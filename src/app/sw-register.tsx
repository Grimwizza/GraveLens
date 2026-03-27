"use client";

import { useEffect, useState } from "react";

// Build time stamped at deploy by next.config.ts → NEXT_PUBLIC_BUILD_TIME
const CLIENT_BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? "dev";

// Minimum gap between version-poll requests (ms). Prevents hammering the
// server when the user rapidly switches in and out of the app.
const POLL_THROTTLE_MS = 60_000;

export default function ServiceWorkerRegister() {
  const [updateReady, setUpdateReady] = useState(false);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    // ── 1. Register service worker ──────────────────────────────────────────
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => console.error("SW registration failed:", err));

    // ── 2. SW-based update notification ────────────────────────────────────
    // controllerchange fires when a waiting SW takes control (e.g. after a
    // new sw.js has been deployed and the user navigates or reloads).
    const onControllerChange = () => setUpdateReady(true);
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    );

    // ── 3. Build-version polling on visibility ──────────────────────────────
    // Catches deploys where sw.js itself didn't change but Next.js JS bundles
    // did. Runs every time the user brings the app back into focus, but no
    // more than once per POLL_THROTTLE_MS.
    let lastPoll = 0;

    const checkVersion = async () => {
      if (CLIENT_BUILD_TIME === "dev") return; // skip in local dev
      const now = Date.now();
      if (now - lastPoll < POLL_THROTTLE_MS) return;
      lastPoll = now;

      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { buildTime } = await res.json();
        if (buildTime && buildTime !== CLIENT_BUILD_TIME) {
          setUpdateReady(true);
        }
      } catch {
        // Network unavailable — silently ignore
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") checkVersion();
    };

    document.addEventListener("visibilitychange", onVisibility);

    // Also check once shortly after mount (covers first open from home screen)
    const initialCheck = setTimeout(checkVersion, 3000);

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(initialCheck);
    };
  }, []);

  const handleReload = () => {
    setReloading(true);
    window.location.reload();
  };

  if (!updateReady) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between gap-3 px-4 py-3 animate-fade-up"
      style={{
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
        background: "linear-gradient(135deg, #2a2515, #1e1c18)",
        borderBottom: "1px solid rgba(201,168,76,0.35)",
        boxShadow: "0 2px 16px rgba(0,0,0,0.4)",
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#c9a84c"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
        >
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
        <p className="text-sm font-medium text-stone-200 truncate">
          A new version of GraveLens is available.
        </p>
      </div>
      <button
        onClick={handleReload}
        disabled={reloading}
        className="shrink-0 text-sm font-semibold px-4 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-60"
        style={{
          background: "linear-gradient(135deg, #c9a84c, #d4b76a)",
          color: "#1a1510",
        }}
      >
        {reloading ? "Reloading…" : "Reload"}
      </button>
    </div>
  );
}
