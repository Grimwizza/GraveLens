/**
 * cemetery.ts
 * Fetches rich, publicly-available data about a cemetery from:
 *   • OpenStreetMap Overpass — hours, phone, website, denomination, OSM tags
 *   • Wikipedia REST API     — description, founding year, notable features
 */

import type { CemeteryRecord } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────

/** Stable id from an OSM element id or a hash of name+lat+lng */
export function cemeteryId(name: string, lat: number, lng: number, osmId?: string): string {
  if (osmId) return `osm-${osmId}`;
  // Simple djb2-style hash so we don't need a crypto import
  const str = `${name}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = (hash * 33) ^ str.charCodeAt(i);
  return `loc-${(hash >>> 0).toString(16)}`;
}

// ── Overpass detail query ─────────────────────────────────────────────────

interface OsmCemeteryDetail {
  osmId?: string;
  openingHours?: string;
  phone?: string;
  website?: string;
  denomination?: string;
  startDate?: string;
  wikidata?: string;
  wikipedia?: string;
}

async function fetchOsmCemeteryDetails(
  lat: number,
  lng: number
): Promise<OsmCemeteryDetail> {
  const query = `
[out:json][timeout:12];
(
  way["landuse"="cemetery"](around:400,${lat},${lng});
  relation["landuse"="cemetery"](around:400,${lat},${lng});
  way["amenity"="grave_yard"](around:400,${lat},${lng});
  relation["amenity"="grave_yard"](around:400,${lat},${lng});
);
out tags;
`.trim();

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return {};

    const data = await res.json();
    const elements: Array<{ type: string; id: number; tags?: Record<string, string> }> =
      data.elements ?? [];

    const named = elements.filter((e) => e.tags?.name);
    if (!named.length) return {};

    const best = named.find((e) => e.tags?.landuse === "cemetery") ?? named[0];
    const tags = best.tags ?? {};

    const wikiRaw = tags.wikipedia;
    const wikipedia = wikiRaw
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(
          wikiRaw.replace(/^en:/, "").replace(/ /g, "_")
        )}`
      : undefined;

    return {
      osmId: `${best.type}/${best.id}`,
      openingHours: tags.opening_hours,
      phone: tags.phone ?? tags["contact:phone"],
      website: tags.website ?? tags["contact:website"] ?? tags.url,
      denomination: tags.denomination ?? tags.religion,
      startDate: tags.start_date,
      wikidata: tags.wikidata,
      wikipedia,
    };
  } catch {
    return {};
  }
}

// ── Wikipedia enrichment ──────────────────────────────────────────────────

interface WikipediaEnrichment {
  description?: string;
  established?: string;
  notableFeatures?: string[];
  historicalEvents?: string[];
}

