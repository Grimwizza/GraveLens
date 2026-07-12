import { toStateCode } from "@/lib/stateUtils";
import type { UsGenWebRecord } from "@/types";

/**
 * Searches USGenWeb Archives directories for volunteer transcriptions of wills, deeds,
 * and probate records for a given county and state.
 *
 * Because usgwarchives.net has historically faced downtime and is currently offline,
 * this function automatically fails over to pre-constructed Google Site-Search links
 * matching wills/probate and deeds/land records for the target county.
 */
export async function searchUsGenWeb(
  state: string,
  county: string
): Promise<UsGenWebRecord[]> {
  if (!state || !county) return [];

  const stateCode = toStateCode(state).toLowerCase();
  if (!stateCode) return [];

  const normalizedCounty = county
    .toLowerCase()
    .replace(/\s*county\s*$/i, "")
    .trim();

  const googleProbate = `https://www.google.com/search?q=site%3Ausgwarchives.net+${encodeURIComponent(county)}+${encodeURIComponent(state)}+wills+probate`;
  const googleDeed = `https://www.google.com/search?q=site%3Ausgwarchives.net+${encodeURIComponent(county)}+${encodeURIComponent(state)}+deeds+land`;

  const fallbackRecords: UsGenWebRecord[] = [
    {
      title: `Search ${county} wills & probate records via Google`,
      url: googleProbate,
      category: "probate",
    },
    {
      title: `Search ${county} deeds & land records via Google`,
      url: googleDeed,
      category: "deeds",
    },
  ];

  const dirUrl = `https://files.usgwarchives.net/${stateCode}/${normalizedCounty}/`;

  try {
    const res = await fetch(dirUrl, {
      headers: {
        "User-Agent": "GraveLens/1.0 (genealogy research app)",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      console.warn(`[USGenWeb] Scraper returned status ${res.status}. Falling back to Google searches.`);
      return fallbackRecords;
    }

    const html = await res.text();
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
    const records: UsGenWebRecord[] = [];
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      const text = match[2].replace(/<[^>]*>/g, "").trim();

      if (!href || href.startsWith("/") || href.includes("://") || href.startsWith("..") || href === "./") {
        continue;
      }

      const lowerText = text.toLowerCase();
      const lowerHref = href.toLowerCase();

      const isProbate = lowerText.includes("probate") || lowerHref.includes("probate") || lowerText.includes("will") || lowerHref.includes("will");
      const isDeed = lowerText.includes("deed") || lowerHref.includes("deed") || lowerText.includes("land") || lowerHref.includes("land") || lowerText.includes("patent") || lowerHref.includes("patent");

      let category: UsGenWebRecord["category"] = "other";
      if (isProbate) {
        category = "probate";
      } else if (isDeed) {
        category = "deeds";
      } else {
        continue;
      }

      records.push({
        title: text || href,
        url: `${dirUrl}${href}`,
        category,
      });
    }

    if (records.length === 0) {
      return fallbackRecords;
    }

    return records.slice(0, 8);
  } catch (err) {
    console.warn(`[USGenWeb] Offline/connection failure for ${stateCode}/${normalizedCounty}. Falling back to Google searches. Reason:`, err);
    return fallbackRecords;
  }
}
