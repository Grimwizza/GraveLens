"use client";

import { useEffect, useState } from "react";
import BottomNav from "@/components/layout/BottomNav";
import ProfileBadge from "@/components/auth/ProfileBadge";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORIES,
  RANKS,
  getRank,
  getNextRank,
  xpToNextRank,
  totalXP,
  loadUnlocks,
  loadStats,
  isUnlocked,
  type Achievement,
  type UnlockRecord,
  type AchievementCategory,
} from "@/lib/achievements";
import { getAllGraves } from "@/lib/storage";
import type { GraveRecord } from "@/types";

const CATEGORY_ICONS: Record<AchievementCategory, string> = {
  "First Steps": "🪦",
  "Collection": "📚",
  "Exploration": "🧭",
  "Through the Ages": "⏳",
  "Military": "🎖️",
  "Family": "🌳",
  "Research": "🔍",
  "Discovery": "✨",
};

function RankBadge({ level, title }: { level: number; title: string }) {
  const isMax = level === 10;
  return (
    <div
      className="relative flex flex-col items-center justify-center rounded-full border-2 w-24 h-24 shrink-0"
      style={{
        background: isMax
          ? "radial-gradient(circle at 40% 35%, #f5d080, #c9a84c 55%, #8a6820)"
          : "radial-gradient(circle at 40% 35%, #3a3530, #2a2520)",
        borderColor: isMax ? "#f5d080" : "#c9a84c",
        boxShadow: isMax ? "0 0 20px rgba(201,168,76,0.45)" : "0 0 8px rgba(201,168,76,0.2)",
      }}
    >
      <span
        className="text-2xl font-bold font-serif leading-none"
        style={{ color: isMax ? "#1a1510" : "#c9a84c" }}
      >
        {level}
      </span>
      <span
        className="text-[9px] font-medium tracking-widest uppercase mt-0.5"
        style={{ color: isMax ? "#1a1510" : "#8a8580" }}
      >
        Level
      </span>
    </div>
  );
}

function XPBar({ progress, label }: { progress: number; label: string }) {
  return (
    <div className="w-full">
      <div className="h-2 rounded-full bg-stone-700 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${Math.max(2, Math.min(100, progress * 100))}%`,
            background: "linear-gradient(90deg, #8a6820, #c9a84c, #f5d080)",
          }}
        />
      </div>
      <p className="text-[11px] text-stone-500 mt-1 text-right">{label}</p>
    </div>
  );
}

function AchievementCard({
  achievement,
  unlocked,
  progress,
  label,
  onClick,
}: {
  achievement: (typeof ACHIEVEMENTS)[number];
  unlocked: boolean;
  progress: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl p-4 flex gap-3 items-start transition-all active:scale-[0.98]"
      style={{
        background: unlocked
          ? "linear-gradient(135deg, #2a2515, #1e1c18)"
          : "rgba(30,28,24,0.6)",
        border: unlocked
          ? "1px solid rgba(201,168,76,0.4)"
          : "1px solid rgba(255,255,255,0.06)",
        boxShadow: unlocked ? "0 0 12px rgba(201,168,76,0.12)" : "none",
        opacity: !unlocked && progress === 0 ? 0.5 : 1,
      }}
    >
      {/* Icon */}
      <div
        className="text-2xl w-10 h-10 flex items-center justify-center rounded-lg shrink-0"
        style={{
          background: unlocked
            ? "rgba(201,168,76,0.15)"
            : "rgba(255,255,255,0.04)",
          filter: !unlocked && progress === 0 ? "grayscale(1)" : "none",
        }}
      >
        {achievement.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className="text-sm font-semibold leading-tight"
            style={{ color: unlocked ? "#f5d080" : "#a09890" }}
          >
            {achievement.title}
          </p>
          <span
            className="text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded"
            style={{
              background: unlocked ? "rgba(201,168,76,0.2)" : "rgba(255,255,255,0.06)",
              color: unlocked ? "#c9a84c" : "#6a6560",
            }}
          >
            +{achievement.xp} XP
          </span>
        </div>

        {unlocked ? (
          <p className="text-[11px] text-stone-400 mt-0.5 leading-snug italic">
            &ldquo;{achievement.flavour}&rdquo;
          </p>
        ) : (
          <p className="text-[11px] text-stone-500 mt-0.5 leading-snug">
            {achievement.description}
          </p>
        )}

        {/* Progress bar for in-progress achievements */}
        {!unlocked && progress > 0 && (
          <div className="mt-2">
            <div className="h-1 rounded-full bg-stone-700 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, progress * 100)}%`,
                  background: "linear-gradient(90deg, #5a4010, #c9a84c)",
                }}
              />
            </div>
            <p className="text-[10px] text-stone-600 mt-0.5">{label}</p>
          </div>
        )}

        {/* Unlocked checkmark */}
        {unlocked && (
          <div className="flex items-center gap-1 mt-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="text-[10px]" style={{ color: "#c9a84c" }}>Unlocked · tap for details</span>
          </div>
        )}
        {!unlocked && (
          <p className="text-[10px] text-stone-700 mt-1.5">Tap to see how to earn this</p>
        )}
      </div>
    </button>
  );
}

