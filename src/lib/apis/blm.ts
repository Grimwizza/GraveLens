import type { LandRecord } from "@/types";

const BASE = "https://glorecords.blm.gov/results/default.aspx";
const API = "https://glorecords.blm.gov/BLMGeneralLandOfficeRecords/api";

export async function searchLandPatents(
  lastName: string,
  firstName: string,
  state?: string
): Promise<LandRecord[]> {
  if (!lastName || lastName.length < 2) return [];

  // BLM GLO has a search endpoint we can query
  const params = new URLSearchParams({
    SearchCriteria_Type: "NameSearch",
    SearchCriteria_LastName: lastName,
    SearchCriteria_FirstName: firstName,
    SearchCriteria_State: state ?? "",
    format: "json",
    rows: "5",
  });

  try {
    const res = await fetch(`${API}/Patents/search?${params}`);
    if (!res.ok) return [];

    const data = await res.json();
    const results = data.results ?? [];

    return results.slice(0, 5).map(
      (item: {
        patentNumber?: string;
        signed_date?: string;
        state?: string;
        county?: string;
        accession?: string;
        totalAcres?: number;
        centroid_lon?: number;
        centroid_lat?: number;
      }) => ({
        patentNumber: item.patentNumber ?? item.accession ?? "",
        date: item.signed_date ?? "",
        state: item.state ?? "",
        county: item.county ?? "",
        acres: item.totalAcres ?? 0,
        documentUrl: item.accession
          ? `https://glorecords.blm.gov/details/patent/default.aspx?accession=${item.accession}`
          : undefined,
        coordinates:
          item.centroid_lat && item.centroid_lon
            ? { lat: item.centroid_lat, lng: item.centroid_lon }
            : undefined,
      })
    );
  } catch {
    return [];
  }
}
