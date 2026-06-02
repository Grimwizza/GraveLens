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

const STRIP_WORDS = /\b(cemetery|cemeteries|graveyard|burial|ground|grounds|memorial|arboretum|park|garden|gardens|church|saint|st\.?)\b/gi;

/**
 * Returns true if the Wikipedia article title is plausibly about the same
 * cemetery as `expected`. Strips generic cemetery words then checks for token
 * overlap so that "Bellefontaine Cemetery and Arboretum" does NOT match
 * "Parkview Cemetery".
 */
function cemeteryNamesMatch(expected: string, articleTitle: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().replace(STRIP_WORDS, " ").replace(/[^a-z0-9\s]/g, " ").trim();
  const tokens = (s: string) => normalize(s).split(/\s+/).filter((t) => t.length > 2);

  const expTokens = new Set(tokens(expected));
  const artTokens = tokens(articleTitle);
  if (!expTokens.size || !artTokens.length) return false;

  // Require at least one non-trivial token to overlap
  return artTokens.some((t) => expTokens.has(t));
}

// ── Overpass detail query ─────────────────────────────────────────────────

export interface OsmCemeteryDetail {
  osmId?: string;
  openingHours?: string;
  phone?: string;
  website?: string;
  denomination?: string;
  startDate?: string;
  wikidata?: string;
  wikipedia?: string;
}

export async function fetchOsmCemeteryDetails(
  lat: number,
  lng: number,
  name?: string,
): Promise<OsmCemeteryDetail> {
  const query = `
[out:json][timeout:15];
(
  node["landuse"="cemetery"](around:800,${lat},${lng});
  way["landuse"="cemetery"](around:800,${lat},${lng});
  relation["landuse"="cemetery"](around:800,${lat},${lng});
  node["amenity"="grave_yard"](around:800,${lat},${lng});
  way["amenity"="grave_yard"](around:800,${lat},${lng});
  relation["amenity"="grave_yard"](around:800,${lat},${lng});
);
out tags;
`.trim();

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "GraveLens/1.0 (https://lowhigh.ai)",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(18000),
    });
    if (!res.ok) return {};

    const data = await res.json();
    const elements: Array<{ type: string; id: number; tags?: Record<string, string> }> =
      data.elements ?? [];

    const named = elements.filter((e) => e.tags?.name);
    if (!named.length) return {};

    // Prefer the element whose name best matches the supplied cemetery name,
    // then fall back to first landuse=cemetery, then first named element.
    let best = named[0];
    if (name) {
      const nameMatched = named.find((e) => cemeteryNamesMatch(name, e.tags?.name ?? ""));
      best = nameMatched ?? named.find((e) => e.tags?.landuse === "cemetery") ?? named[0];
    } else {
      best = named.find((e) => e.tags?.landuse === "cemetery") ?? named[0];
    }
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

// Only called when OSM provides a direct Wikipedia URL — never via name search,
// since searching by name can return a different cemetery with the same name.
async function fetchWikipediaEnrichment(
  wikipediaUrl: string,
  cemeteryName: string,
): Promise<WikipediaEnrichment> {
  try {
    const m = wikipediaUrl.match(/\/wiki\/(.+)$/);
    if (!m) return {};
    const articleTitle = decodeURIComponent(m[1]).replace(/_/g, " ");

    const summaryRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(articleTitle)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!summaryRes.ok) return {};

    const summary = await summaryRes.json();

    // Guard: reject the article if its title doesn't match this cemetery's name.
    // This catches OSM data-quality errors where the wikipedia tag points to a
    // different cemetery (e.g. Bellefontaine) instead of the correct one.
    const resolvedTitle: string = summary.title ?? articleTitle;
    if (!cemeteryNamesMatch(cemeteryName, resolvedTitle)) {
      console.warn(
        `[cemetery] Wikipedia title "${resolvedTitle}" does not match cemetery ` +
        `"${cemeteryName}" — skipping description.`
      );
      return {};
    }

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
  lng: number,
  city?: string,
  state?: string,
): Promise<Omit<CemeteryRecord, "visitCount" | "firstVisited" | "lastVisited">> {
  // Fetch OSM data — location-verified via 800 m radius query, name-matched
  const osmData = await fetchOsmCemeteryDetails(lat, lng, name).catch((): OsmCemeteryDetail => ({}));

  // Only fetch Wikipedia when OSM provides a direct, georeferenced link.
  // Never search Wikipedia by name: "Lakeside Cemetery" matches hundreds of
  // different cemeteries and the first result is almost certainly the wrong one.
  // Additionally, the fetcher validates the article title matches this cemetery.
  let finalWiki: WikipediaEnrichment = {};
  if (osmData.wikipedia) {
    finalWiki = await fetchWikipediaEnrichment(osmData.wikipedia, name).catch(() => ({}));
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
    denomination: osmData.denomination,
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
