"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/browser";
import { syncLocalToCloud, pushExplorerPoints } from "@/lib/cloudSync";
import { loadUnlocks, totalXP, getRank } from "@/lib/achievements";
import SettingsPanel from "./SettingsPanel";
import { RankInsignia, getRankColor } from "@/components/ui/RankInsignia";
import { fetchOwnProfile } from "@/lib/community";

export default function ProfileBadge() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rankLevel, setRankLevel] = useState(1);
  const [rankTitle, setRankTitle] = useState("The Wanderer");
  const [profileUsername, setProfileUsername] = useState<string | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load explorer rank (both offline and online)
  useEffect(() => {
    const unlocks = loadUnlocks();
    const xp = totalXP(unlocks);
    const rank = getRank(xp);
    setRankLevel(rank.level);
    setRankTitle(rank.title);
  }, [user]);

  // Load username from profile
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    fetchOwnProfile(supabase, user.id)
      .then((p) => { if (p?.username) setProfileUsername(p.username); })
      .catch(() => {});
  }, [user?.id]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSyncResult(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (loading) {
    return <div className="w-8 h-8 rounded-full bg-stone-800 animate-pulse" />;
  }

  const displayName = profileUsername ||
                      user?.email?.split("@")[0] ||
                      "Explorer";
  const initials = user
    ? (profileUsername || user.email || "EX").slice(0, 2).toUpperCase()
    : null;

  const handleSync = async () => {
    if (!user) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const supabase = createClient();
      const [{ synced, failed }] = await Promise.all([
        syncLocalToCloud(supabase, user.id),
        pushExplorerPoints(supabase, user.id).catch(() => {}),
      ]);
      setSyncResult(
        synced === 0 && failed === 0
          ? "Everything is already synced."
          : failed > 0
          ? `Synced ${synced}, ${failed} failed.`
          : `Synced ${synced} record${synced !== 1 ? "s" : ""}.`
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
    router.push("/login");
  };

  const openSettings = () => {
    setOpen(false);
    setSyncResult(null);
    setSettingsOpen(true);
  };

  return (
    <>
      <div ref={containerRef} className="relative flex items-center">
        <button 
          onClick={() => router.push("/explorer")}
          className="flex flex-col items-end mr-3 select-none text-right transition-all hover:opacity-80 active:scale-95"
          aria-label="View Achievements"
        >
          <span className="text-stone-100 text-[0.8rem] font-bold tracking-tight leading-none mb-1">
            {displayName}
          </span>
          <div className="flex items-center gap-1.5">
            <span 
              className="text-[10px] uppercase font-black tracking-[0.1em] opacity-90 mt-0.5"
              style={{ color: getRankColor(rankLevel) }}
            >
              {rankTitle}
            </span>
            <div className="shrink-0 pointer-events-none">
              <RankInsignia level={rankLevel} size={18} />
            </div>
          </div>
        </button>

        {/* Avatar button */}
        <button
          onClick={() => { setOpen((o) => !o); setSyncResult(null); }}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 shrink-0"
          style={
            user
              ? { background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }
              : { background: "#2e2b28", border: "1px solid #3a3733" }
          }
          aria-label={user ? "Account" : "Sign in"}
        >
          {user && initials ? (
            <span className="text-[0.8rem] font-bold text-stone-900">{initials}</span>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a8580" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          )}
        </button>

        {/* Dropdown */}
        {open && (
          <div
            className="absolute right-0 top-full mt-2 w-64 rounded-2xl shadow-2xl z-[200] overflow-hidden"
            style={{
              background: "linear-gradient(180deg, #242220, #1a1917)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {user ? (
              <div className="p-4 flex flex-col gap-3">
                {/* User info */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-stone-900 shrink-0"
                    style={{ background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-stone-100 font-medium text-xs truncate">{displayName}</p>
                    <p className="text-stone-500 text-[0.7rem] mt-0.5 truncate">{user.email}</p>
                  </div>
                </div>

                <div className="h-px bg-stone-800" />

                {/* Sync result */}
                {syncResult && (
                  <div className="px-3 py-2 rounded-lg bg-stone-800 text-stone-300 text-xs">
                    {syncResult}
                  </div>
                )}

                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="w-full h-10 rounded-xl border border-stone-700 bg-stone-800 text-stone-200 text-xs font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.97] disabled:opacity-60"
                >
                  {syncing ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-stone-500 border-t-transparent rounded-full animate-spin" />
                      Syncing…
                    </>
                  ) : (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                      </svg>
                      Sync Archive
                    </>
                  )}
                </button>

                {/* Settings */}
                <button
                  onClick={openSettings}
                  className="w-full h-10 rounded-xl border border-stone-700 bg-stone-800 text-stone-200 text-xs font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                  Settings
                </button>

                <button
                  onClick={handleSignOut}
                  className="w-full h-10 rounded-xl border border-stone-700 text-stone-400 text-xs font-medium transition-all active:scale-[0.97]"
                >
                  Sign Out
                </button>

                <p className="text-center text-[0.75rem] text-stone-600 pt-1">
                  © 2026{" "}
                  <a href="https://www.lowhigh.ai" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                    LowHigh LLC
                  </a>
                </p>
              </div>
            ) : (
              <div className="p-4 flex flex-col gap-3">
                <div>
                  <p className="font-serif text-stone-100 font-medium text-sm mb-1">Back up your archive</p>
                  <p className="text-stone-400 text-xs leading-relaxed">
                    Sign in to sync your grave records across devices and keep them safe in the cloud.
                  </p>
                </div>
                <button
                  onClick={() => { setOpen(false); router.push("/login"); }}
                  className="w-full h-10 rounded-xl font-semibold text-stone-900 text-xs transition-all active:scale-[0.97]"
                  style={{ background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }}
                >
                  Sign In or Create Account
                </button>
                {/* Settings available even when signed out */}
                <button
                  onClick={openSettings}
                  className="w-full h-10 rounded-xl border border-stone-700 bg-stone-800 text-stone-200 text-xs font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                  Settings
                </button>

                <p className="text-center text-[0.75rem] text-stone-600 pt-1">
                  © 2026{" "}
                  <a href="https://www.lowhigh.ai" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                    LowHigh LLC
                  </a>
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Settings panel — rendered at root level so it overlays everything */}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
