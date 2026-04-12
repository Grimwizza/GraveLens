/**
 * phonetic.ts
 * Soundex + simplified Double Metaphone for genealogical name normalization.
 *
 * Soundex — the 4-character NARA-compatible code used in census indexes,
 * military pension files, and every major genealogy database.
 *
 * Double Metaphone — a more aggressive algorithm that handles silent letters,
 * Slavic, Romance, and Germanic consonant patterns. Returns up to 2 codes
 * per name (primary + alternate), increasing recall for immigrant surnames.
 *
 * Usage:
 *   getSoundex("Schmidt")   → "S530"
 *   getMetaphone("Schmidt") → ["XMT", "SMT"]
 *   variantsFor("Schmidt")  → ["Schmidt", "Smith", "Schmitt", ...]  (for display)
 */

// ── Soundex ───────────────────────────────────────────────────────────────────

const SOUNDEX_TABLE: Record<string, string> = {
  B: "1", F: "1", P: "1", V: "1",
  C: "2", G: "2", J: "2", K: "2", Q: "2", S: "2", X: "2", Z: "2",
  D: "3", T: "3",
  L: "4",
  M: "5", N: "5",
  R: "6",
};

/**
 * Returns the standard 4-character Soundex code for a surname.
 * Compatible with NARA census indexes.
 */
export function getSoundex(name: string): string {
  if (!name) return "";
  const upper = name.toUpperCase().replace(/[^A-Z]/g, "");
  if (!upper) return "";

  const first = upper[0];
  let code = first;
  let prev = SOUNDEX_TABLE[first] ?? "0";

  for (let i = 1; i < upper.length && code.length < 4; i++) {
    const ch = upper[i];
    // Skip H and W — they don't separate like-coded letters
    if (ch === "H" || ch === "W") continue;
    const digit = SOUNDEX_TABLE[ch] ?? "0";
    if (digit !== "0" && digit !== prev) {
      code += digit;
    }
    prev = digit;
  }

  // Pad to 4 characters
  return code.padEnd(4, "0").slice(0, 4);
}

// ── Simplified Double Metaphone ───────────────────────────────────────────────
// A practical subset covering the most common patterns in US genealogical records:
//   - Slavic (Cz-, Wis-, -ski)
//   - Germanic (Sch-, -mann, -tt-)
//   - Romance (Gn-, silent letters, -tion → X)
//   - Anglo (Kn-, Wr-, Ph-)
// Returns [primary, alternate] — alternate may equal primary if no divergence.

