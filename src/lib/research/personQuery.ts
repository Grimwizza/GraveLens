/**
 * personQuery.ts — the Identity Layer.
 *
 * Normalizes what the stone gave us (OCR names, partial dates, GPS-derived
 * place, co-buried people) into search-ready form, and scores candidate
 * records from any source against that identity with a consistent
 * high/medium/low confidence plus human-readable match reasons.
 *
 * Every research source — inline API queries and deep-link builders alike —
 * should consume buildPersonQuery() rather than raw OCR fields, so that
 * "Wm. H. LARSON" searches as William Larson (and Wm Larson), maiden names
 * become alternate surnames, and exact stone dates tighten search windows.
 */

import { variantsFor } from "@/lib/phonetic";
import type { PersonData } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DateAnchor {
  year: number;
  /** 1–12 when the stone gives a full or partial date */
  month?: number;
  day?: number;
  /** Inclusive search window in years */
  from: number;
  to: number;
  /** ISO yyyy-mm-dd when day-level precision is available */
  iso?: string;
}

export interface PersonQuery {
  /** Cleaned given names, best first: original (cleaned) then formal expansions. */
  givenNames: string[];
  /** Surnames, primary first, then maiden name, then phonetic variants. */
  surnames: string[];
  maidenName: string | null;
  /** "Given Surname" combinations for full-text sources, best first. */
  fullNames: string[];
  birth: DateAnchor | null;
  death: DateAnchor | null;
  places: { state?: string; county?: string; city?: string };
  /** Best-guess spouse when the stone commemorates exactly two adults. */
  spouse: { givenName: string; surname: string } | null;
  coBuried: Array<{ firstName: string; lastName: string }>;
}

export interface PersonQueryInput {
  firstName?: string;
  lastName?: string;
  name?: string;
  birthYear?: number | null;
  deathYear?: number | null;
  birthDate?: string;
  deathDate?: string;
  inscription?: string;
  people?: PersonData[];
  city?: string;
  county?: string;
  state?: string;
}

// ── Given-name normalization ──────────────────────────────────────────────────

/** Titles and relationship epithets that OCR picks up but records never index. */
const NAME_NOISE =
  /\b(rev|dr|mr|mrs|miss|capt|captain|lt|lieut|col|sgt|corp|cpl|pvt|gen|maj|hon|elder|deacon|sister|brother|mother|father|baby|infant|son|daughter|husband|wife|beloved|in memory of|jr|sr|ii|iii|iv)\b\.?/gi;

/** Historical written abbreviations → formal name. */
const ABBREVIATIONS: Record<string, string> = {
  wm: "William", jas: "James", chas: "Charles", geo: "George",
  thos: "Thomas", jno: "John", jos: "Joseph", benj: "Benjamin",
  saml: "Samuel", robt: "Robert", richd: "Richard", edwd: "Edward",
  danl: "Daniel", michl: "Michael", alexr: "Alexander", andw: "Andrew",
  fredk: "Frederick", margt: "Margaret", cath: "Catherine", eliz: "Elizabeth",
};

/** Common historical nicknames → formal names (formal candidates, best first). */
const NICKNAMES: Record<string, string[]> = {
  bill: ["William"], billy: ["William"], will: ["William"], willie: ["William"],
  jack: ["John"], johnny: ["John"],
  jim: ["James"], jimmy: ["James"],
  bob: ["Robert"], bobby: ["Robert"],
  dick: ["Richard"], rich: ["Richard"],
  tom: ["Thomas"], tommy: ["Thomas"],
  ted: ["Theodore", "Edward"], ned: ["Edward"], ed: ["Edward"], eddie: ["Edward"],
  hank: ["Henry"], harry: ["Henry", "Harold"],
  frank: ["Francis", "Franklin"],
  fred: ["Frederick"], freddie: ["Frederick"],
  joe: ["Joseph"], joey: ["Joseph"],
  sam: ["Samuel"], ben: ["Benjamin"], dan: ["Daniel"], dave: ["David"],
  mike: ["Michael"], andy: ["Andrew"], tony: ["Anthony"], gus: ["August", "Gustav"],
  walt: ["Walter"], art: ["Arthur"], al: ["Albert", "Alfred"],
  alex: ["Alexander"], nick: ["Nicholas"], pete: ["Peter"],
  steve: ["Stephen"], greg: ["Gregory"], ken: ["Kenneth"], ron: ["Ronald"],
  don: ["Donald"], ray: ["Raymond"], gene: ["Eugene"], herb: ["Herbert"],
  larry: ["Lawrence"], lou: ["Louis"], lew: ["Lewis"], vic: ["Victor"],
  molly: ["Mary"], mollie: ["Mary"], polly: ["Mary"], mamie: ["Mary", "Margaret"],
  peggy: ["Margaret"], maggie: ["Margaret"], meg: ["Margaret"], madge: ["Margaret"],
  betty: ["Elizabeth"], betsy: ["Elizabeth"], bess: ["Elizabeth"],
  bessie: ["Elizabeth"], lizzie: ["Elizabeth"], eliza: ["Elizabeth"], beth: ["Elizabeth"],
  sally: ["Sarah"], sadie: ["Sarah"],
  nellie: ["Helen", "Eleanor", "Ellen"], nell: ["Helen", "Eleanor"],
  kate: ["Katherine", "Catherine"], katie: ["Katherine"], kitty: ["Katherine"],
  annie: ["Anna", "Ann"], nan: ["Ann", "Nancy"],
  hattie: ["Harriet"], carrie: ["Caroline"], josie: ["Josephine"],
  tillie: ["Matilda"], minnie: ["Wilhelmina", "Minerva"],
  lena: ["Magdalena", "Helena"], dolly: ["Dorothy"], dot: ["Dorothy"],
  patsy: ["Martha", "Patricia"], patty: ["Martha", "Patricia"],
  fanny: ["Frances"], fannie: ["Frances"],
  jenny: ["Jane", "Jennie"], lottie: ["Charlotte"], effie: ["Euphemia"],
  addie: ["Adelaide", "Adeline"], gertie: ["Gertrude"],
  susie: ["Susan", "Susanna"], millie: ["Mildred", "Amelia"],
  etta: ["Henrietta"], retta: ["Henrietta", "Loretta"],
  vinnie: ["Lavinia"], winnie: ["Winifred"], flossie: ["Florence"],
  libby: ["Elizabeth"], abbie: ["Abigail"], debby: ["Deborah"],
};

