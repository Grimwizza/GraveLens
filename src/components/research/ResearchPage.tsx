"use client";

/**
 * ResearchPage — manual genealogy research without a photo (/research).
 *
 * Type a name + dates → instant hits from the pooled burial index, then the
 * full free-source lookup (/api/lookup: WikiTree, loc.gov newspapers, NARA,
 * deep links). Every successful lookup is cached server-side and harvested
 * into the burial index, so repeat searches — by anyone — cost nothing.
 *
 * Modes (URL params):
 *   /research                                  blank form
 *   /research?firstName=&lastName=&...         prefilled (relative cards)
 *   /research?graveId=<id>                     record mode — prefill from an
 *                                              archive record (attach flow:
 *                                              RESEARCH_PAGE_PLAN.md Step 4)
 *
 * See RESEARCH_PAGE_PLAN.md for the full spec and remaining steps.
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import PageShell from "@/components/layout/PageShell";
import SourceStatusCard from "@/components/results/SourceStatusCard";
import {
  WikiTreeCard, RecordsCard, FamilySearchCard,
  ResearchChecklistCard, ResearchLinksCard, ExternalLinksCard,
} from "@/components/research/cards";
import { createClient } from "@/lib/supabase/browser";
import { searchBurialIndexPeople, type BurialIndexPerson } from "@/lib/community";
import { getGrave, saveGrave } from "@/lib/storage";
import { STATE_ABBREV } from "@/lib/stateUtils";
import type { ExtractedGraveData, GeoLocation, ResearchData } from "@/types";

// ── Recent searches (local only) ─────────────────────────────────────────────

const RECENT_KEY = "gl_recent_research";
const RECENT_MAX = 10;

interface RecentSearch {
  firstName: string;
  lastName: string;
  birthYear: string;
  deathYear: string;
  state: string;
  ts: number;
}

function loadRecent(): RecentSearch[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveRecent(s: Omit<RecentSearch, "ts">): RecentSearch[] {
  const key = (r: Omit<RecentSearch, "ts">) =>
    [r.firstName, r.lastName, r.birthYear, r.deathYear, r.state].join("|").toLowerCase();
  const next = [
    { ...s, ts: Date.now() },
    ...loadRecent().filter((r) => key(r) !== key(s)),
  ].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* quota */ }
  return next;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ResearchPage() {
  const params = useSearchParams();

  const [firstName, setFirstName] = useState(params.get("firstName") ?? "");
  const [lastName, setLastName] = useState(params.get("lastName") ?? "");
  const [birthYear, setBirthYear] = useState(params.get("birthYear") ?? "");
  const [deathYear, setDeathYear] = useState(params.get("deathYear") ?? "");
  const [stateName, setStateName] = useState(params.get("state") ?? "");
  const [city, setCity] = useState("");

  // Record mode: launched from an archive record's Research button
  const graveId = params.get("graveId");
  const [sourceRecordName, setSourceRecordName] = useState<string | null>(null);

  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [searching, setSearching] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [indexHits, setIndexHits] = useState<BurialIndexPerson[]>([]);
  const [research, setResearch] = useState<ResearchData | null>(null);
  const [searched, setSearched] = useState(false);
  const [attachState, setAttachState] = useState<"idle" | "saving" | "done">("idle");

  useEffect(() => { setRecent(loadRecent()); }, []);

  // Record mode prefill
  useEffect(() => {
    if (!graveId) return;
    getGrave(graveId).then((g) => {
      if (!g) return;
      setSourceRecordName(g.extracted.name || null);
      setFirstName(g.extracted.firstName ?? "");
      setLastName(g.extracted.lastName ?? "");
      setBirthYear(g.extracted.birthYear ? String(g.extracted.birthYear) : "");
      setDeathYear(g.extracted.deathYear ? String(g.extracted.deathYear) : "");
      setStateName(g.location?.state ?? "");
      setCity(g.location?.city ?? "");
    }).catch(() => {});
  }, [graveId]);

  const canSearch = lastName.trim().length >= 2 && !searching;

  const runSearch = useCallback(async (over?: Partial<RecentSearch>) => {
    const fn = (over?.firstName ?? firstName).trim();
    const ln = (over?.lastName ?? lastName).trim();
    const by = (over?.birthYear ?? birthYear).trim();
    const dy = (over?.deathYear ?? deathYear).trim();
    const st = (over?.state ?? stateName).trim();
    if (ln.length < 2) return;

    setSearching(true);
    setSearched(true);
    setAuthRequired(false);
    setFromCache(false);
    setResearch(null);
    setIndexHits([]);
    setAttachState("idle");

    const byNum = /^\d{4}$/.test(by) ? parseInt(by, 10) : null;
    const dyNum = /^\d{4}$/.test(dy) ? parseInt(dy, 10) : null;

    // Instant tier: pooled burial index (non-blocking, tolerant of failure)
    const supabase = createClient();
    searchBurialIndexPeople(supabase, {
      firstName: fn || undefined, lastName: ln,
      birthYear: byNum, deathYear: dyNum, state: st || undefined,
    }).then(setIndexHits).catch(() => {});

    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: [fn, ln].filter(Boolean).join(" "),
          firstName: fn, lastName: ln,
          birthYear: byNum, deathYear: dyNum,
          state: st || undefined, city: city.trim() || undefined,
          inscription: "", symbols: [],
        }),
      });
      if (res.status === 401) {
        setAuthRequired(true);
        return;
      }
      if (!res.ok) return;
      const d = await res.json();
      setFromCache(!!d.cachedResearch);
      setResearch(d as ResearchData);
      setRecent(saveRecent({ firstName: fn, lastName: ln, birthYear: by, deathYear: dy, state: st }));
    } catch {
      /* network failure — sourceStatus stays empty; user can retry */
    } finally {
      setSearching(false);
    }
  }, [firstName, lastName, birthYear, deathYear, stateName, city]);

  // Record mode: merge fresh findings into the originating archive record,
  // preserving user-facing content the lookup response doesn't carry.
  const attachToRecord = useCallback(async () => {
    if (!graveId || !research || attachState === "saving") return;
    setAttachState("saving");
    try {
      const existing = await getGrave(graveId);
      if (!existing) return;
      const merged = {
        ...existing,
        research: {
          ...existing.research,
          ...research,
          storyScript:     existing.research?.storyScript,
          storyScripts:    existing.research?.storyScripts,
          narrative:       existing.research?.narrative,
          narratives:      existing.research?.narratives,
          epitaphSource:   existing.research?.epitaphSource,
          epitaphSources:  existing.research?.epitaphSources,
          epitaphMeaning:  existing.research?.epitaphMeaning,
          epitaphMeanings: existing.research?.epitaphMeanings,
          culturalContext: existing.research?.culturalContext,
        },
      };
      await saveGrave(merged);
      setAttachState("done");
    } catch {
      setAttachState("idle");
    }
  }, [graveId, research, attachState]);

  // Pseudo-record for the deep-link card builders (no photo, no GPS)
  const pseudoExtracted: ExtractedGraveData = {
    name: [firstName, lastName].filter(Boolean).join(" ").trim(),
    firstName: firstName.trim(), lastName: lastName.trim(),
    birthDate: "", birthYear: /^\d{4}$/.test(birthYear) ? parseInt(birthYear, 10) : null,
    deathDate: "", deathYear: /^\d{4}$/.test(deathYear) ? parseInt(deathYear, 10) : null,
    ageAtDeath: null, inscription: "", epitaph: "", symbols: [],
    markerType: "", material: "", condition: "", confidence: "high", source: "manual",
  };
  const pseudoLocation: GeoLocation = { lat: 0, lng: 0, state: stateName || undefined, city: city || undefined };

  const field = "bg-stone-800 text-stone-100 text-sm rounded-xl px-3 py-2.5 border border-stone-700 focus:outline-none focus:border-stone-500 w-full";

  return (
    <PageShell
      title="Research"
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--t-gold-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      }
    >
      <div className="max-w-2xl mx-auto w-full px-5 pb-24">
        {sourceRecordName && (
          <div className="mt-4 px-4 py-3 rounded-2xl text-sm" style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.18)" }}>
            <span className="text-stone-400">Researching from your archive: </span>
            <span className="font-medium" style={{ color: "var(--t-gold-400)" }}>{sourceRecordName}</span>
          </div>
        )}

        {/* ── Search form ── */}
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => { e.preventDefault(); runSearch(); }}
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-stone-500 uppercase tracking-widest">First name</span>
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g. William" className={field} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-stone-500 uppercase tracking-widest">Last name *</span>
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="e.g. Larson" className={field} required />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-stone-500 uppercase tracking-widest">Birth year</span>
              <input type="text" inputMode="numeric" maxLength={4} value={birthYear} onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, ""))} placeholder="1861" className={field} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-stone-500 uppercase tracking-widest">Death year</span>
              <input type="text" inputMode="numeric" maxLength={4} value={deathYear} onChange={(e) => setDeathYear(e.target.value.replace(/\D/g, ""))} placeholder="1922" className={field} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-stone-500 uppercase tracking-widest">State (optional)</span>
              <select value={stateName} onChange={(e) => setStateName(e.target.value)} className={field}>
                <option value="">Any state</option>
                {Object.keys(STATE_ABBREV).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-stone-500 uppercase tracking-widest">City (optional)</span>
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Warren" className={field} />
            </label>
          </div>
          <button
            type="submit"
            disabled={!canSearch}
            className="mt-1 w-full h-12 rounded-xl font-semibold text-[#1a1917] text-sm transition-all active:scale-[0.98] disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, var(--t-gold-500), var(--t-gold-400))" }}
          >
            {searching ? "Searching…" : "Search records"}
          </button>
        </form>

        {/* ── Recent searches ── */}
        {!searched && recent.length > 0 && (
          <div className="mt-5">
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-2">Recent searches</p>
            <div className="flex flex-wrap gap-2">
              {recent.map((r, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setFirstName(r.firstName); setLastName(r.lastName);
                    setBirthYear(r.birthYear); setDeathYear(r.deathYear); setStateName(r.state);
                    runSearch(r);
                  }}
                  className="px-3 py-1.5 rounded-full text-xs bg-stone-800 border border-stone-700 text-stone-300 active:border-stone-500"
                >
                  {[r.firstName, r.lastName].filter(Boolean).join(" ")}
                  {(r.birthYear || r.deathYear) && (
                    <span className="text-stone-500"> {r.birthYear || "?"}–{r.deathYear || "?"}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Sign-in gate ── */}
        {authRequired && (
          <div className="mt-6 rounded-2xl p-4 border border-amber-500/20 bg-amber-500/5 text-center">
            <p className="text-stone-200 text-sm font-medium mb-1">Sign in to run research</p>
            <p className="text-stone-400 text-xs mb-3">Searches use the shared GraveLens research index and free public archives.</p>
            <Link href="/login" className="inline-block px-5 py-2.5 rounded-xl text-sm font-semibold text-[#1a1917]" style={{ background: "var(--t-gold-500)" }}>
              Sign in
            </Link>
          </div>
        )}

        {/* ── Instant tier: pooled index hits ── */}
        {indexHits.length > 0 && (
          <div className="py-5 animate-fade-up">
            <div className="flex items-center gap-2">
              <span className="text-base">🗂</span>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500">In the GraveLens index</h2>
            </div>
            <p className="text-stone-500 text-xs mt-1 mb-3">
              Already recorded from community gravestone scans — instant, no external searches needed.
            </p>
            <ul className="space-y-1.5">
              {indexHits.map((p) => (
                <li key={p.identityKey} className="flex items-center gap-3 p-3 rounded-xl bg-stone-800 border border-stone-700">
                  <span className="shrink-0 w-8 h-8 rounded-lg bg-stone-700/50 flex items-center justify-center text-xs" aria-hidden>🪦</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-stone-200 text-sm font-medium font-serif truncate">{p.name}</p>
                    <p className="text-stone-500 text-xs mt-0.5 truncate">
                      {[[p.birthYear, p.deathYear].filter(Boolean).join(" – "), p.cemetery, p.state].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {p.scanCount > 1 && (
                    <span className="text-[0.6rem] shrink-0 px-1.5 py-0.5 rounded uppercase tracking-wide text-stone-400 bg-stone-700/50">
                      {p.scanCount} scans
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Full research results ── */}
        {(searching || research) && (
          <>
            {fromCache && (
              <p className="mt-2 text-[0.7rem] text-stone-500">⚡ Served instantly from the shared research cache — no external calls.</p>
            )}

            {/* Record mode: save these findings back onto the archive record */}
            {graveId && research && !searching && (
              <button
                onClick={attachToRecord}
                disabled={attachState !== "idle"}
                className="mt-4 w-full h-11 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-70"
                style={
                  attachState === "done"
                    ? { background: "rgba(122,184,122,0.15)", color: "#7ab87a", border: "1px solid rgba(122,184,122,0.35)" }
                    : { background: "linear-gradient(135deg, var(--t-gold-500), var(--t-gold-400))", color: "#1a1917" }
                }
              >
                {attachState === "done" ? "✓ Attached — record updated"
                  : attachState === "saving" ? "Attaching…"
                  : `Attach findings to ${sourceRecordName ?? "record"}`}
              </button>
            )}

            {!searching && <SourceStatusCard sourceStatus={research?.sourceStatus} />}

            {(research?.wikitree?.length || searching) ? (
              <WikiTreeCard records={research?.wikitree ?? []} loading={searching} />
            ) : null}

            {(research?.newspapers?.length || searching) ? (
              <RecordsCard
                title="Newspaper Archives" icon="📰" loading={searching}
                items={research?.newspapers?.map((n) => ({ title: n.newspaper, subtitle: n.date, detail: n.snippet, url: n.url }))}
              />
            ) : null}

            {(research?.naraRecords?.length) ? (
              <RecordsCard
                title="National Archives" icon="🏛" loading={searching}
                items={research?.naraRecords?.map((r) => ({ title: r.title, subtitle: r.recordGroup ? `Record Group ${r.recordGroup}` : "", detail: r.description, url: r.url }))}
              />
            ) : null}

            {(research?.landRecords?.length) ? (
              <RecordsCard
                title="Land Patents (BLM)" icon="📜" loading={searching}
                items={research?.landRecords?.map((l) => ({ title: `${l.acres} acres — ${l.county}, ${l.state}`, subtitle: l.date, detail: `Patent #${l.patentNumber}`, url: l.documentUrl }))}
              />
            ) : null}

            {(research?.familySearchHints?.length) ? (
              <FamilySearchCard hints={research?.familySearchHints} loading={searching} />
            ) : null}

            {(research?.researchChecklist?.items?.length) ? (
              <ResearchChecklistCard checklist={research?.researchChecklist} loading={searching} />
            ) : null}

            {!searching && pseudoExtracted.name && (
              <ExternalLinksCard extracted={pseudoExtracted} location={pseudoLocation} research={research} />
            )}

            {!searching && research?.researchLinks?.length ? (
              <ResearchLinksCard links={research.researchLinks} />
            ) : null}

            {!searching && research && !authRequired &&
              !research.wikitree?.length && !research.newspapers?.length &&
              !research.naraRecords?.length && !research.landRecords?.length && indexHits.length === 0 && (
              <p className="mt-4 text-stone-500 text-sm text-center">
                No inline records found — try the pre-filled database searches above, or widen the years.
              </p>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
