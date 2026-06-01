import type { ExtractedGraveData, GeoLocation, ResearchData } from "@/types";

const FEMALE_MARKERS = [
  "wife", "mother", "grandmother", "daughter", "sister",
  "mrs.", "miss ", "beloved wife", "loving mother", "faithful wife",
  "devoted mother", "beloved daughter", " she ", " her ",
];

const MALE_MARKERS = [
  "husband", "father", "grandfather", "son", "brother",
  "mr.", "beloved husband", "loving father", "faithful husband",
  "devoted father", "beloved son", " he ", " his ",
];

export function inferGender(
  extracted: ExtractedGraveData
): "male" | "female" | "unknown" {
  const text = [
    extracted.inscription ?? "",
    extracted.epitaph ?? "",
    extracted.name ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const femaleScore = FEMALE_MARKERS.filter((m) => text.includes(m)).length;
  const maleScore = MALE_MARKERS.filter((m) => text.includes(m)).length;

  if (femaleScore > maleScore) return "female";
  if (maleScore > femaleScore) return "male";
  return "unknown";
}

const BRITISH_RE = /\b(united kingdom|england|scotland|wales|ireland|great britain)\b/i;

export function inferOrigin(
  location: GeoLocation | null,
  research?: ResearchData | null
): "british" | "american" {
  if (location?.country && BRITISH_RE.test(location.country)) return "british";
  const immigOrigin = research?.immigration?.[0]?.origin;
  if (immigOrigin && BRITISH_RE.test(immigOrigin)) return "british";
  for (const c of research?.historicalCensus ?? []) {
    if (
      (c.birthplace && BRITISH_RE.test(c.birthplace)) ||
      (c.fatherBirthplace && BRITISH_RE.test(c.fatherBirthplace)) ||
      (c.motherBirthplace && BRITISH_RE.test(c.motherBirthplace))
    ) return "british";
  }
  return "american";
}

export function selectVoice(
  gender: "male" | "female" | "unknown",
  ageAtDeath?: number | null,
  origin: "british" | "american" = "american"
): string {
  const age = ageAtDeath ?? 50;
  if (gender === "female") return age < 35 ? "shimmer" : "nova";
  if (gender === "male")   return age < 35 ? "echo"    : "onyx";
  return origin === "british" ? "fable" : "alloy";
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