const toTitle = (s: string) =>
  s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** Strip titles/epithets/punctuation noise from an OCR'd given name. */
export function cleanGivenName(raw: string): string {
  return raw
    .replace(NAME_NOISE, " ")
    .replace(/[^a-zA-Z' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Expand a given name into search candidates, best first:
 * cleaned original, then formal expansions of abbreviations/nicknames.
 * Multi-word given names ("Wm H") expand on the first word and preserve it.
 */
export function expandGivenName(raw: string): string[] {
  const cleaned = cleanGivenName(raw);
  if (!cleaned) return [];

  const first = cleaned.split(" ")[0];
  const key = first.toLowerCase();

  const expansions: string[] = [];
  if (ABBREVIATIONS[key]) expansions.push(ABBREVIATIONS[key]);
  if (NICKNAMES[key]) expansions.push(...NICKNAMES[key]);

  const out = [toTitle(first), ...expansions];
  return [...new Set(out)];
}

// ── Maiden name ───────────────────────────────────────────────────────────────

/**
 * Parse a maiden name from "née Schmidt" / "nee Schmidt" in the name or
 * inscription, or the parenthetical convention "Mary (Schmidt) Smith".
 */
export function parseMaidenName(
  name: string,
  inscription: string
): string | null {
  const neePattern = /\bn[ée]e\.?\s+([A-Z][a-zA-Z'-]{2,})/i;
  const m1 = name.match(neePattern) ?? inscription.match(neePattern);
  if (m1) return toTitle(m1[1]);

  // "Mary (Schmidt) Smith" — parenthesized single capitalized token mid-name
  const m2 = name.match(/\(([A-Z][a-zA-Z'-]{2,})\)\s+\S/);
  if (m2) return toTitle(m2[1]);

  return null;
}

// ── Dates ─────────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parse common gravestone date formats into a DateAnchor:
 * "March 4, 1898" · "4 Mar 1898" · "1898-03-04" · "03/04/1898" · "1898".
 */
export function parseDateAnchor(
  dateStr: string | undefined,
  year: number | null,
  windowYears: number
): DateAnchor | null {
  let y = year ?? null;
  let month: number | undefined;
  let day: number | undefined;

  if (dateStr) {
    const iso = dateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    const us = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    const mdY = dateStr.match(/([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/);
    const dMY = dateStr.match(/(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4})/);

    if (iso) {
      y = parseInt(iso[1], 10); month = parseInt(iso[2], 10); day = parseInt(iso[3], 10);
    } else if (us) {
      y = parseInt(us[3], 10); month = parseInt(us[1], 10); day = parseInt(us[2], 10);
    } else if (mdY) {
      const mo = MONTHS[mdY[1].slice(0, 3).toLowerCase()];
      if (mo) { month = mo; day = parseInt(mdY[2], 10); y = parseInt(mdY[3], 10); }
    } else if (dMY) {
      const mo = MONTHS[dMY[2].slice(0, 3).toLowerCase()];
      if (mo) { month = mo; day = parseInt(dMY[1], 10); y = parseInt(dMY[3], 10); }
    } else {
      const yOnly = dateStr.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
      if (yOnly) y = parseInt(yOnly[1], 10);
    }
    if (month && (month < 1 || month > 12)) { month = undefined; day = undefined; }
    if (day && (day < 1 || day > 31)) day = undefined;
  }

  if (!y) return null;

  return {
    year: y,
    month,
    day,
    from: y - windowYears,
    to: y + windowYears,
    iso:
      month && day
        ? `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
        : undefined,
  };
}

// ── Query builder ─────────────────────────────────────────────────────────────

export function buildPersonQuery(input: PersonQueryInput): PersonQuery {
  const rawFirst = input.firstName || (input.name ?? "").split(/\s+/)[0] || "";
  const rawLast =
    input.lastName || (input.name ?? "").split(/\s+/).slice(-1)[0] || "";

  const givenNames = expandGivenName(rawFirst);
  const primarySurname = toTitle(cleanGivenName(rawLast));
  const maidenName = parseMaidenName(input.name ?? "", input.inscription ?? "");

  const surnames = [...new Set(
    [
      primarySurname,
      ...(maidenName ? [maidenName] : []),
      ...(primarySurname ? variantsFor(primarySurname) : []),
    ].filter(Boolean)
  )];

  const fullNames = givenNames
    .slice(0, 3)
    .map((g) => `${g} ${primarySurname}`.trim())
    .filter((n) => n.includes(" "));

  // Co-buried people from multi-person stones (excluding the subject)
  const coBuried = (input.people ?? [])
    .filter(
      (p) =>
        p.firstName &&
        p.firstName.toLowerCase() !== rawFirst.toLowerCase()
    )
    .map((p) => ({
      firstName: toTitle(cleanGivenName(p.firstName)),
      lastName: toTitle(cleanGivenName(p.lastName || rawLast)),
    }));

  // Exactly two people sharing a surname is almost always a couple's stone
  const spouse =
    (input.people?.length ?? 0) === 2 &&
    coBuried.length === 1 &&
    coBuried[0].lastName.toLowerCase() === primarySurname.toLowerCase()
      ? { givenName: coBuried[0].firstName, surname: coBuried[0].lastName }
      : null;

  return {
    givenNames,
    surnames,
    maidenName,
    fullNames,
    birth: parseDateAnchor(input.birthDate, input.birthYear ?? null, 2),
    death: parseDateAnchor(input.deathDate, input.deathYear ?? null, 1),
    places: {
      state: input.state || undefined,
      county: input.county || undefined,
      city: input.city || undefined,
    },
    spouse,
    coBuried,
  };
}

// ── Candidate scoring ─────────────────────────────────────────────────────────

export interface CandidateRecord {
  name?: string;
  birthYear?: number | null;
  deathYear?: number | null;
  state?: string;
}

export interface MatchScore {
  confidence: "high" | "medium" | "low";
  score: number;
  /** Human-readable evidence, e.g. "exact death year", "surname variant match" */
  reasons: string[];
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

const yearOf = (v: number | null | undefined): number | null =>
  typeof v === "number" && v > 0 ? v : null;

/**
 * Scores a candidate record from any source against the person query.
 * Implements the cross-validation matrix: name distance, date deltas,
 * place agreement. Same scale for every source so UI badges are comparable.
 */
export function scoreCandidate(
  candidate: CandidateRecord,
  q: PersonQuery
): MatchScore {
  let score = 0;
  const reasons: string[] = [];

  // ── Name ──
  const candName = (candidate.name ?? "").toLowerCase().trim();
  if (candName && q.surnames.length > 0) {
    const candLast = candName.split(/\s+/).slice(-1)[0] ?? "";
    const primary = q.surnames[0].toLowerCase();
    const best = Math.min(...q.surnames.map((s) => levenshtein(candLast, s.toLowerCase())));

    if (candLast === primary) {
      score += 2;
      reasons.push("exact surname");
    } else if (best <= 1) {
      score += 2;
      reasons.push("surname variant match");
    } else if (best <= 3) {
      score += 1;
      reasons.push("close surname spelling");
    } else {
      score -= 2;
      reasons.push("surname differs significantly");
    }

    const candFirst = candName.split(/\s+/)[0] ?? "";
    if (q.givenNames.some((g) => g.toLowerCase() === candFirst)) {
      score += 1;
      reasons.push("given name match (incl. formal expansion)");
    }
  }

  // ── Dates ──
  const cb = yearOf(candidate.birthYear);
  const qb = q.birth?.year ?? null;
  if (cb && qb) {
    const d = Math.abs(cb - qb);
    if (d <= 1) { score += 2; reasons.push("birth year within ±1"); }
    else if (d <= 3) { score += 1; reasons.push("birth year within ±3"); }
    else { score -= 1; reasons.push(`birth year differs by ${d}`); }
  }

  const cd = yearOf(candidate.deathYear);
  const qd = q.death?.year ?? null;
  if (cd && qd) {
    const d = Math.abs(cd - qd);
    if (d === 0) { score += 2; reasons.push("exact death year"); }
    else if (d <= 1) { score += 2; reasons.push("death year within ±1"); }
    else if (d <= 3) { score += 1; reasons.push("death year within ±3"); }
    else { score -= 1; reasons.push(`death year differs by ${d}`); }
  }

  // ── Place ──
  if (candidate.state && q.places.state) {
    if (candidate.state.toLowerCase() === q.places.state.toLowerCase()) {
      score += 1;
      reasons.push("state matches burial location");
    } else {
      reasons.push(`different state (${candidate.state}) — possible migration`);
    }
  }

  const confidence: MatchScore["confidence"] =
    score >= 5 ? "high" : score >= 3 ? "medium" : "low";

  return { confidence, score, reasons };
}
