"use client";

/**
 * cards.tsx — shared research-section cards.
 *
 * Extracted verbatim from ResultPage.tsx so the /research page and the
 * result page render research identically. Presentational only: data in via
 * props, optional onRefresh handlers. See RESEARCH_PAGE_PLAN.md Step 1.
 */

import type { ResearchLink } from "@/lib/researchLinks";
import type { ExtractedGraveData, GeoLocation, ResearchData } from "@/types";

export function RecordsCard({
  title,
  icon,
  loading,
  items,
  onRefresh,
  refreshing,
}: {
  title: string;
  icon: string;
  loading: boolean;
  items?: Array<{
    title: string;
    subtitle: string;
    detail: string;
    url?: string;
  }>;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  if (loading && !items) {
    return (
      <div className="py-5 animate-fade-up">
        <SectionHeader icon={icon} title={title} onRefresh={onRefresh} refreshing={refreshing} />
        <div className="mt-3 space-y-2">
          {[1, 2].map((n) => (
            <div key={n} className="p-3 rounded-xl bg-stone-800/40 border border-stone-700/50">
              <div className="h-4 shimmer rounded w-1/2 mb-1.5" />
              <div className="h-3 shimmer rounded w-1/3 mb-1.5" />
              <div className="h-3.5 shimmer rounded w-2/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!items || items.length === 0) return null;

  return (
    <div className="py-5 animate-fade-up">
      <SectionHeader icon={icon} title={title} onRefresh={onRefresh} refreshing={refreshing} />
      <ul className="mt-3 space-y-2">
        {items.map((item, i) => (
          <li key={i}>
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-3 rounded-xl bg-stone-800 border border-stone-700 active:bg-stone-750 transition-colors"
              >
                <RecordItem item={item} />
              </a>
            ) : (
              <div className="block p-3 rounded-xl bg-stone-800 border border-stone-700">
                <RecordItem item={item} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RecordItem({
  item,
}: {
  item: { title: string; subtitle: string; detail: string; url?: string };
}) {
  return (
    <>
      <p className="text-stone-200 text-sm font-medium leading-snug line-clamp-2">
        {item.title}
      </p>
      {item.subtitle && (
        <p className="text-stone-500 text-xs mt-0.5">{item.subtitle}</p>
      )}
      {item.detail && (
        <p className="text-stone-400 text-xs mt-1 line-clamp-2">{item.detail}</p>
      )}
      {item.url && (
        <p className="text-gold-500 text-xs mt-1">View record →</p>
      )}
    </>
  );
}

// ── FamilySearch Hints Card ───────────────────────────────────────────────────

export function FamilySearchCard({
  hints,
  loading,
  onRefresh,
  refreshing,
}: {
  hints?: import("@/types").FamilySearchHint[];
  loading: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  if (loading && !hints) {
    return (
      <div className="py-5 animate-fade-up">
        <SectionHeader icon="🌳" title="FamilySearch Records" onRefresh={onRefresh} refreshing={refreshing} />
        <div className="mt-3 space-y-2">
          {[1, 2].map((n) => (
            <div key={n} className="flex items-start gap-3 p-3 rounded-xl bg-stone-800/40 border border-stone-700/50">
              <div className="shrink-0 w-12 h-5 rounded bg-stone-700/40 shimmer" />
              <div className="flex-1 min-w-0">
                <div className="h-4 shimmer rounded w-1/2 mb-2" />
                <div className="h-3 shimmer rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (!hints || hints.length === 0) return null;

  return (
    <div className="py-5 animate-fade-up">
      <SectionHeader icon="🌳" title="FamilySearch Records" onRefresh={onRefresh} refreshing={refreshing} />
      <p className="text-stone-500 text-xs mt-1 mb-3">
        Free indexed records — 9 billion entries. Tap any result to view on FamilySearch.
      </p>
      <ul className="space-y-2">
        {hints.map((hint, i) => (
          <li key={i}>
            <a
              href={hint.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 p-3 rounded-xl bg-stone-800 border border-stone-700 active:bg-stone-750 transition-colors"
            >
              {/* Record type badge */}
              <div
                className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[0.65rem] font-semibold uppercase tracking-wide"
                style={{ background: "rgba(201,168,76,0.15)", color: "var(--t-gold-500)" }}
              >
                {hint.recordType ?? "Record"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-stone-200 text-sm font-medium leading-snug line-clamp-2">
                  {hint.title}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {hint.dateRange && (
                    <span className="text-stone-500 text-xs">{hint.dateRange}</span>
                  )}
                  {!hint.dateConfident && (
                    <span
                      className="text-[0.65rem] px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(180,80,60,0.18)", color: "#c07060" }}
                    >
                      Date mismatch — verify
                    </span>
                  )}
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--t-gold-500)" }}>
                  View on FamilySearch →
                </p>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── SSDI Card (F3) ───────────────────────────────────────────────────────────

export const CONFIDENCE_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  high:   { color: "#7ab87a", bg: "rgba(50,120,50,0.18)",  label: "High match"   },
  medium: { color: "var(--t-gold-500)", bg: "rgba(150,100,20,0.18)", label: "Possible match" },
  low:    { color: "#a07060", bg: "rgba(120,60,40,0.18)",  label: "Low confidence" },
};

export function WikiTreeCard({
  records,
  loading,
}: {
  records: import("@/lib/apis/wikitree").WikiTreeMatch[];
  loading?: boolean;
}) {
  if (loading && !records.length) {
    return (
      <div className="py-5 animate-fade-up">
        <SectionHeader icon="🌳" title="WikiTree Profiles" />
        <div className="mt-3 space-y-2">
          {[1, 2].map((n) => (
            <div key={n} className="flex items-start gap-3 p-3 rounded-xl bg-stone-800/40 border border-stone-700/50">
              <div className="shrink-0 w-14 h-5 rounded bg-stone-700/40 shimmer" />
              <div className="flex-1 min-w-0">
                <div className="h-4 shimmer rounded w-1/3 mb-2" />
                <div className="h-3 shimmer rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (!records.length) return null;

  // Deduplicate by wikitreeId — API can return the same profile via different
  // name variants (e.g. formal expansion queries).
  const seen = new Set<string>();
  const unique = records.filter((r) => {
    if (seen.has(r.wikitreeId)) return false;
    seen.add(r.wikitreeId);
    return true;
  });

  // When all remaining cards carry identical positive reasons (no date context
  // to distinguish them), showing 3 looks like a bug — cap at 2.
  const positiveReasons = (r: typeof unique[0]) =>
    r.reasons.filter((x) => !/differs|different/.test(x)).slice(0, 3).join(",");
  const allSameReasons =
    unique.length === 3 &&
    unique.every((r) => positiveReasons(r) === positiveReasons(unique[0]));
  const display = allSameReasons ? unique.slice(0, 2) : unique;

  return (
    <div className="py-5 animate-fade-up">
      <SectionHeader icon="🌳" title="WikiTree Profiles" />
      <p className="text-stone-500 text-xs mt-1 mb-3">
        Collaborative family-tree profiles matched to this marker. Confidence reflects how well the dates and place line up.
      </p>
      <ul className="space-y-2">
        {display.map((r) => {
          const conf = CONFIDENCE_STYLE[r.confidence] ?? CONFIDENCE_STYLE.low;
          const positive = r.reasons.filter((x) => !/differs|different/.test(x)).slice(0, 3);
          return (
            <li key={r.wikitreeId}>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 p-3 rounded-xl bg-stone-800 border border-stone-700 active:bg-stone-750 transition-colors"
              >
                <div
                  className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[0.65rem] font-semibold uppercase tracking-wide whitespace-nowrap"
                  style={{ background: conf.bg, color: conf.color }}
                >
                  {conf.label}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-stone-200 text-sm font-medium leading-snug">{r.name}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {r.birthDate && <span className="text-stone-400 text-xs">b. {r.birthDate}</span>}
                    {r.deathDate && <span className="text-stone-400 text-xs">d. {r.deathDate}</span>}
                    {!(r.birthDate || r.deathDate) && (r.deathPlace || r.birthPlace) && (
                      <span className="text-stone-400 text-xs truncate">{r.deathPlace || r.birthPlace}</span>
                    )}
                  </div>
                  {positive.length > 0 && (
                    <p className="text-stone-500 text-[0.7rem] mt-1 leading-snug">
                      Matched on: {positive.join(", ")}
                    </p>
                  )}
                  <p className="text-xs mt-1.5" style={{ color: "var(--t-gold-500)" }}>View WikiTree profile →</p>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SSDICard({
  records,
  loading,
  onRefresh,
  refreshing,
}: {
  records: import("@/types").SSDIRecord[];
  loading?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  if (loading && !records.length) {
    return (
      <div className="py-5 animate-fade-up">
        <SectionHeader icon="📋" title="Social Security Death Index" onRefresh={onRefresh} refreshing={refreshing} />
        <div className="mt-3 space-y-2">
          {[1, 2].map((n) => (
            <div key={n} className="flex items-start gap-3 p-3 rounded-xl bg-stone-800/40 border border-stone-700/50">
              <div className="shrink-0 w-14 h-5 rounded bg-stone-700/40 shimmer" />
              <div className="flex-1 min-w-0">
                <div className="h-4 shimmer rounded w-1/3 mb-2" />
                <div className="h-3 shimmer rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (!records.length) return null;
  return (
    <div className="py-5 animate-fade-up">
      <SectionHeader icon="📋" title="Social Security Death Index" onRefresh={onRefresh} refreshing={refreshing} />
      <p className="text-stone-500 text-xs mt-1 mb-3">
        SSDI records (1936–2014) — confirms death date and last known state.
      </p>
      <ul className="space-y-2">
        {records.map((r, i) => {
          const conf = CONFIDENCE_STYLE[r.matchConfidence] ?? CONFIDENCE_STYLE.low;
          return (
            <li key={i}>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 p-3 rounded-xl bg-stone-800 border border-stone-700 active:bg-stone-750 transition-colors"
              >
                <div
                  className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[0.65rem] font-semibold uppercase tracking-wide whitespace-nowrap"
                  style={{ background: conf.bg, color: conf.color }}
                >
                  {conf.label}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-stone-200 text-sm font-medium leading-snug">{r.name}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {r.birthDate && <span className="text-stone-400 text-xs">b. {r.birthDate}</span>}
                    {r.deathDate && <span className="text-stone-400 text-xs">d. {r.deathDate}</span>}
                    {r.lastResidenceState && (
                      <span className="text-stone-400 text-xs">Last residence: {r.lastResidenceState}</span>
                    )}
                  </div>
                  <p className="text-xs mt-1.5" style={{ color: "var(--t-gold-500)" }}>View SSDI record →</p>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Historical Census Card (F4) ───────────────────────────────────────────────

export function HistoricalCensusCard({ records, loading }: { records: import("@/types").HistoricalCensusRecord[]; loading?: boolean }) {
  if (loading && !records.length) {
    return (
      <div className="py-5 animate-fade-up">
        <SectionHeader icon="📊" title="Historical Census Records" />
        <div className="mt-3 space-y-2">
          {[1, 2].map((n) => (
            <div key={n} className="flex items-start gap-3 p-3 rounded-xl bg-stone-800/40 border border-stone-700/50">
              <div className="shrink-0 w-10 h-5 rounded bg-stone-700/40 shimmer" />
              <div className="flex-1 min-w-0">
                <div className="h-4 shimmer rounded w-1/3 mb-2" />
                <div className="h-3 shimmer rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (!records.length) return null;
  return (
    <div className="py-5 animate-fade-up">
      <SectionHeader icon="📊" title="Historical Census Records" />
      <p className="text-stone-500 text-xs mt-1 mb-3">
        1880–1940 U.S. Census — household, occupation, and birthplace data.
      </p>
      <ul className="space-y-2">
        {records.map((r, i) => (
          <li key={i}>
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 p-3 rounded-xl bg-stone-800 border border-stone-700 active:bg-stone-750 transition-colors"
            >
              <div
                className="shrink-0 mt-0.5 px-2 py-0.5 rounded text-[0.7rem] font-bold tabular-nums"
                style={{ background: "rgba(201,168,76,0.15)", color: "var(--t-gold-500)" }}
              >
                {r.year}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-stone-200 text-sm font-medium leading-snug">{r.name}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                  {(r.state || r.county) && (
                    <span className="text-stone-400 text-xs">
                      {[r.county, r.state].filter(Boolean).join(", ")}
                    </span>
                  )}
                  {r.occupation && <span className="text-stone-400 text-xs">{r.occupation}</span>}
                  {r.birthplace && <span className="text-stone-400 text-xs">b. {r.birthplace}</span>}
                </div>
                {r.household && r.household.length > 0 && (
                  <p className="text-stone-500 text-xs mt-1 truncate">
                    Household: {r.household.map((m) => m.name).join(", ")}
                  </p>
                )}
                <p className="text-xs mt-1.5" style={{ color: "var(--t-gold-500)" }}>View census record →</p>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Immigration Card (F5) ─────────────────────────────────────────────────────

export function ImmigrationCard({ records, loading }: { records: import("@/types").ImmigrationRecord[]; loading?: boolean }) {
  if (loading && !records.length) {
    return (
      <div className="py-5 animate-fade-up">
        <SectionHeader icon="⚓" title="Immigration & Passenger Records" />
        <div className="mt-3 space-y-2">
          {[1, 2].map((n) => (
            <div key={n} className="flex items-start gap-3 p-3 rounded-xl bg-stone-800/40 border border-stone-700/50">
              <div className="shrink-0 w-12 h-5 rounded bg-stone-700/40 shimmer" />
              <div className="flex-1 min-w-0">
                <div className="h-4 shimmer rounded w-1/3 mb-2" />
                <div className="h-3 shimmer rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (!records.length) return null;
  return (
    <div className="py-5 animate-fade-up">
      <SectionHeader icon="⚓" title="Immigration & Passenger Records" />
      <p className="text-stone-500 text-xs mt-1 mb-3">
        Ship passenger lists and naturalization records — homeland, contact, and arrival details.
      </p>
      <ul className="space-y-2">
        {records.map((r, i) => (
          <li key={i}>
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 p-3 rounded-xl bg-stone-800 border border-stone-700 active:bg-stone-750 transition-colors"
            >
              <div
                className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[0.65rem] font-semibold uppercase tracking-wide"
                style={{ background: "rgba(92,122,92,0.2)", color: "#8ab47a" }}
              >
                {r.arrivalYear ?? "Arrival"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-stone-200 text-sm font-medium leading-snug">{r.name}</p>
                <p className="text-stone-500 text-xs mt-0.5">{r.collection}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                  {r.origin && <span className="text-stone-400 text-xs">From: {r.origin}</span>}
                  {r.arrivalPort && <span className="text-stone-400 text-xs">Arrived: {r.arrivalPort}</span>}
                  {r.departurePort && <span className="text-stone-400 text-xs">Departed: {r.departurePort}</span>}
                </div>
                <p className="text-xs mt-1.5" style={{ color: "var(--t-gold-500)" }}>View passenger record →</p>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── NARA Item-Level Card (F6) ─────────────────────────────────────────────────

export function NaraItemCard({
  records,
  loading,
  onRefresh,
  refreshing,
}: {
  records: import("@/types").NaraItemRecord[];
  loading?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  if (loading && !records.length) {
    return (
      <div className="py-5 animate-fade-up">
        <SectionHeader icon="🎖" title="Military Item-Level Records" />
        <div className="mt-3 space-y-2">
          <div className="h-4 shimmer rounded w-3/4" />
          <div className="h-4 shimmer rounded w-5/6" />
          <div className="h-4 shimmer rounded w-1/2" />
        </div>
      </div>
    );
  }
  if (!records.length) return null;
  return (
    <div className="py-5 animate-fade-up">
      <SectionHeader icon="🎖" title="Military Item-Level Records" onRefresh={onRefresh} refreshing={refreshing} />
      <p className="text-stone-500 text-xs mt-1 mb-3">
        Enlistment, pension, and casualty records — direct links to digitized files.
      </p>
      <ul className="space-y-2">
        {records.map((r, i) => (
          <li key={i}>
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 p-3 rounded-xl bg-stone-800 border border-stone-700 active:bg-stone-750 transition-colors"
            >
              <div
                className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[0.65rem] font-semibold uppercase tracking-wide whitespace-nowrap"
                style={{ background: "rgba(201,168,76,0.12)", color: "var(--t-gold-500)" }}
              >
                {r.recordGroup || "NARA"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-stone-200 text-sm font-medium leading-snug">{r.title}</p>
                {r.description && (
                  <p className="text-stone-500 text-xs mt-0.5 line-clamp-2">{r.description}</p>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                  {r.rank       && <span className="text-stone-400 text-xs">Rank: {r.rank}</span>}
                  {r.occupation && <span className="text-stone-400 text-xs">Occ: {r.occupation}</span>}
                  {r.birthplace && <span className="text-stone-400 text-xs">b. {r.birthplace}</span>}
                </div>
                <p className="text-xs mt-1.5" style={{ color: "var(--t-gold-500)" }}>
                  {r.pdfUrl ? "View PDF →" : "Search records →"}
                </p>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Research Checklist Card ───────────────────────────────────────────────────

const PRIORITY_LABEL: Record<1 | 2 | 3, { label: string; color: string; bg: string; textColor: string }> = {
  1: { label: "Do First",   color: "#e8a87c", bg: "rgba(180,90,40,0.2)",  textColor: "var(--t-stone-200)" },
  2: { label: "High Value", color: "var(--t-gold-500)", bg: "rgba(150,100,20,0.2)", textColor: "var(--t-gold-500)" },
  3: { label: "Supplement", color: "#7a9a7a", bg: "rgba(50,90,50,0.2)",   textColor: "var(--t-stone-300)" },
};

export function ResearchChecklistCard({
  checklist,
  loading,
}: {
  checklist?: import("@/types").ResearchChecklist;
  loading?: boolean;
}) {
  if (loading && !checklist?.items.length) {
    return (
      <div className="py-5 animate-fade-up">
        <SectionHeader icon="🔍" title="What to Research Next" />
        <div className="mt-3 space-y-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-start gap-3 p-3 rounded-xl bg-stone-800/40 border border-stone-700/50">
              <div className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-stone-700/40 shimmer" />
              <div className="flex-1 min-w-0">
                <div className="h-4 shimmer rounded w-5/6 mb-2.5" />
                <div className="flex gap-2 items-center">
                  <div className="w-16 h-4 rounded bg-stone-700/40 shimmer" />
                  <div className="w-12 h-3.5 rounded bg-stone-700/30 shimmer" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (!checklist) return null;
  const { items } = checklist;
  if (!items.length) return null;

  return (
    <div className="py-5 animate-fade-up">
      <SectionHeader icon="🔍" title="What to Research Next" />
      <p className="text-stone-500 text-xs mt-1 mb-3">
        Prioritized next steps based on available evidence. Tap any step to open the source.
      </p>
      <ol className="space-y-2">
        {items.map((item: import("@/types").ResearchChecklistItem, i: number) => {
          const badge = PRIORITY_LABEL[item.priority];
          const content = (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-stone-800 border border-stone-700 transition-colors">
              {/* Step number */}
              <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[0.65rem] font-bold text-[#1a1917]" style={{ background: badge.color }}>
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-stone-200 text-sm leading-snug">{item.action}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span
                    className="text-[0.65rem] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide"
                    style={{ background: badge.bg, color: badge.textColor }}
                  >
                    {badge.label}
                  </span>
                  <span className="text-stone-500 text-xs">{item.source}</span>
                </div>
                {item.url && (
                  <p className="text-xs mt-1" style={{ color: "var(--t-gold-500)" }}>
                    Open source →
                  </p>
                )}
              </div>
            </div>
          );

          return (
            <li key={i}>
              {item.url ? (
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="block active:opacity-80">
                  {content}
                </a>
              ) : content}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── Military Card ─────────────────────────────────────────────────────────────

export function HouseholdCard({ records }: { records: import("@/types").HistoricalCensusRecord[] }) {
  // Pick the census year with the most household members
  const best = records
    .filter((r) => r.household?.length)
    .sort((a, b) => (b.household?.length ?? 0) - (a.household?.length ?? 0))[0];
  if (!best?.household?.length) return null;

  return (
    <div className="py-5 animate-fade-up">
      <SectionHeader icon="📋" title={`Household — ${best.year} Census`} />
      <div className="mt-3 rounded-xl bg-stone-800 border border-stone-700/60 overflow-hidden">
        {best.household.map((m, i) => (
          <div key={i} className="flex items-start gap-3 px-3 py-2.5 border-b border-stone-700/50 last:border-0">
            <div className="flex-1 min-w-0">
              <span className="text-stone-200 text-sm font-medium">{m.name || "Unknown"}</span>
              {m.relationship && (
                <span className="text-stone-500 text-xs ml-2 capitalize">{m.relationship}</span>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0 text-xs text-stone-500">
              {m.age && <span>Age {m.age}</span>}
              {m.birthplace && <span>{m.birthplace}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Immigration Journey Card ──────────────────────────────────────────────────

export function ImmigrationJourneyCard({ records }: { records: import("@/types").ImmigrationRecord[] }) {
  if (!records.length) return null;
  const r = records[0];
  const hasRoute = r.departurePort || r.arrivalPort;

  return (
    <div className="py-5 animate-fade-up">
      <SectionHeader icon="🚢" title="Immigration Journey" />
      <div className="mt-3 rounded-xl bg-stone-800 border border-stone-700/60 p-4">
        {hasRoute && (
          <div className="flex items-center gap-3 mb-3">
            {r.departurePort && (
              <div className="text-center">
                <p className="text-[0.65rem] uppercase tracking-widest text-stone-500 mb-0.5">Departed</p>
                <p className="text-stone-200 text-sm font-medium">{r.departurePort}</p>
              </div>
            )}
            {r.departurePort && r.arrivalPort && (
              <svg width="32" height="12" viewBox="0 0 32 12" fill="none" className="text-stone-600 shrink-0">
                <path d="M0 6h28M22 1l6 5-6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            {r.arrivalPort && (
              <div className="text-center">
                <p className="text-[0.65rem] uppercase tracking-widest text-stone-500 mb-0.5">Arrived</p>
                <p className="text-stone-200 text-sm font-medium">{r.arrivalPort}</p>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
          {r.origin && (
            <div>
              <span className="text-stone-500">Origin: </span>
              <span className="text-stone-300">{r.origin}</span>
            </div>
          )}
          {r.arrivalYear && (
            <div>
              <span className="text-stone-500">Year: </span>
              <span className="text-stone-300">{r.arrivalYear}</span>
            </div>
          )}
          {r.ageAtArrival && (
            <div>
              <span className="text-stone-500">Age at arrival: </span>
              <span className="text-stone-300">{r.ageAtArrival}</span>
            </div>
          )}
        </div>
        {r.collection && (
          <p className="text-stone-600 text-[0.7rem] italic mt-2">{r.collection}</p>
        )}
      </div>
    </div>
  );
}

// ── Find A Grave Submit Card (P4.2) ──────────────────────────────────────────

export const CATEGORY_META: Record<string, { title: string; description: string }> = {
  wwiDraft: {
    title: "WWI Draft Registration Cards",
    description: "Physical description, employer, and nearest relative — 24M cards from 1917–1918.",
  },
  stateVital: {
    title: "State Death Certificate",
    description: "Official record — cause of death, informant name, parents' birthplaces.",
  },
  modernObit: {
    title: "Modern Obituaries",
    description: "Post-1963 newspaper obituaries — not covered by Chronicling America.",
  },
  fraternal: {
    title: "Fraternal Organization Records",
    description: "Lodge membership rolls, benefit files, and meeting minutes.",
  },
};

export function ResearchLinksCard({ links }: { links: ResearchLink[] }) {
  if (!links.length) return null;

  const byCategory = links.reduce<Record<string, ResearchLink[]>>((acc, link) => {
    if (!acc[link.category]) acc[link.category] = [];
    acc[link.category].push(link);
    return acc;
  }, {});

  const order: Array<ResearchLink["category"]> = [
    "wwiDraft", "stateVital", "modernObit", "fraternal",
  ];

  return (
    <div className="py-5 animate-fade-up">
      <SectionHeader icon="📂" title="Targeted Research Sources" />
      <p className="text-stone-500 text-xs mt-1 mb-3">
        {"Sources matched to this person's era, location, and symbols."}
      </p>
      <div className="flex flex-col gap-4">
        {order.filter((cat) => byCategory[cat]).map((cat) => {
          const meta = CATEGORY_META[cat];
          const catLinks = byCategory[cat];
          return (
            <div key={cat}>
              <p className="text-[0.7rem] uppercase tracking-widest text-stone-500 font-semibold mb-1.5">{meta.title}</p>
              <p className="text-stone-500 text-xs mb-2 leading-relaxed">{meta.description}</p>
              <ul className="space-y-1.5">
                {catLinks.map((link) => (
                  <li key={link.url}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-xl bg-stone-800 border border-stone-700 active:bg-stone-750 transition-colors"
                    >
                      <span className="text-lg shrink-0">{link.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-stone-200 text-sm font-medium leading-snug">{link.label}</p>
                        <p className="text-stone-500 text-xs mt-0.5 leading-relaxed">{link.sub}</p>
                      </div>
                      <p className="text-xs shrink-0" style={{ color: "var(--t-gold-500)" }}>Open →</p>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Conflict Warning Card ─────────────────────────────────────────────────────

export function ExternalLinksCard({
  extracted,
  location,
  research,
}: {
  extracted: ExtractedGraveData;
  location: GeoLocation | null;
  research: ResearchData | null;
}) {
  const firstName  = extracted.firstName ?? extracted.name?.split(" ")[0] ?? "";
  const lastName   = extracted.lastName  ?? extracted.name?.split(" ").slice(-1)[0] ?? "";
  const birthYear  = extracted.birthYear ?? null;
  const deathYear  = extracted.deathYear ?? null;
  const state      = location?.state ?? "";

  const fn = encodeURIComponent(firstName);
  const ln = encodeURIComponent(lastName);

  // ±1 year windows to account for record-keeping variances
  const byLo = birthYear ? birthYear - 1 : null;
  const byHi = birthYear ? birthYear + 1 : null;
  const dyLo = deathYear ? deathYear - 1 : null;
  const dyHi = deathYear ? deathYear + 1 : null;

  const fagUrl = [
    `https://www.findagrave.com/memorial/search?firstname=${fn}&lastname=${ln}`,
    birthYear ? `&birth=${birthYear}` : "",
    deathYear ? `&death=${deathYear}` : "",
    state     ? `&state=${encodeURIComponent(state)}` : "",
  ].join("");

  const bgUrl = [
    `https://billiongraves.com/search/results#given_names=${fn}&family_names=${ln}`,
    byLo != null ? `&year_of_birth_start=${byLo}&year_of_birth_end=${byHi}` : "",
    dyLo != null ? `&year_of_death_start=${dyLo}&year_of_death_end=${dyHi}` : "",
  ].join("");

  const fsUrl = [
    `https://www.familysearch.org/search/record/results?q.givenName=${fn}&q.surname=${ln}`,
    byLo != null ? `&q.birthLikeDate.from=${byLo}&q.birthLikeDate.to=${byHi}` : "",
    dyLo != null ? `&q.deathLikeDate.from=${dyLo}&q.deathLikeDate.to=${dyHi}` : "",
  ].join("");

  const links = [
    { label: "Find A Grave",    sub: "200M+ memorials, photos, family connections", url: fagUrl, icon: "🪦" },
    { label: "BillionGraves",   sub: "GPS-indexed grave photos from volunteers",    url: bgUrl,  icon: "📍" },
    { label: "FamilySearch",    sub: "9 billion indexed records — free access",     url: fsUrl,  icon: "🌳" },
  ];

  return (
    <div className="py-5 animate-fade-up">
      <SectionHeader icon="🔗" title="Search Other Databases" />
      <p className="text-stone-500 text-xs mt-1 mb-3">
        Pre-filled searches in major genealogy databases — opens in your browser.
      </p>
      <ul className="space-y-2">
        {links.map(({ label, sub, url, icon }) => (
          <li key={label}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-xl bg-stone-800 border border-stone-700 active:bg-stone-750 transition-colors"
            >
              <span className="text-xl shrink-0">{icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-stone-200 text-sm font-medium">{label}</p>
                <p className="text-stone-500 text-xs mt-0.5">{sub}</p>
              </div>
              <p className="text-xs shrink-0" style={{ color: "var(--t-gold-500)" }}>Search →</p>
            </a>
          </li>
        ))}
      </ul>

      {/* Surname variant hints */}
      {research?.surnameVariants && research.surnameVariants.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-stone-500 uppercase tracking-widest mb-2">Also try alternate spellings</p>
          <div className="flex flex-wrap gap-2">
            {research.surnameVariants.map((variant) => {
              const varUrl = [
                `https://www.findagrave.com/memorial/search?firstname=${fn}&lastname=${encodeURIComponent(variant)}`,
                birthYear ? `&birth=${birthYear}` : "",
                deathYear ? `&death=${deathYear}` : "",
              ].join("");
              return (
                <a
                  key={variant}
                  href={varUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors active:opacity-80"
                  style={{ borderColor: "rgba(201,168,76,0.3)", color: "var(--t-gold-400)", background: "rgba(201,168,76,0.06)" }}
                >
                  {firstName} <strong>{variant}</strong> →
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Confidence Badge ─────────────────────────────────────────────────────────

export const CONFIDENCE_INFO: Record<string, { color: string; tip: string }> = {
  high:   { color: "#92cc92",              tip: "Claude read the inscription clearly. Name and dates are reliable." },
  medium: { color: "var(--t-gold-300)",    tip: "Most details were extracted, but some may be incomplete. Re-scan in better light if needed." },
  low:    { color: "#e88888",              tip: "The inscription was hard to read. Verify details manually and consider re-scanning." },
};

export function SectionHeader({
  icon, title, onRefresh, refreshing,
}: {
  icon: string; title: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500">
          {title}
        </h2>
      </div>
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={refreshing}
          aria-label={`Refresh ${title}`}
          className="text-stone-500 active:text-stone-300 disabled:opacity-40 p-1 -mr-1"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" className={refreshing ? "animate-spin" : ""}>
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
      )}
    </div>
  );
}

