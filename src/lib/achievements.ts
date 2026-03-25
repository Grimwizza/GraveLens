import type { GraveRecord } from "@/types";

// ── Rank ladder ───────────────────────────────────────────────────────────
// Themed as a "History Explorer" progression — from casual visitor to master.

export interface Rank {
  level: number;
  title: string;
  subtitle: string;
  minXP: number;
}

export const RANKS: Rank[] = [
  { level: 1,  title: "The Wanderer",       subtitle: "Your journey into history begins",           minXP: 0     },
  { level: 2,  title: "The Curious",         subtitle: "Questions stir among the stones",            minXP: 150   },
  { level: 3,  title: "The Seeker",          subtitle: "Following trails through the grass",         minXP: 450   },
  { level: 4,  title: "The Chronicler",      subtitle: "Names and dates fill your pages",            minXP: 1000  },
  { level: 5,  title: "The Sleuth",          subtitle: "Every stone holds a secret",                 minXP: 1800  },
  { level: 6,  title: "The Historian",       subtitle: "Patterns emerge across the centuries",       minXP: 2800  },
  { level: 7,  title: "The Archivist",       subtitle: "Deep in the records, deep in the past",      minXP: 4000  },
  { level: 8,  title: "The Curator",         subtitle: "Preserving heritage for those who follow",   minXP: 5500  },
  { level: 9,  title: "The Scholar",         subtitle: "Your knowledge spans generations",           minXP: 7500  },
  { level: 10, title: "Master Historian",    subtitle: "Guardian of the forgotten and the found",    minXP: 10000 },
];

export function getRank(xp: number): Rank {
  return [...RANKS].reverse().find((r) => xp >= r.minXP) ?? RANKS[0];
}

export function getNextRank(xp: number): Rank | null {
  const current = getRank(xp);
  return RANKS.find((r) => r.level === current.level + 1) ?? null;
}

export function xpToNextRank(xp: number): { needed: number; progress: number } {
  const next = getNextRank(xp);
  if (!next) return { needed: 0, progress: 1 };
  const current = getRank(xp);
  const span = next.minXP - current.minXP;
  const earned = xp - current.minXP;
  return { needed: next.minXP - xp, progress: earned / span };
}

// ── Achievement definitions ───────────────────────────────────────────────

export type AchievementCategory =
  | "First Steps"
  | "Collection"
  | "Exploration"
  | "Through the Ages"
  | "Military"
  | "Family"
  | "Research"
  | "Discovery";

export interface AchievementProgress {
  /** 0–1, where 1 = unlocked */
  ratio: number;
  /** Human label, e.g. "3 / 10" */
  label: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  flavour: string;  // thematic one-liner shown after unlock
  xp: number;
  category: AchievementCategory;
  icon: string;
  evaluate: (graves: GraveRecord[], stats: AppStats) => AchievementProgress;
}

// ── App stats tracked separately in localStorage ──────────────────────────
export interface AppStats {
  sharesCount: number;
  cemeteryNamesAdded: number;  // manually named cemeteries
  daysActive: string[];        // ISO date strings "YYYY-MM-DD"
}

const STATS_KEY = "gl_app_stats";

export function loadStats(): AppStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { sharesCount: 0, cemeteryNamesAdded: 0, daysActive: [] };
    return { sharesCount: 0, cemeteryNamesAdded: 0, daysActive: [], ...JSON.parse(raw) };
  } catch {
    return { sharesCount: 0, cemeteryNamesAdded: 0, daysActive: [] };
  }
}

export function updateStats(patch: Partial<AppStats>): void {
  try {
    const current = loadStats();
    localStorage.setItem(STATS_KEY, JSON.stringify({ ...current, ...patch }));
  } catch { /* ignore */ }
}

export function recordActiveDay(): void {
  const today = new Date().toISOString().slice(0, 10);
  const stats = loadStats();
  if (!stats.daysActive.includes(today)) {
    updateStats({ daysActive: [...stats.daysActive, today] });
  }
}

// ── Helpers used in evaluate functions ───────────────────────────────────

function uniqueCemeteries(graves: GraveRecord[]) {
  return new Set(graves.map((g) => g.location?.cemetery).filter(Boolean));
}

function uniqueStates(graves: GraveRecord[]) {
  return new Set(graves.map((g) => g.location?.state).filter(Boolean));
}

