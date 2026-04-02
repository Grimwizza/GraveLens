"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "@/components/layout/BottomNav";


import { fileToDataUrl, extractExifLocation, correctOrientation, generateId } from "@/lib/exif";
import { savePendingResult, addToQueue } from "@/lib/storage";
import { QUEUE_CHANGED_EVENT } from "@/lib/queue";
import { reverseGeocode } from "@/lib/apis/nominatim";
import { takePendingCaptureFile } from "@/lib/pendingCapture";
import type { ExtractedGraveData, GeoLocation } from "@/types";
import ProfileBadge from "@/components/auth/ProfileBadge";

type Phase = "idle" | "processing" | "queued";


export default function CapturePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [queueReason, setQueueReason] = useState<"offline" | "rate_limited" | null>(null);

  // Prevents stale analyses from saving and cancels in-flight fetches
  const analysisNonceRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);


  // Offline detection
  const [isOffline, setIsOffline] = useState(() =>
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );

  // Reset scroll on mount + track connectivity + auto-open camera if flagged
  useEffect(() => {
    window.scrollTo(0, 0);
    const onOnline  = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);

    // BottomNav camera FAB chose a file from another page — process it immediately
    const pending = takePendingCaptureFile();
    if (pending) {
      handleFileChosen(pending);
    }

    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // BottomNav camera FAB tapped while already on this page
  useEffect(() => {
    const handler = () => {
      if (phase === "idle") cameraInputRef.current?.click();
    };
    window.addEventListener("gravelens:open-camera", handler);
    return () => window.removeEventListener("gravelens:open-camera", handler);
  }, [phase]);

  // Keep the screen awake while the user is on this page
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wl = (navigator as any).wakeLock;
    let mounted = true;
    let lock: WakeLockSentinel | null = null;

    const acquire = async () => {
      if (!mounted || document.visibilityState !== "visible") return;
      try {
        lock = await wl.request("screen");
        // Re-acquire if the browser releases the lock unexpectedly (battery saver, etc.)
        lock!.addEventListener("release", () => {
          if (mounted && document.visibilityState === "visible") acquire();
        });
      } catch {
        // Device denied (low battery, permissions, etc.) — silently skip
      }
    };

    // Browsers release the lock when the page is hidden; re-acquire on return
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      lock?.release().catch(() => {});
    };
  }, []);

  const handleFileChosen = useCallback(async (file: File) => {
    // Invalidate any in-flight analysis for the previous photo
    analysisNonceRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    const raw = await fileToDataUrl(file);
    const dataUrl = await correctOrientation(file, raw);
    setPreviewUrl(dataUrl);
    setSelectedFile(file);
    setPhase("processing");
    setProgress(10);
    setProgressLabel("Reading image…");
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!selectedFile || !previewUrl) return;

    // Snapshot the nonce at the start — if it changes, a newer photo was taken
    const nonce = analysisNonceRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setPhase("processing");
    setProgress(10);
    setProgressLabel("Reading image…");

    try {
      // ── Parallel phase ──────────────────────────────────────────────────
      setProgress(20);
      setProgressLabel("Analyzing marker…");

      const [preprocessed, exifLoc] = await Promise.all([
        preprocessAndResize(previewUrl),
        extractExifLocation(selectedFile),
      ]);

      if (analysisNonceRef.current !== nonce) return; // newer photo was taken

      // EXIF GPS is stripped by most mobile browsers — fall back to device location
      const gpsLoc = exifLoc ?? await getDeviceLocation();
      const geocodePromise = gpsLoc ? reverseGeocode(gpsLoc.lat, gpsLoc.lng) : Promise.resolve(null);

      // ── Claude analysis ─────────────────────────────────────────────────
      setProgress(40);
      let extracted: ExtractedGraveData | null = null;

      try {
        const claudeRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: preprocessed.base64, mimeType: preprocessed.mimeType }),
          signal: controller.signal,
        });

        if (claudeRes.ok) {
          const { extracted: claudeExtracted, _model } = await claudeRes.json();
          if (claudeExtracted) {
            extracted = claudeExtracted;
            if (_model && _model.includes("sonnet")) {
              setProgressLabel("Enhanced analysis complete…");
            }
          }
        } else if (claudeRes.status === 429) {
          // Rate limited — queue this image and let the user keep scanning
          await handleQueueCapture("rate_limited");
          return;
        } else {
          const errorData = await claudeRes.json().catch(() => ({}));
          console.warn("Claude API returned", claudeRes.status, errorData.details ?? "");
        }
      } catch (claudeErr) {
        if (claudeErr instanceof Error && claudeErr.name === "AbortError") return; // photo changed
        console.warn("Claude request failed:", claudeErr);
      }

      if (analysisNonceRef.current !== nonce) return; // newer photo was taken

      // ── Tesseract fallback (only if Claude completely failed) ───────────
      if (!extracted) {
        setProgressLabel("Reading inscription locally…");
        try {
          const { runTesseract } = await import("@/lib/ocr");
          const ocr = await runTesseract(selectedFile);
          extracted = buildFromOcr(ocr.text);
          extracted.confidence = "low";
        } catch {
          extracted = buildFromOcr("");
          extracted.confidence = "low";
        }
      }

      if (analysisNonceRef.current !== nonce) return; // newer photo was taken

      // ── Await geocode result (likely already done) ──────────────────────
      setProgress(80);
      setProgressLabel("Finding location…");
      const location = await geocodePromise;

      // ── Save ────────────────────────────────────────────────────────────
      setProgress(90);
      setProgressLabel("Saving…");

      const storageDataUrl = await resizeForStorage(previewUrl);

      const id = generateId();
      await savePendingResult(id, {
        id,
        photoDataUrl: storageDataUrl,
        extracted,
        location,
        timestamp: Date.now(),
      });

      setProgress(100);
      router.push(`/result/${id}`);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("CapturePage: Analysis failed:", err instanceof Error ? err.message : err);
      setPhase("idle");
    }
  }, [selectedFile, previewUrl, router]);

  // Auto-analyze as soon as a file is chosen
  useEffect(() => {
    if (phase === "processing" && selectedFile && previewUrl) {
      if (isOffline) {
        handleQueueCapture();
      } else {
        handleAnalyze();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, selectedFile, previewUrl]);

  const handleReset = useCallback(() => {
    setPhase("idle");
    setPreviewUrl(null);
    setSelectedFile(null);
    setProgress(0);
    setQueueReason(null);
  }, []);


  const handleQueueCapture = useCallback(async (reason?: "offline" | "rate_limited") => {
    if (!selectedFile || !previewUrl) return;

    setQueueReason(reason ?? "offline");
    setPhase("processing");
    setProgress(20);
    setProgressLabel(reason === "rate_limited" ? "Busy — adding to queue…" : "Saving to queue…");

    try {
      const exifLoc = await extractExifLocation(selectedFile);
      // EXIF GPS is stripped by most mobile browsers — fall back to device location
      const gpsLoc = exifLoc ?? await getDeviceLocation();
      let location: GeoLocation | undefined;

      if (gpsLoc) {
        setProgress(40);
        const geocoded = await reverseGeocode(gpsLoc.lat, gpsLoc.lng).catch(() => null);
        location = (geocoded ?? gpsLoc) as GeoLocation;
      }

      setProgress(70);
      const storageDataUrl = await resizeForStorage(previewUrl);

      const id = generateId();
      await addToQueue({
        id,
        timestamp: Date.now(),
        photoDataUrl: storageDataUrl,
        location,
        status: "pending",
        retries: 0,
      });

      window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
      setProgress(100);
      setPhase("queued");
      setTimeout(() => handleReset(), 1400);
    } catch (err) {
      console.error("CapturePage: Queue capture failed:", err instanceof Error ? err.message : err);
      setPhase("idle");
    }
  }, [selectedFile, previewUrl, handleReset]);

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* Header */}
      <header
        className="flex-shrink-0"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex flex-col">
            <span className="font-serif font-semibold tracking-wide" style={{ fontSize: "1.75rem" }}>
              <span className="text-stone-50">Grave</span><span style={{ color: "#c9a84c" }}>Lens</span>
            </span>
            <span className="italic text-white text-[10px] leading-none -mt-0.5 opacity-60">
              By <a href="https://www.lowhigh.ai" target="_blank" rel="noopener noreferrer">LowHigh</a>
            </span>
          </div>
          <ProfileBadge />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center px-5 overflow-y-auto no-scrollbar pb-28" style={{ scrollbarWidth: "none" }}>
        {phase === "idle" && (
          <IdleState
            onUpload={() => fileInputRef.current?.click()}
          />
        )}
        {phase !== "idle" && (
          <div className="flex-1 flex flex-col items-center justify-center w-full">
            {phase === "processing" && previewUrl && (
              <ProcessingState
                previewUrl={previewUrl}
                progress={progress}
                label={progressLabel}
              />
            )}
            {phase === "queued" && (
              <QueuedConfirmation reason={queueReason} />
            )}
          </div>
        )}
      </main>

      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileChosen(file);
          e.target.value = "";
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileChosen(file);
          e.target.value = "";
        }}
      />

      <BottomNav />
    </div>
  );
}