// ── Achievement detail sheet ───────────────────────────────────────────────
function AchievementDetailSheet({
  achievement,
  unlocked,
  unlockedAt,
  progress,
  label,
  onClose,
}: {
  achievement: Achievement;
  unlocked: boolean;
  unlockedAt?: number;
  progress: number;
  label: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative w-full max-w-lg mx-auto rounded-t-3xl animate-fade-up"
        style={{
          background: "linear-gradient(160deg, #1e1c18, #252218)",
          border: "1px solid rgba(201,168,76,0.2)",
          paddingBottom: "max(2rem, env(safe-area-inset-bottom))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 bg-stone-600 rounded-full mx-auto mt-3 mb-6" />

        <div className="px-6">
          {/* Icon + category */}
          <div className="flex items-start justify-between mb-5">
            <div
              className="text-4xl w-16 h-16 flex items-center justify-center rounded-2xl"
              style={{
                background: unlocked
                  ? "rgba(201,168,76,0.18)"
                  : "rgba(255,255,255,0.05)",
                filter: !unlocked ? "grayscale(0.6)" : "none",
              }}
            >
              {achievement.icon}
            </div>
            <div className="text-right">
              <span
                className="text-xs font-medium px-2 py-1 rounded-full"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  color: "#8a8580",
                }}
              >
                {achievement.category}
              </span>
              <div className="mt-2">
                <span
                  className="text-sm font-bold px-2.5 py-1 rounded-lg"
                  style={{
                    background: unlocked ? "rgba(201,168,76,0.2)" : "rgba(255,255,255,0.06)",
                    color: unlocked ? "#f5d080" : "#6a6560",
                  }}
                >
                  +{achievement.xp} XP
                </span>
              </div>
            </div>
          </div>

          {/* Title */}
          <h2
            className="font-serif text-2xl font-bold leading-tight mb-2"
            style={{ color: unlocked ? "#f5d080" : "#c8c0b8" }}
          >
            {achievement.title}
          </h2>

          {/* Unlock status */}
          {unlocked ? (
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: "rgba(201,168,76,0.2)" }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <span className="text-sm font-medium" style={{ color: "#c9a84c" }}>
                Unlocked
                {unlockedAt && (
                  <span className="text-stone-500 font-normal ml-1">
                    · {new Date(unlockedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                )}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6a6560" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <span className="text-sm text-stone-500">Not yet unlocked</span>
            </div>
          )}

          {/* Divider */}
          <div className="h-px bg-stone-700/50 mb-4" />

          {/* How to earn */}
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-widest text-stone-500 font-medium mb-1.5">
              How to earn
            </p>
            <p className="text-stone-300 text-sm leading-relaxed">
              {achievement.description}
            </p>
          </div>

          {/* Progress (if in progress) */}
          {!unlocked && progress > 0 && (
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-widest text-stone-500 font-medium mb-2">
                Your progress
              </p>
              <div className="h-2 rounded-full bg-stone-700 overflow-hidden mb-1">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, progress * 100)}%`,
                    background: "linear-gradient(90deg, #5a4010, #c9a84c)",
                  }}
                />
              </div>
              <p className="text-xs text-stone-500">{label}</p>
            </div>
          )}

          {/* Flavour quote (always show) */}
          <div
            className="rounded-xl px-4 py-3"
            style={{
              background: "rgba(255,255,255,0.03)",
              borderLeft: "2px solid rgba(201,168,76,0.3)",
            }}
          >
            <p className="text-stone-400 text-sm italic leading-relaxed">
              &ldquo;{achievement.flavour}&rdquo;
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-full mt-5 h-12 rounded-2xl text-stone-400 text-sm border border-stone-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AchievementsPage() {
  const [graves, setGraves] = useState<GraveRecord[]>([]);
  const [unlocks, setUnlocks] = useState<UnlockRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    getAllGraves()
      .then((g) => {
        setGraves(g);
        setUnlocks(loadUnlocks());
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const stats = loadStats();
  const xp = totalXP(unlocks);
  const rank = getRank(xp);
  const nextRank = getNextRank(xp);
  const { needed, progress } = xpToNextRank(xp);
  const unlockedCount = unlocks.length;
  const totalCount = ACHIEVEMENTS.length;

  return (
    <div className="flex flex-col h-full bg-stone-900 overflow-hidden">
      {/* Header */}
      <header
        className="px-5 py-4 bg-stone-900/95 backdrop-blur-sm sticky top-0 z-30 border-b border-stone-800"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-serif text-lg text-stone-100 font-semibold">History Explorer</h1>
            <p className="text-xs text-stone-500 mt-0.5">Your journey through the ages</p>
          </div>
          <ProfileBadge />
        </div>
      </header>

      <main className="scroll-container max-w-lg mx-auto w-full px-4 pb-32 space-y-6 mt-5">
        {/* Rank card */}
        <div
          className="rounded-2xl p-5"
          style={{
            background: "linear-gradient(135deg, #1e1c18, #2a2520)",
            border: "1px solid rgba(201,168,76,0.25)",
          }}
        >
          <div className="flex items-center gap-4">
            <RankBadge level={rank.level} title={rank.title} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-widest text-stone-500 font-medium">
                Current Rank
              </p>
              <h2
                className="font-serif text-xl font-bold mt-0.5 leading-tight"
                style={{ color: "#f5d080" }}
              >
                {rank.title}
              </h2>
              <p className="text-xs text-stone-400 mt-0.5 italic">{rank.subtitle}</p>

              <div className="mt-3">
                {nextRank ? (
                  <>
                    <XPBar progress={progress} label={`${xp} XP · ${needed} to ${nextRank.title}`} />
                  </>
                ) : (
                  <p className="text-xs text-gold-500 font-semibold" style={{ color: "#c9a84c" }}>
                    Maximum rank achieved
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Rank ladder preview */}
          <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {RANKS.map((r) => {
              const isCurrentRank = r.level === rank.level;
              const isPastRank = r.level < rank.level;
              return (
                <div
                  key={r.level}
                  className="flex flex-col items-center shrink-0"
                  title={r.title}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border"
                    style={{
                      background: isCurrentRank
                        ? "#c9a84c"
                        : isPastRank
                        ? "rgba(201,168,76,0.2)"
                        : "rgba(255,255,255,0.05)",
                      borderColor: isCurrentRank
                        ? "#f5d080"
                        : isPastRank
                        ? "rgba(201,168,76,0.4)"
                        : "rgba(255,255,255,0.1)",
                      color: isCurrentRank ? "#1a1510" : isPastRank ? "#c9a84c" : "#4a4540",
                    }}
                  >
                    {r.level}
                  </div>
                  {isCurrentRank && (
                    <div
                      className="w-1 h-1 rounded-full mt-0.5"
                      style={{ background: "#c9a84c" }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats row */}
        {loaded && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Unlocked", value: `${unlockedCount}/${totalCount}` },
              { label: "Total XP", value: xp.toLocaleString() },
              { label: "Markers", value: graves.length.toString() },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl p-3 text-center"
                style={{
                  background: "rgba(30,28,24,0.8)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <p className="text-lg font-bold font-serif" style={{ color: "#c9a84c" }}>
                  {s.value}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-stone-500 mt-0.5">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Achievement categories */}
        {ACHIEVEMENT_CATEGORIES.map((category) => {
          const items = ACHIEVEMENTS.filter((a) => a.category === category);
          const catUnlocked = items.filter((a) => isUnlocked(a.id, unlocks)).length;
          const catStats = loaded ? stats : { sharesCount: 0, cemeteryNamesAdded: 0, daysActive: [] };

          return (
            <section key={category}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{CATEGORY_ICONS[category]}</span>
                <h3 className="font-serif text-base font-semibold text-stone-200">{category}</h3>
                <span className="ml-auto text-[11px] text-stone-500">
                  {catUnlocked}/{items.length}
                </span>
              </div>

              <div className="space-y-2.5">
                {items.map((achievement) => {
                  const unlocked = isUnlocked(achievement.id, unlocks);
                  const { ratio, label } = loaded
                    ? achievement.evaluate(graves, catStats)
                    : { ratio: 0, label: "" };
                  return (
                    <AchievementCard
                      key={achievement.id}
                      achievement={achievement}
                      unlocked={unlocked}
                      progress={ratio}
                      label={label}
                      onClick={() => setSelectedId(achievement.id)}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>

      {/* Achievement detail sheet */}
      {selectedId && (() => {
        const achievement = ACHIEVEMENTS.find((a) => a.id === selectedId);
        if (!achievement) return null;
        const unlocked = isUnlocked(selectedId, unlocks);
        const unlockRecord = unlocks.find((u) => u.id === selectedId);
        const catStats = loaded ? stats : { sharesCount: 0, cemeteryNamesAdded: 0, daysActive: [] };
        const { ratio, label } = loaded ? achievement.evaluate(graves, catStats) : { ratio: 0, label: "" };
        return (
          <AchievementDetailSheet
            achievement={achievement}
            unlocked={unlocked}
            unlockedAt={unlockRecord?.unlockedAt}
            progress={ratio}
            label={label}
            onClose={() => setSelectedId(null)}
          />
        );
      })()}

      <BottomNav />
    </div>
  );
}
