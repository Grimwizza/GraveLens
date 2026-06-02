"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { resizeForStorage } from "@/lib/imageUtils";

interface CropRect {
  x: number; // normalized 0–1
  y: number;
  w: number;
  h: number;
}

type Handle = "tl" | "tr" | "bl" | "br" | "body";

interface DragState {
  handle: Handle;
  startClientX: number;
  startClientY: number;
  startRect: CropRect;
}

const MIN_CROP = 0.05; // minimum normalized dimension for the crop rect

async function applyEditsToDataUrl(
  srcDataUrl: string,
  rotation: number,
  crop: CropRect,
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = srcDataUrl;
  });

  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  // After rotation, effective dimensions may be swapped
  const rW = rotation % 2 === 0 ? nw : nh;
  const rH = rotation % 2 === 0 ? nh : nw;

  // Step 1: draw the rotated image onto a temp canvas
  const tmp = document.createElement("canvas");
  tmp.width = rW;
  tmp.height = rH;
  const tc = tmp.getContext("2d")!;
  tc.translate(rW / 2, rH / 2);
  tc.rotate(rotation * Math.PI / 2);
  tc.drawImage(img, -nw / 2, -nh / 2);

  // Step 2: crop from the rotated canvas
  const cx = Math.round(crop.x * rW);
  const cy = Math.round(crop.y * rH);
  const cw = Math.max(1, Math.round(crop.w * rW));
  const ch = Math.max(1, Math.round(crop.h * rH));
  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  out.getContext("2d")!.drawImage(tmp, cx, cy, cw, ch, 0, 0, cw, ch);

  return out.toDataURL("image/jpeg", 0.92);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export default function PhotoEditorModal({
  photoDataUrl,
  graveName,
  onSave,
  onClose,
}: {
  photoDataUrl: string;
  graveName: string;
  onSave: (newDataUrl: string) => Promise<void>;
  onClose: () => void;
}) {
  const [rotation, setRotation] = useState<0 | 1 | 2 | 3>(0);
  const [cropRect, setCropRect] = useState<CropRect>({ x: 0, y: 0, w: 1, h: 1 });
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [applying, setApplying] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute the displayed image bounds within its container
  const getImageDisplayRect = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return null;

    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return null;

    const [dNW, dNH] = rotation % 2 === 0 ? [nw, nh] : [nh, nw];
    const cRect = container.getBoundingClientRect();
    const scale = Math.min(cRect.width / dNW, cRect.height / dNH);
    const dW = dNW * scale;
    const dH = dNH * scale;
    const offX = (cRect.width - dW) / 2;
    const offY = (cRect.height - dH) / 2;
    return { left: cRect.left + offX, top: cRect.top + offY, width: dW, height: dH };
  }, [rotation]);

  const startDrag = useCallback((handle: Handle, clientX: number, clientY: number) => {
    setDragState({ handle, startClientX: clientX, startClientY: clientY, startRect: cropRect });
  }, [cropRect]);

  const updateDrag = useCallback((clientX: number, clientY: number) => {
    if (!dragState) return;
    const disp = getImageDisplayRect();
    if (!disp) return;

    const dx = (clientX - dragState.startClientX) / disp.width;
    const dy = (clientY - dragState.startClientY) / disp.height;
    const sr = dragState.startRect;

    setCropRect((prev) => {
      let { x, y, w, h } = prev;
      if (dragState.handle === "body") {
        x = clamp(sr.x + dx, 0, 1 - sr.w);
        y = clamp(sr.y + dy, 0, 1 - sr.h);
        w = sr.w;
        h = sr.h;
      } else {
        // Compute new rect from handle drag
        let x1 = sr.x, y1 = sr.y, x2 = sr.x + sr.w, y2 = sr.y + sr.h;
        if (dragState.handle === "tl" || dragState.handle === "bl") x1 = clamp(sr.x + dx, 0, x2 - MIN_CROP);
        if (dragState.handle === "tr" || dragState.handle === "br") x2 = clamp(sr.x + sr.w + dx, x1 + MIN_CROP, 1);
        if (dragState.handle === "tl" || dragState.handle === "tr") y1 = clamp(sr.y + dy, 0, y2 - MIN_CROP);
        if (dragState.handle === "bl" || dragState.handle === "br") y2 = clamp(sr.y + sr.h + dy, y1 + MIN_CROP, 1);
        x = x1; y = y1; w = x2 - x1; h = y2 - y1;
      }
      return { x, y, w, h };
    });
  }, [dragState, getImageDisplayRect]);

  const endDrag = useCallback(() => setDragState(null), []);

  const rotate = useCallback((dir: 1 | -1) => {
    setRotation((r) => ((r + dir + 4) % 4) as 0 | 1 | 2 | 3);
    setCropRect({ x: 0, y: 0, w: 1, h: 1 });
  }, []);

  const handleApply = useCallback(async () => {
    setApplying(true);
    try {
      const edited = await applyEditsToDataUrl(photoDataUrl, rotation, cropRect);
      const resized = await resizeForStorage(edited);
      await onSave(resized);
    } catch {
      setApplying(false);
    }
  }, [photoDataUrl, rotation, cropRect, onSave]);

  // CSS rotation transform for the preview
  const previewTransform = rotation === 0 ? undefined : `rotate(${rotation * 90}deg)`;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-stone-950 select-none"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-stone-800">
        <button
          onClick={onClose}
          disabled={applying}
          className="flex items-center gap-1.5 text-stone-400 active:text-stone-200 disabled:opacity-40 text-sm"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
          Cancel
        </button>
        <span className="text-stone-400 text-xs uppercase tracking-widest font-semibold">Edit Photo</span>
        <button
          onClick={handleApply}
          disabled={applying}
          className="flex items-center gap-1.5 active:opacity-70 disabled:opacity-40 text-sm font-semibold"
          style={{ color: "var(--t-gold-500)" }}
        >
          {applying ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
          Apply
        </button>
      </div>

      {/* Image + crop overlay */}
      <div
        ref={containerRef}
        className="flex-1 relative flex items-center justify-center overflow-hidden bg-stone-950"
        onPointerMove={(e) => updateDrag(e.clientX, e.clientY)}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={photoDataUrl}
          alt={graveName || "Grave marker"}
          className="max-w-full max-h-full object-contain pointer-events-none"
          style={{ transform: previewTransform, transition: "transform 0.2s ease" }}
          draggable={false}
        />

        {/* Crop overlay — rendered over the displayed image area */}
        <CropOverlay
          cropRect={cropRect}
          getImageDisplayRect={getImageDisplayRect}
          onHandleDown={startDrag}
          dragHandle={dragState?.handle ?? null}
        />
      </div>

      {/* Bottom toolbar */}
      <div className="shrink-0 flex items-center justify-center gap-8 px-6 py-4 border-t border-stone-800 bg-stone-950">
        <button
          onClick={() => rotate(-1)}
          disabled={applying}
          className="flex flex-col items-center gap-1 text-stone-400 active:text-stone-200 disabled:opacity-40"
          aria-label="Rotate 90° counter-clockwise"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
          <span className="text-[0.65rem] uppercase tracking-wide">Rotate CCW</span>
        </button>
        <button
          onClick={() => rotate(1)}
          disabled={applying}
          className="flex flex-col items-center gap-1 text-stone-400 active:text-stone-200 disabled:opacity-40"
          aria-label="Rotate 90° clockwise"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
          </svg>
          <span className="text-[0.65rem] uppercase tracking-wide">Rotate CW</span>
        </button>
      </div>
    </div>
  );
}