const MILITARY_TERMS =
  /\b(war|veteran|vet\b|tank|infantry|cavalry|regiment|battalion|squadron|division|brigade|corps|platoon|army|navy|marine|air\s*force|pvt|sgt|cpl|cpt|maj|col|gen|lt\b|served|service|killed\s*in\s*action|k\.i\.a|medal|doughboy|soldier|sailor|airman|pilot|gunner|commander|sergeant|corporal|private|lieutenant|captain|major|colonel|admiral)\b/i;

function isMilitary(g: GraveRecord): boolean {
  if (g.research?.militaryContext) return true;
  if (g.tags?.includes("Veteran")) return true;
  const text = [g.extracted.inscription, ...(g.extracted.symbols ?? [])].join(" ");
  return MILITARY_TERMS.test(text);
}

function markerAgeYears(g: GraveRecord): number | null {
  const year = g.extracted.deathYear ?? g.extracted.birthYear;
  if (!year) return null;
  return new Date().getFullYear() - year;
}

function conflictFromGrave(g: GraveRecord): string | null {
  return g.research?.militaryContext?.likelyConflict ?? null;
}

function isFamily(g: GraveRecord): boolean {
  return Boolean(g.tags?.some((t) => ["Relative", "Ancestor"].includes(t)));
}

function count(n: number, target: number): AchievementProgress {
  return { ratio: Math.min(n / target, 1), label: `${n} / ${target}` };
}

function binary(met: boolean): AchievementProgress {
  return { ratio: met ? 1 : 0, label: met ? "Complete" : "Incomplete" };
}

// ── The full achievement list ─────────────────────────────────────────────