// ── Idle state ─────────────────────────────────────────────────────────────

function IdleState({
  onUpload,
}: {
  onUpload: () => void;
}) {
  return (
    <div className="flex flex-col items-center w-full max-w-sm mx-auto animate-fade-in flex-1 pt-4 pb-44">
      {/* Graphic + text — takes all available space and centers content within it */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        {/* Viewfinder graphic */}
        <div className="relative flex items-center justify-center w-64 h-64 flex-shrink-0">
          {/* Corner brackets */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 256 256">
            <path
              d="M32 80 L32 32 L80 32"
              stroke="#c9a84c"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
              opacity="0.8"
            />
            <path
              d="M176 32 L224 32 L224 80"
              stroke="#c9a84c"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
              opacity="0.8"
            />
            <path
              d="M32 176 L32 224 L80 224"
              stroke="#c9a84c"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
              opacity="0.8"
            />
            <path
              d="M176 224 L224 224 L224 176"
              stroke="#c9a84c"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
              opacity="0.8"
            />
            {/* Headstone silhouette */}
            <path
              d="M96 190 L96 120 Q96 96 128 96 Q160 96 160 120 L160 190 Z"
              fill="none"
              stroke="#3a3633"
              strokeWidth="1.5"
            />
          </svg>
          <div className="absolute inset-0 pointer-events-none">
            {/* Camera AF box centered on grave silhouette (y=142 of 256 -> 55.5%) */}
            <div style={{ position: "absolute", left: "50%", top: "55.5%", transform: "translate(-50%, -50%)" }}
              className="drop-shadow-[0_0_10px_rgba(201,168,76,0.4)]">
              <svg width="40" height="40" viewBox="0 0 100 100" fill="none">
                {/* Top-left corner */}
                <path d="M18 38 L18 18 L38 18" stroke="#c9a84c" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
                {/* Top-right corner */}
                <path d="M82 38 L82 18 L62 18" stroke="#c9a84c" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
                {/* Bottom-left corner */}
                <path d="M18 62 L18 82 L38 82" stroke="#c9a84c" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
                {/* Bottom-right corner */}
                <path d="M82 62 L82 82 L62 82" stroke="#c9a84c" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
                {/* Center focus point */}
                <circle cx="50" cy="50" r="3" fill="#c9a84c" opacity="0.7"/>
              </svg>
            </div>
            {/* Text centered below brackets (y=240 of 256 -> 94%) */}
            <div style={{ position: "absolute", left: "50%", top: "94%", transform: "translate(-50%, -50%)" }}>
              <span className="text-stone-300 text-[13px] font-bold tracking-[0.3em] whitespace-nowrap uppercase opacity-50">
                Point & scan
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 text-center px-2">
          <h1 className="font-serif text-3xl font-semibold text-stone-100 leading-tight">
            Bring the story behind every stone into focus.
          </h1>
          <p className="text-stone-400 text-lg leading-relaxed">
            Photograph any headstone and experience history like never before.
          </p>
        </div>
      </div>

      {/* Action buttons — anchored to bottom */}
      <div className="flex flex-col gap-3 w-full pt-6">
        <button
          onClick={onUpload}
          className="flex items-center justify-center gap-3 w-full h-12 rounded-2xl border border-stone-600 text-stone-200 font-medium text-base transition-all active:scale-[0.97] bg-stone-800/50"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Upload from Library
        </button>
      </div>
    </div>
  );
}

// ── Queued confirmation ─────────────────────────────────────────────────────

function QueuedConfirmation({ reason }: { reason: "offline" | "rate_limited" | null }) {
  return (
    <div className="flex flex-col items-center gap-4 animate-fade-in text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-stone-800 border border-stone-700 flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>
      <div>
        <p className="text-stone-100 font-semibold text-base">Saved to queue</p>
        <p className="text-stone-500 text-sm mt-1">
          {reason === "rate_limited"
            ? "Keep scanning — this will process automatically in a moment."
            : "Will analyze automatically when back online."}
        </p>
      </div>
    </div>
  );
}

// ── Preview state ───────────────────────────────────────────────────────────



// ── Processing state ────────────────────────────────────────────────────────

function ProcessingState({
  previewUrl,
  progress,
  label,
}: {
  previewUrl: string;
  progress: number;
  label: string;
}) {
  return (
    <div className="flex flex-col w-full max-w-sm gap-6 animate-fade-in pt-4">
      <div className="relative rounded-2xl overflow-hidden bg-stone-800 aspect-[3/4] w-full shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt="Analyzing"
          className="w-full h-full object-cover opacity-40"
        />
        {/* Scan line animation */}
        <div
          className="absolute left-0 right-0 h-0.5 transition-all duration-700"
          style={{
            top: `${progress}%`,
            background: "linear-gradient(90deg, transparent, #c9a84c, transparent)",
            boxShadow: "0 0 8px #c9a84c",
          }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex justify-between text-xs text-stone-400">
          <span>{label}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1 bg-stone-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(90deg, #5c7a5c, #c9a84c)",
            }}
          />
        </div>
      </div>

      <p className="text-stone-500 text-xs text-center">
        Searching historical records & public archives…
      </p>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get the device's current GPS position via the Geolocation API.
 * Used as a fallback when the photo has no EXIF GPS data (common on PWA/mobile).
 * Resolves to null on error or denial rather than rejecting.
 */
function getDeviceLocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 6000, maximumAge: 30000, enableHighAccuracy: true }
    );
  });
}