// ── Crop overlay ──────────────────────────────────────────────────────────────

function CropOverlay({
  cropRect,
  getImageDisplayRect,
  onHandleDown,
  dragHandle,
}: {
  cropRect: CropRect;
  getImageDisplayRect: () => { left: number; top: number; width: number; height: number } | null;
  onHandleDown: (handle: Handle, clientX: number, clientY: number) => void;
  dragHandle: Handle | null;
}) {
  const [disp, setDisp] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Recompute display rect when cropRect or rotation changes, and on resize
  useEffect(() => {
    const update = () => setDisp(getImageDisplayRect());
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current?.parentElement) ro.observe(containerRef.current.parentElement);
    return () => ro.disconnect();
  }, [getImageDisplayRect, cropRect]);

  if (!disp) return null;

  // Position of the crop rect in container-relative px
  const cx = cropRect.x * disp.width;
  const cy = cropRect.y * disp.height;
  const cw = cropRect.w * disp.width;
  const ch = cropRect.h * disp.height;

  // Container offset from viewport (the overlay is fixed positioned)
  const left = disp.left;
  const top = disp.top;

  const handlePointerDown = (handle: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    onHandleDown(handle, e.clientX, e.clientY);
  };

  const HANDLE_SIZE = 36; // touch target px
  const HANDLE_VIS = 10;  // visual dot px

  const handles: { id: Handle; offsetX: number; offsetY: number }[] = [
    { id: "tl", offsetX: cx,      offsetY: cy },
    { id: "tr", offsetX: cx + cw, offsetY: cy },
    { id: "bl", offsetX: cx,      offsetY: cy + ch },
    { id: "br", offsetX: cx + cw, offsetY: cy + ch },
  ];

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 10 }}
    >
      {/* Dark overlay — 4 panels around the crop rect */}
      {/* Top */}
      <div className="absolute bg-stone-950/75" style={{ left, top, width: disp.width, height: cy }} />
      {/* Bottom */}
      <div className="absolute bg-stone-950/75" style={{ left, top: top + cy + ch, width: disp.width, height: disp.height - cy - ch }} />
      {/* Left */}
      <div className="absolute bg-stone-950/75" style={{ left, top: top + cy, width: cx, height: ch }} />
      {/* Right */}
      <div className="absolute bg-stone-950/75" style={{ left: left + cx + cw, top: top + cy, width: disp.width - cx - cw, height: ch }} />

      {/* Crop border */}
      <div
        className="absolute border-2 border-white/80 pointer-events-auto cursor-move"
        style={{ left: left + cx, top: top + cy, width: cw, height: ch }}
        onPointerDown={handlePointerDown("body")}
      >
        {/* Rule-of-thirds grid lines */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute w-px bg-white/20" style={{ left: "33.3%", top: 0, bottom: 0 }} />
          <div className="absolute w-px bg-white/20" style={{ left: "66.6%", top: 0, bottom: 0 }} />
          <div className="absolute h-px bg-white/20" style={{ top: "33.3%", left: 0, right: 0 }} />
          <div className="absolute h-px bg-white/20" style={{ top: "66.6%", left: 0, right: 0 }} />
        </div>
      </div>

      {/* Corner handles */}
      {handles.map(({ id, offsetX, offsetY }) => (
        <div
          key={id}
          className="absolute pointer-events-auto"
          style={{
            left: left + offsetX - HANDLE_SIZE / 2,
            top: top + offsetY - HANDLE_SIZE / 2,
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: id === "tl" || id === "br" ? "nwse-resize" : "nesw-resize",
          }}
          onPointerDown={handlePointerDown(id)}
        >
          <div
            style={{
              width: HANDLE_VIS,
              height: HANDLE_VIS,
              background: dragHandle === id ? "var(--t-gold-500)" : "white",
              borderRadius: 2,
              boxShadow: "0 1px 4px rgba(0,0,0,0.6)",
            }}
          />
        </div>
      ))}
    </div>
  );
}
