"use client";

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import BottomNav from "@/components/layout/BottomNav";
import { getAllGraves } from "@/lib/storage";
import type { GraveRecord } from "@/types";
import ProfileBadge from "@/components/auth/ProfileBadge";
import { loadSettings } from "@/lib/settings";

const ArchiveMap = dynamic(() => import("./ArchiveMap"), { ssr: false });

export default function MapPage() {
  const [graves, setGraves] = useState<GraveRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  // Discovery State — default radius seeded from settings (km → miles approx)
  const [findRadius, setFindRadius] = useState(() => {
    const km = loadSettings().defaultSearchRadius;
    // Map to closest available mile option: 1→5, 5→5, 10→15, 25→50
    if (km <= 5) return 5;
    if (km <= 10) return 15;
    return 50;
  });
  const [findType, setFindType] = useState<any>("all");
  const [findTrigger, setFindTrigger] = useState(0);
  const [hasManualResults, setHasManualResults] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 2000);
    getAllGraves().then((g) => {
      setGraves(g);
      setLoading(false);
      clearTimeout(timer);
    }).catch(() => {
      setLoading(false);
      clearTimeout(timer);
    });
    return () => clearTimeout(timer);
  }, []);

  const filteredGraves = useMemo(() => {
    return graves.filter((g) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const name = g.extracted.name?.toLowerCase() || "";
      const cemetery = g.location?.cemetery?.toLowerCase() || "";
      const city = g.location?.city?.toLowerCase() || "";
      const tags = (g.tags || []).join(" ").toLowerCase();
      return name.includes(q) || cemetery.includes(q) || city.includes(q) || tags.includes(q);
    });
  }, [graves, searchQuery]);

  return (
    <div className="relative w-screen h-screen bg-stone-950 overflow-hidden">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-[1001] bg-stone-900 border-b border-stone-800" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <span className="font-serif font-semibold tracking-wide" style={{ fontSize: "1.75rem" }}>
                <span className="text-stone-50">Grave</span><span style={{ color: "#c9a84c" }}>Lens</span>
              </span>
              <span className="italic text-white text-[10px] leading-none -mt-0.5 opacity-60">
                By <a href="https://www.lowhigh.ai" target="_blank" rel="noopener noreferrer">LowHigh</a>
              </span>
            </div>
            {!loading && (
              <span className="text-sm text-stone-500 ml-1">
                ({filteredGraves.length} {filteredGraves.length === 1 ? "marker" : "markers"})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                menuOpen ? "bg-stone-700" : "bg-stone-800"
              }`}
              aria-label="Discovery and Search"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={menuOpen ? "#c9a84c" : "#8a8580"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </button>
            <ProfileBadge />
          </div>
        </div>

        {/* Discovery & Search Panel */}
        {menuOpen && (
          <div className="px-4 pb-3 border-t border-stone-800 pt-3 flex flex-col gap-3">
            <p className="font-serif text-stone-100 text-base font-semibold">Local Discovery</p>
            {/* Archive search */}
            <div className="relative">
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, cemetery, or city..."
                className="w-full bg-stone-800 text-stone-200 text-sm rounded-lg pl-9 pr-4 py-1.5 border border-stone-700 focus:outline-none focus:border-gold-500/50"
              />
              <div className="absolute left-3 top-2 text-stone-500">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </div>
            </div>

            {/* Discovery settings */}
            <div className="flex gap-2">
              <div className="flex items-center rounded-lg overflow-hidden border border-stone-700 bg-stone-800">
                {[5, 15, 50].map((r) => (
                  <button
                    key={r}
                    onClick={() => setFindRadius(r)}
                    className="w-12 h-8 text-xs transition-colors font-medium"
                    style={{ color: findRadius === r ? "#c9a84c" : "#6a6560", background: findRadius === r ? "rgba(201,168,76,0.12)" : "transparent" }}
                  >
                    {r === 50 ? "50+" : `${r}mi`}
                  </button>
                ))}
              </div>
              <select
                value={findType}
                onChange={(e) => setFindType(e.target.value)}
                className="flex-1 bg-stone-800 text-stone-200 text-xs rounded-lg px-3 py-2 border border-stone-700 appearance-none focus:outline-none focus:border-gold-500/50"
              >
                <option value="all">Discover Everything</option>
                <option value="cemeteries">Cemeteries Only</option>
                <option value="relatives">Family & Ancestors</option>
                <option value="political">Political Heritage</option>
                <option value="military">Military Service</option>
                <option value="other">Notable Figures</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                id="execute-map-search"
                onClick={() => {
                  setFindTrigger(Date.now());
                  setMenuOpen(false);
                }}
                className="flex-1 py-2 rounded-lg font-semibold text-sm active:scale-[0.97] transition-all"
                style={{ background: "#c9a84c", color: "#1a1917" }}
              >
                Discover Local
              </button>
              {hasManualResults && (
                <button
                  onClick={() => {
                    setFindTrigger(-1);
                    setMenuOpen(false);
                  }}
                  className="px-4 rounded-lg bg-stone-800 text-stone-500 border border-stone-700 active:bg-stone-700 transition-colors flex items-center justify-center hover:text-stone-200"
                  aria-label="Clear results"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Map Background */}
      <main className="w-full h-full">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center bg-stone-950">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-2 border-gold-500 border-t-transparent rounded-full animate-spin" />
              <p className="font-serif italic text-stone-500 text-sm tracking-widest animate-pulse">Initializing Archive...</p>
            </div>
          </div>
        ) : (
          <ArchiveMap
            graves={filteredGraves}
            allGraves={graves}
            findRadius={findRadius}
            findType={findType}
            findTrigger={findTrigger}
            onSearchStateChange={(_searching, hasResults) => {
              setHasManualResults(hasResults);
            }}
            onClearFind={() => setFindTrigger(0)}
          />
        )}
      </main>

      {/* Navigation Overlay */}
      <div className="absolute bottom-0 left-0 right-0 z-[1001] pointer-events-none">
        <div className="pointer-events-auto">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
