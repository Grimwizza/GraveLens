"use client";

import { useEffect, useState } from "react";
import BottomNav from "@/components/layout/BottomNav";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORIES,
  RANKS,
  getRank,
  getNextRank,
  xpToNextRank,
  totalXP,
  loadUnlocks,
  isUnlocked,
  type UnlockRecord,
  type AchievementCategory,
} from "@/lib/achievements";
import { loadStats } from "@/lib/achievements";
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
}: {
  achievement: (typeof ACHIEVEMENTS)[number];
  unlocked: boolean;
  progress: number;
  label: string;
}) {
  return (
    <div
      className="rounded-xl p-4 flex gap-3 items-start transition-all"
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
            <span className="text-[10px] text-gold-500" style={{ color: "#c9a84c" }}>Unlocked</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AchievementsPage() {
  const [graves, setGraves] = useState<GraveRecord[]>([]);
  const [unlocks, setUnlocks] = useState<UnlockRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getAllGraves().then((g) => {
      setGraves(g);
      setUnlocks(loadUnlocks());
      setLoaded(true);
    });
  }, []);

  const stats = loadStats();
  const xp = totalXP(unlocks);
  const rank = getRank(xp);
  const nextRank = getNextRank(xp);
  const { needed, progress } = xpToNextRank(xp);
  const unlockedCount = unlocks.length;
  const totalCount = ACHIEVEMENTS.length;

  return (
    <div className="flex flex-col min-h-dvh bg-stone-900">
      {/* Header */}
      <header
        className="px-5 py-4 bg-stone-900/95 backdrop-blur-sm sticky top-0 z-30 border-b border-stone-800"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <div className="max-w-lg mx-auto">
          <h1 className="font-serif text-lg text-stone-100 font-semibold">History Explorer</h1>
          <p className="text-xs text-stone-500 mt-0.5">Your journey through the ages</p>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 pb-28 space-y-6 mt-5">
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
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>

      <BottomNav />
    </div>
  );
}
