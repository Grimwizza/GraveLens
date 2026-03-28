"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import BottomNav from "@/components/layout/BottomNav";
import BrandLogo from "@/components/ui/BrandLogo";
import { fileToDataUrl, extractExifLocation, generateId } from "@/lib/exif";
import { savePendingResult, addToQueue } from "@/lib/storage";
import { QUEUE_CHANGED_EVENT } from "@/lib/queue";
import { reverseGeocode } from "@/lib/apis/nominatim";
import type { ExtractedGraveData, GeoLocation } from "@/types";
import ProfileBadge from "@/components/auth/ProfileBadge";

type Phase = "idle" | "previewing" | "cropping" | "processing" | "queued";

export default function CapturePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // Crop state — originalUrl preserves the uncropped image so the user can
  // re-crop if they change their mind before hitting Analyze.
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);

  // Cemetery Mode
  const [cemeteryMode, setCemeteryMode] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionCount, setSessionCount] = useState(0);

  // Reset scroll on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleFileChosen = useCallback(async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    setPreviewUrl(dataUrl);
    setSelectedFile(file);
    setPhase("previewing");
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!selectedFile || !previewUrl) return;

    setPhase("processing");
    setProgress(10);
    setProgressLabel("Reading image…");

    try {
      // ── Parallel phase ──────────────────────────────────────────────────
      // All three independent operations start simultaneously:
      //   • EXIF extraction  (instant — reads file metadata)
      //   • Claude analysis  (3–8s — the critical path)
      //   • Image resize     (instant — canvas op, runs in parallel)
      // Geocoding starts immediately after EXIF resolves, overlapping Claude.
      setProgress(20);
      setProgressLabel("Analyzing marker…");

      // Pre-process + resize for Claude while EXIF runs
      const [preprocessed, exifLoc] = await Promise.all([
        preprocessAndResize(previewUrl),
        extractExifLocation(selectedFile),
      ]);

      // Kick off geocoding immediately — it overlaps the Claude call
      const geocodePromise = exifLoc ? reverseGeocode(exifLoc.lat, exifLoc.lng) : Promise.resolve(null);

      // ── Claude analysis ─────────────────────────────────────────────────
      setProgress(40);
      let extracted: ExtractedGraveData | null = null;

      try {
        const claudeRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: preprocessed.base64, mimeType: preprocessed.mimeType }),
        });

        if (claudeRes.ok) {
          const { extracted: claudeExtracted } = await claudeRes.json();
          if (claudeExtracted) extracted = claudeExtracted;
        } else {
          const errorData = await claudeRes.json().catch(() => ({}));
          console.warn("Claude API returned", claudeRes.status, errorData.details ?? "");
        }
      } catch (claudeErr) {
        console.warn("Claude request failed:", claudeErr);
      }

      // ── Tesseract fallback (only if Claude completely failed) ───────────
      // Dynamically imported so the ~10 MB WASM is never downloaded on the
      // happy path. Only loads when the network is unavailable or Claude errors.
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
      console.error(err);
      setPhase("previewing");
    }
  }, [selectedFile, previewUrl, router]);

  const handleCrop = useCallback(() => {
    setOriginalUrl(previewUrl);
    setPhase("cropping");
  }, [previewUrl]);

  const handleCropApply = useCallback((croppedUrl: string) => {
    setPreviewUrl(croppedUrl);
    setPhase("previewing");
  }, []);

  const handleCropSkip = useCallback(() => {
    setPhase("previewing");
  }, []);

  const handleReset = useCallback(() => {
    setPhase("idle");
    setPreviewUrl(null);
    setOriginalUrl(null);
    setSelectedFile(null);
    setProgress(0);
  }, []);

  // Cemetery Mode: queue the photo for later processing instead of running Claude now
  const handleQueueCapture = useCallback(async () => {
    if (!selectedFile || !previewUrl) return;

    setPhase("processing");
    setProgress(20);
    setProgressLabel("Saving to queue…");

    try {
      // Extract EXIF location from file (works offline)
      const exifLoc = await extractExifLocation(selectedFile);
      let location: GeoLocation | undefined;

      if (exifLoc) {
        setProgress(40);
        const geocoded = await reverseGeocode(exifLoc.lat, exifLoc.lng).catch(() => null);
        location = (geocoded ?? exifLoc) as GeoLocation;
      }

      setProgress(70);
      const storageDataUrl = await resizeForStorage(previewUrl);

      const id = generateId();
      const sid = sessionId ?? generateId();
      if (!sessionId) setSessionId(sid);

      await addToQueue({
        id,
        timestamp: Date.now(),
        photoDataUrl: storageDataUrl,
        location,
        sessionId: sid,
        sessionName: sessionName.trim() || undefined,
        status: "pending",
        retries: 0,
      });

      // Notify BottomNav badge
      window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));

      setProgress(100);
      setSessionCount((c) => c + 1);
      setPhase("queued");

      // Reset to idle after a brief confirmation
      setTimeout(() => handleReset(), 1400);
    } catch (err) {
      console.error(err);
      setPhase("previewing");
    }
  }, [selectedFile, previewUrl, sessionId, sessionName, handleReset]);

  return (
    <div className="flex flex-col h-dvh bg-stone-900 overflow-hidden">
      {/* Header */}
      <header
        className="flex items-center justify-between px-5 pt-2 pb-2 flex-shrink-0 bg-stone-900"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <div className="w-8" />
        <div className="flex items-center gap-2.5">
          <BrandLogo size={22} color="#c9a84c" />
          <span className="font-serif text-xl font-semibold tracking-wide text-stone-50">
            GraveLens
          </span>
        </div>
        <ProfileBadge />
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-5 overflow-y-auto no-scrollbar" style={{ scrollbarWidth: "none" }}>
        {phase === "idle" && (
          <IdleState
            onCamera={() => cameraInputRef.current?.click()}
            onUpload={() => fileInputRef.current?.click()}
            cemeteryMode={cemeteryMode}
            onToggleCemeteryMode={() => {
              setCemeteryMode((m) => !m);
              setSessionId(null);
              setSessionCount(0);
            }}
            sessionName={sessionName}
            onSessionNameChange={setSessionName}
            sessionCount={sessionCount}
          />
        )}
        {phase === "previewing" && previewUrl && (
          <PreviewState
            previewUrl={previewUrl}
            onAnalyze={cemeteryMode ? handleQueueCapture : handleAnalyze}
            analyzeLabel={cemeteryMode ? "Add to Queue" : "Analyze Marker"}
            onCrop={handleCrop}
            onRetake={handleReset}
          />
        )}
        {phase === "cropping" && (originalUrl ?? previewUrl) && (
          <CropState
            imageUrl={(originalUrl ?? previewUrl)!}
            onApply={handleCropApply}
            onSkip={handleCropSkip}
          />
        )}
        {phase === "processing" && previewUrl && (
          <ProcessingState
            previewUrl={previewUrl}
            progress={progress}
            label={progressLabel}
          />
        )}
        {phase === "queued" && (
          <QueuedConfirmation sessionCount={sessionCount} sessionName={sessionName} />
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
  onCamera,
  onUpload,
  cemeteryMode,
  onToggleCemeteryMode,
  sessionName,
  onSessionNameChange,
  sessionCount,
}: {
  onCamera: () => void;
  onUpload: () => void;
  cemeteryMode: boolean;
  onToggleCemeteryMode: () => void;
  sessionName: string;
  onSessionNameChange: (v: string) => void;
  sessionCount: number;
}) {
  return (
    <div className="flex flex-col items-center w-full max-w-sm gap-4 animate-fade-in pt-1">
      {/* Viewfinder graphic - sized to fit 375x667 with NO scrolling */}
      <div className="relative flex items-center justify-center w-48 h-48 flex-shrink-0">
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
          {/* Logo centered on grave silhouette (y=142 of 256 -> 55.5%) */}
          <div style={{ position: "absolute", left: "50%", top: "55.5%", transform: "translate(-50%, -50%)" }}>
            <BrandLogo size={28} color="#c9a84c" className="drop-shadow-[0_0_12px_rgba(201,168,76,0.5)]" />
          </div>
          {/* Text centered below brackets (y=240 of 256 -> 94%) */}
          <div style={{ position: "absolute", left: "50%", top: "94%", transform: "translate(-50%, -50%)" }}>
            <span className="text-stone-300 text-[10px] font-bold tracking-[0.3em] whitespace-nowrap uppercase opacity-50">
              Point & scan
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 text-center px-4 -translate-y-2">
        <h1 className="font-serif text-xl font-semibold text-stone-100 leading-tight">
          Bring the story behind every stone into focus.
        </h1>
        <p className="text-stone-400 text-sm leading-relaxed max-w-[280px]">
          Photograph any headstone to instantly uncover and preserve their legacy.
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-3 w-full">
        <button
          onClick={onCamera}
          className="flex items-center justify-center gap-3 w-full h-11 rounded-xl text-stone-900 font-semibold text-base transition-all active:scale-[0.97]"
          style={{ background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          Take a Photo
        </button>

        <button
          onClick={onUpload}
          className="flex items-center justify-center gap-3 w-full h-11 rounded-xl border border-stone-600 text-stone-200 font-medium text-sm transition-all active:scale-[0.97] bg-stone-800/50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Upload from Library
        </button>
      </div>

      {/* Cemetery Mode toggle */}
      <div className="w-full mt-1">
        <button
          onClick={onToggleCemeteryMode}
          className="flex items-center justify-between w-full px-4 py-3 rounded-xl bg-stone-800/60 border border-stone-700/60 transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cemeteryMode ? "#c9a84c" : "#8a8580"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 11 7 11s7-5.75 7-11c0-3.87-3.13-7-7-7z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            <span className="text-sm font-medium" style={{ color: cemeteryMode ? "#c9a84c" : "#a09890" }}>
              Cemetery Mode
            </span>
            {cemeteryMode && sessionCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(201,168,76,0.15)", color: "#c9a84c" }}>
                {sessionCount} queued
              </span>
            )}
          </div>
          {/* Toggle pill */}
          <div
            className="w-10 h-6 rounded-full transition-colors flex items-center px-1"
            style={{ background: cemeteryMode ? "#c9a84c" : "#3a3633" }}
          >
            <div
              className="w-4 h-4 rounded-full bg-white shadow transition-transform"
              style={{ transform: cemeteryMode ? "translateX(16px)" : "translateX(0)" }}
            />
          </div>
        </button>

        {cemeteryMode && (
          <div className="mt-2 px-1">
            <input
              type="text"
              value={sessionName}
              onChange={(e) => onSessionNameChange(e.target.value)}
              placeholder="Session name (optional)"
              className="w-full h-10 rounded-lg bg-stone-800 border border-stone-700 px-3 text-stone-200 text-sm placeholder-stone-600 focus:outline-none focus:border-stone-500"
            />
            <p className="text-stone-600 text-[10px] mt-1.5 leading-tight px-1">
              Photos are queued and analyzed when you're back online.
            </p>
          </div>
        )}
      </div>

      {!cemeteryMode && (
        <p className="text-stone-600 text-[10px] text-center px-6 leading-tight">
          Photos with GPS data will automatically identify the cemetery location.
        </p>
      )}
    </div>
  );
}

// ── Queued confirmation ─────────────────────────────────────────────────────

function QueuedConfirmation({ sessionCount, sessionName }: { sessionCount: number; sessionName: string }) {
  return (
    <div className="flex flex-col items-center gap-4 animate-fade-in text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-stone-800 border border-stone-700 flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>
      <div>
        <p className="text-stone-100 font-semibold text-base">Added to queue</p>
        <p className="text-stone-500 text-sm mt-1">
          {sessionName ? `${sessionName} · ` : ""}{sessionCount} photo{sessionCount !== 1 ? "s" : ""} queued
        </p>
      </div>
    </div>
  );
}

// ── Preview state ───────────────────────────────────────────────────────────

function PreviewState({
  previewUrl,
  onAnalyze,
  onCrop,
  onRetake,
}: {
  previewUrl: string;
  onAnalyze: () => void;
  onCrop: () => void;
  onRetake: () => void;
}) {
  return (
    <div className="flex flex-col w-full max-w-sm gap-4 animate-fade-in pt-4">
      <div className="relative rounded-2xl overflow-hidden bg-stone-800 aspect-[3/4] w-full shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt="Selected grave marker"
          className="w-full h-full object-cover"
        />
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M5 15 L5 5 L15 5" stroke="#c9a84c" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" opacity="0.9" />
          <path d="M85 5 L95 5 L95 15" stroke="#c9a84c" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" opacity="0.9" />
          <path d="M5 85 L5 95 L15 95" stroke="#c9a84c" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" opacity="0.9" />
          <path d="M85 95 L95 95 L95 85" stroke="#c9a84c" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" opacity="0.9" />
        </svg>
        {/* Crop shortcut overlay */}
        <button
          onClick={onCrop}
          className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium backdrop-blur-sm transition-all active:scale-95"
          style={{ background: "rgba(0,0,0,0.55)", color: "#d4b76a", border: "1px solid rgba(201,168,76,0.35)" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>
          </svg>
          Crop
        </button>
      </div>

      <p className="text-stone-400 text-sm text-center">
        Crop to the marker for best results, then analyze.
      </p>

      <div className="flex flex-col gap-3 w-full">
        <button
          onClick={onAnalyze}
          className="flex items-center justify-center gap-3 w-full h-14 rounded-2xl text-stone-900 font-semibold text-base transition-all active:scale-[0.97]"
          style={{ background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          Analyze Marker
        </button>
        <button
          onClick={onRetake}
          className="w-full h-12 rounded-2xl text-stone-400 font-medium text-sm transition-all active:scale-[0.97]"
        >
          Use a different photo
        </button>
      </div>
    </div>
  );
}

// ── Crop state ────────────────────────────────────────────────────────────────

function CropState({
  imageUrl,
  onApply,
  onSkip,
}: {
  imageUrl: string;
  onApply: (croppedUrl: string) => void;
  onSkip: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [applying, setApplying] = useState(false);

  const handleApply = async () => {
    if (!croppedAreaPixels) { onSkip(); return; }
    setApplying(true);
    try {
      const cropped = await applyCrop(imageUrl, croppedAreaPixels);
      onApply(cropped);
    } catch {
      onSkip();
    }
  };

  return (
    <div className="flex flex-col w-full max-w-sm gap-4 animate-fade-in pt-4">
      <p className="text-stone-300 text-sm text-center">
        Drag and pinch to frame the marker tightly.
      </p>

      {/* Crop canvas — fixed height so the Cropper has a defined container */}
      <div
        className="relative w-full rounded-2xl overflow-hidden bg-stone-800"
        style={{ height: "60vw", maxHeight: "360px", minHeight: "260px" }}
      >
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={undefined}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_: Area, pixels: Area) => setCroppedAreaPixels(pixels)}
          style={{
            containerStyle: { borderRadius: "1rem" },
            mediaStyle: {},
            cropAreaStyle: {
              border: "2px solid #c9a84c",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            },
          }}
        />
      </div>

      <div className="flex gap-3 w-full">
        <button
          onClick={handleApply}
          disabled={applying}
          className="flex-1 h-13 rounded-2xl font-semibold text-stone-900 text-sm transition-all active:scale-[0.97] disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #c9a84c, #d4b76a)", height: "52px" }}
        >
          {applying ? "Applying…" : "Apply Crop"}
        </button>
        <button
          onClick={onSkip}
          className="flex-1 h-13 rounded-2xl text-stone-400 font-medium text-sm border border-stone-700 transition-all active:scale-[0.97]"
          style={{ height: "52px" }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}

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
 * Draw the crop region onto a canvas and return it as a JPEG data URL.
 * croppedAreaPixels comes directly from react-easy-crop's onCropComplete.
 */
function applyCrop(imageUrl: string, area: Area): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = area.width;
      canvas.height = area.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
      resolve(canvas.toDataURL("image/jpeg", 0.95));
    };
    img.onerror = reject;
    img.src = imageUrl;
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
    img.onerror = reject;
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
    img.onerror = reject;
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
