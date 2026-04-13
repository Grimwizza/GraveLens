"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BottomNav from "@/components/layout/BottomNav";
import { saveGrave, getGrave, getAllGraves, getPendingResult, deletePendingResult, deleteGrave, recordCemeteryVisit } from "@/lib/storage";
import { enrichCemetery, cemeteryId } from "@/lib/apis/cemetery";
import { checkAndUnlock, loadStats, type Achievement } from "@/lib/achievements";
import { createClient } from "@/lib/supabase/browser";
import { uploadPhoto, upsertGrave, pushExplorerPoints, deleteFromCloud } from "@/lib/cloudSync";
import { setGravePublic } from "@/lib/community";
import { shareGrave, buildEmailShareUrl, buildSmsShareUrl } from "@/lib/share";
import { interpretSymbols } from "@/lib/apis/symbols";
import { checkQuality, qualitySeverity, type QualityResult } from "@/lib/qualityCheck";
import { loadSettings } from "@/lib/settings";
import { SHOW_COMMUNITY_FEATURES } from "@/lib/config";
import ProfileBadge from "@/components/auth/ProfileBadge";
import type {
  GraveRecord,
  ResearchData,
  ExtractedGraveData,
  GeoLocation,
  LifeNarrative,
  CulturalContext,
  PersonData,
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
  const [achievementToasts, setAchievementToasts] = useState<Achievement[]>([]);
  const [narratives, setNarratives] = useState<(LifeNarrative | null)[]>([null]);
  const [narrativeLoadingIndex, setNarrativeLoadingIndex] = useState<number | null>(null);
  const [selectedPersonIndex, setSelectedPersonIndex] = useState(0);
  const [culturalContext, setCulturalContext] = useState<CulturalContext | null>(null);
  const [culturalLoading, setCulturalLoading] = useState(false);
  const [expandingCategory, setExpandingCategory] = useState<string | null>(null);
  const [locationOverride, setLocationOverride] = useState<GeoLocation | null>(null);
  const [nearbyPrompt, setNearbyPrompt] = useState<{ name: string; records: GraveRecord[] } | null>(null);
  const [photoFullscreen, setPhotoFullscreen] = useState(false);
  const [extractedOverride, setExtractedOverride] = useState<Partial<ExtractedGraveData> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  // Abort controller for the initial fresh-scan research fetch.
  // Cancelled the moment a user-triggered refresh starts so the old-name
  // response can never overwrite a corrected refresh that resolves first.
  const initialFetchAbortRef = useRef<AbortController | null>(null);

  // Quality check state
  type RescanStatus = "idle" | "checking" | "rescanning" | "done";
  const [rescanStatus, setRescanStatus] = useState<RescanStatus>("idle");
  const [qualityResult, setQualityResult] = useState<QualityResult | null>(null);
  const [qualityDialog, setQualityDialog] = useState<{
    issues: QualityResult["issues"];
    photoDataUrl: string;
  } | null>(null);
  const [deepRescanDone, setDeepRescanDone] = useState(false);
  const [deepRescanning, setDeepRescanning] = useState(false);

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
        const archivePeople = archived.extracted?.people;
        if (archivePeople && archivePeople.length > 1) {
          setNarratives(archived.research?.narratives ?? new Array(archivePeople.length).fill(null));
        } else {
          setNarratives([archived.research?.narrative ?? null]);
        }
        setCulturalContext(archived.research?.culturalContext ?? null);
        setTags(archived.tags ?? []);
        setIsPublic(archived.isPublic ?? false);
        setSaved(true);
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

      // Auto-create / update a CemeteryRecord when a grave is saved at a named cemetery
      if (data.location?.cemetery && data.location?.lat && data.location?.lng) {
        const { cemetery, lat, lng } = data.location;
        (async () => {
          try {
            // Kick off enrichment in the background — non-blocking
            const enriched = await enrichCemetery(cemetery, lat, lng);
            await recordCemeteryVisit(enriched);
          } catch {
            // Enrichment failed: record a minimal visit so we always track it
            try {
              await recordCemeteryVisit({
                id: cemeteryId(cemetery, lat, lng),
                name: cemetery,
                lat,
                lng,
              });
            } catch { /* truly non-fatal */ }
          }
        })();
      }

      // Cloud sync — non-fatal if offline or not logged in
      (async () => {
        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const photoUrl = await uploadPhoto(supabase, user.id, autoRecord.id, autoRecord.photoDataUrl);
            await upsertGrave(supabase, user.id, autoRecord, photoUrl);
            await saveGrave({ ...autoRecord, photoDataUrl: photoUrl, syncedAt: Date.now() });
          }
        } catch { /* offline or not logged in — local save stands */ }

        // Check for newly unlocked achievements and push to cloud
        try {
          const allGraves = await getAllGraves();
          const stats = loadStats();
          const newUnlocks = checkAndUnlock(allGraves, stats);
          if (newUnlocks.length > 0) {
            setAchievementToasts(newUnlocks);
            setTimeout(() => setAchievementToasts([]), 5000);
          }
          // Push current Explorer state to cloud (new unlocks or not)
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            pushExplorerPoints(supabase, user.id).catch(() => {});
          }
        } catch { /* non-fatal */ }
      })();

      if (!data.extracted?.name) return;
      setResearchLoading(true);
      const initialAbort = new AbortController();
      initialFetchAbortRef.current = initialAbort;
      fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: initialAbort.signal,
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
            newspapers:        d.newspapers ?? [],
            naraRecords:       d.naraRecords ?? [],
            landRecords:       d.landRecords ?? [],
            historical:        d.historical ?? {},
            militaryContext:   d.militaryContext ?? undefined,
            localHistory:      d.localHistory ?? undefined,
            familySearchHints: d.familySearchHints ?? undefined,
            ssdi:              d.ssdi ?? undefined,
            immigration:       d.immigration ?? undefined,
            historicalCensus:  d.historicalCensus ?? undefined,
            naraItemRecords:   d.naraItemRecords ?? undefined,
            usGenWebRecords:   d.usGenWebRecords ?? undefined,
            researchChecklist: d.researchChecklist ?? undefined,
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
        .catch((err) => {
          // Ignore aborts — a user-triggered refresh took over
          if (err?.name !== "AbortError") setResearch({});
        })
        .finally(() => {
          if (!initialAbort.signal.aborted) setResearchLoading(false);
        });
    });
  }, [id, router]);

  // ── Automatic quality check + rescan ─────────────────────────────────────
  // Runs once when a fresh scan result arrives (not when loading from archive).
  // Skips: re-opened archived records (saved=true before this effect has a chance
  //        to do anything), records that already went through a rescan.
  useEffect(() => {
    if (!pending) return;
    if (rescanStatus !== "idle") return;
    // Don't run the quality check on already-archived records opened from history
    const currentExtracted = pending.extracted;
    if ((currentExtracted as any).isRescan) return; // was already upgraded

    // Respect the autoQualityCheck setting
    if (!loadSettings().autoQualityCheck) {
      setRescanStatus("done");
      return;
    }

    setRescanStatus("checking");
    const qr = checkQuality(currentExtracted);
    setQualityResult(qr);

    const severity = qualitySeverity(qr);
    if (severity === "clean") {
      setRescanStatus("done");
      return;
    }

    // Silently kick off a Sonnet rescan with the specific issues listed
    setRescanStatus("rescanning");
    const issueMessages = qr.issues.map((i) => i.message);

    fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: pending.photoDataUrl.replace(/^data:[^;]+;base64,/, ""),
        mimeType: pending.photoDataUrl.match(/^data:([^;]+);/)?.[1] ?? "image/jpeg",
        rescan: true,
        issues: issueMessages,
      }),
    })
      .then((r) => r.json())
      .then(async (d) => {
        if (!d.extracted) throw new Error("No extracted data in rescan response");

        const newExtracted: ExtractedGraveData = { ...d.extracted };
        const postRescanQr = checkQuality(newExtracted);
        setQualityResult(postRescanQr);

        if (postRescanQr.pass || qualitySeverity(postRescanQr) === "soft") {
          // Rescan improved things — silently apply the better data
          setExtractedOverride(newExtracted);
          const existing = await getGrave(pending.id);
          if (existing) {
            await saveGrave({ ...existing, extracted: newExtracted });
          }
          setRescanStatus("done");
        } else {
          // Still bad after best effort — show the user-facing dialog
          setQualityDialog({ issues: postRescanQr.issues, photoDataUrl: pending.photoDataUrl });
          setRescanStatus("done");
        }
      })
      .catch(() => {
        // Network or API failure — show dialog with original issues so user can fix manually
        setQualityDialog({ issues: qr.issues, photoDataUrl: pending.photoDataUrl });
        setRescanStatus("done");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

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

  // Toggle community sharing for this grave
  const handleTogglePublic = useCallback(async (next: boolean) => {
    setIsPublic(next);
    if (!pending) return;
    // Persist locally
    const existing = await getGrave(pending.id);
    if (existing) await saveGrave({ ...existing, isPublic: next });
    // Sync to cloud
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await setGravePublic(supabase, pending.id, next);
    } catch { /* non-fatal */ }
  }, [pending]);

  const handleDeepRescan = useCallback(async () => {
    if (!pending || deepRescanDone) return;
    setDeepRescanning(true);
    const issueMessages = (qualityResult?.issues ?? []).map((i) => i.message);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: pending.photoDataUrl.replace(/^data:[^;]+;base64,/, ""),
          mimeType: pending.photoDataUrl.match(/^data:([^;]+);/)?.[1] ?? "image/jpeg",
          rescan: true,
          deep: true,
          issues: issueMessages,
        }),
      });
      const d = await res.json();
      if (d.extracted) {
        const newExtracted: ExtractedGraveData = { ...d.extracted };
        const postQr = checkQuality(newExtracted);
        setQualityResult(postQr);
        if (postQr.pass || qualitySeverity(postQr) === "soft") {
          setExtractedOverride(newExtracted);
          const existing = await getGrave(pending.id);
          if (existing) await saveGrave({ ...existing, extracted: newExtracted });
          setQualityDialog(null);
          return;
        }
        // Still has issues — update dialog issues but keep it open (no rescan button)
        setQualityDialog({ issues: postQr.issues, photoDataUrl: pending.photoDataUrl });
      }
    } catch { /* network failure — keep dialog open */ }
    finally {
      setDeepRescanning(false);
      setDeepRescanDone(true);
    }
  }, [pending, deepRescanDone, qualityResult]);

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

  const handleGenerateNarrative = useCallback(async (personIndex: number = 0) => {
    if (!pending || narrativeLoadingIndex !== null) return;
    setNarrativeLoadingIndex(personIndex);
    try {
      const { extracted, location } = pending;
      const people = extracted.people;
      const person = people && people.length > personIndex ? people[personIndex] : null;
      const historical = research?.historical;
      const militaryContext = research?.militaryContext;
      const res = await fetch("/api/narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: person?.name ?? extracted.name,
          birthYear: person?.birthYear ?? extracted.birthYear,
          deathYear: person?.deathYear ?? extracted.deathYear,
          birthDate: person?.birthDate ?? extracted.birthDate,
          deathDate: person?.deathDate ?? extracted.deathDate,
          ageAtDeath: person?.ageAtDeath ?? extracted.ageAtDeath,
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
        const data: LifeNarrative = await res.json();
        setNarratives((prev) => {
          const updated = [...prev];
          updated[personIndex] = data;
          return updated;
        });
        const isMulti = people && people.length > 1;
        if (isMulti) {
          setResearch((prev) => {
            const existing = prev?.narratives ?? new Array(people!.length).fill(null);
            const updated = [...existing];
            updated[personIndex] = data;
            return { ...(prev ?? {}), narratives: updated };
          });
        } else {
          setResearch((prev) => ({ ...(prev ?? {}), narrative: data }));
        }
        // Persist to IndexedDB
        const existing = await getGrave(pending.id);
        if (existing) {
          const updatedResearch = isMulti
            ? {
                ...existing.research,
                narratives: (() => {
                  const arr = [...(existing.research?.narratives ?? new Array(people!.length).fill(null))];
                  arr[personIndex] = data;
                  return arr;
                })(),
              }
            : { ...existing.research, narrative: data };
          await saveGrave({ ...existing, research: updatedResearch });
        }
      }
    } catch (err) {
      console.warn("Narrative generation failed:", err);
    } finally {
      setNarrativeLoadingIndex(null);
    }
  }, [pending, research, narrativeLoadingIndex]);

  const currentLocation = locationOverride ?? pending?.location ?? null;

  const handleCemeteryEdit = useCallback(async (name: string) => {
    if (!pending) return;
    const newLocation: GeoLocation = { ...(currentLocation ?? { lat: 0, lng: 0 }), cemetery: name };
    setLocationOverride(newLocation);

    const updated: GraveRecord = {
      id: pending.id,
      timestamp: pending.timestamp,
      photoDataUrl: pending.photoDataUrl,
      location: newLocation,
      extracted: pending.extracted,
      research: research ?? {},
      tags,
    };
    await saveGrave(updated);

    if (newLocation.lat !== 0 && newLocation.lng !== 0) {
      try {
        const all = await getAllGraves();
        const PROXIMITY_M = 750;
        const nearby = all.filter((g) => {
          if (g.id === pending.id) return false;
          if (!g.location?.lat || !g.location?.lng) return false;
          const dLat = g.location.lat - newLocation.lat;
          const dLng = g.location.lng - newLocation.lng;
          const dist = Math.sqrt(dLat * dLat + dLng * dLng) * 111_000;
          return dist < PROXIMITY_M;
        });
        if (nearby.length > 0) setNearbyPrompt({ name, records: nearby });
      } catch { /* non-fatal */ }
    }
  }, [pending, currentLocation, research, tags]);

  const handleNearbyYes = useCallback(async () => {
    if (!nearbyPrompt) return;
    for (const g of nearbyPrompt.records) {
      const updated = { ...g, location: { ...g.location, cemetery: nearbyPrompt.name } };
      await saveGrave(updated);
    }
    setNearbyPrompt(null);
  }, [nearbyPrompt]);

  const handleRefreshData = useCallback(async (extractedData?: ExtractedGraveData) => {
    if (!pending || refreshing) return;
    // Cancel any in-flight initial scan fetch so it can't overwrite this refresh
    initialFetchAbortRef.current?.abort();
    initialFetchAbortRef.current = null;
    setRefreshing(true);
    const current = extractedData ?? { ...pending.extracted, ...(extractedOverride ?? {}) };
    try {
      setResearchLoading(true);
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: current.name,
          firstName: current.firstName,
          lastName: current.lastName,
          birthYear: current.birthYear,
          deathYear: current.deathYear,
          lat: currentLocation?.lat,
          lng: currentLocation?.lng,
          city: currentLocation?.city,
          county: currentLocation?.county,
          state: currentLocation?.state,
          cemetery: currentLocation?.cemetery,
          inscription: current.inscription ?? "",
          symbols: current.symbols ?? [],
        }),
      });
      if (res.ok) {
        const d = await res.json();
        const researchData: ResearchData = {
          newspapers:        d.newspapers ?? [],
          naraRecords:       d.naraRecords ?? [],
          landRecords:       d.landRecords ?? [],
          historical:        d.historical ?? {},
          militaryContext:   d.militaryContext ?? undefined,
          localHistory:      d.localHistory ?? undefined,
          familySearchHints: d.familySearchHints ?? undefined,
          ssdi:              d.ssdi ?? undefined,
          immigration:       d.immigration ?? undefined,
          historicalCensus:  d.historicalCensus ?? undefined,
          naraItemRecords:   d.naraItemRecords ?? undefined,
          usGenWebRecords:   d.usGenWebRecords ?? undefined,
          researchChecklist: d.researchChecklist ?? undefined,
          cemetery: currentLocation?.cemetery
            ? { name: currentLocation.cemetery, wikipediaUrl: d.cemeteryWikiUrl, location: currentLocation ?? undefined }
            : undefined,
        };
        setResearch(researchData);
        setNarratives(new Array(Math.max(1, pending.extracted?.people?.length ?? 1)).fill(null));
        setCulturalContext(null);
        const existing = await getGrave(pending.id);
        if (existing) await saveGrave({ ...existing, extracted: current, research: researchData });
      }
    } catch { /* non-fatal */ } finally {
      setResearchLoading(false);
      setRefreshing(false);
    }
  }, [pending, extractedOverride, currentLocation, refreshing]);

  const handleExtractedEdit = useCallback(async (patch: Partial<ExtractedGraveData>) => {
    if (!pending) return;

    // Derive firstName/lastName when full name is edited
    let enriched: Partial<ExtractedGraveData> = patch;
    if (patch.name !== undefined) {
      const parts = patch.name.trim().split(/\s+/).filter(Boolean);
      enriched = {
        ...enriched,
        firstName: parts[0] ?? "",
        lastName: parts.length > 1 ? parts[parts.length - 1] : "",
      };
    }
    // Derive year numbers when date strings are edited
    if (patch.birthDate !== undefined) {
      const m = patch.birthDate.match(/\b(1[5-9]\d\d|20[0-2]\d)\b/);
      enriched = { ...enriched, birthYear: m ? parseInt(m[1], 10) : null };
    }
    if (patch.deathDate !== undefined) {
      const m = patch.deathDate.match(/\b(1[5-9]\d\d|20[0-2]\d)\b/);
      enriched = { ...enriched, deathYear: m ? parseInt(m[1], 10) : null };
    }

    // Substitute edited name/dates into the inscription text so it stays in sync.
    const currentExtracted = { ...pending.extracted, ...(extractedOverride ?? {}) };
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const YEAR_RE = /\b(1[5-9]\d\d|20[0-2]\d)\b/;

    // Replace oldVal with newVal in text. Strategy:
    //   1. Case-insensitive exact match (handles "JOHN" → "John", "MARCH 15, 1890" → etc.)
    //   2. Year-only fallback — the AI normalises dates so the extracted string rarely
    //      matches the raw inscription verbatim (e.g. "March 15, 1890" vs "MAR. 15, 1890").
    //      If the full string misses, replace just the year token so "1890" → "1891" still lands.
    function replaceInText(text: string, oldVal: string, newVal: string): string {
      const direct = text.replace(new RegExp(esc(oldVal.trim()), "gi"), newVal);
      if (direct !== text) return direct;
      const oldYear = oldVal.match(YEAR_RE)?.[0];
      const newYear = newVal.match(YEAR_RE)?.[0];
      if (oldYear && newYear && oldYear !== newYear) {
        return text.replace(new RegExp(`\\b${oldYear}\\b`, "g"), newYear);
      }
      return text;
    }

    let inscriptionText = currentExtracted.inscription ?? "";
    if (patch.name !== undefined && currentExtracted.name?.trim()) {
      inscriptionText = replaceInText(inscriptionText, currentExtracted.name, patch.name);
    }
    if (patch.birthDate !== undefined && currentExtracted.birthDate?.trim()) {
      inscriptionText = replaceInText(inscriptionText, currentExtracted.birthDate, patch.birthDate);
    }
    if (patch.deathDate !== undefined && currentExtracted.deathDate?.trim()) {
      inscriptionText = replaceInText(inscriptionText, currentExtracted.deathDate, patch.deathDate);
    }
    if (inscriptionText !== (currentExtracted.inscription ?? "")) {
      enriched = { ...enriched, inscription: inscriptionText };
    }

    const next = { ...pending.extracted, ...(extractedOverride ?? {}), ...enriched };
    setExtractedOverride(next);

    // Persist to DB — don't let a missing record block the research refresh
    const existing = await getGrave(pending.id);
    if (existing) {
      await saveGrave({ ...existing, extracted: next });

      // Push to cloud so the manual edit overwrites stale cloud data on other devices
      (async () => {
        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          const photoUrl = await uploadPhoto(supabase, user.id, existing.id, existing.photoDataUrl);
          await upsertGrave(supabase, user.id, { ...existing, extracted: next }, photoUrl);
          await saveGrave({ ...existing, extracted: next, photoDataUrl: photoUrl, syncedAt: Date.now() });
        } catch { /* offline or not logged in — local save stands */ }
      })();
    }

    // Re-run research when fields that affect the lookup change
    const RESEARCH_KEYS: (keyof ExtractedGraveData)[] = [
      "name", "firstName", "lastName", "birthYear", "deathYear", "inscription", "symbols",
    ];
    if (RESEARCH_KEYS.some((k) => k in enriched)) {
      handleRefreshData(next);
    }
  }, [pending, extractedOverride, handleRefreshData]);

  if (!pending) {
    return (
      <div className="flex items-center justify-center min-h-full bg-stone-900">
        <div className="w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const extracted: ExtractedGraveData = { ...pending.extracted, ...(extractedOverride ?? {}) };
  const { photoDataUrl } = pending;
  const location = currentLocation;

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
          onClick={() => router.back()}
          className="flex items-center gap-2 -ml-1 px-2 py-2 rounded-xl text-stone-400 active:text-stone-200 active:bg-white/5 transition-colors"
          aria-label="Go back"
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
            onClick={() => handleRefreshData()}
            disabled={refreshing || researchLoading}
            aria-label="Refresh data"
            className="text-stone-400 active:text-stone-200 disabled:opacity-40"
          >
            <svg
              width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={refreshing || researchLoading ? "animate-spin" : ""}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
          <button
            onClick={handleShare}
            className="text-stone-400 active:text-stone-200"
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
        <div
          className="relative w-full aspect-[4/3] bg-stone-800 overflow-hidden cursor-pointer"
          onClick={() => setPhotoFullscreen(true)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoDataUrl}
            alt="Grave marker"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-900 via-transparent to-transparent" />
          {/* Expand hint */}
          <div className="absolute bottom-3 right-3 w-7 h-7 rounded-full flex items-center justify-center bg-stone-900/60">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#b0aba6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
            </svg>
          </div>

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
          <PrimaryCard extracted={extracted} onSave={handleExtractedEdit} />

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-stone-700 to-transparent my-1" />

          {/* Cemetery & Location */}
          {location && <CemeteryCard location={location} research={research} onSave={handleCemeteryEdit} />}

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
            narrative={narratives[selectedPersonIndex] ?? null}
            loading={narrativeLoadingIndex === selectedPersonIndex}
            onGenerate={() => handleGenerateNarrative(selectedPersonIndex)}
            extracted={extracted}
            people={extracted.people}
            selectedPersonIndex={selectedPersonIndex}
            onSelectPerson={setSelectedPersonIndex}
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
          <InscriptionCard
            inscription={extracted.inscription}
            epitaph={extracted.epitaph}
            epitaphSource={narratives[selectedPersonIndex]?.epitaphSource}
            epitaphMeaning={narratives[selectedPersonIndex]?.epitaphMeaning}
            onSave={(inscription) => handleExtractedEdit({ inscription })}
          />

          {/* Symbols with database meanings */}
          {extracted.symbols && extracted.symbols.length > 0 && (
            <SymbolsCard symbols={extracted.symbols} />
          )}

          {/* Tags */}
          <TagsCard tags={tags} onChange={handleTagsChange} />

          {/* Community sharing */}
          {SHOW_COMMUNITY_FEATURES && (
            <div
              className="rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3"
              style={{ background: "rgba(26,25,23,0.7)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-stone-200 text-sm font-medium">Share with community</p>
                <p className="text-stone-500 text-[0.8rem] mt-0.5 leading-relaxed">
                  {isPublic
                    ? "Visible on the community map as a coral marker"
                    : "Private — only you can see this on the map"}
                </p>
              </div>
              <button
                onClick={() => handleTogglePublic(!isPublic)}
                className="shrink-0 w-11 h-6 rounded-full relative transition-colors duration-200"
                style={{ background: isPublic ? "#c97c6b" : "#3a3733" }}
                role="switch"
                aria-checked={isPublic}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
                  style={{ transform: isPublic ? "translateX(1.25rem)" : "translateX(0.125rem)" }}
                />
              </button>
            </div>
          )}

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

          {/* FamilySearch record hints */}
          {(research?.familySearchHints?.length || researchLoading) ? (
            <FamilySearchCard
              hints={research?.familySearchHints}
              loading={researchLoading}
            />
          ) : null}

          {/* F3: SSDI */}
          {research?.ssdi?.length ? (
            <SSDICard records={research.ssdi} />
          ) : null}

          {/* F4: Historical Census */}
          {research?.historicalCensus?.length ? (
            <HistoricalCensusCard records={research.historicalCensus} />
          ) : null}

          {/* F5: Immigration records */}
          {research?.immigration?.length ? (
            <ImmigrationCard records={research.immigration} />
          ) : null}

          {/* F6: Item-level military/enlistment records */}
          {research?.naraItemRecords?.length ? (
            <NaraItemCard records={research.naraItemRecords} />
          ) : null}

          {/* F7: USGenWeb probate/deed/will */}
          {research?.usGenWebRecords?.length ? (
            <UsGenWebCard records={research.usGenWebRecords} />
          ) : null}

          {/* F8: Research Checklist */}
          {research?.researchChecklist?.items?.length ? (
            <ResearchChecklistCard checklist={research.researchChecklist} />
          ) : null}
        </div>

        <div className="mx-5 mt-4">
          <Link
            href="/archive"
            className="flex items-center justify-center gap-2 h-11 rounded-xl border border-stone-700 text-stone-300 text-sm w-full"
          >
            View in Archive →
          </Link>
        </div>
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
                <p className="text-[0.75rem] uppercase tracking-widest font-medium" style={{ color: "#c9a84c" }}>
                  Achievement Unlocked
                </p>
                <p className="text-sm font-semibold text-stone-100 leading-tight mt-0.5">{a.title}</p>
                <p className="text-[0.8rem] text-stone-400 truncate">{a.flavour}</p>
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

      {/* Fullscreen photo viewer */}
      {photoFullscreen && (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-stone-950"
          style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {/* Tap image to close */}
          <div className="flex-1 flex items-center justify-center overflow-hidden" onClick={() => setPhotoFullscreen(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoDataUrl}
              alt="Grave marker"
              className="max-w-full max-h-full object-contain"
              style={{ touchAction: "pinch-zoom" }}
            />
          </div>

          {/* Action bar */}
          <div className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-stone-800 bg-stone-950">
            <button
              onClick={() => setPhotoFullscreen(false)}
              className="flex items-center gap-2 text-stone-400 active:text-stone-200"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
              <span className="text-sm">Close</span>
            </button>

            <div className="flex items-center gap-4">
              {/* Download */}
              <a
                href={photoDataUrl}
                download={`${extracted.name || "grave-marker"}.jpg`}
                className="flex items-center gap-1.5 text-stone-300 active:text-stone-100"
                onClick={(e) => e.stopPropagation()}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                <span className="text-sm">Save</span>
              </a>

              {/* Share */}
              <button
                onClick={(e) => { e.stopPropagation(); handleShare(); }}
                className="flex items-center gap-1.5 text-stone-300 active:text-stone-100"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                  <polyline points="16 6 12 2 8 6"/>
                  <line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
                <span className="text-sm">Share</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nearby-records bulk-update prompt */}
      {nearbyPrompt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 pb-safe">
          <div className="absolute inset-0 bg-stone-950/70 backdrop-blur-sm" onClick={() => setNearbyPrompt(null)} />
          <div
            className="relative w-full max-w-sm rounded-2xl p-5 flex flex-col gap-4"
            style={{ background: "rgb(30 28 26)", border: "1px solid rgb(60 56 50)" }}
          >
            <div className="flex flex-col gap-1">
              <p className="text-stone-100 font-semibold text-base">Update nearby records?</p>
              <p className="text-stone-400 text-sm leading-relaxed">
                {nearbyPrompt.records.length} other{" "}
                {nearbyPrompt.records.length === 1 ? "record" : "records"} in this area{" "}
                {nearbyPrompt.records.every((g) => !g.location?.cemetery)
                  ? "also have no cemetery listed"
                  : "are in the same area"}
                . Set them all to{" "}
                <span className="text-stone-200 font-medium">&ldquo;{nearbyPrompt.name}&rdquo;</span>?
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setNearbyPrompt(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-stone-300 bg-stone-800 active:bg-stone-700"
              >
                No, just this one
              </button>
              <button
                onClick={handleNearbyYes}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: "#c9a84c", color: "#1a1917" }}
              >
                Yes, update all
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rescan status indicator — floats below header */}
      {rescanStatus === "rescanning" && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2.5 px-4 py-2.5 rounded-2xl shadow-xl"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 3.5rem)",
            background: "rgba(26,25,23,0.96)",
            border: "1px solid rgba(201,168,76,0.3)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div
            className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin shrink-0"
            style={{ borderColor: "#c9a84c transparent #c9a84c #c9a84c" }}
          />
          <span className="text-xs text-stone-300 font-medium">Verifying data quality…</span>
        </div>
      )}

      {/* Quality issue dialog — shown when both AI passes fail checks */}
      {qualityDialog && (
        <QualityIssueSheet
          issues={qualityDialog.issues}
          onRescan={deepRescanDone ? undefined : handleDeepRescan}
          rescanBusy={deepRescanning}
          onEdit={() => {
            setQualityDialog(null);
            document.getElementById("primary-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          onDelete={async () => {
            if (!pending) return;
            setQualityDialog(null);
            await deleteGrave(pending.id);
            try {
              const supabase = createClient();
              const { data: { user } } = await supabase.auth.getUser();
              if (user) await deleteFromCloud(supabase, user.id, pending.id);
            } catch { /* non-fatal */ }
            router.replace("/");
          }}
          onDismiss={() => setQualityDialog(null)}
        />
      )}
    </div>
  );
}

// ── Quality Issue Sheet ───────────────────────────────────────────────────────

function QualityIssueSheet({
  issues,
  onRescan,
  rescanBusy,
  onEdit,
  onDelete,
  onDismiss,
}: {
  issues: { field: string; code: string; message: string }[];
  onRescan?: () => void;
  rescanBusy?: boolean;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onDismiss: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-stone-950/70 backdrop-blur-sm" onClick={onDismiss} />

      <div
        className="relative w-full max-w-sm rounded-t-3xl flex flex-col gap-0 overflow-hidden"
        style={{
          background: "rgb(22 20 18)",
          border: "1px solid rgba(255,255,255,0.08)",
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-stone-700" />
        </div>

        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-3 pb-4">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.25)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-stone-100 font-semibold text-base leading-snug">Data quality issue detected</p>
            <p className="text-stone-400 text-sm mt-0.5 leading-relaxed">
              The scan result couldn't be verified after two attempts. You can correct it manually or delete this entry.
            </p>
          </div>
        </div>

        {/* Issue list */}
        <div className="mx-5 rounded-xl overflow-hidden border border-stone-800 mb-5">
          {issues.slice(0, 4).map((issue, i) => (
            <div
              key={i}
              className="flex items-start gap-2.5 px-3 py-2.5 border-b border-stone-800 last:border-0"
              style={{ background: "rgb(26 24 22)" }}
            >
              <span className="text-[0.8rem] mt-0.5 shrink-0">⚠️</span>
              <span className="text-stone-400 text-xs leading-relaxed">{issue.message}</span>
            </div>
          ))}
          {issues.length > 4 && (
            <div className="px-3 py-2 text-xs text-stone-600 text-center" style={{ background: "rgb(26 24 22)" }}>
              +{issues.length - 4} more issue{issues.length - 4 !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 px-5">
          {!confirmDelete ? (
            <>
              {onRescan && (
                <button
                  onClick={onRescan}
                  disabled={rescanBusy}
                  className="w-full py-3 rounded-2xl text-sm font-semibold text-stone-900 flex items-center justify-center gap-2 disabled:opacity-70"
                  style={{ background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }}
                >
                  {rescanBusy ? (
                    <>
                      <div className="w-4 h-4 border-2 border-stone-900/40 border-t-stone-900 rounded-full animate-spin" />
                      Scanning…
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                      </svg>
                      Re-scan with Enhanced Analysis
                    </>
                  )}
                </button>
              )}
              <button
                onClick={onEdit}
                className="w-full py-3 rounded-2xl text-sm font-semibold"
                style={onRescan ? { background: "rgba(255,255,255,0.06)", color: "#e5e2de", border: "1px solid rgba(255,255,255,0.1)" } : { background: "linear-gradient(135deg, #c9a84c, #d4b76a)", color: "#1a1917" }}
              >
                Edit Manually
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full py-3 rounded-2xl text-sm font-medium text-red-400 border border-red-500/20 bg-red-500/5"
              >
                Delete Entry
              </button>
              <button
                onClick={onDismiss}
                className="w-full py-2.5 text-xs text-stone-500"
              >
                Keep as-is
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-stone-300 text-center pb-1">
                Are you sure? This will permanently remove this entry.
              </p>
              <button
                onClick={async () => { setDeleting(true); await onDelete(); }}
                disabled={deleting}
                className="w-full py-3 rounded-2xl text-sm font-semibold text-white bg-red-600 active:bg-red-700 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Yes, Delete Permanently"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="w-full py-2.5 text-xs text-stone-500"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function PrimaryCard({
  extracted,
  onSave,
}: {
  extracted: ExtractedGraveData;
  onSave?: (patch: Partial<ExtractedGraveData>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(extracted.name ?? "");
  const [birthDate, setBirthDate] = useState(extracted.birthDate ?? "");
  const [deathDate, setDeathDate] = useState(extracted.deathDate ?? "");

  // Keep fields in sync if parent updates extracted (e.g. after refresh)
  useEffect(() => {
    if (!editing) {
      setName(extracted.name ?? "");
      setBirthDate(extracted.birthDate ?? "");
      setDeathDate(extracted.deathDate ?? "");
    }
  }, [extracted, editing]);

  const handleSave = () => {
    onSave?.({ name, birthDate, deathDate });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="py-6 animate-fade-up flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[0.75rem] uppercase tracking-widest text-stone-500 font-bold">Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-stone-800 text-stone-100 text-lg font-serif rounded-lg px-3 py-2 border border-stone-700 focus:outline-none focus:border-stone-500"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[0.75rem] uppercase tracking-widest text-stone-500 font-bold">Birth Date</label>
            <input
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              placeholder="e.g. Mar 4, 1842"
              className="bg-stone-800 text-stone-200 text-sm rounded-lg px-3 py-2 border border-stone-700 focus:outline-none focus:border-stone-500"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[0.75rem] uppercase tracking-widest text-stone-500 font-bold">Death Date</label>
            <input
              value={deathDate}
              onChange={(e) => setDeathDate(e.target.value)}
              placeholder="e.g. Jan 12, 1901"
              className="bg-stone-800 text-stone-200 text-sm rounded-lg px-3 py-2 border border-stone-700 focus:outline-none focus:border-stone-500"
            />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            className="flex-1 h-9 rounded-lg text-stone-900 text-sm font-semibold"
            style={{ background: "#c9a84c" }}
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="flex-1 h-9 rounded-lg text-stone-400 text-sm border border-stone-700"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6 animate-fade-up">
      <div className="flex items-start justify-between gap-2">
        {extracted.name ? (
          <h1 className="font-serif text-3xl font-bold text-stone-50 leading-tight mb-3">
            {extracted.name}
          </h1>
        ) : (
          <h1 className="font-serif text-3xl font-bold text-stone-500 leading-tight mb-3 italic">
            Unknown
          </h1>
        )}
        {onSave && (
          <button
            onClick={() => setEditing(true)}
            className="mt-1 shrink-0 text-stone-500 active:text-stone-200"
            aria-label="Edit details"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {(extracted.birthDate || extracted.deathDate) && (
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-0.5">Dates</p>
            <p className="text-stone-200 font-medium">
              {[extracted.birthDate, extracted.deathDate].filter(Boolean).join(" — ")}
            </p>
          </div>
        )}
        {extracted.ageAtDeath && (
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-0.5">Age</p>
            <p className="text-stone-200 font-medium">{extracted.ageAtDeath} years</p>
          </div>
        )}
        {extracted.markerType && extracted.markerType !== "headstone" && (
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-0.5">Marker</p>
            <p className="text-stone-200 font-medium capitalize">{extracted.markerType}</p>
          </div>
        )}
        {extracted.material && extracted.material !== "unknown" && (
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-0.5">Material</p>
            <p className="text-stone-200 font-medium capitalize">{extracted.material}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function CemeteryCard({
  location,
  research,
  onSave,
}: {
  location: GeoLocation;
  research: ResearchData | null;
  onSave?: (name: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(location.cemetery ?? "");
  const [saving, setSaving] = useState(false);
  const cemeteryUrl = research?.cemetery?.wikipediaUrl;

  const handleSave = async () => {
    const name = editValue.trim();
    if (!name || !onSave) return;
    setSaving(true);
    await onSave(name);
    setSaving(false);
    setEditing(false);
  };

  return (
    <div className="py-5 animate-fade-up" style={{ animationDelay: "0.05s" }}>
      <SectionHeader icon="📍" title="Location" />
      <div className="flex flex-col gap-1 mt-3">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
              placeholder="Cemetery name"
              className="flex-1 bg-stone-800 text-stone-200 text-sm rounded-lg px-3 py-1.5 border border-stone-600 focus:outline-none focus:border-stone-400"
            />
            <button
              onClick={handleSave}
              disabled={saving || !editValue.trim()}
              className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40"
              style={{ background: "#c9a84c", color: "#1a1917" }}
            >
              {saving ? "…" : "Save"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-2 py-1.5 rounded-lg text-sm text-stone-400 active:text-stone-200"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              {location.cemetery ? (
                <p className="text-stone-200 font-medium">{location.cemetery}</p>
              ) : (
                <p className="text-stone-500 text-sm italic">No cemetery on record</p>
              )}
              {cemeteryUrl && (
                <a
                  href={cemeteryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-500 text-xs underline"
                >
                  Wikipedia →
                </a>
              )}
            </div>
            {onSave && (
              <button
                onClick={() => { setEditValue(location.cemetery ?? ""); setEditing(true); }}
                className="text-stone-500 active:text-stone-300 shrink-0 mt-0.5"
                aria-label="Edit cemetery"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            )}
          </div>
        )}
        {location.city && location.state && (
          <p className="text-stone-400 text-sm">
            {location.city}, {location.state}
          </p>
        )}
        {location.lat !== 0 && (
          <div className="flex gap-2 mt-2">
            <a
              href={`https://maps.apple.com/?q=${encodeURIComponent(location.cemetery || "Grave Location")}&ll=${location.lat},${location.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[0.8rem] font-semibold text-stone-200 border border-stone-700 bg-stone-800 active:bg-stone-700 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#007AFF"/><path d="M12 7l4 10-4-2-4 2 4-10z" fill="white"/></svg>
              Apple Maps
            </a>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.cemetery || "Grave Location")}&center=${location.lat},${location.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[0.8rem] font-semibold text-stone-200 border border-stone-700 bg-stone-800 active:bg-stone-700 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#4285F4"/><circle cx="12" cy="9" r="2.5" fill="#FBBC05"/></svg>
              Google Maps
            </a>
          </div>
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
  onSave,
}: {
  inscription: string;
  epitaph: string;
  epitaphSource?: string;
  epitaphMeaning?: string;
  onSave?: (inscription: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(inscription ?? "");
  const shouldTruncate = !editing && inscription.length > 200;

  useEffect(() => {
    if (!editing) setDraft(inscription ?? "");
  }, [inscription, editing]);

  const handleSave = () => {
    onSave?.(draft);
    setEditing(false);
  };

  return (
    <div className="py-5 animate-fade-up" style={{ animationDelay: "0.15s" }}>
      <div className="flex items-center justify-between mb-1">
        <SectionHeader icon="✦" title="Inscription" />
        {onSave && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-stone-500 active:text-stone-200"
            aria-label="Edit inscription"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        )}
      </div>

      {epitaph && !editing && (
        <div className="mt-3 mb-3">
          <p className="font-serif text-stone-300 italic text-base leading-relaxed border-l-2 border-stone-600 pl-3">
            &ldquo;{epitaph}&rdquo;
          </p>
          {(epitaphSource || epitaphMeaning) && (
            <div className="mt-2 pl-3 space-y-1">
              {epitaphSource && <p className="text-stone-500 text-xs font-medium">{epitaphSource}</p>}
              {epitaphMeaning && <p className="text-stone-400 text-xs leading-relaxed">{epitaphMeaning}</p>}
            </div>
          )}
        </div>
      )}

      {editing ? (
        <div className="flex flex-col gap-2 mt-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            className="w-full bg-stone-800 text-stone-200 text-sm font-mono rounded-lg px-3 py-2 border border-stone-700 focus:outline-none focus:border-stone-500 resize-none leading-relaxed"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 h-9 rounded-lg text-stone-900 text-sm font-semibold"
              style={{ background: "#c9a84c" }}
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="flex-1 h-9 rounded-lg text-stone-400 text-sm border border-stone-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {inscription ? (
            <div
              className={`mt-2 font-mono text-stone-400 text-sm leading-relaxed whitespace-pre-wrap ${
                !expanded && shouldTruncate ? "line-clamp-6" : ""
              }`}
            >
              {inscription}
            </div>
          ) : (
            <p className="mt-2 text-stone-600 text-sm italic">No inscription recorded.</p>
          )}
          {shouldTruncate && (
            <button onClick={() => setExpanded((e) => !e)} className="text-stone-500 text-xs mt-2">
              {expanded ? "Show less" : "Show full inscription"}
            </button>
          )}
        </>
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

// ── FamilySearch Hints Card ───────────────────────────────────────────────────

function FamilySearchCard({
  hints,
  loading,
}: {
  hints?: import("@/types").FamilySearchHint[];
  loading: boolean;
}) {
  if (loading && !hints) {
    return (
      <div className="py-5 animate-fade-up">
        <SectionHeader icon="🌳" title="FamilySearch Records" />
        <div className="mt-3 space-y-2">
          <div className="h-14 shimmer rounded-xl" />
          <div className="h-14 shimmer rounded-xl" />
        </div>
      </div>
    );
  }
  if (!hints || hints.length === 0) return null;

  return (
    <div className="py-5 animate-fade-up">
      <SectionHeader icon="🌳" title="FamilySearch Records" />
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
                style={{ background: "rgba(201,168,76,0.15)", color: "#c9a84c" }}
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
                <p className="text-xs mt-1" style={{ color: "#c9a84c" }}>
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

const CONFIDENCE_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  high:   { color: "#7ab87a", bg: "rgba(50,120,50,0.18)",  label: "High match"   },
  medium: { color: "#c9a84c", bg: "rgba(150,100,20,0.18)", label: "Possible match" },
  low:    { color: "#a07060", bg: "rgba(120,60,40,0.18)",  label: "Low confidence" },
};

function SSDICard({ records }: { records: import("@/types").SSDIRecord[] }) {
  if (!records.length) return null;
  return (
    <div className="py-5 animate-fade-up">
      <SectionHeader icon="📋" title="Social Security Death Index" />
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
                  <p className="text-xs mt-1.5" style={{ color: "#c9a84c" }}>View SSDI record →</p>
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

function HistoricalCensusCard({ records }: { records: import("@/types").HistoricalCensusRecord[] }) {
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
                style={{ background: "rgba(201,168,76,0.15)", color: "#c9a84c" }}
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
                <p className="text-xs mt-1.5" style={{ color: "#c9a84c" }}>View census record →</p>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Immigration Card (F5) ─────────────────────────────────────────────────────

function ImmigrationCard({ records }: { records: import("@/types").ImmigrationRecord[] }) {
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
                <p className="text-xs mt-1.5" style={{ color: "#c9a84c" }}>View passenger record →</p>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── NARA Item-Level Card (F6) ─────────────────────────────────────────────────

function NaraItemCard({ records }: { records: import("@/types").NaraItemRecord[] }) {
  if (!records.length) return null;
  return (
    <div className="py-5 animate-fade-up">
      <SectionHeader icon="🎖" title="Military Item-Level Records" />
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
                style={{ background: "rgba(201,168,76,0.12)", color: "#c9a84c" }}
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
                <p className="text-xs mt-1.5" style={{ color: "#c9a84c" }}>
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

// ── USGenWeb Card (F7) ────────────────────────────────────────────────────────

const RECORD_TYPE_LABEL: Record<string, string> = {
  probate:   "Probate",
  deed:      "Deed",
  will:      "Will",
  directory: "Directory",
  general:   "County Archive",
};

function UsGenWebCard({ records }: { records: import("@/types").UsGenWebRecord[] }) {
  if (!records.length) return null;
  return (
    <div className="py-5 animate-fade-up">
      <SectionHeader icon="📜" title="Probate & Deed Records (USGenWeb)" />
      <p className="text-stone-500 text-xs mt-1 mb-3">
        Volunteer-transcribed county probate, deed, and will records — names heirs and land transfers.
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
                style={{ background: "rgba(92,122,92,0.2)", color: "#8ab47a" }}
              >
                {RECORD_TYPE_LABEL[r.recordType] ?? r.recordType}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-stone-200 text-sm font-medium leading-snug">{r.title}</p>
                <p className="text-stone-500 text-xs mt-0.5">
                  {r.county}, {r.state}
                </p>
                <p className="text-xs mt-1.5" style={{ color: "#c9a84c" }}>View on USGenWeb →</p>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Research Checklist Card ───────────────────────────────────────────────────

const PRIORITY_LABEL: Record<1 | 2 | 3, { label: string; color: string; bg: string }> = {
  1: { label: "Do First",   color: "#e8a87c", bg: "rgba(180,90,40,0.2)" },
  2: { label: "High Value", color: "#c9a84c", bg: "rgba(150,100,20,0.2)" },
  3: { label: "Supplement", color: "#7a9a7a", bg: "rgba(50,90,50,0.2)" },
};

function ResearchChecklistCard({
  checklist,
}: {
  checklist: import("@/types").ResearchChecklist;
}) {
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
              <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[0.65rem] font-bold text-stone-900" style={{ background: badge.color }}>
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-stone-200 text-sm leading-snug">{item.action}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span
                    className="text-[0.65rem] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide"
                    style={{ background: badge.bg, color: badge.color }}
                  >
                    {badge.label}
                  </span>
                  <span className="text-stone-500 text-xs">{item.source}</span>
                </div>
                {item.url && (
                  <p className="text-xs mt-1" style={{ color: "#c9a84c" }}>
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
                  <p className="text-stone-500 text-[0.75rem] uppercase tracking-wide">{entry.year}</p>
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
            <p className="text-stone-600 text-[0.75rem] mt-1.5">
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
  people,
  selectedPersonIndex = 0,
  onSelectPerson,
}: {
  narrative: LifeNarrative | null;
  loading: boolean;
  onGenerate: () => void;
  extracted: ExtractedGraveData;
  people?: PersonData[];
  selectedPersonIndex?: number;
  onSelectPerson?: (index: number) => void;
}) {
  // Only offer the feature when we have enough data to generate something meaningful
  const hasEnoughData = !!(extracted.birthYear || extracted.deathYear || extracted.inscription);
  if (!hasEnoughData) return null;

  const isMulti = people && people.length > 1;

  const eligiblePeople = isMulti
    ? people.map((person, i) => ({ person, i })).filter(({ person }) => !!(person.deathDate || person.deathYear))
    : [];

  const pillSelector = eligiblePeople.length > 1 ? (
    <div className="flex flex-wrap gap-2 mt-3">
      {eligiblePeople.map(({ person, i }) => {
        const label = person.firstName || person.name.split(" ")[0] || `Person ${i + 1}`;
        const isSelected = i === selectedPersonIndex;
        return (
          <button
            key={i}
            onClick={() => onSelectPerson?.(i)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all active:scale-[0.97] ${
              isSelected ? "text-stone-900" : "bg-stone-800 text-stone-400 hover:bg-stone-700"
            }`}
            style={isSelected ? { background: "linear-gradient(135deg, #c9a84c, #d4b76a)" } : undefined}
          >
            {label}
          </button>
        );
      })}
    </div>
  ) : null;

  if (!narrative && !loading) {
    return (
      <div className="py-5 animate-fade-up" style={{ animationDelay: "0.12s" }}>
        <SectionHeader icon="📜" title="A Life in Context" />
        {pillSelector}
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
        {pillSelector}
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
      {pillSelector}
      <div className="mt-3 space-y-3">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-stone-300 text-sm leading-relaxed">
            {p}
          </p>
        ))}
        <p className="text-stone-600 text-[0.75rem] italic pt-1">
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
      <p className="text-stone-600 text-[0.75rem] italic mt-3">
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
