"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/browser";
import { syncLocalToCloud, pushExplorerPoints, pullExplorerPoints } from "@/lib/cloudSync";

export default function ProfileBadge() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
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

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : null;

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

  return (
    <div ref={containerRef} className="relative">
      {/* Avatar button */}
      <button
        onClick={() => { setOpen((o) => !o); setSyncResult(null); }}
        className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
        style={
          user
            ? { background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }
            : { background: "#2e2b28", border: "1px solid #3a3733" }
        }
        aria-label={user ? "Account" : "Sign in"}
      >
        {user && initials ? (
          <span className="text-[11px] font-bold text-stone-900">{initials}</span>
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
                  <p className="text-stone-100 font-medium text-xs truncate">{user.email}</p>
                  <p className="text-stone-500 text-[10px] mt-0.5">Signed in</p>
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
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                    Sync Archive
                  </>
                )}
              </button>

              <button
                onClick={handleSignOut}
                className="w-full h-10 rounded-xl border border-stone-700 text-stone-400 text-xs font-medium transition-all active:scale-[0.97]"
              >
                Sign Out
              </button>
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
