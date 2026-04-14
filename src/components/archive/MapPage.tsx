"use client";

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import PageShell from "@/components/layout/PageShell";
import { getAllGraves } from "@/lib/storage";
import type { CommunityGraveRecord, GraveRecord } from "@/types";
import { loadSettings } from "@/lib/settings";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/browser";
import { fetchCommunityGravesInBounds } from "@/lib/community";
import { SHOW_COMMUNITY_FEATURES } from "@/lib/config";

const ArchiveMap = dynamic(() => import("./ArchiveMap"), { ssr: false });

export default function MapPage() {
  const { user } = useAuth();
  const [graves, setGraves] = useState<GraveRecord[]>([]);
  const [communityGraves, setCommunityGraves] = useState<CommunityGraveRecord[]>([]);
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

  // Fetch community graves when the user is signed in and community features enabled.
  useEffect(() => {
    if (!user || !SHOW_COMMUNITY_FEATURES) return;
    const supabase = createClient();
    fetchCommunityGravesInBounds(supabase, user.id, 24, -125, 50, -66)
      .then(setCommunityGraves)
      .catch(() => {});
  }, [user]);

  const filteredGraves = useMemo(() => {
    return graves.filter((g) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const name = g.extracted.name?.toLowerCase() || "";
      const cemetery = g.location?.cemetery?.toLowerCase() || "";
      const city = g.location?.city?.toLowerCase() || "";
      const state = g.location?.state?.toLowerCase() || "";
      return name.includes(q) || cemetery.includes(q) || city.includes(q) || state.includes(q);
    });
  }, [graves, searchQuery]);

  return (
    <PageShell
      noScroll={true}
      title="Discovery Map"
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
      }
      customMainClasses="w-full h-full relative"
      headerTitleActions={null}
      headerActions={
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
            menuOpen ? "bg-stone-700" : "bg-stone-800"
          }`}
          aria-label="Discovery and Search"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={menuOpen ? "#c9a84c" : "var(--t-stone-500)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </button>
      }
      headerPanels={
        menuOpen && (
          <div className="px-4 pb-3 border-t border-stone-800 pt-3 flex flex-col gap-3">

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
            </div>

            <div className="flex gap-2">
              <button
                id="execute-map-search"
                onClick={() => {
                  setFindTrigger(Date.now());
                  setMenuOpen(false);
                }}
                className="flex-1 py-2 rounded-lg font-semibold text-sm active:scale-[0.97] transition-all"
                style={{ background: "#c9a84c", color: "var(--t-stone-900)" }}
              >
                Search
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
        )
      }
    >
      {/* Main Map Background */}
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
          communityGraves={communityGraves}
          findRadius={findRadius}
          findTrigger={findTrigger}
          onSearchStateChange={(_searching, hasResults) => {
            setHasManualResults(hasResults);
          }}
          onClearFind={() => setFindTrigger(0)}
        />
      )}
    </PageShell>
  );
}
