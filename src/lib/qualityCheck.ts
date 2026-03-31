/**
 * Quality validation for extracted grave marker data.
 *
 * Detects common OCR/AI errors before the result is surfaced to the user:
 *  - Invalid / OCR-noise characters in name fields
 *  - Nonsense spellings (excessively long tokens, repeated chars, pure digits)
 *  - Incomplete, impossible, or inconsistent dates
 *  - Suspiciously young/old ages
 */

import type { ExtractedGraveData } from "@/types";

export interface QualityIssue {
  field: string;
  code: string;
  message: string;
}

export interface QualityResult {
  pass: boolean;
  issues: QualityIssue[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Characters that should never appear in a human name on a gravestone */
const INVALID_NAME_RE = /[{}[\]<>\\|=_@#$%^&*~`]/;

/** OCR garbage: strings that are all symbols / digits / mixed junk */
const NONSENSE_TOKEN_RE = /^[\W\d_]{3,}$/u;

/** Repeated character run (e.g. "xxxxxxxx", "AAAAAAAA") */
const REPEAT_CHAR_RE = /(.)\1{5,}/i;

/** Too many consecutive consonants without a vowel (unlikely in real names) */
const CONSONANT_CLUSTER_RE = /[b-df-hj-np-tv-z]{7,}/i;

/** A year that looks unreasonable for a grave marker */
const CURRENT_YEAR = new Date().getFullYear();
const MIN_PLAUSIBLE_YEAR = 1500;
const MAX_PLAUSIBLE_YEAR = CURRENT_YEAR;

/** Markers for intentionally uncertain text from the AI */
const UNCERTAINTY_MARK = /\[\?]/;

function hasUncertainty(s: string | undefined | null): boolean {
  return !!s && UNCERTAINTY_MARK.test(s);
}

// ── Name validation ───────────────────────────────────────────────────────────

function checkName(name: string | undefined | null, field: string): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (!name || name.trim() === "") return issues; // blank is flagged elsewhere

  if (INVALID_NAME_RE.test(name)) {
    issues.push({
      field,
      code: "INVALID_CHARS",
      message: `"${field}" contains characters that shouldn't appear in a name: "${name}"`,
    });
  }

  const tokens = name.trim().split(/\s+/);
  for (const token of tokens) {
    if (NONSENSE_TOKEN_RE.test(token)) {
      issues.push({ field, code: "NONSENSE_TOKEN", message: `Nonsense token "${token}" in ${field}` });
    }
    if (token.length > 30) {
      issues.push({ field, code: "TOKEN_TOO_LONG", message: `Unusually long token "${token}" in ${field}` });
    }
    if (REPEAT_CHAR_RE.test(token)) {
      issues.push({ field, code: "REPEAT_CHARS", message: `Repeated characters in "${token}" (${field})` });
    }
    if (CONSONANT_CLUSTER_RE.test(token)) {
      issues.push({ field, code: "CONSONANT_CLUSTER", message: `Unlikely consonant cluster in "${token}" (${field})` });
    }
  }

  return issues;
}

// ── Year validation ───────────────────────────────────────────────────────────

function checkYear(year: number | null | undefined, field: string): QualityIssue[] {
  if (year === null || year === undefined) return [];
  if (!Number.isInteger(year) || year < MIN_PLAUSIBLE_YEAR || year > MAX_PLAUSIBLE_YEAR) {
    return [{
      field,
      code: "IMPLAUSIBLE_YEAR",
      message: `${field} ${year} is outside the plausible range (${MIN_PLAUSIBLE_YEAR}–${MAX_PLAUSIBLE_YEAR})`,
    }];
  }
  return [];
}

// ── Date string validation ────────────────────────────────────────────────────

/** Month numbers extracted from common date formats */
function extractMonth(dateStr: string): number | null {
  const monthNames = [
    "jan","feb","mar","apr","may","jun",
    "jul","aug","sep","oct","nov","dec",
  ];
  const lower = dateStr.toLowerCase();
  const idx = monthNames.findIndex((m) => lower.includes(m));
  if (idx >= 0) return idx + 1;
  // numeric format DD/MM/YYYY or MM/DD/YYYY — we can't distinguish, skip month check
  return null;
}

function extractDayNumber(dateStr: string): number | null {
  const match = dateStr.match(/\b(\d{1,2})\b/);
  return match ? parseInt(match[1], 10) : null;
}

function checkDateString(dateStr: string | undefined | null, field: string): QualityIssue[] {
  if (!dateStr || dateStr.trim() === "") return [];
  const issues: QualityIssue[] = [];

  // OCR noise in date
  if (INVALID_NAME_RE.test(dateStr)) {
    issues.push({ field, code: "INVALID_CHARS_DATE", message: `Invalid characters in ${field}: "${dateStr}"` });
  }

  const month = extractMonth(dateStr);
  if (month !== null && (month < 1 || month > 12)) {
    issues.push({ field, code: "INVALID_MONTH", message: `Month ${month} is invalid in ${field}: "${dateStr}"` });
  }

  const day = extractDayNumber(dateStr);
  if (day !== null && (day < 1 || day > 31)) {
    issues.push({ field, code: "INVALID_DAY", message: `Day ${day} is invalid in ${field}: "${dateStr}"` });
  }

  return issues;
}

// ── Cross-field consistency ───────────────────────────────────────────────────

function checkConsistency(data: ExtractedGraveData): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const { birthYear, deathYear, ageAtDeath } = data;

  if (birthYear && deathYear) {
    if (deathYear < birthYear) {
      issues.push({
        field: "deathYear",
        code: "DEATH_BEFORE_BIRTH",
        message: `Death year (${deathYear}) is before birth year (${birthYear})`,
      });
    }
    const span = deathYear - birthYear;
    if (span > 130) {
      issues.push({
        field: "birthYear",
        code: "LIFESPAN_TOO_LONG",
        message: `Calculated age of ${span} years is implausibly long`,
      });
    }
    if (ageAtDeath !== null && ageAtDeath !== undefined) {
      const delta = Math.abs(ageAtDeath - span);
      if (delta > 2) {
        issues.push({
          field: "ageAtDeath",
          code: "AGE_MISMATCH",
          message: `Stated age (${ageAtDeath}) doesn't match birth/death years (${birthYear}–${deathYear} = ${span} yrs)`,
        });
      }
    }
  }

  if (ageAtDeath !== null && ageAtDeath !== undefined) {
    if (ageAtDeath < 0 || ageAtDeath > 130) {
      issues.push({
        field: "ageAtDeath",
        code: "IMPLAUSIBLE_AGE",
        message: `Age at death of ${ageAtDeath} is implausible`,
      });
    }
  }

  return issues;
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Run all quality checks on extracted grave data.
 * Returns { pass: true } when no significant issues are found,
 * or { pass: false, issues: [...] } listing every problem detected.
 */
export function checkQuality(data: ExtractedGraveData): QualityResult {
  const issues: QualityIssue[] = [
    ...checkName(data.name, "name"),
    ...checkName(data.firstName, "firstName"),
    ...checkName(data.lastName, "lastName"),
    ...checkYear(data.birthYear, "birthYear"),
    ...checkYear(data.deathYear, "deathYear"),
    ...checkDateString(data.birthDate, "birthDate"),
    ...checkDateString(data.deathDate, "deathDate"),
    ...checkConsistency(data),
  ];

  // AI-marked uncertainty in name is a soft flag
  if (hasUncertainty(data.name)) {
    issues.push({
      field: "name",
      code: "UNCERTAIN_NAME",
      message: "Name contains uncertain characters marked with [?]",
    });
  }

  return { pass: issues.length === 0, issues };
}

/**
 * Severity of the issue set:
 *  "hard"  — definitely wrong data, re-scan warranted
 *  "soft"  — uncertain or partially wrong, re-scan may help
 *  "clean" — no issues
 */
export function qualitySeverity(result: QualityResult): "hard" | "soft" | "clean" {
  if (result.pass) return "clean";
  const hardCodes = new Set([
    "INVALID_CHARS", "NONSENSE_TOKEN", "TOKEN_TOO_LONG", "REPEAT_CHARS",
    "CONSONANT_CLUSTER", "DEATH_BEFORE_BIRTH", "IMPLAUSIBLE_YEAR",
    "IMPLAUSIBLE_AGE", "INVALID_MONTH", "INVALID_DAY", "AGE_MISMATCH",
    "INVALID_CHARS_DATE",
  ]);
  const hasHard = result.issues.some((i) => hardCodes.has(i.code));
  return hasHard ? "hard" : "soft";
}
