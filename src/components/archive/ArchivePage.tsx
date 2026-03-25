"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import BottomNav from "@/components/layout/BottomNav";
import { getAllGraves, deleteGrave, saveGrave } from "@/lib/storage";
import type { GraveRecord } from "@/types";
import Link from "next/link";

type SortField = "birthYear" | "deathYear";
type SortDir = "asc" | "desc";

// ── Learned cemetery storage ───────────────────────────────────────────────
const LEARNED_KEY = "gl_learned_cemeteries";
const PROXIMITY_METERS = 750;

interface LearnedCemetery { name: string; lat: number; lng: number }

function loadLearned(): LearnedCemetery[] {
  try { return JSON.parse(localStorage.getItem(LEARNED_KEY) ?? "[]"); }
  catch { return []; }
}
function saveLearned(entries: LearnedCemetery[]): void {
  try { localStorage.setItem(LEARNED_KEY, JSON.stringify(entries)); } catch { /* ignore */ }
}
function learnCemetery(name: string, lat: number, lng: number): void {
  const entries = loadLearned();
  if (!entries.some((e) => distanceMeters(lat, lng, e.lat, e.lng) < PROXIMITY_METERS)) {
    saveLearned([...entries, { name, lat, lng }]);
  }
}
function findLearnedCemetery(lat: number, lng: number): string | undefined {
  return loadLearned().find((e) => distanceMeters(lat, lng, e.lat, e.lng) < PROXIMITY_METERS)?.name;
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Nominatim reverse geocode ──────────────────────────────────────────────
async function reverseCemetery(lat: number, lng: number): Promise<{
  cemetery?: string; city?: string; state?: string;
}> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&zoom=17&lat=${lat}&lon=${lng}`,
    { headers: { "Accept-Language": "en" } }
  );
  if (!res.ok) return {};
  const data = await res.json();
  const addr = data.address ?? {};
  const isCemeteryFeature =
    data.type === "cemetery" || data.type === "grave_yard" ||
    (data.category === "landuse" && data.type === "cemetery") ||
    (data.category === "amenity" && data.type === "grave_yard");
  const cemetery =
    addr.cemetery || addr.amenity || (isCemeteryFeature ? data.name : undefined) || undefined;
  return {
    cemetery: cemetery || undefined,
    city: addr.city || addr.town || addr.village || addr.hamlet || undefined,
    state: addr.state || undefined,
  };
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ── Component ──────────────────────────────────────────────────────────────
export default function ArchivePage() {
  const [graves, setGraves] = useState<GraveRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ── Assignment flow state ─────────────────────────────────────────────
  // Queue of grave IDs that still need a cemetery name after auto-enrichment
  const [assignmentQueue, setAssignmentQueue] = useState<string[]>([]);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const [assignmentInput, setAssignmentInput] = useState("");
  // Proximity confirmation: after assigning one grave, nearby unassigned ones
  const [nearbyConfirm, setNearbyConfirm] = useState<{
    name: string;
    graves: GraveRecord[];
  } | null>(null);

  // Filter / sort state
  const [sortField, setSortField] = useState<SortField>("deathYear");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterState, setFilterState] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterCemetery, setFilterCemetery] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ── Load graves ──────────────────────────────────────────────────────────
  useEffect(() => {
    getAllGraves().then((g) => { setGraves(g); setLoading(false); });
  }, []);

  // ── Cemetery enrichment ──────────────────────────────────────────────────
  // 1. Check learned cemeteries (instant, no network)
  // 2. Nominatim reverse geocode (1 req/sec)
  // 3. Unresolved → placed in assignmentQueue for guided manual entry
  useEffect(() => {
    if (loading) return;

    const needsEnrichment = graves.filter(
      (g) => g.location?.lat && g.location?.lng && !g.location?.cemetery
    );
    if (needsEnrichment.length === 0) return;

    let active = true;
    setEnriching(true);
    const resolvedIds = new Set<string>();

    (async () => {
      let nominatimCalls = 0;

      for (const grave of needsEnrichment) {
        if (!active) break;
        const { lat, lng } = grave.location;

        // 1. Learned cemeteries
        const learnedName = findLearnedCemetery(lat, lng);
        if (learnedName) {
          const updated = { ...grave, location: { ...grave.location, cemetery: learnedName } };
          await saveGrave(updated);
          if (active) setGraves((prev) => prev.map((g) => g.id === updated.id ? updated : g));
          resolvedIds.add(grave.id);
          continue;
        }

        // 2. Nominatim
        if (nominatimCalls > 0) await sleep(1100);
        if (!active) break;
        nominatimCalls++;

        try {
          const enriched = await reverseCemetery(lat, lng);
          if (!active) break;
          const hasNew =
            enriched.cemetery ||
            (enriched.city && !grave.location.city) ||
            (enriched.state && !grave.location.state);
          if (hasNew) {
            const updated: GraveRecord = {
              ...grave,
              location: {
                ...grave.location,
                cemetery: enriched.cemetery || grave.location.cemetery,
                city: enriched.city || grave.location.city,
                state: enriched.state || grave.location.state,
              },
            };
            await saveGrave(updated);
            if (enriched.cemetery) learnCemetery(enriched.cemetery, lat, lng);
            if (active) setGraves((prev) => prev.map((g) => g.id === updated.id ? updated : g));
            resolvedIds.add(grave.id);
          }
        } catch { /* non-fatal */ }
      }

      if (active) {
        setEnriching(false);
        // Build queue from graves that still have no cemetery after enrichment
        const unresolved = needsEnrichment
          .filter((g) => !resolvedIds.has(g.id))
          .map((g) => g.id);
        if (unresolved.length > 0) setAssignmentQueue(unresolved);
      }
    })();

    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // ── Assignment flow helpers ──────────────────────────────────────────────
  const openNextAssignment = (queue: string[]) => {
    if (queue.length === 0) {
      setActiveAssignmentId(null);
      setAssignmentInput("");
      return;
    }
    setActiveAssignmentId(queue[0]);
    setAssignmentInput("");
  };

  const startAssignment = () => openNextAssignment(assignmentQueue);

  const handleAssignSave = async () => {
    const name = assignmentInput.trim();
    if (!name || !activeAssignmentId) return;

    const grave = graves.find((g) => g.id === activeAssignmentId);
    if (!grave) return;

    // Apply to current grave
    const updated = { ...grave, location: { ...grave.location, cemetery: name } };
    await saveGrave(updated);
    if (grave.location?.lat && grave.location?.lng) {
      learnCemetery(name, grave.location.lat, grave.location.lng);
    }
    setGraves((prev) => prev.map((g) => g.id === updated.id ? updated : g));

    // Remove from queue
    const nextQueue = assignmentQueue.filter((id) => id !== activeAssignmentId);
    setAssignmentQueue(nextQueue);
    setActiveAssignmentId(null);
    setAssignmentInput("");

    // Find other unassigned graves in the queue that are within proximity
    if (grave.location?.lat && grave.location?.lng) {
      const nearby = nextQueue
        .map((id) => graves.find((g) => g.id === id))
        .filter((g): g is GraveRecord =>
          Boolean(
            g?.location?.lat &&
            g?.location?.lng &&
            !g?.location?.cemetery &&
            distanceMeters(grave.location.lat, grave.location.lng, g.location.lat, g.location.lng) < PROXIMITY_METERS
          )
        );

      if (nearby.length > 0) {
        setNearbyConfirm({ name, graves: nearby });
        return; // wait for confirmation before advancing
      }
    }

    openNextAssignment(nextQueue);
  };

  const handleAssignSkip = () => {
    const nextQueue = assignmentQueue.filter((id) => id !== activeAssignmentId);
    setAssignmentQueue(nextQueue);
    openNextAssignment(nextQueue);
  };

  const handleNearbyYes = async () => {
    if (!nearbyConfirm) return;
    const { name, graves: nearbyGraves } = nearbyConfirm;

    // Apply cemetery name to all nearby graves
    const ids = nearbyGraves.map((g) => g.id);
    for (const g of nearbyGraves) {
      const updated = { ...g, location: { ...g.location, cemetery: name } };
      await saveGrave(updated);
      setGraves((prev) => prev.map((r) => r.id === updated.id ? updated : r));
    }

    const nextQueue = assignmentQueue.filter((id) => !ids.includes(id));
    setAssignmentQueue(nextQueue);
    setNearbyConfirm(null);
    openNextAssignment(nextQueue);
  };

  const handleNearbyNo = () => {
    // Nearby graves stay in queue — user will be prompted individually
    setNearbyConfirm(null);
    openNextAssignment(assignmentQueue);
  };

  // ── Derived filter options ────────────────────────────────────────────────
  const uniqueStates = useMemo(() => {
    const vals = graves.map((g) => g.location?.state).filter((v): v is string => Boolean(v));
    return [...new Set(vals)].sort();
  }, [graves]);

  const uniqueCities = useMemo(() => {
    const vals = graves
      .filter((g) => !filterState || g.location?.state === filterState)
      .map((g) => g.location?.city)
      .filter((v): v is string => Boolean(v));
    return [...new Set(vals)].sort();
  }, [graves, filterState]);

  const uniqueTags = useMemo(() => {
    const vals = graves.flatMap((g) => g.tags ?? []);
    return [...new Set(vals)].sort();
  }, [graves]);

  const uniqueCemeteries = useMemo(() => {
    const vals = graves
      .filter(
        (g) =>
          (!filterState || g.location?.state === filterState) &&
          (!filterCity || g.location?.city === filterCity)
      )
      .map((g) => g.location?.cemetery)
      .filter((v): v is string => Boolean(v));
    return [...new Set(vals)].sort();
  }, [graves, filterState, filterCity]);

  // ── Filtered + sorted graves ──────────────────────────────────────────────
  const filteredGraves = useMemo(() => {
    let result = graves.filter((g) => {
      if (filterState && g.location?.state !== filterState) return false;
      if (filterCity && g.location?.city !== filterCity) return false;
      if (filterCemetery && g.location?.cemetery !== filterCemetery) return false;
      if (filterTag && !g.tags?.includes(filterTag)) return false;
      return true;
    });
    result = [...result].sort((a, b) => {
      const aVal = a.extracted[sortField] ?? null;
      const bVal = b.extracted[sortField] ?? null;
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
    return result;
  }, [graves, filterState, filterCity, filterCemetery, filterTag, sortField, sortDir]);

  const handleDelete = async (id: string) => {
    await deleteGrave(id);
    setGraves((prev) => prev.filter((g) => g.id !== id));
    setDeleteConfirm(null);
  };

  const handleFilterState = (val: string) => { setFilterState(val); setFilterCity(""); setFilterCemetery(""); };
  const handleFilterCity = (val: string) => { setFilterCity(val); setFilterCemetery(""); };

  const hasActiveFilters =
    filterState || filterCity || filterCemetery || filterTag ||
    sortField !== "deathYear" || sortDir !== "asc";

  const showAssignBanner = assignmentQueue.length > 0 && !enriching && !activeAssignmentId && !nearbyConfirm;

  return (
    <div className="flex flex-col min-h-dvh bg-stone-900">
      {/* Header */}
      <header
        className="sticky top-0 z-30 bg-stone-900 border-b border-stone-800"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
              <path d="M11 2L11 4M11 18L11 20M4 11L2 11M20 11L18 11" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="11" cy="11" r="4" stroke="#c9a84c" strokeWidth="1.5" />
            </svg>
            <span className="font-serif text-stone-100 text-lg font-semibold">Archive</span>
            {graves.length > 0 && (
              <span className="text-xs text-stone-500 ml-1">
                ({filteredGraves.length}{filteredGraves.length !== graves.length && `/${graves.length}`}{" "}
                {graves.length === 1 ? "marker" : "markers"})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {graves.length > 0 && (
              <button
                onClick={() => setFiltersOpen((o) => !o)}
                className={`relative w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${filtersOpen ? "bg-stone-700" : "bg-stone-800"}`}
                aria-label="Toggle filters"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={hasActiveFilters ? "#c9a84c" : "#8a8580"} strokeWidth="1.5" strokeLinecap="round">
                  <path d="M1 3h14M3 8h10M6 13h4" />
                </svg>
                {hasActiveFilters && (
                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-gold-500 rounded-full" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Filter panel */}
        {filtersOpen && graves.length > 0 && (
          <div className="px-4 pb-3 border-t border-stone-800 pt-3 flex flex-col gap-2">
            <div className="flex gap-2">
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as SortField)}
                className="flex-1 bg-stone-800 text-stone-200 text-xs rounded-lg px-3 py-2 border border-stone-700 appearance-none"
              >
                <option value="deathYear">Sort by death year</option>
                <option value="birthYear">Sort by birth year</option>
              </select>
              <button
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                className="flex items-center gap-1 px-3 py-2 bg-stone-800 border border-stone-700 text-stone-300 text-xs rounded-lg shrink-0"
              >
                {sortDir === "asc" ? (
                  <><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2v8M3 7l3 3 3-3" /></svg>Oldest first</>
                ) : (
                  <><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 10V2M3 5l3-3 3 3" /></svg>Newest first</>
                )}
              </button>
            </div>
            <div className="flex gap-2">
              <select value={filterState} onChange={(e) => handleFilterState(e.target.value)} className="flex-1 bg-stone-800 text-stone-200 text-xs rounded-lg px-3 py-2 border border-stone-700 appearance-none">
                <option value="">All states</option>
                {uniqueStates.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filterCity} onChange={(e) => handleFilterCity(e.target.value)} disabled={uniqueCities.length === 0} className="flex-1 bg-stone-800 text-stone-200 text-xs rounded-lg px-3 py-2 border border-stone-700 appearance-none disabled:opacity-40">
                <option value="">All cities</option>
                {uniqueCities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <select value={filterCemetery} onChange={(e) => setFilterCemetery(e.target.value)} disabled={uniqueCemeteries.length === 0} className="w-full bg-stone-800 text-stone-200 text-xs rounded-lg px-3 py-2 border border-stone-700 appearance-none disabled:opacity-40">
              <option value="">All cemeteries</option>
              {uniqueCemeteries.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} disabled={uniqueTags.length === 0} className="w-full bg-stone-800 text-stone-200 text-xs rounded-lg px-3 py-2 border border-stone-700 appearance-none disabled:opacity-40">
              <option value="">All tags</option>
              {uniqueTags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {hasActiveFilters && (
              <button
                onClick={() => { setFilterState(""); setFilterCity(""); setFilterCemetery(""); setFilterTag(""); setSortField("deathYear"); setSortDir("asc"); }}
                className="text-xs text-gold-400 text-left"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col pb-20">
        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <div className="w-6 h-6 border-2 border-gold-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : graves.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Assignment banner */}
            {showAssignBanner && (
              <div className="mx-4 mt-4 mb-1 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-gold-500/30 bg-gold-500/5 animate-fade-in">
                <div className="flex items-center gap-2 min-w-0">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M8 1.5C5.52 1.5 3.5 3.52 3.5 6c0 3.5 4.5 8.5 4.5 8.5s4.5-5 4.5-8.5c0-2.48-2.02-4.5-4.5-4.5z" strokeLinejoin="round" />
                    <circle cx="8" cy="6" r="1.5" />
                  </svg>
                  <p className="text-gold-300 text-xs leading-snug">
                    <span className="font-semibold">{assignmentQueue.length} marker{assignmentQueue.length !== 1 ? "s" : ""}</span>{" "}
                    without a cemetery name
                  </p>
                </div>
                <button
                  onClick={startAssignment}
                  className="shrink-0 text-xs font-semibold text-stone-900 px-3 py-1.5 rounded-lg"
                  style={{ background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }}
                >
                  Assign
                </button>
              </div>
            )}

            <GraveList
              graves={filteredGraves}
              enriching={enriching}
              deleteConfirm={deleteConfirm}
              onDeleteRequest={setDeleteConfirm}
              onDeleteConfirm={handleDelete}
              onDeleteCancel={() => setDeleteConfirm(null)}
            />
          </>
        )}
      </main>

      {/* Assignment bottom sheet */}
      {activeAssignmentId && (() => {
        const grave = graves.find((g) => g.id === activeAssignmentId);
        if (!grave) return null;
        const queueIndex = assignmentQueue.indexOf(activeAssignmentId);
        const position = assignmentQueue.length - assignmentQueue.filter((id) => {
          // count how many we've already passed (not active, not in queue anymore) — just use original position
          return true;
        }).length;
        return (
          <AssignmentSheet
            grave={grave}
            value={assignmentInput}
            onChange={setAssignmentInput}
            onSave={handleAssignSave}
            onSkip={handleAssignSkip}
            current={queueIndex + 1}
            total={assignmentQueue.length}
          />
        );
      })()}

      {/* Proximity confirmation sheet */}
      {nearbyConfirm && (
        <NearbyConfirmSheet
          cemeteryName={nearbyConfirm.name}
          nearby={nearbyConfirm.graves}
          onYes={handleNearbyYes}
          onNo={handleNearbyNo}
        />
      )}

      <BottomNav />
    </div>
  );
}

// ── AssignmentSheet ────────────────────────────────────────────────────────
function AssignmentSheet({
  grave,
  value,
  onChange,
  onSave,
  onSkip,
  current,
  total,
}: {
  grave: GraveRecord;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onSkip: () => void;
  current: number;
  total: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60" onClick={onSkip} />
      <div
        className="relative w-full bg-stone-800 rounded-t-3xl animate-fade-up"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 bg-stone-600 rounded-full mx-auto mt-3 mb-5" />

        <div className="px-6 pb-2">
          {/* Progress */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif text-stone-100 text-lg">Name this cemetery</h3>
            {total > 1 && (
              <span className="text-stone-500 text-xs">{current} of {total}</span>
            )}
          </div>

          {/* Grave preview */}
          <div className="flex items-center gap-3 mb-5 p-3 rounded-xl bg-stone-700/50">
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-stone-700 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={grave.photoDataUrl} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className="font-serif text-stone-200 font-medium truncate">
                {grave.extracted.name || "Unknown"}
              </p>
              <p className="text-stone-500 text-xs mt-0.5">
                {[grave.extracted.birthDate, grave.extracted.deathDate].filter(Boolean).join(" — ") || "Dates unknown"}
              </p>
            </div>
          </div>

          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onSkip(); }}
            placeholder="e.g. Oak Hill Cemetery"
            className="w-full bg-stone-700 border border-stone-600 text-stone-100 text-sm rounded-xl px-4 py-3 placeholder:text-stone-500 outline-none focus:border-gold-500 mb-4"
          />

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onSave}
              disabled={!value.trim()}
              className="flex-1 h-12 rounded-xl font-semibold text-stone-900 text-sm disabled:opacity-40 transition-all active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }}
            >
              Save
            </button>
            <button
              onClick={onSkip}
              className="flex-1 h-12 rounded-xl text-sm text-stone-400 bg-stone-700"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── NearbyConfirmSheet ─────────────────────────────────────────────────────
function NearbyConfirmSheet({
  cemeteryName,
  nearby,
  onYes,
  onNo,
}: {
  cemeteryName: string;
  nearby: GraveRecord[];
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60" onClick={onNo} />
      <div
        className="relative w-full bg-stone-800 rounded-t-3xl animate-fade-up"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-stone-600 rounded-full mx-auto mt-3 mb-5" />

        <div className="px-6 pb-2">
          <h3 className="font-serif text-stone-100 text-lg mb-1">
            {nearby.length} nearby marker{nearby.length !== 1 ? "s" : ""} found
          </h3>
          <p className="text-stone-400 text-sm mb-5">
            Apply <span className="text-gold-400 font-medium">"{cemeteryName}"</span> to{" "}
            {nearby.length === 1 ? "this marker" : "these markers"} too?
          </p>

          {/* Nearby grave list */}
          <div className="flex flex-col gap-2 mb-5">
            {nearby.map((g) => (
              <div key={g.id} className="flex items-center gap-3 p-3 rounded-xl bg-stone-700/50">
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-stone-700 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.photoDataUrl} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0">
                  <p className="text-stone-200 text-sm font-medium truncate">
                    {g.extracted.name || "Unknown"}
                  </p>
                  <p className="text-stone-500 text-xs">
                    {[g.extracted.birthDate, g.extracted.deathDate].filter(Boolean).join(" — ") || "Dates unknown"}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onYes}
              className="flex-1 h-12 rounded-xl font-semibold text-stone-900 text-sm transition-all active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }}
            >
              Yes, apply to all
            </button>
            <button
              onClick={onNo}
              className="flex-1 h-12 rounded-xl text-sm text-stone-400 bg-stone-700"
            >
              Ask individually
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── EmptyState ─────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 px-8 text-center animate-fade-in">
      <div className="w-20 h-20 rounded-full bg-stone-800 flex items-center justify-center">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#5a5550" strokeWidth="1.5">
          <path d="M3 6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6z"/>
          <path d="M3 12h18M3 18h18"/>
        </svg>
      </div>
      <div>
        <h2 className="font-serif text-xl text-stone-200 mb-2">Your archive is empty</h2>
        <p className="text-stone-500 text-sm leading-relaxed">
          When you photograph and save a grave marker, it will appear here as a pin on the map.
        </p>
      </div>
      <Link
        href="/"
        className="flex items-center justify-center gap-2 h-12 px-6 rounded-2xl font-semibold text-stone-900 text-sm"
        style={{ background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }}
      >
        Scan your first marker
      </Link>
    </div>
  );
}

// ── GraveList ──────────────────────────────────────────────────────────────
function GraveList({
  graves,
  enriching,
  deleteConfirm,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: {
  graves: GraveRecord[];
  enriching: boolean;
  deleteConfirm: string | null;
  onDeleteRequest: (id: string) => void;
  onDeleteConfirm: (id: string) => void;
  onDeleteCancel: () => void;
}) {
  if (graves.length === 0) {
    return (
      <div className="flex items-center justify-center flex-1 mt-16">
        <p className="text-stone-500 text-sm">No markers match the current filters.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-stone-800 mt-2">
      {graves.map((grave) => {
        const hasCemetery = Boolean(grave.location?.cemetery);
        const hasGps = Boolean(grave.location?.lat && grave.location?.lng);

        return (
          <div key={grave.id} className="flex items-center gap-3 px-5 py-4">
            <Link href={`/result/${grave.id}`} className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-stone-800 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={grave.photoDataUrl} alt={grave.extracted.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-serif text-stone-100 font-medium truncate">
                  {grave.extracted.name || "Unknown"}
                </p>
                <p className="text-stone-500 text-xs mt-0.5">
                  {[grave.extracted.birthDate, grave.extracted.deathDate].filter(Boolean).join(" — ") || "Dates unknown"}
                </p>
                {hasCemetery || grave.location?.city ? (
                  <p className="text-stone-600 text-xs truncate">
                    {[grave.location.cemetery, grave.location.city, grave.location.state].filter(Boolean).join(", ")}
                  </p>
                ) : enriching && hasGps ? (
                  <span className="text-stone-600 text-xs">Looking up cemetery…</span>
                ) : null}
                {grave.tags && grave.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {grave.tags.map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 rounded-full text-[10px] bg-stone-800 border border-stone-700 text-stone-500">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Link>

            <div className="flex items-center gap-2 shrink-0">
              {deleteConfirm === grave.id ? (
                <div className="flex gap-2">
                  <button onClick={() => onDeleteConfirm(grave.id)} className="text-xs text-red-400 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20">
                    Delete
                  </button>
                  <button onClick={onDeleteCancel} className="text-xs text-stone-400">Cancel</button>
                </div>
              ) : (
                <button onClick={() => onDeleteRequest(grave.id)} className="w-8 h-8 flex items-center justify-center text-stone-600 active:text-red-400 rounded-lg">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
