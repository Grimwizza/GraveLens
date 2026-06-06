import type { LandRecord } from "@/types";
import { toStateCode } from "@/lib/stateUtils";

// BLM General Land Office Records — free public API for land patent searches.
// Covers homestead claims, cash entries, military warrants, etc. (1776–present).
// Most relevant for rural burials from the 1800s and early 1900s.

const API = "https://glorecords.blm.gov/BLMGeneralLandOfficeRecords/api";

export async function searchLandPatents(
  lastName: string,
  firstName: string,
  state?: string
): Promise<LandRecord[]> {
  if (!lastName || lastName.length < 2) return [];

  const stateCode = toStateCode(state ?? "");

  const params = new URLSearchParams({
    SearchCriteria_Type: "NameSearch",
    SearchCriteria_LastName: lastName.toUpperCase(),
    SearchCriteria_FirstName: firstName.toUpperCase(),
    start: "0",
    count: "5",
    type: "NameSearch",
    requireCert: "false",
  });

  if (stateCode) params.set("SearchCriteria_State", stateCode);

  try {
    const res = await fetch(`${API}/Patents/search?${params}`, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "GraveLens/1.0 (genealogy research app)",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const data = await res.json();
    // BLM GLO wraps results in either `results` or `patentList` depending on version
    const results: Array<{
      accession?: string;
      patentNumber?: string;
      signed_date?: string;
      issue_date?: string;
      state?: string;
      county?: string;
      totalAcres?: number;
      centroid_lon?: number;
      centroid_lat?: number;
    }> = data.results ?? data.patentList ?? [];

    return results.slice(0, 5).map((item) => ({
      patentNumber: item.patentNumber ?? item.accession ?? "",
      date: item.signed_date ?? item.issue_date ?? "",
      state: item.state ?? stateCode ?? "",
      county: item.county ?? "",
      acres: item.totalAcres ?? 0,
      documentUrl: item.accession
        ? `https://glorecords.blm.gov/details/patent/default.aspx?accession=${item.accession}`
        : undefined,
      coordinates:
        item.centroid_lat && item.centroid_lon
          ? { lat: item.centroid_lat, lng: item.centroid_lon }
          : undefined,
    }));
  } catch {
    return [];
  }
}
