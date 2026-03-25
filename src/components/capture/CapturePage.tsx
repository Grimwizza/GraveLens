"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "@/components/layout/BottomNav";
import { fileToDataUrl, extractExifLocation, generateId } from "@/lib/exif";
import { runTesseract } from "@/lib/ocr";
import type { ExtractedGraveData, GeoLocation } from "@/types";

type Phase = "idle" | "previewing" | "processing" | "done";

export default function CapturePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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
      // Step 1: Extract GPS from EXIF
      setProgress(20);
      setProgressLabel("Extracting location…");
      const exifLoc = await extractExifLocation(selectedFile);

      // Step 2: Try Tesseract OCR first
      setProgress(35);
      setProgressLabel("Reading inscription…");
      let extracted: ExtractedGraveData | null = null;

      const ocrResult = await runTesseract(selectedFile);
      const useClaudeBackup = ocrResult.confidence < 60 || ocrResult.text.length < 10;

      if (!useClaudeBackup) {
        // Build a basic structured result from Tesseract
        extracted = buildFromOcr(ocrResult.text);
      }

      // Step 3: Claude API (primary or backup)
      setProgress(55);
      setProgressLabel(
        useClaudeBackup ? "Enhancing with AI…" : "Verifying with AI…"
      );

      // Convert to base64 for Claude
      const base64 = previewUrl.split(",")[1];
      const mimeType = selectedFile.type || "image/jpeg";

      const claudeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });

      if (claudeRes.ok) {
        const { extracted: claudeExtracted } = await claudeRes.json();
        extracted = claudeExtracted;
      } else if (!extracted) {
        throw new Error("Both OCR and AI analysis failed");
      }

      // Step 4: Reverse geocode if we have GPS
      setProgress(75);
      setProgressLabel("Finding location…");

      let location: GeoLocation | null = null;
      if (exifLoc) {
        try {
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${exifLoc.lat}&lon=${exifLoc.lng}&format=json&addressdetails=1&zoom=17`,
            {
              headers: {
                "User-Agent": "GraveLens/1.0 (cemetery history app)",
              },
            }
          );
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            const addr = geoData.address ?? {};
            location = {
              lat: exifLoc.lat,
              lng: exifLoc.lng,
              cemetery: addr.cemetery || addr.leisure || addr.amenity,
              address: geoData.display_name,
              city: addr.city || addr.town || addr.village,
              state: addr.state,
              country: addr.country,
            };
          }
        } catch {
          location = { lat: exifLoc.lat, lng: exifLoc.lng };
        }
      }

      // Step 5: Store result in sessionStorage and navigate
      setProgress(95);
      setProgressLabel("Almost done…");

      const id = generateId();
      const pendingResult = {
        id,
        photoDataUrl: previewUrl,
        extracted,
        location,
        timestamp: Date.now(),
      };
      sessionStorage.setItem(`pending-${id}`, JSON.stringify(pendingResult));

      setProgress(100);
      router.push(`/result/${id}`);
    } catch (err) {
      console.error(err);
      setPhase("previewing");
    }
  }, [selectedFile, previewUrl, router]);

  const handleReset = useCallback(() => {
    setPhase("idle");
    setPreviewUrl(null);
    setSelectedFile(null);
    setProgress(0);
  }, []);

  return (
    <div className="flex flex-col min-h-dvh bg-stone-900">
      {/* Header */}
      <header
        className="flex items-center justify-center px-5 pt-4 pb-3 flex-shrink-0"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-2.5">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path
              d="M11 2L11 4M11 18L11 20M4 11L2 11M20 11L18 11"
              stroke="#c9a84c"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="11" cy="11" r="4" stroke="#c9a84c" strokeWidth="1.5" />
            <path
              d="M7.5 3.5C5 4.5 3 7 3 11"
              stroke="#5c7a5c"
              strokeWidth="1"
              strokeLinecap="round"
              opacity="0.6"
            />
          </svg>
          <span className="font-serif text-xl font-semibold tracking-wide text-stone-50">
            GraveLens
          </span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center px-5 pb-28">
        {phase === "idle" && <IdleState onCamera={() => cameraInputRef.current?.click()} onUpload={() => fileInputRef.current?.click()} />}
        {phase === "previewing" && previewUrl && (
          <PreviewState
            previewUrl={previewUrl}
            onAnalyze={handleAnalyze}
            onRetake={handleReset}
          />
        )}
        {phase === "processing" && previewUrl && (
          <ProcessingState
            previewUrl={previewUrl}
            progress={progress}
            label={progressLabel}
          />
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
}: {
  onCamera: () => void;
  onUpload: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 w-full max-w-sm gap-8 animate-fade-in">
      {/* Viewfinder graphic */}
      <div className="relative flex items-center justify-center w-64 h-64">
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
          {/* Center cross */}
          <line x1="128" y1="116" x2="128" y2="140" stroke="#5c7a5c" strokeWidth="1" opacity="0.5" />
          <line x1="116" y1="128" x2="140" y2="128" stroke="#5c7a5c" strokeWidth="1" opacity="0.5" />
          {/* Headstone silhouette */}
          <path
            d="M96 190 L96 120 Q96 96 128 96 Q160 96 160 120 L160 190 Z"
            fill="none"
            stroke="#3a3633"
            strokeWidth="1.5"
          />
        </svg>
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="font-serif text-3xl text-stone-400 leading-none">†</span>
          <span className="text-stone-500 text-xs tracking-widest uppercase mt-1">
            Point & scan
          </span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 text-center px-4">
        <h1 className="font-serif text-2xl font-semibold text-stone-100">
          Read a grave marker
        </h1>
        <p className="text-stone-400 text-sm leading-relaxed">
          Photograph any headstone to uncover the story of the person buried there.
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-3 w-full">
        <button
          onClick={onCamera}
          className="flex items-center justify-center gap-3 w-full h-14 rounded-2xl text-stone-900 font-semibold text-base transition-all active:scale-[0.97]"
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
          className="flex items-center justify-center gap-3 w-full h-14 rounded-2xl border border-stone-600 text-stone-200 font-medium text-base transition-all active:scale-[0.97] bg-stone-800/50"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Upload from Library
        </button>
      </div>

      <p className="text-stone-600 text-xs text-center px-6">
        Photos with GPS data will automatically identify the cemetery location.
      </p>
    </div>
  );
}

// ── Preview state ───────────────────────────────────────────────────────────

function PreviewState({
  previewUrl,
  onAnalyze,
  onRetake,
}: {
  previewUrl: string;
  onAnalyze: () => void;
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
        {/* Corner brackets overlay */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
          <path d="M5% 15% L5% 5% L15% 5%" stroke="#c9a84c" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" opacity="0.9" />
          <path d="M85% 5% L95% 5% L95% 15%" stroke="#c9a84c" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" opacity="0.9" />
          <path d="M5% 85% L5% 95% L15% 95%" stroke="#c9a84c" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" opacity="0.9" />
          <path d="M85% 95% L95% 95% L95% 85%" stroke="#c9a84c" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" opacity="0.9" />
        </svg>
      </div>

      <p className="text-stone-400 text-sm text-center">
        Make sure the inscription is clear and legible.
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
