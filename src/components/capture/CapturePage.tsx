"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import BottomNav from "@/components/layout/BottomNav";
import BrandLogo from "@/components/ui/BrandLogo";
import { fileToDataUrl, extractExifLocation, generateId } from "@/lib/exif";
import { runTesseract } from "@/lib/ocr";
import { savePendingResult } from "@/lib/storage";
import type { ExtractedGraveData, GeoLocation } from "@/types";

type Phase = "idle" | "previewing" | "cropping" | "processing" | "done";

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

      // Step 2: Tesseract OCR (always run — provides fallback if Claude fails)
      setProgress(35);
      setProgressLabel("Reading inscription…");

      const ocrResult = await runTesseract(selectedFile);
      // Always build a Tesseract baseline so we have something to show
      let extracted: ExtractedGraveData = buildFromOcr(ocrResult.text);
      const preferClaude = ocrResult.confidence < 60 || ocrResult.text.length < 10;

      // Step 3: Claude API — always try it; it reads weathered markers far better
      setProgress(55);
      setProgressLabel("Analyzing with AI…");

      try {
        // Resize to max 1536px before sending — full-size photos (10–20 MB as
        // base64) exceed Next.js's 4 MB body limit and cause a silent 413 failure.
        const { base64, mimeType } = await resizeForClaude(previewUrl);

        const claudeRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mimeType }),
        });

        if (claudeRes.ok) {
          const { extracted: claudeExtracted } = await claudeRes.json();
          if (claudeExtracted) extracted = claudeExtracted;
        } else {
          const errorData = await claudeRes.json().catch(() => ({}));
          console.warn(
            "Claude API returned",
            claudeRes.status,
            "— using Tesseract result.",
            "Details:", errorData.details || "Unknown error"
          );
          // Downgrade confidence label if we're relying on Tesseract alone
          if (preferClaude) extracted.confidence = "low";
        }
      } catch (claudeErr) {
        console.warn("Claude request failed — using Tesseract result:", claudeErr);
        if (preferClaude) extracted.confidence = "low";
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

      // Step 5: Compress photo for storage, then write to IndexedDB and navigate.
      // Full-res phone photos are 3–8 MB as base64. We resize to ≤1200px / 80%
      // JPEG before saving — typically 100–250 KB, a 20–50× reduction.
      // The compressed version is still sharp enough to read inscriptions on-screen.
      setProgress(90);
      setProgressLabel("Saving…");

      const storageDataUrl = await resizeForStorage(previewUrl);

      setProgress(95);
      setProgressLabel("Almost done…");

      const id = generateId();
      const pendingResult = {
        id,
        photoDataUrl: storageDataUrl,
        extracted,
        location,
        timestamp: Date.now(),
      };
      await savePendingResult(id, pendingResult);

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

  return (
    <div className="flex flex-col h-dvh bg-stone-900 overflow-hidden">
      {/* Header */}
      <header
        className="flex items-center justify-center px-5 pt-2 pb-2 flex-shrink-0"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-2.5">
          <BrandLogo size={22} color="#c9a84c" />
          <span className="font-serif text-xl font-semibold tracking-wide text-stone-50">
            GraveLens
          </span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-5 overflow-y-auto no-scrollbar" style={{ scrollbarWidth: "none" }}>
        {phase === "idle" && <IdleState onCamera={() => cameraInputRef.current?.click()} onUpload={() => fileInputRef.current?.click()} />}
        {phase === "previewing" && previewUrl && (
          <PreviewState
            previewUrl={previewUrl}
            onAnalyze={handleAnalyze}
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

      <p className="text-stone-600 text-[10px] text-center px-6 leading-tight mt-6">
        Photos with GPS data will automatically identify the cemetery location.
      </p>
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
 * Resize + re-encode to JPEG before sending to Claude.
 * Keeps the longest edge ≤ 1024 px at 78% quality.
 * Anthropic enforces a 5 MB decoded-image limit; 1536 px / 88% can exceed
 * this on high-frequency textures (grass, weathered stone). At 1024 px / 78%
 * typical grave marker photos land at 150–400 KB — well under both the
 * Anthropic limit and Next.js's 4 MB request body limit.
 * Claude reads inscriptions accurately at this resolution.
 */
function resizeForClaude(
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
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.drawImage(img, 0, 0, w, h);
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