export const ACHIEVEMENTS: Achievement[] = [

  // ── FIRST STEPS ────────────────────────────────────────────────────────

  {
    id: "first_stone",
    title: "First Stone",
    description: "Save your first grave marker to the archive.",
    flavour: "Every great archive begins with a single stone.",
    xp: 10, category: "First Steps", icon: "🪦",
    evaluate: (g) => count(g.length, 1),
  },
  {
    id: "first_name",
    title: "A Name Remembered",
    description: "Save a marker with a full name extracted.",
    flavour: "To speak a name is to keep them alive.",
    xp: 6, category: "First Steps", icon: "✍️",
    evaluate: (g) => binary(g.some((r) => Boolean(r.extracted.name))),
  },
  {
    id: "first_gps",
    title: "Marked on the Map",
    description: "Save a GPS-tagged grave marker.",
    flavour: "Place them on the map of memory.",
    xp: 8, category: "First Steps", icon: "📍",
    evaluate: (g) => binary(g.some((r) => Boolean(r.location?.lat))),
  },
  {
    id: "first_inscription",
    title: "The Written Word",
    description: "Find a grave marker with an inscription.",
    flavour: "Stone outlasts paper. These words were meant to last.",
    xp: 6, category: "First Steps", icon: "📖",
    evaluate: (g) => binary(g.some((r) => r.extracted.inscription?.length > 10)),
  },
  {
    id: "first_symbol",
    title: "Symbol Seeker",
    description: "Find a grave marker bearing a symbol or emblem.",
    flavour: "Every symbol carries a century of meaning.",
    xp: 6, category: "First Steps", icon: "✦",
    evaluate: (g) => binary(g.some((r) => (r.extracted.symbols?.length ?? 0) > 0)),
  },
  {
    id: "first_epitaph",
    title: "Last Words",
    description: "Find a grave marker with an epitaph.",
    flavour: "The final message, chosen with great care.",
    xp: 8, category: "First Steps", icon: "📜",
    evaluate: (g) => binary(g.some((r) => r.extracted.epitaph?.length > 5)),
  },

  // ── COLLECTION ─────────────────────────────────────────────────────────

  {
    id: "col_5",
    title: "Stone Garden",
    description: "Save 5 grave markers.",
    flavour: "A small garden of names and dates.",
    xp: 25, category: "Collection", icon: "🌿",
    evaluate: (g) => count(g.length, 5),
  },
  {
    id: "col_10",
    title: "Cemetery Row",
    description: "Save 10 grave markers.",
    flavour: "A proper row of history taking shape.",
    xp: 50, category: "Collection", icon: "🏚️",
    evaluate: (g) => count(g.length, 10),
  },
  {
    id: "col_25",
    title: "Burial Ground",
    description: "Save 25 grave markers.",
    flavour: "Your archive grows into hallowed territory.",
    xp: 75, category: "Collection", icon: "⛪",
    evaluate: (g) => count(g.length, 25),
  },
  {
    id: "col_50",
    title: "The Necropolis",
    description: "Save 50 grave markers.",
    flavour: "A city of the departed, preserved in your care.",
    xp: 100, category: "Collection", icon: "🏛️",
    evaluate: (g) => count(g.length, 50),
  },
  {
    id: "col_100",
    title: "Eternal Archive",
    description: "Save 100 grave markers.",
    flavour: "One hundred stories saved from silence.",
    xp: 175, category: "Collection", icon: "📚",
    evaluate: (g) => count(g.length, 100),
  },
  {
    id: "col_250",
    title: "Keeper of the Departed",
    description: "Save 250 grave markers.",
    flavour: "You have become a guardian of the forgotten.",
    xp: 300, category: "Collection", icon: "🗝️",
    evaluate: (g) => count(g.length, 250),
  },

  // ── EXPLORATION ────────────────────────────────────────────────────────

  {
    id: "exp_cemetery_1",
    title: "Hallowed Ground",
    description: "Visit and document a named cemetery.",
    flavour: "The gate opens. The stones await.",
    xp: 20, category: "Exploration", icon: "🚪",
    evaluate: (g) => binary(uniqueCemeteries(g).size >= 1),
  },
  {
    id: "exp_cemetery_3",
    title: "Beyond the Gates",
    description: "Visit 3 different cemeteries.",
    flavour: "Each cemetery holds its own chapter of local history.",
    xp: 40, category: "Exploration", icon: "🗺️",
    evaluate: (g) => count(uniqueCemeteries(g).size, 3),
  },
  {
    id: "exp_cemetery_5",
    title: "Cemetery Hopper",
    description: "Visit 5 different cemeteries.",
    flavour: "The roots run deeper than any single yard.",
    xp: 75, category: "Exploration", icon: "🧭",
    evaluate: (g) => count(uniqueCemeteries(g).size, 5),
  },
  {
    id: "exp_cemetery_10",
    title: "The Circuit",
    description: "Visit 10 different cemeteries.",
    flavour: "You know the roads less travelled.",
    xp: 100, category: "Exploration", icon: "🛤️",
    evaluate: (g) => count(uniqueCemeteries(g).size, 10),
  },
  {
    id: "exp_cemetery_25",
    title: "Cemetery Connoisseur",
    description: "Visit 25 different cemeteries.",
    flavour: "Every plot has its own personality.",
    xp: 200, category: "Exploration", icon: "🏆",
    evaluate: (g) => count(uniqueCemeteries(g).size, 25),
  },
  {
    id: "exp_state_2",
    title: "Crossing State Lines",
    description: "Document graves in 2 different states.",
    flavour: "History doesn't respect borders.",
    xp: 50, category: "Exploration", icon: "🌎",
    evaluate: (g) => count(uniqueStates(g).size, 2),
  },
  {
    id: "exp_state_3",
    title: "The Grand Tour",
    description: "Document graves in 3 different states.",
    flavour: "A regional historian in the making.",
    xp: 100, category: "Exploration", icon: "🗾",
    evaluate: (g) => count(uniqueStates(g).size, 3),
  },
  {
    id: "exp_state_5",
    title: "Cross Country",
    description: "Document graves in 5 different states.",
    flavour: "America's stories are buried coast to coast.",
    xp: 200, category: "Exploration", icon: "🦅",
    evaluate: (g) => count(uniqueStates(g).size, 5),
  },
  {
    id: "exp_gps_10",
    title: "Map Maker",
    description: "Have 10 GPS-tagged markers on your map.",
    flavour: "The map of memory grows more complete.",
    xp: 40, category: "Exploration", icon: "🗺️",
    evaluate: (g) => count(g.filter((r) => r.location?.lat).length, 10),
  },
  {
    id: "exp_gps_25",
    title: "The Navigator",
    description: "Have 25 GPS-tagged markers on your map.",
    flavour: "Your map rivals any local historical society's.",
    xp: 75, category: "Exploration", icon: "⚓",
    evaluate: (g) => count(g.filter((r) => r.location?.lat).length, 25),
  },

  // ── THROUGH THE AGES ───────────────────────────────────────────────────

  {
    id: "age_75",
    title: "Touched by Time",
    description: "Find a grave marker from 75 or more years ago.",
    flavour: "These stones have weathered more than we know.",
    xp: 25, category: "Through the Ages", icon: "⏳",
    evaluate: (g) => binary(g.some((r) => (markerAgeYears(r) ?? 0) >= 75)),
  },
  {
    id: "age_100",
    title: "A Century Past",
    description: "Find a grave marker 100 or more years old.",
    flavour: "A century of silence, broken by your lens.",
    xp: 50, category: "Through the Ages", icon: "🕰️",
    evaluate: (g) => binary(g.some((r) => (markerAgeYears(r) ?? 0) >= 100)),
  },
  {
    id: "age_victorian",
    title: "Victorian Era",
    description: "Document a grave from before 1900.",
    flavour: "Gaslight and grave plots — another world entirely.",
    xp: 75, category: "Through the Ages", icon: "🎩",
    evaluate: (g) => binary(g.some((r) => (r.extracted.deathYear ?? 9999) < 1900)),
  },
  {
    id: "age_civil_war",
    title: "Civil War Era",
    description: "Find a grave from the Civil War years (1861–1865).",
    flavour: "Brother against brother. A nation's wound in stone.",
    xp: 100, category: "Through the Ages", icon: "⚔️",
    evaluate: (g) =>
      binary(
        g.some((r) => {
          const y = r.extracted.deathYear;
          return y !== null && y >= 1861 && y <= 1865;
        })
      ),
  },
  {
    id: "age_antebellum",
    title: "Antebellum",
    description: "Document a grave from before the Civil War (pre-1861).",
    flavour: "A world about to be shattered.",
    xp: 125, category: "Through the Ages", icon: "🕯️",
    evaluate: (g) => binary(g.some((r) => (r.extracted.deathYear ?? 9999) < 1861)),
  },
  {
    id: "age_republic",
    title: "The Early Republic",
    description: "Find a grave from before 1800.",
    flavour: "The ink on the Constitution was barely dry.",
    xp: 200, category: "Through the Ages", icon: "📜",
    evaluate: (g) => binary(g.some((r) => (r.extracted.deathYear ?? 9999) < 1800)),
  },
  {
    id: "age_colonial",
    title: "Colonial Roots",
    description: "Document a grave from the 1700s.",
    flavour: "They knew the colonies before they became a nation.",
    xp: 300, category: "Through the Ages", icon: "⚓",
    evaluate: (g) =>
      binary(
        g.some((r) => {
          const y = r.extracted.deathYear ?? r.extracted.birthYear;
          return y !== null && y >= 1700 && y < 1800;
        })
      ),
  },
  {
    id: "age_centenarian",
    title: "The Centenarian",
    description: "Find someone who lived to 100 years or older.",
    flavour: "A century of living — what stories they could tell.",
    xp: 50, category: "Through the Ages", icon: "🎂",
    evaluate: (g) => binary(g.some((r) => (r.extracted.ageAtDeath ?? 0) >= 100)),
  },
  {
    id: "age_long_life",
    title: "Long Life",
    description: "Find someone who lived to 90 years or older.",
    flavour: "They outlasted empires.",
    xp: 25, category: "Through the Ages", icon: "🌳",
    evaluate: (g) => binary(g.some((r) => (r.extracted.ageAtDeath ?? 0) >= 90)),
  },
  {
    id: "age_young",
    title: "Gone Too Soon",
    description: "Find a marker for someone who died before age 18.",
    flavour: "A life interrupted. Their name deserves to be remembered.",
    xp: 20, category: "Through the Ages", icon: "🕊️",
    evaluate: (g) =>
      binary(
        g.some((r) => {
          const a = r.extracted.ageAtDeath;
          return a !== null && a < 18 && a >= 0;
        })
      ),
  },

  // ── MILITARY ───────────────────────────────────────────────────────────

  {
    id: "mil_first",
    title: "Salute",
    description: "Document your first military grave marker.",
    flavour: "They answered the call. You answered theirs.",
    xp: 40, category: "Military", icon: "🎖️",
    evaluate: (g) => binary(g.some(isMilitary)),
  },
  {
    id: "mil_5",
    title: "The Honor Roll",
    description: "Document 5 military grave markers.",
    flavour: "Five names. Five lives of service.",
    xp: 75, category: "Military", icon: "🏅",
    evaluate: (g) => count(g.filter(isMilitary).length, 5),
  },
  {
    id: "mil_10",
    title: "In Memoriam",
    description: "Document 10 military grave markers.",
    flavour: "Ten stones. Ten futures interrupted.",
    xp: 100, category: "Military", icon: "🪖",
    evaluate: (g) => count(g.filter(isMilitary).length, 10),
  },
  {
    id: "mil_25",
    title: "Hall of Honor",
    description: "Document 25 military grave markers.",
    flavour: "You carry their memory forward.",
    xp: 200, category: "Military", icon: "🦸",
    evaluate: (g) => count(g.filter(isMilitary).length, 25),
  },
  {
    id: "mil_ww1",
    title: "The Doughboy",
    description: "Document a World War I veteran's marker.",
    flavour: "They crossed an ocean to defend an ideal.",
    xp: 75, category: "Military", icon: "⚔️",
    evaluate: (g) =>
      binary(g.some((r) => conflictFromGrave(r)?.toLowerCase().includes("world war i") ?? false)),
  },
  {
    id: "mil_ww2",
    title: "The Greatest Generation",
    description: "Document a World War II veteran's marker.",
    flavour: "They saved the world and came home to mow the lawn.",
    xp: 75, category: "Military", icon: "🌍",
    evaluate: (g) =>
      binary(g.some((r) => conflictFromGrave(r)?.toLowerCase().includes("world war ii") ?? false)),
  },
  {
    id: "mil_civil_war",
    title: "Blue or Grey",
    description: "Document a Civil War veteran's marker.",
    flavour: "A nation tore itself apart. They survived it.",
    xp: 100, category: "Military", icon: "🪖",
    evaluate: (g) =>
      binary(g.some((r) => conflictFromGrave(r)?.toLowerCase().includes("civil war") ?? false)),
  },
  {
    id: "mil_two_conflicts",
    title: "Brothers in Arms",
    description: "Document veterans from 2 different conflicts.",
    flavour: "War visits every generation.",
    xp: 100, category: "Military", icon: "✊",
    evaluate: (g) => {
      const conflicts = new Set(
        g.map(conflictFromGrave).filter((c): c is string => Boolean(c))
      );
      return count(conflicts.size, 2);
    },
  },
  {
    id: "mil_three_conflicts",
    title: "Theater of War",
    description: "Document veterans from 3 different conflicts.",
    flavour: "Three generations. Three calls to duty.",
    xp: 150, category: "Military", icon: "🎖️",
    evaluate: (g) => {
      const conflicts = new Set(
        g.map(conflictFromGrave).filter((c): c is string => Boolean(c))
      );
      return count(conflicts.size, 3);
    },
  },

  // ── FAMILY ─────────────────────────────────────────────────────────────

  {
    id: "fam_first_relative",
    title: "Family Roots",
    description: "Tag a grave marker as a Relative.",
    flavour: "Blood and stone. The oldest connection.",
    xp: 40, category: "Family", icon: "🌱",
    evaluate: (g) => binary(g.some((r) => r.tags?.includes("Relative") ?? false)),
  },
  {
    id: "fam_first_ancestor",
    title: "The Ancestor",
    description: "Tag a grave marker as an Ancestor.",
    flavour: "You stand here because they stood there.",
    xp: 40, category: "Family", icon: "🌳",
    evaluate: (g) => binary(g.some((r) => r.tags?.includes("Ancestor") ?? false)),
  },
  {
    id: "fam_3",
    title: "The Family Tree",
    description: "Tag 3 grave markers as Relative or Ancestor.",
    flavour: "Three branches of the same tree.",
    xp: 75, category: "Family", icon: "🌲",
    evaluate: (g) => count(g.filter(isFamily).length, 3),
  },
  {
    id: "fam_same_cemetery",
    title: "Family Plot",
    description: "Find 3 relatives buried in the same cemetery.",
    flavour: "They chose to rest together.",
    xp: 75, category: "Family", icon: "🏡",
    evaluate: (g) => {
      const familyByCemetery: Record<string, number> = {};
      for (const r of g) {
        if (isFamily(r) && r.location?.cemetery) {
          familyByCemetery[r.location.cemetery] =
            (familyByCemetery[r.location.cemetery] ?? 0) + 1;
        }
      }
      const max = Math.max(0, ...Object.values(familyByCemetery));
      return count(max, 3);
    },
  },
  {
    id: "fam_5",
    title: "Deep Roots",
    description: "Tag 5 family members in your archive.",
    flavour: "The deeper you dig, the richer the soil.",
    xp: 100, category: "Family", icon: "🪴",
    evaluate: (g) => count(g.filter(isFamily).length, 5),
  },
  {
    id: "fam_10",
    title: "Family Reunion",
    description: "Tag 10 family members in your archive.",
    flavour: "Generations gathered in one archive.",
    xp: 150, category: "Family", icon: "👨‍👩‍👧‍👦",
    evaluate: (g) => count(g.filter(isFamily).length, 10),
  },

  // ── RESEARCH ───────────────────────────────────────────────────────────

  {
    id: "res_newspaper",
    title: "Paper Trail",
    description: "Find a newspaper archive record for a documented person.",
    flavour: "They made the news. You found the clipping.",
    xp: 30, category: "Research", icon: "📰",
    evaluate: (g) =>
      binary(g.some((r) => (r.research?.newspapers?.length ?? 0) > 0)),
  },
  {
    id: "res_land",
    title: "Land Baron",
    description: "Find a land patent record.",
    flavour: "They staked a claim. You found the deed.",
    xp: 30, category: "Research", icon: "🌾",
    evaluate: (g) =>
      binary(g.some((r) => (r.research?.landRecords?.length ?? 0) > 0)),
  },
  {
    id: "res_nara",
    title: "Archive Diver",
    description: "Find a National Archives record.",
    flavour: "The government kept records. Now you have them.",
    xp: 30, category: "Research", icon: "🏛️",
    evaluate: (g) =>
      binary(g.some((r) => (r.research?.naraRecords?.length ?? 0) > 0)),
  },
  {
    id: "res_five_people",
    title: "The Researcher",
    description: "Find at least one external record on 5 different people.",
    flavour: "History rewards the persistent.",
    xp: 75, category: "Research", icon: "🔍",
    evaluate: (g) => {
      const n = g.filter(
        (r) =>
          (r.research?.newspapers?.length ?? 0) > 0 ||
          (r.research?.naraRecords?.length ?? 0) > 0 ||
          (r.research?.landRecords?.length ?? 0) > 0
      ).length;
      return count(n, 5);
    },
  },
  {
    id: "res_trifecta",
    title: "Primary Source",
    description: "Find newspaper, NARA, and land records all for one person.",
    flavour: "Three sources. One life, fully illuminated.",
    xp: 125, category: "Research", icon: "🔎",
    evaluate: (g) =>
      binary(
        g.some(
          (r) =>
            (r.research?.newspapers?.length ?? 0) > 0 &&
            (r.research?.naraRecords?.length ?? 0) > 0 &&
            (r.research?.landRecords?.length ?? 0) > 0
        )
      ),
  },
  {
    id: "res_military_context",
    title: "Boots on the Ground",
    description: "Discover military service context for a grave marker.",
    flavour: "The inscription told you rank. History tells you the rest.",
    xp: 50, category: "Research", icon: "🗃️",
    evaluate: (g) =>
      binary(g.some((r) => Boolean(r.research?.militaryContext?.roleDescription))),
  },

  // ── DISCOVERY ──────────────────────────────────────────────────────────

  {
    id: "dis_high_confidence",
    title: "Clearly Inscribed",
    description: "Record a high-confidence extraction from a grave marker.",
    flavour: "This stone was carved by a patient hand.",
    xp: 20, category: "Discovery", icon: "✅",
    evaluate: (g) =>
      binary(g.some((r) => r.extracted.confidence === "high")),
  },
  {
    id: "dis_epitaphs_5",
    title: "Epitaph Collector",
    description: "Collect 5 markers with epitaphs.",
    flavour: "Five final thoughts, preserved in stone.",
    xp: 50, category: "Discovery", icon: "💬",
    evaluate: (g) =>
      count(g.filter((r) => r.extracted.epitaph?.length > 5).length, 5),
  },
  {
    id: "dis_symbolist",
    title: "The Symbolist",
    description: "Find a marker bearing 3 or more distinct symbols.",
    flavour: "Every symbol was a deliberate choice.",
    xp: 35, category: "Discovery", icon: "🔱",
    evaluate: (g) =>
      binary(g.some((r) => (r.extracted.symbols?.length ?? 0) >= 3)),
  },
  {
    id: "dis_tagged_all",
    title: "The Cataloguer",
    description: "Apply tags to 10 grave markers.",
    flavour: "Named and categorised. The archivist's art.",
    xp: 50, category: "Discovery", icon: "🏷️",
    evaluate: (g) =>
      count(g.filter((r) => (r.tags?.length ?? 0) > 0).length, 10),
  },
  {
    id: "dis_cemetery_named",
    title: "Name the Ground",
    description: "Manually assign a cemetery name to a grave marker.",
    flavour: "The places between places deserve names too.",
    xp: 25, category: "Discovery", icon: "🪧",
    evaluate: (_g, stats) => binary(stats.cemeteryNamesAdded >= 1),
  },
  {
    id: "dis_share",
    title: "Pass It On",
    description: "Share a grave record with someone.",
    flavour: "History lives through conversation.",
    xp: 20, category: "Discovery", icon: "📤",
    evaluate: (_g, stats) => binary(stats.sharesCount >= 1),
  },
  {
    id: "dis_share_5",
    title: "Town Crier",
    description: "Share 5 grave records.",
    flavour: "You've become a local historian's newsletter.",
    xp: 50, category: "Discovery", icon: "📣",
    evaluate: (_g, stats) => count(stats.sharesCount, 5),
  },
  {
    id: "dis_days_3",
    title: "Weekend Explorer",
    description: "Use the app on 3 different days.",
    flavour: "History is a habit, not a moment.",
    xp: 30, category: "Discovery", icon: "📅",
    evaluate: (_g, stats) => count(stats.daysActive.length, 3),
  },
  {
    id: "dis_days_7",
    title: "Regular Visitor",
    description: "Use the app on 7 different days.",
    flavour: "The stones become familiar. The names, like old friends.",
    xp: 75, category: "Discovery", icon: "🗓️",
    evaluate: (_g, stats) => count(stats.daysActive.length, 7),
  },
];

