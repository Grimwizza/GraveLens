"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/browser";
import { syncLocalToCloud, pushExplorerPoints } from "@/lib/cloudSync";
import { loadUnlocks, totalXP, getRank } from "@/lib/achievements";
import SettingsPanel from "./SettingsPanel";
import { RankInsignia, getRankColor } from "@/components/ui/RankInsignia";
import { fetchOwnProfile } from "@/lib/community";

import { createPortal } from "react-dom";

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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const unlocks = loadUnlocks();
    const xp = totalXP(unlocks);
    const rank = getRank(xp);
    setRankLevel(rank.level);
    setRankTitle(rank.title);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    fetchOwnProfile(supabase, user.id)
      .then((p) => { if (p?.username) setProfileUsername(p.username); })
      .catch(() => {});
  }, [user?.id]);

  // Close sheet when pressing Escape (keyboard / accessibility)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
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

  function close() {
    setOpen(false);
    setSyncResult(null);
  }

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
    close();
    router.push("/login");
  };

  const openSettings = () => {
    close();
    setSettingsOpen(true);
  };

  return (
    <>
      {/* Avatar button */}
      <button
        onClick={() => { setOpen((o) => !o); setSyncResult(null); }}
        className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 shrink-0"
        style={
          user
            ? { background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }
            : { background: "var(--t-stone-700)", border: "1px solid var(--t-stone-600)" }
        }
        aria-label={user ? "Account" : "Sign in"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {user && initials ? (
          <span className="text-[0.8rem] font-bold text-stone-900">{initials}</span>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t-stone-500)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
        )}
      </button>

      {mounted && open && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop — pointerdown closes immediately on first touch */}
          <div
            className="absolute inset-0 bg-stone-950/70 backdrop-blur-sm transition-opacity"
            onPointerDown={close}
            aria-hidden="true"
          />

          {/* Modal Box */}
          <div
            role="dialog"
            aria-label="Account"
            className="relative w-full max-w-sm flex flex-col rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            style={{
              background: "linear-gradient(180deg, var(--t-stone-800), var(--t-stone-900))",
              border: "1px solid rgba(var(--glass-bg-rgb), 0.08)",
              maxHeight: "90dvh",
            }}
          >
            <div className="overflow-y-auto flex-1 p-5">
              {user ? (
                <div className="flex flex-col gap-3">
                  {/* User info */}
                  <div className="flex items-center gap-3 py-2">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-stone-900 shrink-0"
                      style={{ background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }}
                    >
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-stone-100 font-semibold text-base truncate">{displayName}</p>
                      <p className="text-stone-500 text-xs mt-0.5 truncate">{user.email}</p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <RankInsignia level={rankLevel} size={15} />
                        <span className="text-[0.75rem] font-medium" style={{ color: getRankColor(rankLevel) }}>
                          {rankTitle}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-stone-800 my-1" />

                  {syncResult && (
                    <div className="px-3 py-2.5 rounded-xl bg-stone-800/80 text-stone-300 text-center text-sm border border-stone-700/50">
                      {syncResult}
                    </div>
                  )}

                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="w-full h-12 rounded-2xl border border-stone-700 bg-stone-800 text-stone-200 text-sm font-medium flex items-center justify-center gap-2.5 transition-all active:scale-[0.97] disabled:opacity-60"
                  >
                    {syncing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-stone-500 border-t-transparent rounded-full animate-spin" />
                        Syncing…
                      </>
                    ) : (
                      <>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                        Sync Archive
                      </>
                    )}
                  </button>

                  <button
                    onClick={openSettings}
                    className="w-full h-12 rounded-2xl border border-stone-700 bg-stone-800 text-stone-200 text-sm font-medium flex items-center justify-center gap-2.5 transition-all active:scale-[0.97]"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                    </svg>
                    Settings
                  </button>

                  <button
                    onClick={handleSignOut}
                    className="w-full h-12 rounded-2xl border border-stone-700 text-stone-400 text-sm font-medium transition-all active:scale-[0.97]"
                  >
                    Sign Out
                  </button>

                  <p className="text-center text-xs text-stone-600 pt-2">
                    © 2026{" "}
                    <a href="https://www.lowhigh.ai" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-stone-400 transition-colors">
                      LowHigh LLC
                    </a>
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="py-2 text-center">
                    <p className="font-serif text-stone-100 font-semibold text-lg mb-2">Back up your archive</p>
                    <p className="text-stone-400 text-sm leading-relaxed px-2">
                      Sign in to sync your grave records across devices and keep them safe in the cloud.
                    </p>
                  </div>
                  <button
                    onClick={() => { close(); router.push("/login"); }}
                    className="w-full h-12 rounded-2xl font-semibold text-stone-900 text-sm transition-all active:scale-[0.97] mt-2"
                    style={{ background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }}
                  >
                    Sign In or Create Account
                  </button>
                  <button
                    onClick={openSettings}
                    className="w-full h-12 rounded-2xl border border-stone-700 bg-stone-800 text-stone-200 text-sm font-medium flex items-center justify-center gap-2.5 transition-all active:scale-[0.97]"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                    </svg>
                    Settings
                  </button>

                  <p className="text-center text-xs text-stone-600 pt-2">
                    © 2026{" "}
                    <a href="https://www.lowhigh.ai" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-stone-400 transition-colors">
                      LowHigh LLC
                    </a>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Settings panel — rendered at root level so it overlays everything */}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