/**
 * Compress a photo for long-term storage in IndexedDB.
 * Keeps the longest edge ≤ 1200 px at 80% JPEG quality.
 * A typical 3–8 MB phone photo becomes ~100–250 KB — safe for IndexedDB
 * and resistant to browser storage eviction on low-storage devices.
 * 1200 px is sharp enough to read inscriptions at full-screen mobile width.
 *
 * To upgrade to cloud storage later, replace this function's output with
 * an upload call and store the returned URL instead of the data URL.
 * See CLOUD_STORAGE_GUIDE.md for the recommended migration path.
 */
function resizeForStorage(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxPx = 1200;
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.80));
    };
    img.onerror = () => reject(new Error("Failed to load image for storage resizing"));
    img.src = dataUrl;
  });
}


/**
 * Preprocess an image for Claude: contrast stretch + unsharp mask + resize.
 * Keeps the longest edge ≤ 1024 px at 78% JPEG quality.
 * Contrast stretch and sharpening improve legibility on weathered stone.
 */
function preprocessAndResize(
  dataUrl: string,
  maxPx = 1024,
  quality = 0.78
): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      // Draw at target size
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.drawImage(img, 0, 0, w, h);

      // ── Contrast stretch ──────────────────────────────────────────────────
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      let min = 255, max = 0;
      for (let i = 0; i < data.length; i += 4) {
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (luma < min) min = luma;
        if (luma > max) max = luma;
      }
      const range = max - min || 1;
      for (let i = 0; i < data.length; i += 4) {
        data[i]     = Math.min(255, ((data[i]     - min) / range) * 255);
        data[i + 1] = Math.min(255, ((data[i + 1] - min) / range) * 255);
        data[i + 2] = Math.min(255, ((data[i + 2] - min) / range) * 255);
      }
      ctx.putImageData(imageData, 0, 0);

      // ── Unsharp mask (overlay at low opacity) ─────────────────────────────
      // Blur a copy then composite: original + (original - blurred) * amount
      const blurCanvas = document.createElement("canvas");
      blurCanvas.width = w;
      blurCanvas.height = h;
      const blurCtx = blurCanvas.getContext("2d");
      if (blurCtx) {
        blurCtx.filter = "blur(1px)";
        blurCtx.drawImage(canvas, 0, 0);
        ctx.globalCompositeOperation = "overlay";
        ctx.globalAlpha = 0.25;
        ctx.drawImage(blurCanvas, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }

      const resized = canvas.toDataURL("image/jpeg", quality);
      resolve({ base64: resized.split(",")[1], mimeType: "image/jpeg" });
    };
    img.onerror = () => reject(new Error("Failed to load image for Claude preprocessing"));
    img.src = dataUrl;
  });
}

function buildFromOcr(text: string): ExtractedGraveData {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const yearRegex = /\b(1[7-9]\d{2}|20\d{2})\b/g;
  const years: number[] = [];
  text.replace(yearRegex, (_, y) => {
    years.push(parseInt(y));
    return _;
  });
  years.sort((a, b) => a - b);

  const birthYear = years[0] ?? null;
  const deathYear = years[years.length - 1] ?? null;
  const ageAtDeath =
    birthYear && deathYear && deathYear > birthYear
      ? deathYear - birthYear
      : null;

  const nameLine =
    lines.find(
      (l) => /^[A-Z][a-zA-Z\s'-]+$/.test(l) && l.length > 3 && l.length < 60
    ) ?? "";

  const parts = nameLine.trim().split(/\s+/);

  return {
    name: nameLine,
    firstName: parts[0] ?? "",
    lastName: parts[parts.length - 1] ?? "",
    birthDate: birthYear ? String(birthYear) : "",
    birthYear,
    deathDate: deathYear ? String(deathYear) : "",
    deathYear,
    ageAtDeath,
    inscription: text,
    epitaph: "",
    symbols: [],
    markerType: "headstone",
    material: "unknown",
    condition: "unknown",
    confidence: "low",
    source: "tesseract",
  };
}
