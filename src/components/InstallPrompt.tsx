"use client";

import { useEffect, useState } from "react";
import BrandLogo from "./ui/BrandLogo";

type InstallState = "hidden" | "android" | "ios";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [state, setState] = useState<InstallState>("hidden");
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Already running as a standalone PWA — hide everything
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone)
    ) {
      return;
    }

    // User already permanently dismissed
    if (localStorage.getItem("gl-install-dismissed") === "1") return;

    // iOS Safari detection
    // iPadOS 13+ reports as Macintosh with maxTouchPoints > 1
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (isIOS) {
      // Only show iOS banner in Safari (not Chrome-for-iOS which can't install PWAs)
      const isSafari =
        /Safari/.test(navigator.userAgent) &&
        !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
      if (isSafari) {
        const t = setTimeout(() => setState("ios"), 4000);
        return () => clearTimeout(t);
      }
      return;
    }

    // Chrome / Edge / Samsung Internet — capture the native install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Small delay so it doesn't compete with the page loading
      setTimeout(() => setState("android"), 2500);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss(permanent = false) {
    setState("hidden");
    if (permanent) localStorage.setItem("gl-install-dismissed", "1");
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      dismiss(true);
    } else {
      dismiss(false);
    }
    setDeferredPrompt(null);
  }

  if (state === "hidden") return null;

  return (
    <div
      className="fixed left-4 right-4 z-50 animate-fade-up"
      // Sits just above the bottom nav (nav is ~64px + safe-area)
      style={{ bottom: "calc(82px + env(safe-area-inset-bottom))" }}
    >
      {state === "android" && (
        <div className="flex items-center gap-3 glass-gold rounded-2xl p-3.5 shadow-2xl max-w-md mx-auto">
          {/* App icon */}
          <div
            className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center border border-stone-800"
            style={{ background: "#1a1917" }}
          >
            <BrandLogo size={28} />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-stone-100 text-sm font-semibold leading-tight">
              Add to Home Screen
            </p>
            <p className="text-stone-500 text-xs mt-0.5">
              Install GraveLens for quick access
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleInstall}
              className="h-8 px-3 rounded-lg text-xs font-bold text-stone-900 active:opacity-80"
              style={{
                background: "linear-gradient(135deg, #c9a84c, #d4b76a)",
              }}
            >
              Install
            </button>
            <button
              onClick={() => dismiss(true)}
              className="w-7 h-7 flex items-center justify-center text-stone-600 active:text-stone-400 rounded-lg"
              aria-label="Dismiss"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="1" y1="1" x2="13" y2="13" />
                <line x1="13" y1="1" x2="1" y2="13" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {state === "ios" && (
        <div className="glass-gold rounded-2xl p-4 shadow-2xl max-w-md mx-auto">
          <div className="flex items-center justify-between mb-3">
            <p className="text-stone-100 text-sm font-semibold">
              Install GraveLens
            </p>
            <button
              onClick={() => dismiss(true)}
              className="text-stone-600 active:text-stone-400"
              aria-label="Dismiss"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="1" y1="1" x2="13" y2="13" />
                <line x1="13" y1="1" x2="1" y2="13" />
              </svg>
            </button>
          </div>

          <div className="flex items-start gap-3">
            {/* Step indicators */}
            <div className="flex flex-col items-center gap-1 mt-0.5 shrink-0">
              <div className="w-5 h-5 rounded-full bg-gold-500 flex items-center justify-center text-stone-900 text-xs font-bold">1</div>
              <div className="w-px h-4 bg-stone-700" />
              <div className="w-5 h-5 rounded-full bg-stone-700 flex items-center justify-center text-stone-300 text-xs font-bold">2</div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <p className="text-stone-300 text-sm leading-snug">
                  Tap the{" "}
                  <span className="inline-flex items-center gap-1 text-stone-100 font-medium">
                    {/* Safari share icon */}
                    <svg width="14" height="16" viewBox="0 0 14 16" fill="none" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="7 1 7 11" />
                      <polyline points="3 4 7 1 11 4" />
                      <path d="M2 7H1a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1" />
                    </svg>
                    Share
                  </span>{" "}
                  button at the bottom of Safari
                </p>
              </div>
              <p className="text-stone-300 text-sm leading-snug">
                Scroll down and tap{" "}
                <span className="text-stone-100 font-medium">
                  Add to Home Screen
                </span>
              </p>
            </div>
          </div>

          {/* Arrow pointing down to Safari toolbar */}
          <div className="flex justify-center mt-3">
            <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
              <path d="M8 0 L8 16 M2 10 L8 18 L14 10" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
