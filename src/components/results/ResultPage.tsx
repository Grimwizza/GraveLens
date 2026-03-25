"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BottomNav from "@/components/layout/BottomNav";
import { saveGrave } from "@/lib/storage";
import { shareGrave, buildEmailShareUrl, buildSmsShareUrl } from "@/lib/share";
import type {
  GraveRecord,
  ResearchData,
  ExtractedGraveData,
  GeoLocation,
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
  const [shareOpen, setShareOpen] = useState(false);
  const [savePromptDismissed, setSavePromptDismissed] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(`pending-${id}`);
    if (!raw) {
      router.replace("/");
      return;
    }
    const data: PendingResult = JSON.parse(raw);
    setPending(data);

    // Kick off background research lookups
    if (data.extracted?.name) {
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
          state: data.location?.state,
          cemetery: data.location?.cemetery,
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          setResearch({
            newspapers: d.newspapers ?? [],
            naraRecords: d.naraRecords ?? [],
            landRecords: d.landRecords ?? [],
            historical: d.historical ?? {},
            cemetery: data.location?.cemetery
              ? {
                  name: data.location.cemetery,
                  wikipediaUrl: d.cemeteryWikiUrl,
                  location: data.location ?? undefined,
                }
              : undefined,
          });
        })
        .catch(() => setResearch({}))
        .finally(() => setResearchLoading(false));
    }
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
    };
    await saveGrave(record);
    setSaved(true);
    setSavePromptDismissed(true);
  }, [pending, research]);

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

  if (!pending) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-stone-900">
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
  };

  return (
    <div className="flex flex-col min-h-dvh bg-stone-900">
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

        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 text-gold-500 active:text-gold-400"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          <span className="text-sm">Share</span>
        </button>
      </header>

      <main className="flex-1 flex flex-col max-w-lg mx-auto w-full pb-32">
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

          {/* Historical context */}
          {(research?.historical || researchLoading) && (
            <HistoricalCard
              historical={research?.historical}
              extracted={extracted}
              loading={researchLoading}
            />
          )}

          {/* Inscription */}
          {extracted.inscription && (
            <InscriptionCard inscription={extracted.inscription} epitaph={extracted.epitaph} />
          )}

          {/* Symbols */}
          {extracted.symbols && extracted.symbols.length > 0 && (
            <SymbolsCard symbols={extracted.symbols} />
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

          {/* NARA records */}
          {(research?.naraRecords?.length || researchLoading) ? (
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
  if (loading && !historical) {
    return (
      <div className="py-5 animate-fade-up" style={{ animationDelay: "0.1s" }}>
        <SectionHeader icon="📖" title="Historical Context" />
        <div className="mt-3 space-y-2">
          <div className="h-4 shimmer rounded w-3/4" />
          <div className="h-4 shimmer rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (!historical) return null;

  return (
    <div className="py-5 animate-fade-up" style={{ animationDelay: "0.1s" }}>
      <SectionHeader icon="📖" title="Historical Context" />
      <div className="mt-3 space-y-3">
        {historical.deathEra && (
          <div className="flex items-center gap-3">
            <span className="text-stone-400 text-sm w-20 shrink-0">Era</span>
            <span className="text-stone-200 text-sm">{historical.deathEra}</span>
          </div>
        )}
        {historical.lifeExpectancyAtDeath && extracted.ageAtDeath && (
          <div className="flex items-start gap-3">
            <span className="text-stone-400 text-sm w-20 shrink-0">Context</span>
            <span className="text-stone-300 text-sm leading-relaxed">
              In {extracted.birthYear ?? "their era"}, life expectancy was{" "}
              <strong className="text-stone-200">
                ~{historical.lifeExpectancyAtDeath} years
              </strong>
              . {extracted.name || "This person"} lived to{" "}
              <strong className="text-stone-200">
                {extracted.ageAtDeath}
              </strong>
              .
            </span>
          </div>
        )}
        {historical.worldEvents && historical.worldEvents.length > 0 && (
          <div className="mt-2 p-3 rounded-xl bg-stone-800 border border-stone-700">
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-2">
              The Year {extracted.deathYear ?? "They Died"}
            </p>
            <p className="text-stone-300 text-sm leading-relaxed">
              {historical.worldEvents.join(" ")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function InscriptionCard({
  inscription,
  epitaph,
}: {
  inscription: string;
  epitaph: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const shouldTruncate = inscription.length > 200;

  return (
    <div className="py-5 animate-fade-up" style={{ animationDelay: "0.15s" }}>
      <SectionHeader icon="✦" title="Inscription" />
      {epitaph && (
        <p className="mt-3 font-serif text-stone-300 italic text-base leading-relaxed border-l-2 border-gold-500/50 pl-3 mb-3">
          &ldquo;{epitaph}&rdquo;
        </p>
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
  return (
    <div className="py-5 animate-fade-up" style={{ animationDelay: "0.2s" }}>
      <SectionHeader icon="✦" title="Symbols & Emblems" />
      <ul className="mt-3 space-y-2">
        {symbols.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className="text-gold-500 mt-0.5">—</span>
            <span className="text-stone-300">{s}</span>
          </li>
        ))}
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
