import type { ExtractedGraveData } from "@/types";

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

export function selectVoice(
  gender: "male" | "female" | "unknown",
  ageAtDeath?: number | null
): string {
  const age = ageAtDeath ?? 50;
  if (gender === "female") return age < 35 ? "shimmer" : "nova";
  if (gender === "male")   return age < 35 ? "echo"    : "onyx";
  return age < 35 ? "alloy" : "fable";
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
