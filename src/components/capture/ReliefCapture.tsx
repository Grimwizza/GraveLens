"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { processReliefFrames } from "@/lib/relief";

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
  const [progress, setProgress] = useState(0); // 0 to 100 during recording
  const [torchFailed, setTorchFailed] = useState(false);

  // Initialize camera
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    let mounted = true;

    async function initCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
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

        // Try to turn on torch
        const track = s.getVideoTracks()[0];
        const capabilities = track.getCapabilities?.();
        // @ts-expect-error Torch is not in the standard types but works in Chrome Mobile
        if (capabilities && capabilities.torch) {
          try {
            await track.applyConstraints({
              advanced: [{ torch: true } as MediaTrackConstraintSet]
            });
          } catch (e) {
            console.warn("Could not enable torch programmatically", e);
            setTorchFailed(true);
          }
        } else {
          setTorchFailed(true);
        }
      } catch (err) {
        console.error("Camera access denied or unavailable", err);
        alert("Camera access is required for Relief Lens");
        onCancel();
      }
    }

    initCamera();

    return () => {
      mounted = false;
      if (activeStream) {
        activeStream.getTracks().forEach((t) => {
          // Attempt to turn off torch before stopping
          try { t.applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] }); } catch {}
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
    
    // We want to scale down to a reasonable size so processing is fast and memory is low.
    const maxPx = 720;
    const scale = Math.min(1, maxPx / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      alert("Canvas not supported");
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

    async function finishCapture() {
      setIsProcessing(true);
      
      // Let React render the "Processing" state before doing heavy lifting
      requestAnimationFrame(async () => {
        requestAnimationFrame(() => {
          try {
            const composite = processReliefFrames(frames);
            ctx!.putImageData(composite, 0, 0);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
            onCaptureComplete(dataUrl);
          } catch (err) {
            console.error("Relief processing failed", err);
            alert("Failed to process relief frames.");
            setIsRecording(false);
            setIsProcessing(false);
            setProgress(0);
          }
        });
      });
    }

  }, [onCaptureComplete, stream]);

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
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
            <div className="flex flex-col items-end">
              <span className="bg-amber-500/90 text-black font-bold text-xs uppercase px-2 py-1 rounded">Pro Scan</span>
            </div>
          </div>

          {/* Center Reticle / Instructions */}
          {!isRecording && !isProcessing && (
            <div className="flex flex-col items-center gap-4 text-center animate-fade-in shadow-black drop-shadow-md">
              <p className="text-white font-medium text-lg px-6">
                Position stone in frame. <br/>
                When you tap start, sweep your light across the surface for 3s.
              </p>
              {torchFailed && (
                <div className="bg-black/60 backdrop-blur rounded-lg p-3 mx-4 border border-white/20 mt-4">
                  <p className="text-amber-400 font-semibold text-sm">💡 For best results, turn on your iPhone flashlight from the Control Center now.</p>
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
              <svg className="animate-spin text-amber-500 w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
              </svg>
              <p className="text-white font-medium text-lg">Enhancing stone topography...</p>
            </div>
          )}

          {/* Bottom Controls */}
          <div className="flex flex-col items-center gap-6 w-full px-8 pb-8">
            {!isProcessing && (
              <div className="relative flex justify-center items-center h-24">
                {isRecording ? (
                  <div className="relative flex justify-center items-center w-24 h-24">
                    {/* Circular progress track */}
                    <svg className="absolute inset-0 w-full h-full -rotate-90">
                      <circle cx="48" cy="48" r="44" stroke="rgba(255,255,255,0.2)" strokeWidth="4" fill="none" />
                      <circle cx="48" cy="48" r="44" stroke="#f59e0b" strokeWidth="4" fill="none" 
                        strokeDasharray="276" strokeDashoffset={276 - (276 * progress) / 100} 
                        className="transition-all duration-100 ease-linear" />
                    </svg>
                    <div className="w-8 h-8 bg-amber-500 rounded-sm animate-pulse"></div>
                  </div>
                ) : (
                  <button 
                    onClick={startCapture}
                    disabled={!stream}
                    className="w-20 h-20 rounded-full border-4 border-white/50 flex items-center justify-center p-1 active:scale-95 transition-transform"
                  >
                    <div className="w-full h-full rounded-full bg-white"></div>
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