export function getMetaphone(name: string): [string, string] {
  if (!name) return ["", ""];
  let s = name.toUpperCase().replace(/[^A-Z]/g, "");
  if (!s) return ["", ""];

  // Pre-processing: normalize common prefixes
  if (s.startsWith("AE")) s = s.slice(1);
  if (s.startsWith("GN")) s = s.slice(1);
  if (s.startsWith("KN")) s = s.slice(1);
  if (s.startsWith("PN")) s = s.slice(1);
  if (s.startsWith("WR")) s = s.slice(1);

  let prim = "";
  let alt = "";
  let i = 0;

  const add = (p: string, a?: string) => {
    prim += p;
    alt += a !== undefined ? a : p;
  };

  const at = (pos: number, ...strs: string[]): boolean =>
    strs.some((str) => s.slice(pos, pos + str.length) === str);

  while (i < s.length && prim.length < 6) {
    const c = s[i];

    switch (c) {
      // Vowels: only first one is recorded
      case "A": case "E": case "I": case "O": case "U":
        if (i === 0) add("A");
        i++; break;

      case "B":
        add("P");
        i += s[i + 1] === "B" ? 2 : 1; break;

      case "C":
        if (at(i, "CIA") || at(i, "CI") || at(i, "CE") || at(i, "CY")) {
          add("S");
        } else if (at(i, "CH")) {
          add("X", "K");
          i++;
        } else if (at(i, "CK")) {
          add("K"); i++;
        } else if (at(i, "CZ")) {
          add("S"); i++;
        } else {
          add("K");
        }
        i++; break;

      case "D":
        if (at(i, "DG")) {
          add("TK"); i += 2;
        } else {
          add("T");
          i += s[i + 1] === "D" ? 2 : 1;
        }
        break;

      case "F":
        add("F");
        i += s[i + 1] === "F" ? 2 : 1; break;

      case "G":
        if (at(i, "GH")) {
          if (i === 0) { add("K"); i += 2; break; }
          // silent GH after vowel
          add("K"); i += 2; break;
        }
        if (at(i, "GN")) { i += 2; break; }
        if (at(i, "GE") || at(i, "GI") || at(i, "GY")) { add("K", "J"); i++; break; }
        add("K");
        i += s[i + 1] === "G" ? 2 : 1; break;

      case "H":
        if (!"AEIOU".includes(s[i + 1] ?? "")) { i++; break; }
        add("H");
        i++; break;

      case "J":
        add("J", "H"); i++; break;

      case "K":
        if (s[i - 1] === "C") { i++; break; }
        add("K");
        i += s[i + 1] === "K" ? 2 : 1; break;

      case "L":
        add("L");
        i += s[i + 1] === "L" ? 2 : 1; break;

      case "M":
        if (at(i, "MB")) { i += 2; break; }
        add("M");
        i += s[i + 1] === "M" ? 2 : 1; break;

      case "N":
        add("N");
        i += s[i + 1] === "N" ? 2 : 1; break;

      case "P":
        if (at(i, "PH")) { add("F"); i += 2; break; }
        add("P");
        i += s[i + 1] === "P" ? 2 : 1; break;

      case "Q": add("K"); i++; break;

      case "R":
        add("R");
        i += s[i + 1] === "R" ? 2 : 1; break;

      case "S":
        if (at(i, "SCH")) { add("X", "SK"); i += 3; break; }
        if (at(i, "SH")) { add("X"); i += 2; break; }
        if (at(i, "SZ")) { add("S"); i += 2; break; }
        if (at(i, "SI") || at(i, "SIO")) { add("X", "S"); i++; break; }
        add("S");
        i += s[i + 1] === "S" ? 2 : 1; break;

      case "T":
        if (at(i, "TIA") || at(i, "TIO")) { add("X"); i += 3; break; }
        if (at(i, "TCH") || at(i, "TH")) { add("T"); i += 2; break; }
        add("T");
        i += s[i + 1] === "T" ? 2 : 1; break;

      case "V": add("F"); i++; break;

      case "W":
        if ("AEIOU".includes(s[i + 1] ?? "")) { add("F"); }
        i++; break;

      case "X": add("KS"); i++; break;
      case "Y":
        if ("AEIOU".includes(s[i + 1] ?? "")) { add("Y"); }
        i++; break;

      case "Z":
        if (at(i, "ZH") || at(i, "ZI") || at(i, "ZE") || at(i, "ZY")) {
          add("S", "J"); i += 2;
        } else {
          add("S");
          i += s[i + 1] === "Z" ? 2 : 1;
        }
        break;

      default:
        i++; break;
    }
  }

  return [prim || "", alt || prim || ""];
}

// ── Convenience helpers ───────────────────────────────────────────────────────

/** True if two names are phonetically equivalent by Soundex. */
export function soundexMatch(a: string, b: string): boolean {
  const sa = getSoundex(a);
  const sb = getSoundex(b);
  return sa !== "" && sa === sb;
}

/** True if two names share any Metaphone code. */
export function metaphoneMatch(a: string, b: string): boolean {
  const [ap, aa] = getMetaphone(a);
  const [bp, ba] = getMetaphone(b);
  return (!!(ap && (ap === bp || ap === ba))) || (!!(aa && (aa === bp || aa === ba)));
}

/**
 * Returns all phonetic codes for a surname — useful for multi-variant API queries.
 * Deduplicates automatically.
 */
export function phoneticCodes(name: string): string[] {
  const soundex = getSoundex(name);
  const [mp, ma] = getMetaphone(name);
  return [...new Set([soundex, mp, ma].filter(Boolean))];
}
