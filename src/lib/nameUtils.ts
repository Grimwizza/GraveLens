/**
 * Shared name-casing utility.
 *
 * Single source of truth used by both the API layer (normalize extracted
 * names before storage) and the display layer (ResultPage).  If casing rules
 * ever change — e.g. adding Mc/Mac prefix support — update here only.
 */

export function toNameCase(str: string): string {
  if (!str) return str;
  return str
    .toLowerCase()
    .replace(/(^|[\s\-'])([a-z])/g, (_, sep, c) => sep + c.toUpperCase());
}
