"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/browser";
import { syncLocalToCloud } from "@/lib/cloudSync";

export default function ProfileBadge() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  if (loading) {
    return <div className="w-8 h-8 rounded-full bg-stone-800 animate-pulse" />;
  }

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : null;

  const handleSync = async () => {
    if (!user) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const supabase = createClient();
      const { synced, failed } = await syncLocalToCloud(supabase, user.id);
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
    setSheetOpen(false);
    router.push("/login");
  };

  return (
    <>
      {/* Avatar button */}
      <button
        onClick={() => setSheetOpen(true)}
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

      {/* Bottom sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { setSheetOpen(false); setSyncResult(null); }}
          />

          {/* Sheet */}
          <div
            className="relative rounded-t-3xl px-6 pt-5 animate-fade-up"
            style={{
              background: "linear-gradient(180deg, #242220, #1a1917)",
              border: "1px solid rgba(255,255,255,0.06)",
              paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
            }}
          >
            {/* Drag handle */}
            <div className="w-10 h-1 bg-stone-700 rounded-full mx-auto mb-5" />

            {user ? (
              <>
                {/* User info */}
                <div className="flex items-center gap-3 mb-6">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold text-stone-900 shrink-0"
                    style={{ background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-stone-100 font-medium text-sm truncate">{user.email}</p>
                    <p className="text-stone-500 text-xs mt-0.5">Signed in</p>
                  </div>
                </div>

                {/* Sync result */}
                {syncResult && (
                  <div className="mb-4 px-4 py-2.5 rounded-xl bg-stone-800 text-stone-300 text-sm">
                    {syncResult}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="w-full h-12 rounded-xl border border-stone-700 bg-stone-800 text-stone-200 text-sm font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.97] disabled:opacity-60"
                  >
                    {syncing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-stone-500 border-t-transparent rounded-full animate-spin" />
                        Syncing…
                      </>
                    ) : (
                      <>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="23 4 23 10 17 10" />
                          <polyline points="1 20 1 14 7 14" />
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                        Sync Archive Now
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleSignOut}
                    className="w-full h-12 rounded-xl border border-stone-700 text-stone-400 text-sm font-medium transition-all active:scale-[0.97]"
                  >
                    Sign Out
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="font-serif text-lg text-stone-100 font-medium mb-1">
                  Back up your archive
                </p>
                <p className="text-stone-400 text-sm mb-6">
                  Sign in to sync your grave records across devices and keep them safe in the cloud.
                </p>
                <button
                  onClick={() => { setSheetOpen(false); router.push("/login"); }}
                  className="w-full h-12 rounded-xl font-semibold text-stone-900 text-sm transition-all active:scale-[0.97]"
                  style={{ background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }}
                >
                  Sign In or Create Account
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
