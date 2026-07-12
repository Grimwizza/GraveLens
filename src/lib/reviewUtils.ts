import type { GraveRecord } from "@/types";

export const TYPICAL_NAME_RE = /^[a-zA-ZÀ-ÿ\s\-'.]+$/;

export function shouldReview(g: GraveRecord): boolean {
  if (g.reviewedAt != null) return false;
  if (g.needsReview) return true;
  const { confidence, name, birthYear, deathYear } = g.extracted;
  if (confidence === "low") return true;
  if (birthYear == null && deathYear == null) return true;
  if (name && !TYPICAL_NAME_RE.test(name)) return true;
  return false;
}
