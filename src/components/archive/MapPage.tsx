"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import BottomNav from "@/components/layout/BottomNav";
import { getAllGraves } from "@/lib/storage";
import type { GraveRecord } from "@/types";

const ArchiveMap = dynamic(() => import("./ArchiveMap"), { ssr: false });

export default function MapPage() {
  const [graves, setGraves] = useState<GraveRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllGraves().then((g) => {
      setGraves(g);
      setLoading(false);
    });
  }, []);

  return (
    <div className="flex flex-col min-h-dvh bg-stone-900">
      <header
        className="flex items-center justify-between px-5 py-3 bg-stone-900 sticky top-0 z-30 border-b border-stone-800"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
            <path
              d="M11 2C7.13 2 4 5.13 4 9c0 5.25 7 11 7 11s7-5.75 7-11c0-3.87-3.13-7-7-7z"
              stroke="#c9a84c"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <circle cx="11" cy="9" r="2.5" stroke="#c9a84c" strokeWidth="1.5" />
          </svg>
          <span className="font-serif text-stone-100 text-lg font-semibold">Map</span>
          {!loading && graves.length > 0 && (
            <span className="text-xs text-stone-500 ml-1">
              ({graves.length} {graves.length === 1 ? "marker" : "markers"})
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col pb-16">
        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <div className="w-6 h-6 border-2 border-gold-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : graves.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 px-8 text-center animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-stone-800 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5a5550" strokeWidth="1.5">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 11 7 11s7-5.75 7-11c0-3.87-3.13-7-7-7z" strokeLinejoin="round" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
            </div>
            <p className="text-stone-500 text-sm leading-relaxed">
              Saved grave markers with GPS data will appear as pins on the map.
            </p>
          </div>
        ) : (
          <ArchiveMap graves={graves} />
        )}
      </main>

      <BottomNav />
    </div>
  );
}
