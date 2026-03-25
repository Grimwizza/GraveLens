import type { NewspaperArticle } from "@/types";

const BASE = "https://chroniclingamerica.loc.gov";

export async function searchNewspapers(
  name: string,
  deathYear: number | null,
  state?: string
): Promise<NewspaperArticle[]> {
  if (!name || name.length < 3) return [];

  const lastName = name.split(" ").pop() ?? name;
  const yearFrom = deathYear ? deathYear - 1 : undefined;
  const yearTo = deathYear ? deathYear + 2 : undefined;

  const params = new URLSearchParams({
    proxtext: `"${lastName}"`,
    format: "json",
    rows: "5",
  });

  if (yearFrom) params.set("date1", String(yearFrom));
  if (yearTo) params.set("date2", String(yearTo));
  if (state) params.set("state", state);

  try {
    const res = await fetch(`${BASE}/search/pages/results/?${params}`);
    if (!res.ok) return [];

    const data = await res.json();
    const items = data.items ?? [];

    return items.slice(0, 5).map(
      (item: {
        title_normal?: string;
        date?: string;
        title?: string;
        url?: string;
        ocr_eng?: string;
        place_of_publication?: string;
      }) => ({
        title: item.title_normal ?? item.title ?? "Untitled",
        date: item.date ?? "",
        newspaper: item.title ?? "",
        location: item.place_of_publication ?? "",
        url: item.url ? `${BASE}${item.url}` : BASE,
        snippet: item.ocr_eng
          ? item.ocr_eng.slice(0, 300).replace(/\s+/g, " ")
          : "",
      })
    );
  } catch {
    return [];
  }
}