// ── Unlock state management ───────────────────────────────────────────────

const UNLOCKS_KEY = "gl_achievement_unlocks";

export interface UnlockRecord {
  id: string;
  unlockedAt: number;
}

export function loadUnlocks(): UnlockRecord[] {
  try {
    return JSON.parse(localStorage.getItem(UNLOCKS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveUnlocks(unlocks: UnlockRecord[]): void {
  try {
    localStorage.setItem(UNLOCKS_KEY, JSON.stringify(unlocks));
  } catch { /* ignore */ }
}

export function isUnlocked(id: string, unlocks: UnlockRecord[]): boolean {
  return unlocks.some((u) => u.id === id);
}

/**
 * Evaluate all achievements against the current graves + stats.
 * Returns any achievements newly unlocked in this call (for toast notifications).
 */
export function checkAndUnlock(
  graves: GraveRecord[],
  stats: AppStats
): Achievement[] {
  const existing = loadUnlocks();
  const alreadyUnlocked = new Set(existing.map((u) => u.id));
  const newUnlocks: Achievement[] = [];
  const now = Date.now();

  for (const a of ACHIEVEMENTS) {
    if (alreadyUnlocked.has(a.id)) continue;
    const { ratio } = a.evaluate(graves, stats);
    if (ratio >= 1) {
      existing.push({ id: a.id, unlockedAt: now });
      newUnlocks.push(a);
    }
  }

  if (newUnlocks.length > 0) saveUnlocks(existing);
  return newUnlocks;
}

export function totalXP(unlocks: UnlockRecord[]): number {
  const unlockedIds = new Set(unlocks.map((u) => u.id));
  return ACHIEVEMENTS.filter((a) => unlockedIds.has(a.id)).reduce(
    (sum, a) => sum + a.xp,
    0
  );
}

export const ACHIEVEMENT_CATEGORIES: AchievementCategory[] = [
  "First Steps",
  "Collection",
  "Exploration",
  "Through the Ages",
  "Military",
  "Family",
  "Research",
  "Discovery",
];
