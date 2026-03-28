"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BottomNav from "@/components/layout/BottomNav";
import { saveGrave, getGrave, getAllGraves, getPendingResult, deletePendingResult } from "@/lib/storage";
import { checkAndUnlock, loadStats, type Achievement } from "@/lib/achievements";
import { createClient } from "@/lib/supabase/browser";
import { uploadPhoto, upsertGrave } from "@/lib/cloudSync";
import { shareGrave, buildEmailShareUrl, buildSmsShareUrl } from "@/lib/share";
import { interpretSymbols } from "@/lib/apis/symbols";
import ProfileBadge from "@/components/auth/ProfileBadge";
import type {
  GraveRecord,
  ResearchData,
  ExtractedGraveData,
  GeoLocation,
  LifeNarrative,
  CulturalContext,
} from "@/types";

interface PendingResult {
  id: string;
  photoDataUrl: string;
  extracted: ExtractedGraveData;
  location: GeoLocation | null;
  timestamp: number;
}

export default function ResultPage({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingResult | null>(null);
  const [research, setResearch] = useState<ResearchData | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [savePromptDismissed, setSavePromptDismissed] = useState(false);
  const [achievementToasts, setAchievementToasts] = useState<Achievement[]>([]);
  const [narrative, setNarrative] = useState<LifeNarrative | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [culturalContext, setCulturalContext] = useState<CulturalContext | null>(null);
  const [culturalLoading, setCulturalLoading] = useState(false);
  const [expandingCategory, setExpandingCategory] = useState<string | null>(null);

  useEffect(() => {
    getPendingResult(id).then(async (raw) => {
      // Fall back to the saved archive if there's no in-flight pending result
      if (!raw) {
        const archived = await getGrave(id);
        if (!archived) {
          router.replace("/");
          return;
        }
        setPending({
          id: archived.id,
          photoDataUrl: archived.photoDataUrl,
          extracted: archived.extracted,
          location: archived.location,
          timestamp: archived.timestamp,
        });
        setResearch(archived.research ?? {});
        setNarrative(archived.research?.narrative ?? null);
        setCulturalContext(archived.research?.culturalContext ?? null);
        setTags(archived.tags ?? []);
        setSaved(true);
        setSavePromptDismissed(true);
        return;
      }

      const data = raw as PendingResult;
      setPending(data);
      deletePendingResult(id).catch(() => {});

      // Auto-save immediately so the record is never lost, regardless of
      // whether the user taps "Save" or navigates away. Research data is
      // patched into the saved record once the lookup response arrives.
      const autoRecord: GraveRecord = {
        id: data.id,
        timestamp: data.timestamp,
        photoDataUrl: data.photoDataUrl,
        location: data.location ?? { lat: 0, lng: 0 },
        extracted: data.extracted,
        research: {},
        tags: [],
      };
      saveGrave(autoRecord).catch(() => {});
      setSaved(true);
      setSavePromptDismissed(true);

      if (!data.extracted?.name) return;
      setResearchLoading(true);
      fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.extracted.name,
          firstName: data.extracted.firstName,
          lastName: data.extracted.lastName,
          birthYear: data.extracted.birthYear,
          deathYear: data.extracted.deathYear,
          lat: data.location?.lat,
          lng: data.location?.lng,
          city: data.location?.city,
          county: data.location?.county,
          state: data.location?.state,
          cemetery: data.location?.cemetery,
          inscription: data.extracted.inscription ?? "",
          symbols: data.extracted.symbols ?? [],
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          const researchData: ResearchData = {
            newspapers: d.newspapers ?? [],
            naraRecords: d.naraRecords ?? [],
            landRecords: d.landRecords ?? [],
            historical: d.historical ?? {},
            militaryContext: d.militaryContext ?? undefined,
            localHistory: d.localHistory ?? undefined,
            cemetery: data.location?.cemetery
              ? {
                  name: data.location.cemetery,
                  wikipediaUrl: d.cemeteryWikiUrl,
                  location: data.location ?? undefined,
                }
              : undefined,
          };
          setResearch(researchData);
          // Patch research into the already-saved record
          saveGrave({ ...autoRecord, research: researchData }).catch(() => {});
        })
        .catch(() => setResearch({}))
        .finally(() => setResearchLoading(false));
    });
  }, [id, router]);

  const handleSave = useCallback(async () => {
    if (!pending) return;
    const record: GraveRecord = {
      id: pending.id,
      timestamp: pending.timestamp,
      photoDataUrl: pending.photoDataUrl,
      location: pending.location ?? { lat: 0, lng: 0 },
      extracted: pending.extracted,
      research: research ?? {},
      tags,
    };

    // Always save locally first — cloud sync is best-effort
    await saveGrave(record);
    setSaved(true);
    setSavePromptDismissed(true);

    // Cloud sync — non-fatal if offline or not logged in
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const photoUrl = await uploadPhoto(supabase, user.id, record.id, record.photoDataUrl);
        await upsertGrave(supabase, user.id, record, photoUrl);
        // Update local copy with CDN URL so it loads from cloud going forward
        await saveGrave({ ...record, photoDataUrl: photoUrl, syncedAt: Date.now() });
      }
    } catch (err) {
      console.warn("[Sync] Cloud save failed — local save succeeded:", err);
    }

    // Check for newly unlocked achievements
    const allGraves = await getAllGraves();
    const stats = loadStats();
    const newUnlocks = checkAndUnlock(allGraves, stats);
    if (newUnlocks.length > 0) {
      setAchievementToasts(newUnlocks);
      setTimeout(() => setAchievementToasts([]), 5000);
    }
  }, [pending, research, tags]);

  // When already saved, persist tag changes immediately
  const handleTagsChange = useCallback(async (next: string[]) => {
    setTags(next);
    if (!saved || !pending) return;
    const existing = await getGrave(pending.id);
    if (!existing) return;
    const updated = { ...existing, tags: next };
    await saveGrave(updated);
    // Sync tag update to cloud
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await upsertGrave(supabase, user.id, updated, updated.photoDataUrl);
    } catch { /* non-fatal */ }
  }, [saved, pending]);

  const handleShare = useCallback(async () => {
    if (!pending) return;
    const record: GraveRecord = {
      id: pending.id,
      timestamp: pending.timestamp,
      photoDataUrl: pending.photoDataUrl,
      location: pending.location ?? { lat: 0, lng: 0 },
      extracted: pending.extracted,
      research: research ?? {},
    };

    // Try native share first
    const nativeSuccess = await shareGrave(record);
    if (!nativeSuccess) {
      setShareOpen(true);
    }
  }, [pending, research]);

  const handleLoadCultural = useCallback(async () => {
    if (!pending || culturalLoading) return;
    setCulturalLoading(true);
    try {
      const { extracted, location } = pending;
      const res = await fetch("/api/cultural", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "summary",
          name: extracted.name,
          birthYear: extracted.birthYear,
          deathYear: extracted.deathYear,
          ageAtDeath: extracted.ageAtDeath,
          city: location?.city,
          state: location?.state,
        }),
      });
      if (res.ok) {
        const data: CulturalContext = await res.json();
        setCulturalContext(data);
        setResearch((prev) => ({ ...(prev ?? {}), culturalContext: data }));
      }
    } catch (err) {
      console.warn("Cultural context generation failed:", err);
    } finally {
      setCulturalLoading(false);
    }
  }, [pending, culturalLoading]);

  const handleExpandCategory = useCallback(async (categoryId: string, categoryLabel: string) => {
    if (!pending || expandingCategory || !culturalContext) return;
    setExpandingCategory(categoryId);
    try {
      const { extracted, location } = pending;
      const res = await fetch("/api/cultural", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "expand",
          categoryId,
          categoryLabel,
          name: extracted.name,
          birthYear: extracted.birthYear,
          deathYear: extracted.deathYear,
          ageAtDeath: extracted.ageAtDeath,
          city: location?.city,
          state: location?.state,
        }),
      });
      if (res.ok) {
        const { detail } = await res.json();
        const updatedCtx: CulturalContext = {
          categories: culturalContext.categories.map((c) =>
            c.id === categoryId ? { ...c, detail } : c
          ),
        };
        setCulturalContext(updatedCtx);
        setResearch((r) => ({ ...(r ?? {}), culturalContext: updatedCtx }));
      }
    } catch (err) {
      console.warn("Category expand failed:", err);
    } finally {
      setExpandingCategory(null);
    }
  }, [pending, expandingCategory, culturalContext]);

  const handleGenerateNarrative = useCallback(async () => {
    if (!pending || narrativeLoading) return;
    setNarrativeLoading(true);
    try {
      const { extracted, location } = pending;
      const historical = research?.historical;
      const militaryContext = research?.militaryContext;
      const res = await fetch("/api/narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: extracted.name,
          birthYear: extracted.birthYear,
          deathYear: extracted.deathYear,
          birthDate: extracted.birthDate,
          deathDate: extracted.deathDate,
          ageAtDeath: extracted.ageAtDeath,
          city: location?.city,
          state: location?.state,
          country: location?.country,
          inscription: extracted.inscription,
          epitaph: extracted.epitaph,
          symbols: extracted.symbols ?? [],
          birthEra: historical?.birthEra,
          deathEra: historical?.deathEra,
          lifeExpectancyAtDeath: historical?.lifeExpectancyAtDeath,
          militaryConflict: militaryContext?.likelyConflict,
          militaryTheater: militaryContext?.theater,
          militaryRole: militaryContext?.role,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setNarrative(data);
        // Persist narrative into research so it's saved with the record
        setResearch((prev) => ({ ...(prev ?? {}), narrative: data }));
      }
    } catch (err) {
      console.warn("Narrative generation failed:", err);
    } finally {
      setNarrativeLoading(false);
    }
  }, [pending, research, narrativeLoading]);

  if (!pending) {
    return (
      <div className="flex items-center justify-center min-h-full bg-stone-900">
        <div className="w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const { extracted, location, photoDataUrl } = pending;

  const graveRecord: GraveRecord = {
    id: pending.id,
    timestamp: pending.timestamp,
    photoDataUrl,
    location: location ?? { lat: 0, lng: 0 },
    extracted,
    research: research ?? {},
    tags,
  };

  return (
    <div className="flex flex-col h-full bg-stone-900 overflow-hidden">
      {/* Header */}
      <header
        className="flex items-center justify-between px-5 py-3 bg-stone-900/95 backdrop-blur-sm sticky top-0 z-30 border-b border-stone-800"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-stone-400 active:text-stone-200"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          <span className="text-sm">Back</span>
        </button>

        <span className="font-serif text-stone-200 text-base font-medium">
          {extracted.name || "Unknown"}
        </span>

        <div className="flex items-center gap-3">
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 text-gold-500 active:text-gold-400"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
              <polyline points="16 6 12 2 8 6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
          </button>
          <ProfileBadge />
        </div>
      </header>

      <main className="scroll-container max-w-lg mx-auto w-full pb-32">
        {/* Hero photo */}
        <div className="relative w-full aspect-[4/3] bg-stone-800 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoDataUrl}
            alt="Grave marker"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-900 via-transparent to-transparent" />

          {/* Confidence badge */}
          {extracted.confidence && (
            <div className="absolute top-3 right-3">
              <span
                className="px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  background:
                    extracted.confidence === "high"
                      ? "#5c7a5c40"
                      : extracted.confidence === "medium"
                      ? "#a07830 40"
                      : "#8b3a3a40",
                  color:
                    extracted.confidence === "high"
                      ? "#7a9a7a"
                      : extracted.confidence === "medium"
                      ? "#d4b76a"
                      : "#c07070",
                  border: "1px solid currentColor",
                }}
              >
                {extracted.confidence === "high"
                  ? "High confidence"
                  : extracted.confidence === "medium"
                  ? "Medium confidence"
                  : "Low confidence — verify manually"}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-0 px-5">
          {/* Primary info card */}
          <PrimaryCard extracted={extracted} />

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-stone-700 to-transparent my-1" />

          {/* Cemetery & Location */}
          {location && <CemeteryCard location={location} research={research} />}

          {/* Military context */}
          {(research?.militaryContext || researchLoading) && (
            <MilitaryCard
              context={research?.militaryContext}
              naraRecords={research?.naraRecords}
              loading={researchLoading}
            />
          )}

          {/* Historical context */}
          {(research?.historical || researchLoading) && (
            <HistoricalCard
              historical={research?.historical}
              extracted={extracted}
              loading={researchLoading}
            />
          )}

          {/* Local & regional history */}
          {(research?.localHistory || researchLoading) && (
            <LocalHistoryCard
              localHistory={research?.localHistory}
              location={location}
              loading={researchLoading}
            />
          )}

          {/* A Life in Context — on-demand narrative */}
          <NarrativeCard
            narrative={narrative}
            loading={narrativeLoading}
            onGenerate={handleGenerateNarrative}
            extracted={extracted}
          />

          {/* A Life in Their Era — cultural context */}
          <CulturalContextCard
            context={culturalContext}
            loading={culturalLoading}
            expandingCategory={expandingCategory}
            onLoad={handleLoadCultural}
            onExpand={handleExpandCategory}
            extracted={extracted}
          />

          {/* Inscription + epitaph */}
          {extracted.inscription && (
            <InscriptionCard
              inscription={extracted.inscription}
              epitaph={extracted.epitaph}
              epitaphSource={narrative?.epitaphSource}
              epitaphMeaning={narrative?.epitaphMeaning}
            />
          )}

          {/* Symbols with database meanings */}
          {extracted.symbols && extracted.symbols.length > 0 && (
            <SymbolsCard symbols={extracted.symbols} />
          )}

          {/* Tags */}
          <TagsCard tags={tags} onChange={handleTagsChange} />

          {/* Newspaper records */}
          {(research?.newspapers?.length || researchLoading) ? (
            <RecordsCard
              title="Newspaper Archives"
              icon="📰"
              loading={researchLoading}
              items={research?.newspapers?.map((n) => ({
                title: n.newspaper,
                subtitle: n.date,
                detail: n.snippet,
                url: n.url,
              }))}
            />
          ) : null}

          {/* NARA records — only show standalone card when there's no military section
              (military section already embeds them when militaryContext is present) */}
          {!research?.militaryContext && (research?.naraRecords?.length || researchLoading) ? (
            <RecordsCard
              title="National Archives"
              icon="🏛"
              loading={researchLoading}
              items={research?.naraRecords?.map((r) => ({
                title: r.title,
                subtitle: r.recordGroup ? `Record Group ${r.recordGroup}` : "",
                detail: r.description,
                url: r.url,
              }))}
            />
          ) : null}

          {/* Land patents */}
          {(research?.landRecords?.length || researchLoading) ? (
            <RecordsCard
              title="Land Patents (BLM)"
              icon="📜"
              loading={researchLoading}
              items={research?.landRecords?.map((l) => ({
                title: `${l.acres} acres — ${l.county}, ${l.state}`,
                subtitle: l.date,
                detail: `Patent #${l.patentNumber}`,
                url: l.documentUrl,
              }))}
            />
          ) : null}
        </div>

        {/* Save prompt */}
        {!savePromptDismissed && (
          <div className="mx-5 mt-4 p-4 rounded-2xl border border-gold-500/30 bg-gold-500/5 animate-fade-up">
            <p className="text-stone-300 text-sm mb-3">
              Save this marker to your personal archive?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                className="flex-1 h-11 rounded-xl font-semibold text-stone-900 text-sm transition-all active:scale-[0.97]"
                style={{ background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }}
              >
                {saved ? "Saved ✓" : "Save to Archive"}
              </button>
              <button
                onClick={() => setSavePromptDismissed(true)}
                className="h-11 px-4 rounded-xl text-stone-400 text-sm border border-stone-700"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {saved && savePromptDismissed && (
          <div className="mx-5 mt-4">
            <Link
              href="/archive"
              className="flex items-center justify-center gap-2 h-11 rounded-xl border border-stone-700 text-stone-300 text-sm w-full"
            >
              View in Archive →
            </Link>
          </div>
        )}
      </main>

      {/* Share sheet fallback */}
      {shareOpen && (
        <ShareSheet
          record={graveRecord}
          onClose={() => setShareOpen(false)}
        />
      )}

      {/* Achievement unlock toasts */}
      {achievementToasts.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col items-center gap-2 px-4 pb-24 pointer-events-none" style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}>
          {achievementToasts.map((a) => (
            <div
              key={a.id}
              className="w-full max-w-sm rounded-2xl px-4 py-3 flex items-center gap-3 animate-fade-up"
              style={{
                background: "linear-gradient(135deg, #2a2515, #1e1c18)",
                border: "1px solid rgba(201,168,76,0.5)",
                boxShadow: "0 4px 24px rgba(201,168,76,0.2)",
              }}
            >
              <div
                className="text-2xl w-10 h-10 flex items-center justify-center rounded-lg shrink-0"
                style={{ background: "rgba(201,168,76,0.15)" }}
              >
                {a.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-widest font-medium" style={{ color: "#c9a84c" }}>
                  Achievement Unlocked
                </p>
                <p className="text-sm font-semibold text-stone-100 leading-tight mt-0.5">{a.title}</p>
                <p className="text-[11px] text-stone-400 truncate">{a.flavour}</p>
              </div>
              <span
                className="text-xs font-bold shrink-0 px-2 py-1 rounded-lg"
                style={{ background: "rgba(201,168,76,0.2)", color: "#f5d080" }}
              >
                +{a.xp} XP
              </span>
            </div>
          ))}
        </div>
      )}

      <BottomNav />
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function PrimaryCard({ extracted }: { extracted: ExtractedGraveData }) {
  return (
    <div className="py-6 animate-fade-up">
      {extracted.name && (
        <h1 className="font-serif text-3xl font-bold text-stone-50 leading-tight mb-3">
          {extracted.name}
        </h1>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {(extracted.birthDate || extracted.deathDate) && (
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-0.5">
              Dates
            </p>
            <p className="text-stone-200 font-medium">
              {[extracted.birthDate, extracted.deathDate]
                .filter(Boolean)
                .join(" — ")}
            </p>
          </div>
        )}

        {extracted.ageAtDeath && (
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-0.5">
              Age
            </p>
            <p className="text-stone-200 font-medium">
              {extracted.ageAtDeath} years
            </p>
          </div>
        )}

        {extracted.markerType && extracted.markerType !== "headstone" && (
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-0.5">
              Marker
            </p>
            <p className="text-stone-200 font-medium capitalize">
              {extracted.markerType}
            </p>
          </div>
        )}

        {extracted.material && extracted.material !== "unknown" && (
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-0.5">
              Material
            </p>
            <p className="text-stone-200 font-medium capitalize">
              {extracted.material}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function CemeteryCard({
  location,
  research,
}: {
  location: GeoLocation;
  research: ResearchData | null;
}) {
  const cemeteryUrl = research?.cemetery?.wikipediaUrl;

  return (
    <div className="py-5 animate-fade-up" style={{ animationDelay: "0.05s" }}>
      <SectionHeader icon="📍" title="Location" />
      <div className="flex flex-col gap-1 mt-3">
        {location.cemetery && (
          <div className="flex items-start justify-between gap-2">
            <p className="text-stone-200 font-medium">{location.cemetery}</p>
            {cemeteryUrl && (
              <a
                href={cemeteryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold-500 text-xs shrink-0 mt-0.5 underline"
              >
                Wikipedia →
              </a>
            )}
          </div>
        )}
        {location.city && location.state && (
          <p className="text-stone-400 text-sm">
            {location.city}, {location.state}
          </p>
        )}
        {location.lat !== 0 && (
          <a
            href={`https://maps.google.com/?q=${location.lat},${location.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold-500 text-sm mt-1 inline-flex items-center gap-1"
          >
            Open in Maps →
          </a>
        )}
      </div>
    </div>
  );
}

function HistoricalCard({
  historical,
  extracted,
  loading,
}: {
  historical: ResearchData["historical"] | undefined;
  extracted: ExtractedGraveData;
  loading: boolean;
}) {
  const [landmarksExpanded, setLandmarksExpanded] = useState(false);

  if (loading && !historical) {
    return (
      <div className="py-5 animate-fade-up" style={{ animationDelay: "0.1s" }}>
        <SectionHeader icon="📖" title="Historical Context" />
        <div className="mt-3 space-y-2">
          <div className="h-4 shimmer rounded w-3/4" />
          <div className="h-4 shimmer rounded w-5/6" />
          <div className="h-4 shimmer rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (!historical) return null;

  const hasContent =
    historical.birthEra ||
    historical.deathEra ||
    historical.birthYearEvents?.length ||
    historical.deathYearEvents?.length ||
    historical.lifetimeLandmarks?.length;

  if (!hasContent) return null;

  const landmarks = historical.lifetimeLandmarks ?? [];
  const visibleLandmarks = landmarksExpanded ? landmarks : landmarks.slice(0, 5);

  return (
    <div className="py-5 animate-fade-up" style={{ animationDelay: "0.1s" }}>
      <SectionHeader icon="📖" title="Historical Context" />
      <div className="mt-3 space-y-4">

        {/* Era + life expectancy */}
        {(historical.birthEra || historical.deathEra) && (
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {historical.birthEra && (
              <div>
                <p className="text-xs text-stone-500 uppercase tracking-widest mb-0.5">Born in</p>
                <p className="text-stone-300 text-sm">{historical.birthEra}</p>
              </div>
            )}
            {historical.deathEra && historical.deathEra !== historical.birthEra && (
              <div>
                <p className="text-xs text-stone-500 uppercase tracking-widest mb-0.5">Died in</p>
                <p className="text-stone-300 text-sm">{historical.deathEra}</p>
              </div>
            )}
            {historical.lifeExpectancyAtDeath && extracted.ageAtDeath && (
              <div>
                <p className="text-xs text-stone-500 uppercase tracking-widest mb-0.5">Life expectancy then</p>
                <p className="text-stone-300 text-sm">
                  ~{historical.lifeExpectancyAtDeath} yrs
                  <span className="text-stone-500 ml-1">
                    (lived to {extracted.ageAtDeath})
                  </span>
                </p>
              </div>
            )}
          </div>
        )}

        {/* Birth year events */}
        {historical.birthYearEvents && historical.birthYearEvents.length > 0 && (
          <div className="p-3 rounded-xl bg-stone-800 border border-stone-700/60">
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-2">
              The World in {extracted.birthYear}
            </p>
            <ul className="space-y-1.5">
              {historical.birthYearEvents.map((e, i) => (
                <li key={i} className="text-stone-300 text-sm leading-relaxed flex gap-2">
                  <span className="text-stone-600 mt-0.5 shrink-0">—</span>
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Death year events */}
        {historical.deathYearEvents && historical.deathYearEvents.length > 0 && (
          <div className="p-3 rounded-xl bg-stone-800 border border-stone-700/60">
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-2">
              The World in {extracted.deathYear}
            </p>
            <ul className="space-y-1.5">
              {historical.deathYearEvents.map((e, i) => (
                <li key={i} className="text-stone-300 text-sm leading-relaxed flex gap-2">
                  <span className="text-stone-600 mt-0.5 shrink-0">—</span>
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Landmark events lived through */}
        {landmarks.length > 0 && (
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-2">
              Events witnessed in their lifetime
            </p>
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[52px] top-0 bottom-0 w-px bg-stone-700" />
              <ul className="space-y-3">
                {visibleLandmarks.map((lm, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="text-right shrink-0 w-10">
                      <span className="text-gold-500 text-xs font-mono">{lm.year}</span>
                    </div>
                    {/* Timeline dot */}
                    <div className="w-2.5 h-2.5 rounded-full bg-stone-600 border border-stone-500 mt-1 shrink-0 relative z-10" />
                    <div className="flex-1 min-w-0">
                      <p className="text-stone-300 text-sm leading-snug">{lm.event}</p>
                      <p className="text-stone-600 text-xs mt-0.5">Age {lm.age}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            {landmarks.length > 5 && (
              <button
                onClick={() => setLandmarksExpanded((e) => !e)}
                className="text-gold-500 text-xs mt-3 ml-[52px]"
              >
                {landmarksExpanded
                  ? "Show fewer events"
                  : `Show all ${landmarks.length} events`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InscriptionCard({
  inscription,
  epitaph,
  epitaphSource,
  epitaphMeaning,
}: {
  inscription: string;
  epitaph: string;
  epitaphSource?: string;
  epitaphMeaning?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const shouldTruncate = inscription.length > 200;

  return (
    <div className="py-5 animate-fade-up" style={{ animationDelay: "0.15s" }}>
      <SectionHeader icon="✦" title="Inscription" />
      {epitaph && (
        <div className="mt-3 mb-3">
          <p className="font-serif text-stone-300 italic text-base leading-relaxed border-l-2 border-gold-500/50 pl-3">
            &ldquo;{epitaph}&rdquo;
          </p>
          {(epitaphSource || epitaphMeaning) && (
            <div className="mt-2 pl-3 space-y-1">
              {epitaphSource && (
                <p className="text-gold-500/80 text-xs font-medium">{epitaphSource}</p>
              )}
              {epitaphMeaning && (
                <p className="text-stone-400 text-xs leading-relaxed">{epitaphMeaning}</p>
              )}
            </div>
          )}
        </div>
      )}
      <div
        className={`mt-2 font-mono text-stone-400 text-sm leading-relaxed whitespace-pre-wrap ${
          !expanded && shouldTruncate ? "line-clamp-6" : ""
        }`}
      >
        {inscription}
      </div>
      {shouldTruncate && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-gold-500 text-xs mt-2"
        >
          {expanded ? "Show less" : "Show full inscription"}
        </button>
      )}
    </div>
  );
}

function SymbolsCard({ symbols }: { symbols: string[] }) {
  const interpretations = interpretSymbols(symbols);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (sym: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(sym) ? next.delete(sym) : next.add(sym);
      return next;
    });

  return (
    <div className="py-5 animate-fade-up" style={{ animationDelay: "0.2s" }}>
      <SectionHeader icon="✦" title="Symbols & Emblems" />
      <ul className="mt-3 space-y-3">
        {symbols.map((s, i) => {
          const interp = interpretations.get(s);
          const isExpanded = expanded.has(s);
          return (
            <li key={i} className="text-sm">
              <div className="flex items-start gap-2">
                <span className="text-gold-500 mt-0.5 shrink-0">—</span>
                <div className="flex-1 min-w-0">
                  <span className="text-stone-300">{s}</span>
                  {interp && (
                    <button
                      onClick={() => toggle(s)}
                      className="ml-2 text-gold-500/70 text-xs underline-offset-2 hover:text-gold-400"
                    >
                      {isExpanded ? "less" : "what this means"}
                    </button>
                  )}
                  {interp && isExpanded && (
                    <div className="mt-2 p-3 rounded-xl bg-stone-800 border border-stone-700/60 space-y-1.5">
                      <p className="text-stone-200 text-xs font-semibold uppercase tracking-wide">
                        {interp.name}
                        <span className="ml-2 text-stone-600 font-normal capitalize">
                          {interp.category}
                        </span>
                      </p>
                      <p className="text-stone-300 text-xs leading-relaxed">{interp.meaning}</p>
                      {interp.era && (
                        <p className="text-stone-500 text-xs italic">{interp.era}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RecordsCard({
  title,
  icon,
  loading,
  items,
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
}) {
  if (loading && !items) {
    return (
      <div className="py-5 animate-fade-up">
        <SectionHeader icon={icon} title={title} />
        <div className="mt-3 space-y-2">
          <div className="h-14 shimmer rounded-xl" />
          <div className="h-14 shimmer rounded-xl" />
        </div>
      </div>
    );
  }

  if (!items || items.length === 0) return null;

  return (
    <div className="py-5 animate-fade-up">
      <SectionHeader icon={icon} title={title} />
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

function RecordItem({
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

// ── Military Card ─────────────────────────────────────────────────────────────

function MilitaryCard({
  context,
  naraRecords,
  loading,
}: {
  context: import("@/types").MilitaryContext | undefined;
  naraRecords: import("@/types").NaraRecord[] | undefined;
  loading: boolean;
}) {
  if (loading && !context) {
    return (
      <div className="py-5 animate-fade-up" style={{ animationDelay: "0.08s" }}>
        <SectionHeader icon="🎖" title="Military Service" />
        <div className="mt-3 space-y-2">
          <div className="h-4 shimmer rounded w-2/3" />
          <div className="h-4 shimmer rounded w-5/6" />
          <div className="h-4 shimmer rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (!context) return null;

  const naraSearchName = context.likelyConflict
    ? `https://catalog.archives.gov/search?q=${encodeURIComponent(context.likelyConflict)}&levelOfDescription=item`
    : "https://catalog.archives.gov";

  return (
    <div className="py-5 animate-fade-up" style={{ animationDelay: "0.08s" }}>
      <SectionHeader icon="🎖" title="Military Service" />

      <div className="mt-3 space-y-4">
        {/* Conflict + service dates */}
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {context.likelyConflict && (
            <div>
              <p className="text-xs text-stone-500 uppercase tracking-widest mb-0.5">Conflict</p>
              <p className="text-stone-200 font-medium">{context.likelyConflict}</p>
            </div>
          )}
          {context.servedDuring && (
            <div>
              <p className="text-xs text-stone-500 uppercase tracking-widest mb-0.5">US Service Period</p>
              <p className="text-stone-200 font-medium">{context.servedDuring}</p>
            </div>
          )}
          {context.theater && (
            <div>
              <p className="text-xs text-stone-500 uppercase tracking-widest mb-0.5">Theater</p>
              <p className="text-stone-200 font-medium">{context.theater}</p>
            </div>
          )}
        </div>

        {/* Role + description */}
        {(context.role || context.roleDescription) && (
          <div className="p-3 rounded-xl bg-stone-800 border border-stone-700/60">
            {context.role && (
              <p className="text-xs text-stone-500 uppercase tracking-widest mb-1.5">{context.role}</p>
            )}
            {context.roleDescription && (
              <p className="text-stone-300 text-sm leading-relaxed">{context.roleDescription}</p>
            )}
          </div>
        )}

        {/* Historical note */}
        {context.historicalNote && (
          <p className="text-stone-400 text-sm leading-relaxed italic border-l-2 border-stone-700 pl-3">
            {context.historicalNote}
          </p>
        )}

        {/* Inferred disclaimer */}
        {context.inferredFrom === "dates" && (
          <p className="text-stone-600 text-xs">
            Conflict inferred from life dates — not confirmed by inscription.
          </p>
        )}

        {/* NARA records if found */}
        {naraRecords && naraRecords.length > 0 && (
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-2">National Archives Records</p>
            <ul className="space-y-2">
              {naraRecords.map((r, i) => (
                <li key={i}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 rounded-xl bg-stone-800 border border-stone-700 active:bg-stone-750"
                  >
                    <p className="text-stone-200 text-sm font-medium line-clamp-2">{r.title}</p>
                    {r.recordGroup && (
                      <p className="text-stone-500 text-xs mt-0.5">Record Group {r.recordGroup}</p>
                    )}
                    {r.description && (
                      <p className="text-stone-400 text-xs mt-1 line-clamp-2">{r.description}</p>
                    )}
                    <p className="text-gold-500 text-xs mt-1">View in NARA →</p>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Always offer a NARA search link */}
        <a
          href={naraSearchName}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-gold-500 text-sm"
        >
          Search National Archives
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 6h8M6 2l4 4-4 4" />
          </svg>
        </a>
      </div>
    </div>
  );
}

// ── Tags ─────────────────────────────────────────────────────────────────────

const PRESET_TAGS = [
  "Relative",
  "Ancestor",
  "Veteran",
  "Notable",
  "Historic",
  "Needs research",
  "Mystery",
];

function TagsCard({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [customValue, setCustomValue] = useState("");

  const customTags = tags.filter((t) => !PRESET_TAGS.includes(t));

  const toggle = (tag: string) => {
    onChange(tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]);
  };

  const addCustom = () => {
    const val = customValue.trim();
    if (!val || tags.includes(val)) return;
    onChange([...tags, val]);
    setCustomValue("");
    setAdding(false);
  };

  const remove = (tag: string) => onChange(tags.filter((t) => t !== tag));

  return (
    <div className="py-5 animate-fade-up" style={{ animationDelay: "0.22s" }}>
      <SectionHeader icon="🏷" title="Tags" />
      <div className="mt-3 flex flex-wrap gap-2">
        {PRESET_TAGS.map((tag) => {
          const active = tags.includes(tag);
          return (
            <button
              key={tag}
              onClick={() => toggle(tag)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                active
                  ? "bg-gold-500/15 border-gold-500/50 text-gold-400"
                  : "bg-stone-800 border-stone-700 text-stone-400 active:border-stone-500"
              }`}
            >
              {active && <span className="mr-1 text-gold-500">✓</span>}
              {tag}
            </button>
          );
        })}

        {/* Custom tags */}
        {customTags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-moss-700/30 border border-moss-600/40 text-moss-400"
          >
            {tag}
            <button
              onClick={() => remove(tag)}
              className="text-stone-500 active:text-red-400 ml-0.5 leading-none"
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}

        {/* Add custom tag */}
        {adding ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="text"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addCustom();
                if (e.key === "Escape") { setAdding(false); setCustomValue(""); }
              }}
              placeholder="Tag name…"
              className="px-3 py-1.5 rounded-full text-xs bg-stone-800 border border-stone-600 text-stone-200 w-28 outline-none focus:border-gold-500"
            />
            <button
              onClick={addCustom}
              disabled={!customValue.trim()}
              className="text-gold-500 text-xs disabled:opacity-40"
            >
              Add
            </button>
            <button
              onClick={() => { setAdding(false); setCustomValue(""); }}
              className="text-stone-500 text-xs"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="px-3 py-1.5 rounded-full text-xs border border-dashed border-stone-600 text-stone-500 active:border-stone-400"
          >
            + Custom
          </button>
        )}
      </div>
    </div>
  );
}

// ── Local History Card ────────────────────────────────────────────────────────

function LocalHistoryCard({
  localHistory,
  location,
  loading,
}: {
  localHistory: import("@/types").LocalHistoryContext | undefined;
  location: GeoLocation | null;
  loading: boolean;
}) {
  const [decadeExpanded, setDecadeExpanded] = useState(false);
  const [censusExpanded, setCensusExpanded] = useState(false);

  if (loading && !localHistory) {
    return (
      <div className="py-5 animate-fade-up" style={{ animationDelay: "0.13s" }}>
        <SectionHeader icon="🗺" title="Local History" />
        <div className="mt-3 space-y-2">
          <div className="h-4 shimmer rounded w-4/5" />
          <div className="h-4 shimmer rounded w-3/4" />
          <div className="h-4 shimmer rounded w-5/6" />
        </div>
      </div>
    );
  }

  if (!localHistory) return null;

  const hasContent =
    localHistory.cityArticle ||
    localHistory.countyArticle ||
    localHistory.decadeSnapshots?.length ||
    localHistory.localNewspaper?.length ||
    localHistory.nrhpSites?.length ||
    localHistory.censusPopulation?.length ||
    localHistory.sanbornMapUrl ||
    localHistory.wikidataEvents?.length;

  if (!hasContent) return null;

  const placeName = location?.city || location?.county || location?.state || "this area";

  return (
    <div className="py-5 animate-fade-up" style={{ animationDelay: "0.13s" }}>
      <SectionHeader icon="🗺" title="Local History" />
      <div className="mt-3 space-y-5">

        {/* City article */}
        {localHistory.cityArticle && (
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-1.5">
              {localHistory.cityArticle.title}
            </p>
            <p className="text-stone-300 text-sm leading-relaxed">
              {localHistory.cityArticle.summary}
            </p>
            <a
              href={localHistory.cityArticle.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold-500 text-xs mt-1 inline-block"
            >
              Read more on Wikipedia →
            </a>
          </div>
        )}

        {/* County article — only if different from city */}
        {localHistory.countyArticle &&
          localHistory.countyArticle.title !== localHistory.cityArticle?.title && (
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-1.5">
              {localHistory.countyArticle.title}
            </p>
            <p className="text-stone-300 text-sm leading-relaxed">
              {localHistory.countyArticle.summary}
            </p>
            <a
              href={localHistory.countyArticle.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold-500 text-xs mt-1 inline-block"
            >
              Read more on Wikipedia →
            </a>
          </div>
        )}

        {/* Decade snapshots */}
        {localHistory.decadeSnapshots && localHistory.decadeSnapshots.length > 0 && (
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-2">
              The Region Through the Decades
            </p>
            <div className="space-y-3">
              {(decadeExpanded
                ? localHistory.decadeSnapshots
                : localHistory.decadeSnapshots.slice(0, 2)
              ).map((snap, i) => (
                <div key={i} className="p-3 rounded-xl bg-stone-800 border border-stone-700/60">
                  <p className="text-stone-400 text-xs uppercase tracking-wide mb-1.5">
                    {snap.label}
                  </p>
                  <ul className="space-y-1">
                    {snap.events.map((e, j) => (
                      <li key={j} className="text-stone-300 text-xs leading-relaxed flex gap-2">
                        <span className="text-stone-600 shrink-0">—</span>
                        <span>{e}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {localHistory.decadeSnapshots.length > 2 && (
              <button
                onClick={() => setDecadeExpanded((e) => !e)}
                className="text-gold-500 text-xs mt-2"
              >
                {decadeExpanded
                  ? "Show fewer decades"
                  : `Show all ${localHistory.decadeSnapshots.length} decades`}
              </button>
            )}
          </div>
        )}

        {/* NRHP historic sites */}
        {localHistory.nrhpSites && localHistory.nrhpSites.length > 0 && (
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-2">
              Historic Sites Nearby
            </p>
            <ul className="space-y-2">
              {localHistory.nrhpSites.map((site, i) => (
                <li key={i} className="p-3 rounded-xl bg-stone-800 border border-stone-700/60">
                  <p className="text-stone-200 text-sm font-medium leading-snug">{site.name}</p>
                  {site.address && (
                    <p className="text-stone-500 text-xs mt-0.5">{site.address}</p>
                  )}
                  {site.wikidataUrl && (
                    <a
                      href={site.wikidataUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gold-500 text-xs mt-1 inline-block"
                    >
                      View on Wikidata →
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Wikidata local events */}
        {localHistory.wikidataEvents && localHistory.wikidataEvents.length > 0 && (
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-2">
              Events Near {placeName}
            </p>
            <ul className="space-y-2">
              {localHistory.wikidataEvents.map((evt, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="text-gold-500 text-xs font-mono shrink-0 w-10 text-right">
                    {evt.year}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-stone-300 text-sm leading-snug">{evt.label}</p>
                    {evt.description && (
                      <p className="text-stone-500 text-xs mt-0.5 leading-snug">{evt.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Census county population */}
        {localHistory.censusPopulation && localHistory.censusPopulation.length > 0 && (
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-2">
              {localHistory.censusPopulation[0].countyName
                ? `${localHistory.censusPopulation[0].countyName} Population`
                : "County Population"}
            </p>
            <div className="flex flex-wrap gap-3">
              {(censusExpanded
                ? localHistory.censusPopulation
                : localHistory.censusPopulation.slice(0, 3)
              ).map((entry, i) => (
                <div
                  key={i}
                  className="px-3 py-2 rounded-xl bg-stone-800 border border-stone-700/60 text-center"
                >
                  <p className="text-stone-500 text-[10px] uppercase tracking-wide">{entry.year}</p>
                  <p className="text-stone-200 text-sm font-medium mt-0.5">
                    {entry.population.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
            {localHistory.censusPopulation.length > 3 && (
              <button
                onClick={() => setCensusExpanded((e) => !e)}
                className="text-gold-500 text-xs mt-2"
              >
                {censusExpanded ? "Show fewer" : "Show all census years"}
              </button>
            )}
            <p className="text-stone-600 text-[10px] mt-1.5">
              Census Bureau data — coverage begins 1990.
            </p>
          </div>
        )}

        {/* Local newspaper coverage */}
        {localHistory.localNewspaper && localHistory.localNewspaper.length > 0 && (
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-2">
              Local Newspaper Coverage
            </p>
            <ul className="space-y-2">
              {localHistory.localNewspaper.map((article, i) => (
                <li key={i}>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 rounded-xl bg-stone-800 border border-stone-700 active:bg-stone-750"
                  >
                    <p className="text-stone-200 text-sm font-medium line-clamp-1">
                      {article.newspaper}
                    </p>
                    <p className="text-stone-500 text-xs mt-0.5">{article.date}</p>
                    {article.snippet && (
                      <p className="text-stone-400 text-xs mt-1 line-clamp-2">{article.snippet}</p>
                    )}
                    <p className="text-gold-500 text-xs mt-1">View page →</p>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Sanborn map link */}
        {localHistory.sanbornMapUrl && (
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-1.5">
              Historical Fire Insurance Map
            </p>
            <a
              href={localHistory.sanbornMapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 rounded-xl bg-stone-800 border border-stone-700 active:bg-stone-750"
            >
              <span className="text-xl">🗺</span>
              <div className="flex-1 min-w-0">
                <p className="text-stone-200 text-sm font-medium">Sanborn Fire Insurance Map</p>
                <p className="text-stone-500 text-xs mt-0.5">
                  View historic street-level maps of {placeName} from the LOC collection
                </p>
              </div>
              <p className="text-gold-500 text-xs shrink-0">View →</p>
            </a>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Narrative Card ────────────────────────────────────────────────────────────

function NarrativeCard({
  narrative,
  loading,
  onGenerate,
  extracted,
}: {
  narrative: import("@/types").LifeNarrative | null;
  loading: boolean;
  onGenerate: () => void;
  extracted: ExtractedGraveData;
}) {
  // Only offer the feature when we have enough data to generate something meaningful
  const hasEnoughData = !!(extracted.birthYear || extracted.deathYear || extracted.inscription);
  if (!hasEnoughData) return null;

  if (!narrative && !loading) {
    return (
      <div className="py-5 animate-fade-up" style={{ animationDelay: "0.12s" }}>
        <SectionHeader icon="📜" title="A Life in Context" />
        <p className="mt-2 text-stone-500 text-sm leading-relaxed">
          Generate a historical narrative about what life was like for someone of this era, place, and background.
        </p>
        <button
          onClick={onGenerate}
          className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-stone-900 transition-all active:scale-[0.97]"
          style={{ background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          Tell me their story
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-5 animate-fade-up" style={{ animationDelay: "0.12s" }}>
        <SectionHeader icon="📜" title="A Life in Context" />
        <div className="mt-3 space-y-2">
          <div className="h-4 shimmer rounded w-full" />
          <div className="h-4 shimmer rounded w-5/6" />
          <div className="h-4 shimmer rounded w-4/5" />
          <div className="h-4 shimmer rounded w-full mt-3" />
          <div className="h-4 shimmer rounded w-3/4" />
          <div className="h-4 shimmer rounded w-5/6" />
        </div>
      </div>
    );
  }

  if (!narrative) return null;

  // Split narrative into paragraphs for better formatting
  const paragraphs = narrative.narrative
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="py-5 animate-fade-up" style={{ animationDelay: "0.12s" }}>
      <SectionHeader icon="📜" title="A Life in Context" />
      <div className="mt-3 space-y-3">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-stone-300 text-sm leading-relaxed">
            {p}
          </p>
        ))}
        <p className="text-stone-600 text-[10px] italic pt-1">
          Historical narrative generated by AI based on verified era context. Not specific to this individual.
        </p>
      </div>
    </div>
  );
}

// ── Cultural Context Card ─────────────────────────────────────────────────────

const CULTURAL_DEFS = [
  { id: "popculture",    label: "Pop Culture",            icon: "🎵" },
  { id: "transport",     label: "Getting Around",         icon: "🚂" },
  { id: "homelife",      label: "Home & Daily Life",      icon: "🏡" },
  { id: "health",        label: "Health & Medicine",      icon: "🩺" },
  { id: "communication", label: "News & Communication",   icon: "📻" },
];

function CulturalContextCard({
  context,
  loading,
  expandingCategory,
  onLoad,
  onExpand,
  extracted,
}: {
  context: CulturalContext | null;
  loading: boolean;
  expandingCategory: string | null;
  onLoad: () => void;
  onExpand: (id: string, label: string) => void;
  extracted: ExtractedGraveData;
}) {
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const hasEnoughData = !!(extracted.birthYear || extracted.deathYear);
  if (!hasEnoughData) return null;

  if (!context && !loading) {
    return (
      <div className="py-5 animate-fade-up" style={{ animationDelay: "0.14s" }}>
        <SectionHeader icon="🌎" title="A Life in Their Era" />
        <p className="mt-2 text-stone-500 text-sm leading-relaxed">
          Discover the music, transport, home life, and culture of this person&apos;s time and place.
        </p>
        <button
          onClick={onLoad}
          className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-stone-900 transition-all active:scale-[0.97]"
          style={{ background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }}
        >
          <span>🌎</span>
          Explore their world
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-5 animate-fade-up" style={{ animationDelay: "0.14s" }}>
        <SectionHeader icon="🌎" title="A Life in Their Era" />
        <div className="mt-3 space-y-2">
          {CULTURAL_DEFS.map((def) => (
            <div key={def.id} className="p-3 rounded-xl bg-stone-800 border border-stone-700/60">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">{def.icon}</span>
                <div className="h-3 shimmer rounded w-24" />
              </div>
              <div className="space-y-1.5">
                <div className="h-3 shimmer rounded w-full" />
                <div className="h-3 shimmer rounded w-5/6" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!context) return null;

  return (
    <div className="py-5 animate-fade-up" style={{ animationDelay: "0.14s" }}>
      <SectionHeader icon="🌎" title="A Life in Their Era" />
      <div className="mt-3 space-y-2">
        {context.categories.map((cat) => {
          const def = CULTURAL_DEFS.find((d) => d.id === cat.id);
          const isOpen = openCategory === cat.id;
          const isExpanding = expandingCategory === cat.id;

          return (
            <div key={cat.id} className="rounded-xl bg-stone-800 border border-stone-700/60 overflow-hidden">
              <div className="p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm">{def?.icon ?? "✦"}</span>
                  <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">
                    {def?.label ?? cat.id}
                  </p>
                </div>
                <p className="text-stone-300 text-sm leading-relaxed">{cat.summary}</p>
                {!isOpen && (
                  <button
                    onClick={() => {
                      setOpenCategory(cat.id);
                      if (!cat.detail && !isExpanding) onExpand(cat.id, def?.label ?? cat.id);
                    }}
                    className="mt-2 text-gold-500 text-xs flex items-center gap-1"
                  >
                    Tell me more
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 18 6-6-6-6"/>
                    </svg>
                  </button>
                )}
              </div>

              {isOpen && (
                <div className="border-t border-stone-700/60 px-3 pb-3 pt-2">
                  {isExpanding ? (
                    <div className="space-y-1.5 py-1">
                      <div className="h-3 shimmer rounded w-full" />
                      <div className="h-3 shimmer rounded w-5/6" />
                      <div className="h-3 shimmer rounded w-full" />
                      <div className="h-3 shimmer rounded w-4/5" />
                      <div className="h-3 shimmer rounded w-full mt-3" />
                      <div className="h-3 shimmer rounded w-3/4" />
                      <div className="h-3 shimmer rounded w-5/6" />
                    </div>
                  ) : cat.detail ? (
                    <>
                      {cat.detail.split(/\n\n+/).map((p, i) => (
                        <p key={i} className="text-stone-400 text-sm leading-relaxed mt-2 first:mt-0">
                          {p.trim()}
                        </p>
                      ))}
                      <button
                        onClick={() => setOpenCategory(null)}
                        className="mt-3 text-stone-500 text-xs"
                      >
                        Show less
                      </button>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-stone-600 text-[10px] italic mt-3">
        Era context generated by AI. Reflects the period and region — not specific to this individual.
      </p>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-base">{icon}</span>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500">
        {title}
      </h2>
    </div>
  );
}

function ShareSheet({
  record,
  onClose,
}: {
  record: GraveRecord;
  onClose: () => void;
}) {
  const emailUrl = buildEmailShareUrl(record);
  const smsUrl = buildSmsShareUrl(record);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full bg-stone-800 rounded-t-3xl p-6 animate-fade-up"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-stone-600 rounded-full mx-auto mb-6" />
        <h3 className="font-serif text-lg text-stone-100 mb-4">
          Share {record.extracted.name || "this grave"}
        </h3>
        <div className="flex flex-col gap-3">
          <a
            href={smsUrl}
            className="flex items-center gap-4 p-4 rounded-2xl bg-stone-700 text-stone-200"
          >
            <span className="text-2xl">💬</span>
            <span className="font-medium">Send as Text Message</span>
          </a>
          <a
            href={emailUrl}
            className="flex items-center gap-4 p-4 rounded-2xl bg-stone-700 text-stone-200"
          >
            <span className="text-2xl">✉️</span>
            <span className="font-medium">Send via Email</span>
          </a>
          <button
            onClick={async () => {
              const { copyToClipboard } = await import("@/lib/share");
              const text = [
                record.extracted.name,
                [record.extracted.birthDate, record.extracted.deathDate]
                  .filter(Boolean)
                  .join(" — "),
                record.location?.cemetery,
              ]
                .filter(Boolean)
                .join("\n");
              await copyToClipboard(text);
              onClose();
            }}
            className="flex items-center gap-4 p-4 rounded-2xl bg-stone-700 text-stone-200 w-full text-left"
          >
            <span className="text-2xl">📋</span>
            <span className="font-medium">Copy to Clipboard</span>
          </button>
        </div>
      </div>
    </div>
  );
}
