/**
 * extractionValidation.ts — post-extraction sanity checks for vision output.
 *
 * The model occasionally returns confidently-wrong data (swapped dates, OCR
 * confusables like 1861→1361, impossible ages). These checks run server-side
 * in /api/analyze: issues on a Haiku result trigger Sonnet escalation, and
 * issues that survive Sonnet downgrade confidence to "low" so the record
 * lands in the Review tab instead of masquerading as clean data.
 */

const MIN_YEAR = 1400;
const MAX_AGE = 115;

export interface ExtractionIssue {
  person: string;
  problem: string;
}

interface PersonLike {
  name?: unknown;
  birthYear?: unknown;
  deathYear?: unknown;
  ageAtDeath?: unknown;
}

const asYear = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function validatePerson(p: PersonLike, label: string, maxYear: number): ExtractionIssue[] {
  const issues: ExtractionIssue[] = [];
  const birth = asYear(p.birthYear);
  const death = asYear(p.deathYear);
  const age = asYear(p.ageAtDeath);

  for (const [field, y] of [["birthYear", birth], ["deathYear", death]] as const) {
    if (y != null && (y < MIN_YEAR || y > maxYear)) {
      issues.push({ person: label, problem: `${field} ${y} outside plausible range` });
    }
  }
  if (birth != null && death != null && death < birth) {
    issues.push({ person: label, problem: `death year ${death} before birth year ${birth}` });
  }
  if (age != null && (age < 0 || age > MAX_AGE)) {
    issues.push({ person: label, problem: `ageAtDeath ${age} implausible` });
  }
  if (birth != null && death != null && age != null && Math.abs(death - birth - age) > 2) {
    issues.push({
      person: label,
      problem: `ageAtDeath ${age} disagrees with years (${death} − ${birth} = ${death - birth})`,
    });
  }
  return issues;
}

/**
 * Validate an extraction result (top-level person + people[]).
 * Empty array = plausible.
 */
export function validateExtraction(extracted: Record<string, unknown>): ExtractionIssue[] {
  const maxYear = new Date().getFullYear() + 1;
  const issues = validatePerson(extracted as PersonLike, "primary", maxYear);

  if (Array.isArray(extracted.people)) {
    (extracted.people as PersonLike[]).forEach((p, i) => {
      const label = typeof p.name === "string" && p.name ? p.name : `person ${i + 1}`;
      issues.push(...validatePerson(p, label, maxYear));
    });
  }
  return issues;
}

// Two or more "YYYY – YYYY" ranges, or relationship labels that only appear
// on shared stones, strongly suggest multiple people.
const YEAR_RANGE_RE = /\b(1[4-9]\d\d|20\d\d)\s*[–—-]\s*(1[4-9]\d\d|20\d\d)\b/g;
const SHARED_STONE_RE = /\b(father|mother|his wife|her husband|married)\b/i;

/**
 * Heuristic: does the transcribed inscription suggest the stone commemorates
 * more than one person? Used to escalate when the model returned fewer
 * people[] entries than the inscription implies.
 */
export function looksMultiPerson(inscription: string): boolean {
  if (!inscription) return false;
  const ranges = inscription.match(YEAR_RANGE_RE) ?? [];
  if (ranges.length >= 2) return true;
  return SHARED_STONE_RE.test(inscription);
}