async function fetchWikipediaEnrichment(
  cemeteryName: string,
  wikipediaUrl?: string
): Promise<WikipediaEnrichment> {
  try {
    // Prefer the direct Wikipedia URL if we have it; otherwise search by name
    let articleTitle: string | null = null;

    if (wikipediaUrl) {
      const m = wikipediaUrl.match(/\/wiki\/(.+)$/);
      if (m) articleTitle = decodeURIComponent(m[1]);
    }

    if (!articleTitle) {
      const searchRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
          cemeteryName + " cemetery"
        )}&srlimit=1&format=json&origin=*`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!searchRes.ok) return {};
      const searchData = await searchRes.json();
      articleTitle = searchData?.query?.search?.[0]?.title ?? null;
    }

    if (!articleTitle) return {};

    const summaryRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(articleTitle)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!summaryRes.ok) return {};

    const summary = await summaryRes.json();
    const extract: string = summary.extract ?? "";

    // Heuristically extract founding year from text
    const yearMatch = extract.match(/\b(established|founded|opened|created|consecrated)\s+in\s+(\d{4})\b/i)
      ?? extract.match(/\bin\s+(\d{4})\b.*\b(established|founded|opened)\b/i);

    const established = yearMatch ? yearMatch[2] ?? yearMatch[1] : undefined;

    // Pull one short description (first 300 chars)
    const description = extract.length > 0
      ? extract.replace(/\(.*?\)/g, "").slice(0, 300).trim() + (extract.length > 300 ? "…" : "")
      : undefined;

    // Lightweight feature extraction from the text
    const notableFeatures: string[] = [];
    const historicalEvents: string[] = [];

    const featurePatterns = [
      /notable (?:features?|sections?|areas?)[^.]*?[:—]\s*([^.]+\.)/gi,
      /contains?\s+([\w\s,]+(?:monument|memorial|section|plot|mausoleum)[^.]*\.)/gi,
    ];
    for (const pat of featurePatterns) {
      for (const m of extract.matchAll(pat)) {
        notableFeatures.push(m[1].trim());
        if (notableFeatures.length >= 4) break;
      }
    }

    const eventPatterns = [
      /during (?:the\s+)?(\w[\w\s]+(?:War|Battle|Conflict|Revolution)[^.]*\.)/gi,
      /in \d{4},?\s*([A-Z][^.]+(?:was buried|was interred|ceremony|dedication)[^.]*\.)/g,
    ];
    for (const pat of eventPatterns) {
      for (const m of extract.matchAll(pat)) {
        historicalEvents.push(m[1].trim());
        if (historicalEvents.length >= 3) break;
      }
    }

    return { description, established, notableFeatures, historicalEvents };
  } catch {
    return {};
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Fetches OSM + Wikipedia data for a cemetery at the given coordinates.
 * Returns a partial CemeteryRecord (without visit tracking fields).
 * Designed to be called once when a user first saves a grave at this cemetery.
 */
export async function enrichCemetery(
  name: string,
  lat: number,
  lng: number
): Promise<Omit<CemeteryRecord, "visitCount" | "firstVisited" | "lastVisited">> {
  const [osm, wiki] = await Promise.allSettled([
    fetchOsmCemeteryDetails(lat, lng),
    fetchWikipediaEnrichment(name),
  ]);

  const osmData = osm.status === "fulfilled" ? osm.value : {};
  const wikiData = wiki.status === "fulfilled" ? wiki.value : {};

  // Re-fetch wiki with the proper URL if OSM gave us one
  let finalWiki = wikiData;
  if (osmData.wikipedia && !wikiData.description) {
    const retry = await fetchWikipediaEnrichment(name, osmData.wikipedia).catch(() => ({}));
    finalWiki = retry;
  }

  const id = cemeteryId(name, lat, lng, osmData.osmId);

  return {
    id,
    name,
    lat,
    lng,
    osmId: osmData.osmId,
    openingHours: osmData.openingHours,
    phone: osmData.phone,
    website: osmData.website,
    wikipediaUrl: osmData.wikipedia,
    denomination: osmData.denomination ?? finalWiki.established ? undefined : osmData.denomination,
    established: osmData.startDate ?? finalWiki.established,
    description: finalWiki.description,
    notableFeatures: finalWiki.notableFeatures?.length ? finalWiki.notableFeatures : undefined,
    historicalEvents: finalWiki.historicalEvents?.length ? finalWiki.historicalEvents : undefined,
  };
}

// ── Opening hours formatter ─────────────────────────────────────────────────

/** Converts OSM opening_hours string to a human-readable summary */
export function formatOpeningHours(raw: string): string {
  if (!raw || raw === "24/7") return raw === "24/7" ? "Open 24 hours" : raw;

  // Simple cleanup for common patterns
  return raw
    .replace(/Mo/g, "Mon")
    .replace(/Tu/g, "Tue")
    .replace(/We/g, "Wed")
    .replace(/Th/g, "Thu")
    .replace(/Fr/g, "Fri")
    .replace(/Sa/g, "Sat")
    .replace(/Su/g, "Sun")
    .replace(/PH/g, "Holidays");
}
