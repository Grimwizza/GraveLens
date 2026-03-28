import type { LandRecord } from "@/types";

// BLM General Land Office Records — free public API for land patent searches.
// Covers homestead claims, cash entries, military warrants, etc. (1776–present).
// Most relevant for rural burials from the 1800s and early 1900s.

const API = "https://glorecords.blm.gov/BLMGeneralLandOfficeRecords/api";

// BLM GLO expects 2-letter state abbreviations, not full state names.
// Nominatim returns full names (e.g. "Wisconsin") — we convert here.
const STATE_ABBREV: Record<string, string> = {
  "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
  "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
  "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
  "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
  "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
  "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
  "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
  "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
  "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
  "Wisconsin": "WI", "Wyoming": "WY",
};

function toStateAbbrev(state: string | undefined): string {
  if (!state) return "";
  // Already a 2-letter code
  if (/^[A-Z]{2}$/.test(state)) return state;
  return STATE_ABBREV[state] ?? "";
}

export async function searchLandPatents(
  lastName: string,
  firstName: string,
  state?: string
): Promise<LandRecord[]> {
  if (!lastName || lastName.length < 2) return [];

  const stateCode = toStateAbbrev(state);

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
