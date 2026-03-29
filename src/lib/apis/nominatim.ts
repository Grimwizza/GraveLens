import type { GeoLocation } from "@/types";

// ── USGS GNIS cemetery lookup ─────────────────────────────────────────────
// Queries the GNIS (Geographic Names Information System) for cemetery features
// within ~1 km of the GPS point. Covers rural/historical US cemeteries that
// are frequently absent from OpenStreetMap.

interface GnisFeature {
  feature_name?: string;
  feature_class?: string;
  prim_lat_dec?: number;
  prim_long_dec?: number;
}

async function queryCemeteryGnis(lat: number, lng: number): Promise<string | null> {
  // Approx ±0.009° ≈ 1 km bounding box
  const d = 0.009;
  const url =
    `https://geonames.usgs.gov/api/geonames` +
    `?bbox=${lng - d},${lat - d},${lng + d},${lat + d}` +
    `&featureCode=CMTY&maxResults=10`;

  try {
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const features: GnisFeature[] = data?.features ?? data?.GnisFeatures ?? [];
    if (features.length === 0) return null;

    // Pick the closest feature to the query point
    let best: GnisFeature | null = null;
    let bestDist = Infinity;
    for (const f of features) {
      if (!f.feature_name || f.feature_class !== "Cemetery") continue;
      if (f.prim_lat_dec == null || f.prim_long_dec == null) { best ??= f; continue; }
      const dLat = f.prim_lat_dec - lat;
      const dLng = f.prim_long_dec - lng;
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      if (dist < bestDist) { bestDist = dist; best = f; }
    }
    return best?.feature_name ?? null;
  } catch {
    return null;
  }
}

// ── Overpass (OSM) cemetery lookup ────────────────────────────────────────
// Queries for cemetery/grave_yard polygons within 500 m of the GPS point.
// Far more reliable than Nominatim reverse geocode for cemetery names because
// it checks the landuse polygon directly rather than the nearest address node.

interface OverpassElement {
  tags?: Record<string, string>;
}

interface OverpassResult {
  name: string | null;
  wikipedia: string | null;
}

async function queryCemeteryOverpass(
  lat: number,
  lng: number
): Promise<OverpassResult> {
  const query = `
[out:json][timeout:10];
(
  way["landuse"="cemetery"](around:500,${lat},${lng});
  relation["landuse"="cemetery"](around:500,${lat},${lng});
  way["amenity"="grave_yard"](around:500,${lat},${lng});
  relation["amenity"="grave_yard"](around:500,${lat},${lng});
);
out tags;
`.trim();

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) return { name: null, wikipedia: null };

  const data = await res.json();
  const elements: OverpassElement[] = data.elements ?? [];

  // Prefer named elements; among those prefer landuse=cemetery over grave_yard
  const named = elements.filter((e) => e.tags?.name);
  if (named.length === 0) return { name: null, wikipedia: null };

  const best =
    named.find((e) => e.tags?.landuse === "cemetery") ?? named[0];

  const name = best.tags?.name ?? null;

  // OSM wikipedia tag format: "en:Cemetery Name" or just "Cemetery Name"
  const wikiRaw = best.tags?.wikipedia ?? null;
  const wikipedia = wikiRaw
    ? `https://en.wikipedia.org/wiki/${encodeURIComponent(
        wikiRaw.replace(/^en:/, "").replace(/ /g, "_")
      )}`
    : null;

  return { name, wikipedia };
}

// ── Nominatim reverse geocode ─────────────────────────────────────────────

interface NominatimResult {
  display_name: string;
  address: {
    cemetery?: string;
    leisure?: string;
    amenity?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

async function fetchNominatim(lat: number, lng: number): Promise<NominatimResult> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=17`;
  const res = await fetch(url, {
    headers: { "User-Agent": "GraveLens/1.0 (cemetery history app)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return res.json();
}

// ── Public API ────────────────────────────────────────────────────────────

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<GeoLocation> {
  // Run Nominatim, Overpass, and GNIS in parallel
  const [nominatimSettled, overpassSettled, gnisSettled] = await Promise.allSettled([
    fetchNominatim(lat, lng),
    queryCemeteryOverpass(lat, lng),
    queryCemeteryGnis(lat, lng),
  ]);

  const nominatim =
    nominatimSettled.status === "fulfilled" ? nominatimSettled.value : null;
  const overpass =
    overpassSettled.status === "fulfilled" ? overpassSettled.value : null;
  const gnisName =
    gnisSettled.status === "fulfilled" ? gnisSettled.value : null;

  const addr = nominatim?.address ?? {};

  // Priority: Overpass polygon (spatially precise) → GNIS (authoritative US) → Nominatim tags
  const cemetery =
    overpass?.name ??
    gnisName ??
    addr.cemetery ??
    addr.leisure ??
    addr.amenity ??
    undefined;

  const city = addr.city ?? addr.town ?? addr.village ?? undefined;

  return {
    lat,
    lng,
    cemetery,
    cemeteryWikipedia: overpass?.wikipedia ?? undefined,
    address: nominatim?.display_name,
    city,
    county: addr.county,
    state: addr.state,
    country: addr.country,
  };
}
