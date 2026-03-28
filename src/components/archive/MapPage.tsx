"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import BottomNav from "@/components/layout/BottomNav";
import { getAllGraves } from "@/lib/storage";
import type { GraveRecord } from "@/types";
import ThematicIllustration from "@/components/ui/ThematicIllustration";
import ProfileBadge from "@/components/auth/ProfileBadge";

const ArchiveMap = dynamic(() => import("./ArchiveMap"), { ssr: false });

export default function MapPage() {
  const [graves, setGraves] = useState<GraveRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    // Failsafe: ensure loading finishes eventually
    const timer = setTimeout(() => setLoading(false), 1500);

    getAllGraves()
      .then((g) => {
        setGraves(g);
        setLoading(false);
        clearTimeout(timer);
      })
      .catch(() => {
        setLoading(false);
        clearTimeout(timer);
      });

    return () => clearTimeout(timer);
  }, []);

  const filteredGraves = graves.filter((g) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = g.extracted.name?.toLowerCase() || "";
    const cemetery = g.location?.cemetery?.toLowerCase() || "";
    const city = g.location?.city?.toLowerCase() || "";
    const state = g.location?.state?.toLowerCase() || "";
    const tags = (g.tags || []).join(" ").toLowerCase();
    const inscription = g.extracted.inscription?.toLowerCase() || "";

    return (
      name.includes(q) ||
      cemetery.includes(q) ||
      city.includes(q) ||
      state.includes(q) ||
      tags.includes(q) ||
      inscription.includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full bg-stone-900 overflow-hidden">
      <header
        className="bg-stone-900 sticky top-0 z-30 border-b border-stone-800 transition-all"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 11 7 11s7-5.75 7-11c0-3.87-3.13-7-7-7z"
                stroke="#c9a84c"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="9" r="2.5" stroke="#c9a84c" strokeWidth="1.5" />
            </svg>
            <span className="font-serif text-stone-100 text-xl font-semibold">Map</span>
            {!loading && graves.length > 0 && (
              <span className="text-sm text-stone-500 ml-1">
                ({filteredGraves.length}{filteredGraves.length !== graves.length && `/${graves.length}`}{" "}
                {graves.length === 1 ? "marker" : "markers"})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
          <button
            onClick={() => setSearchOpen((o) => !o)}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
              searchOpen ? "bg-stone-700" : "bg-stone-800"
            }`}
            aria-label="Toggle search"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke={searchQuery ? "#c9a84c" : "#8a8580"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </button>
          <ProfileBadge />
          </div>
        </div>

        {searchOpen && (
          <div className="px-4 pb-3 border-t border-stone-800 pt-3 flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="relative">
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, cemetery, city..."
                className="w-full bg-stone-800 text-stone-200 text-sm rounded-lg pl-9 pr-8 py-1.5 border border-stone-700 focus:outline-none focus:border-gold-500/50"
              />
              <div className="absolute left-3 top-2 text-stone-500">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </div>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2 text-stone-500 active:text-stone-300"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col overflow-hidden pb-32">
        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <div className="w-6 h-6 border-2 border-gold-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : graves.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-5 px-10 text-center animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-stone-800/40 flex items-center justify-center border border-stone-800/60 shadow-inner">
              <ThematicIllustration type="map" size={40} />
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="font-serif text-stone-200 text-xl font-medium leading-tight">No pins yet</h2>
              <p className="text-stone-500 text-sm leading-relaxed max-w-[240px] mx-auto">
                Saved grave markers with GPS data will appear as pins on the map.
              </p>
            </div>
          </div>
        ) : (
          <ArchiveMap graves={filteredGraves} allGraves={graves} />
        )}
      </main>

      <BottomNav />
    </div>
  );
}
