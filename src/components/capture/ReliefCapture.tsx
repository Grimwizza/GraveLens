"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// Safari/WebKit does not expose the torch capability in MediaTrackConstraints.
// Detect once at module level — avoids repeated navigator checks during render.
const isIOS =
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

interface ReliefCaptureProps {
  onCaptureComplete: (dataUrl: string) => void;
  onCancel: () => void;
}

export default function ReliefCapture({
  onCaptureComplete,
  onCancel,
}: ReliefCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [torchFailed, setTorchFailed] = useState(isIOS); // iOS never has torch API
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize camera
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    let mounted = true;

    async function initCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            // Request 720p upfront — avoids capturing full-res frames then downscaling
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!mounted) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }

        activeStream = s;
        setStream(s);

        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }

        // iOS: torch API unsupported — skip entirely, torchFailed is already true
        if (!isIOS) {
          const track = s.getVideoTracks()[0];

          const enableTorch = async () => {
            const capabilities = track.getCapabilities?.();
            // @ts-expect-error torch is not in the standard TS types but works in Chrome Mobile
            if (capabilities?.torch) {
              try {
                await track.applyConstraints({
                  advanced: [{ torch: true } as MediaTrackConstraintSet],
                });
              } catch (e) {
                console.warn("Could not enable torch programmatically", e);
                setTorchFailed(true);
              }
            } else {
              setTorchFailed(true);
            }
          };

          // Defer until the video track is actually delivering frames —
          // avoids a silent failure on some Android devices where the torch
          // constraint is rejected before readyState reaches HAVE_ENOUGH_DATA.
          if (videoRef.current && videoRef.current.readyState >= 2) {
            enableTorch();
          } else if (videoRef.current) {
            videoRef.current.addEventListener("canplay", enableTorch, { once: true });
          } else {
            enableTorch();
          }
        }
      } catch (err) {
        console.error("Camera access denied or unavailable", err);
        setErrorMessage(
          "Camera access is required for Relief Lens. Please allow camera access in your browser settings and try again."
        );
      }
    }

    initCamera();

    return () => {
      mounted = false;
      if (activeStream) {
        activeStream.getTracks().forEach((t) => {
          try {
            t.applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] });
          } catch {}
          t.stop();
        });
      }
    };
  }, [onCancel]);

  const startCapture = useCallback(async () => {
    if (!videoRef.current || !stream) return;
    setIsRecording(true);
    setProgress(0);

    const video = videoRef.current;

    const maxPx = 720;
    const scale = Math.min(1, maxPx / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      setErrorMessage("Canvas is not supported on this device.");
      setIsRecording(false);
      return;
    }

    const durationMs = 3000;
    const framesCount = 20;
    const intervalMs = durationMs / framesCount;
    const frames: ImageData[] = [];

    const startTime = Date.now();

    const captureInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setProgress(Math.min(100, Math.round((elapsed / durationMs) * 100)));

      if (elapsed >= durationMs || frames.length >= framesCount) {
        clearInterval(captureInterval);
        finishCapture();
        return;
      }

      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(video, 0, 0, w, h);
      try {
        frames.push(ctx.getImageData(0, 0, w, h));
      } catch (e) {
        console.error("Failed to extract frame", e);
      }
    }, intervalMs);

    function finishCapture() {
      setIsProcessing(true);

      // Let React paint the "Enhancing…" state before spawning the worker
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            // Transfer underlying ArrayBuffers — zero-copy handoff to worker
            const buffers = frames.map((f) => f.data.buffer as ArrayBuffer);
            const worker = new Worker(
              new URL("../../lib/relief.worker.ts", import.meta.url)
            );

            worker.onmessage = (
              e: MessageEvent<{ composite: ArrayBuffer; width: number; height: number }>
            ) => {
              worker.terminate();
              const { composite, width: rw, height: rh } = e.data;
              const imageData = new ImageData(new Uint8ClampedArray(composite), rw, rh);
              ctx!.putImageData(imageData, 0, 0);
              const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
              onCaptureComplete(dataUrl);
            };

            worker.onerror = (err) => {
              worker.terminate();
              console.error("Relief worker error", err);
              setErrorMessage("Failed to process relief frames. Please try again.");
              setIsRecording(false);
              setIsProcessing(false);
              setProgress(0);
            };

            worker.postMessage({ buffers, width: w, height: h }, buffers);
          } catch (err) {
            console.error("Relief processing failed", err);
            setErrorMessage("Failed to process relief frames. Please try again.");
            setIsRecording(false);
            setIsProcessing(false);
            setProgress(0);
          }
        });
      });
    }
  }, [onCaptureComplete, stream]);

  // Torch fallback copy — platform-specific
  const torchFallbackCopy = isIOS
    ? "Enable your flashlight from Control Center before tapping Start."
    : "Your browser doesn't support automatic torch control. Enable your device flashlight manually before tapping Start.";

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Viewfinder */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* UI Overlay */}
        <div className="absolute inset-0 flex flex-col justify-between items-center pb-12 pt-16">
          {/* Header */}
          <div className="w-full px-4 flex justify-between items-start">
            <button
              onClick={onCancel}
              className="w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            <div className="flex flex-col items-end">
              <span className="bg-amber-500/90 text-black font-bold text-xs uppercase px-2 py-1 rounded">
                Pro Scan
              </span>
            </div>
          </div>

          {/* Error state — replaces native alert() */}
          {errorMessage && (
            <div className="mx-4 bg-red-900/80 backdrop-blur rounded-xl p-4 border border-red-500/50 text-center">
              <p className="text-red-300 font-medium text-sm">{errorMessage}</p>
              <button
                onClick={onCancel}
                className="mt-3 px-4 py-2 rounded-lg bg-red-700/60 text-white text-sm font-medium"
              >
                Go Back
              </button>
            </div>
          )}

          {/* Center instructions */}
          {!isRecording && !isProcessing && !errorMessage && (
            <div className="flex flex-col items-center gap-4 text-center animate-fade-in shadow-black drop-shadow-md">
              <p className="text-white font-medium text-lg px-6">
                Position stone in frame.
                <br />
                When you tap start, sweep your light across the surface for 3s.
              </p>
              {torchFailed && (
                <div className="bg-black/60 backdrop-blur rounded-lg p-3 mx-4 border border-white/20 mt-4">
                  <p className="text-amber-400 font-semibold text-sm">
                    💡 {torchFallbackCopy}
                  </p>
                </div>
              )}
            </div>
          )}

          {isRecording && !isProcessing && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-white font-bold text-xl drop-shadow-md animate-pulse text-center">
                Moving light...
              </p>
            </div>
          )}

          {isProcessing && (
            <div className="flex flex-col items-center gap-4 bg-black/60 p-6 rounded-2xl backdrop-blur">
              <svg
                className="animate-spin text-amber-500 w-8 h-8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
              </svg>
              <p className="text-white font-medium text-lg">Enhancing stone topography...</p>
            </div>
          )}

          {/* Bottom controls */}
          <div className="flex flex-col items-center gap-6 w-full px-8 pb-8">
            {!isProcessing && !errorMessage && (
              <div className="relative flex justify-center items-center h-24">
                {isRecording ? (
                  <div className="relative flex justify-center items-center w-24 h-24">
                    <svg className="absolute inset-0 w-full h-full -rotate-90">
                      <circle cx="48" cy="48" r="44" stroke="rgba(255,255,255,0.2)" strokeWidth="4" fill="none" />
                      <circle
                        cx="48"
                        cy="48"
                        r="44"
                        stroke="#f59e0b"
                        strokeWidth="4"
                        fill="none"
                        strokeDasharray="276"
                        strokeDashoffset={276 - (276 * progress) / 100}
                        className="transition-all duration-100 ease-linear"
                      />
                    </svg>
                    <div className="w-8 h-8 bg-amber-500 rounded-sm animate-pulse" />
                  </div>
                ) : (
                  <button
                    onClick={startCapture}
                    disabled={!stream}
                    className="w-20 h-20 rounded-full border-4 border-white/50 flex items-center justify-center p-1 active:scale-95 transition-transform"
                  >
                    <div className="w-full h-full rounded-full bg-white" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
