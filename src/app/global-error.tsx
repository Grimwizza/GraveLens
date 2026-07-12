"use client";

/**
 * global-error.tsx — last-resort boundary for crashes in the ROOT layout
 * itself, which the route-level error.tsx cannot catch. It replaces the
 * entire document, so it must render its own <html>/<body> and cannot rely
 * on the app's global CSS (the layout that imports it is what failed) — all
 * styling is inlined with the theme's literal colors.
 */

import { useEffect } from "react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

const GOLD = "#c9a84c";
const BG = "#0c0a09";
const TEXT = "#fafaf9";
const MUTED = "#a8a29e";

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("[Global Exception Boundary]:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: BG,
          color: TEXT,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "3rem 1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ maxWidth: "28rem", width: "100%" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "4rem",
              height: "4rem",
              borderRadius: "1rem",
              marginBottom: "1.5rem",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>

          <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: "0 0 0.75rem", lineHeight: 1.3 }}>
            GraveLens hit a problem
          </h1>
          <p style={{ color: MUTED, fontSize: "0.9rem", lineHeight: 1.6, margin: "0 0 1.5rem" }}>
            The app failed to load. Your saved scans and offline queue remain safe on this device.
          </p>

          {error.digest && (
            <p style={{ color: "#78716c", fontSize: "0.7rem", margin: "0 0 1.5rem" }}>
              Reference: {error.digest}
            </p>
          )}

          <button
            onClick={() => reset()}
            style={{
              width: "100%",
              height: "3rem",
              borderRadius: "0.75rem",
              border: "none",
              fontWeight: 600,
              fontSize: "0.9rem",
              color: "#1a1917",
              background: GOLD,
              cursor: "pointer",
            }}
          >
            Reload GraveLens
          </button>
        </div>
      </body>
    </html>
  );
}
