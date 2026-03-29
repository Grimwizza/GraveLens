"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { GraveRecord, NotableFigure } from "@/types";
import { getNotableFiguresInBounds } from "@/lib/apis/wikidata";

interface CemeteryFeature {
  lat: number;
  lng: number;
  name: string;
  wikipedia?: string;
}

export type SearchType = "all" | "cemeteries" | "political" | "military" | "artist" | "musician" | "actor" | "relatives" | "other";
const RELATIVE_TAGS = ["family", "relative", "ancestor", "kin", "grandparent", "parent", "mother", "father"];

// ── Overpass cemetery query ───────────────────────────────────────────────

async function fetchCemeteriesInBounds(
  south: number,
  west: number,
  north: number,
  east: number
): Promise<CemeteryFeature[]> {
  const query = `
[out:json][timeout:15];
(
  way["landuse"="cemetery"](${south},${west},${north},${east});
  relation["landuse"="cemetery"](${south},${west},${north},${east});
  way["amenity"="grave_yard"](${south},${west},${north},${east});
  relation["amenity"="grave_yard"](${south},${west},${north},${east});
);
out center tags;
`.trim();

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(18000),
    });
    if (!res.ok) return [];

    const data = await res.json();
    const results: CemeteryFeature[] = [];

    for (const el of data.elements ?? []) {
      const name = el.tags?.name;
      if (!name) continue;

      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (!lat || !lng) continue;

      const wikiRaw: string | undefined = el.tags?.wikipedia;
      const wikipedia = wikiRaw
        ? `https://en.wikipedia.org/wiki/${encodeURIComponent(
            wikiRaw.replace(/^en:/, "").replace(/ /g, "_")
          )}`
        : undefined;

      results.push({ lat, lng, name, wikipedia });
    }

    const seen = new Set<string>();
    return results.filter((c) => {
      if (seen.has(c.name)) return false;
      seen.add(c.name);
      return true;
    });
  } catch (e) {
    return [];
  }
}

// ── Component ─────────────────────────────────────────────────────────────

export default function ArchiveMap({
  graves,
  allGraves,
  findRadius,
  findType,
  findTrigger,
  onSearchStateChange,
  onClearFind,
}: {
  graves: GraveRecord[];
  allGraves: GraveRecord[];
  findRadius: number;
  findType: SearchType;
  findTrigger: number;
  onSearchStateChange: (searching: boolean, hasResults: boolean) => void;
  onClearFind: () => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [notableFigures, setNotableFigures] = useState<NotableFigure[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [manualFigures, setManualFigures] = useState<NotableFigure[] | null>(null);
  const [manualCemeteries, setManualCemeteries] = useState<CemeteryFeature[] | null>(null);
  const [manualRelatives, setManualRelatives] = useState<GraveRecord[] | null>(null);

  // Sync results state to parent
  useEffect(() => {
    onSearchStateChange(isSearching, !!(manualFigures || manualCemeteries || manualRelatives));
  }, [isSearching, manualFigures, manualCemeteries, manualRelatives, onSearchStateChange]);

  // Initial Map Load
  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current || mapInstanceRef.current) return;

      // Fix Icons
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      const validGraves = graves.filter((g) => g.location?.lat && g.location?.lng);
      const center: [number, number] = validGraves.length > 0
        ? [validGraves[0].location.lat, validGraves[0].location.lng]
        : [39.8283, -98.5795];

      const map = L.map(mapRef.current!, { center, zoom: validGraves.length > 0 ? 14 : 5 });
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Icon definitions
      const graveIcon = L.divIcon({
        html: `<div style="width:28px;height:28px;background:linear-gradient(135deg,#c9a84c,#a07830);border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #1a1917;box-shadow:0 2px 8px rgba(0,0,0,0.5);"></div>`,
        className: "", iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -32],
      });

      validGraves.forEach((grave) => {
        const { name } = grave.extracted;
        const popupHtml = `<div style="font-family:system-ui;min-width:160px;padding:12px;">
            <p style="font-family:Georgia,serif;font-size:15px;font-weight:600;color:#f5f2ed;margin:0 0 4px;">${name || "Unknown"}</p>
            <img src="${grave.photoDataUrl}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;" />
          </div>`;
        L.marker([grave.location.lat, grave.location.lng], { icon: graveIcon }).addTo(map).bindPopup(popupHtml);
      });

      if (validGraves.length > 1) {
        const bounds = L.latLngBounds(validGraves.map(g => [g.location.lat, g.location.lng] as [number, number]));
        map.fitBounds(bounds, { padding: [40, 40] });
      }

      // Auto-Discovery
      let fetchTimer: any = null;
      const fetchFigures = async () => {
        if (manualFigures) return;
        if (fetchTimer) clearTimeout(fetchTimer);
        fetchTimer = setTimeout(async () => {
          if (map.getZoom() < 13) { setNotableFigures([]); return; }
          const b = map.getBounds();
          const sw = b.getSouthWest(); const ne = b.getNorthEast();
          const figures = await getNotableFiguresInBounds(sw.lat, sw.lng, ne.lat, ne.lng);
          if (!cancelled) setNotableFigures(figures);
        }, 500);
      };

      map.on("moveend", fetchFigures);
      fetchFigures();

      return () => {
        cancelled = true;
        map.off("moveend", fetchFigures);
        map.remove();
        mapInstanceRef.current = null;
      };
    });
  }, [graves]);

  // Handle Find / Clear from Parent
  useEffect(() => {
    if (findTrigger > 0) handleFind();
    if (findTrigger === -1) clearFind();
  }, [findTrigger]);

  const handleFind = async () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    setIsSearching(true);
    try {
      const center = map.getCenter();
      const lat = center.lat; const lng = center.lng;
      const latDelta = findRadius / 69;
      const lngDelta = findRadius / (69 * Math.cos((lat * Math.PI) / 180));
      const s = lat - latDelta; const n = lat + latDelta;
      const w = lng - lngDelta; const e = lng + lngDelta;

      const p: Promise<any>[] = [];
      if (findType === "all" || findType === "cemeteries") {
        p.push(fetchCemeteriesInBounds(s, w, n, e).then(setManualCemeteries));
      } else setManualCemeteries(null);

      if (findType !== "relatives" && findType !== "cemeteries") {
        p.push(getNotableFiguresInBounds(s, w, n, e).then(figs => {
          setManualFigures(findType === "all" || findType === "other" ? figs : figs.filter(f => f.category === findType));
        }));
      } else setManualFigures(null);

      if (findType === "all" || findType === "relatives") {
        setManualRelatives(allGraves.filter(g => g.location?.lat && g.location.lat >= s && g.location.lat <= n && g.location.lng >= w && g.location.lng <= e && (g.tags || []).some(t => RELATIVE_TAGS.includes(t.toLowerCase()))));
      } else setManualRelatives(null);

      await Promise.all(p);
      map.fitBounds([[s, w], [n, e]], { padding: [20, 20] });
    } finally {
      setIsSearching(false);
    }
  };

  const clearFind = () => {
    setManualFigures(null); setManualCemeteries(null); setManualRelatives(null); setNotableFigures([]);
    onClearFind();
  };

  // Marker Rendering (Notable & Search Results)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    import("leaflet").then((L) => {
      const notableLayer = L.layerGroup().addTo(map);
      const activeFigures = manualFigures || notableFigures;
      const iconMap: any = { political: "🏛️", military: "⚔️", artist: "🎨", musician: "🎵", actor: "🎭", other: "📍" };

      activeFigures.forEach((n: NotableFigure) => {
        const catIcon = iconMap[n.category] || iconMap.other;
        const icon = L.divIcon({
          html: `<div style="width:32px;height:32px;background:#1a1917;border-radius:50%;border:2px solid #2e2b28;display:flex;align-items:center;justify-content:center;font-size:18px;">${catIcon}</div>`,
          className: "", iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -16],
        });
        const html = `<div style="font-family:system-ui;min-width:180px;padding:14px;">
            <p style="font-family:Georgia,serif;font-size:15px;font-weight:600;color:#f5f2ed;margin:0;">${n.label}</p>
            <p style="font-size:11px;color:#c9a84c;margin-top:2px;">${n.occupationLabel || n.category}</p>
            ${n.wikipediaUrl ? `<a href="${n.wikipediaUrl}" target="_blank" style="display:block;margin-top:10px;padding:8px;background:#c9a84c;color:#1a1917;text-align:center;border-radius:8px;font-weight:bold;text-decoration:none;">Wikipedia →</a>` : ""}
          </div>`;
        L.marker([n.lat, n.lng], { icon }).addTo(notableLayer).bindPopup(html);
      });

      if (manualCemeteries) {
        manualCemeteries.forEach(c => {
           const icon = L.divIcon({
             html: `<div style="
               width:34px;height:34px;
               background:linear-gradient(135deg,#4a4845,#2e2c2a);
               border-radius:6px;
               border:2px solid #1a1917;
               display:flex;align-items:center;justify-content:center;
               box-shadow:0 2px 10px rgba(0,0,0,0.5);
             ">
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                 <path d="M6 21h12" />
                 <path d="M7 21v-8a5 5 0 0 1 10 0v8" />
                 <path d="M12 7v4" />
                 <path d="M10 9h4" />
               </svg>
             </div>`,
             className: "", iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -38],
           });
           const popupContent = `<div style="padding:10px;font-family:system-ui;color:white;min-width:140px;"><b>${c.name}</b>${c.wikipedia ? `<br/><a href="${c.wikipedia}" target="_blank" style="color:#c9a84c;font-size:12px;">Wikipedia →</a>` : ""}</div>`;
           L.marker([c.lat, c.lng], { icon }).addTo(notableLayer).bindPopup(popupContent);
        });
      }

      if (manualRelatives) {
        manualRelatives.forEach(g => {
          const relIcon = L.divIcon({
            html: `<div style="width:30px;height:30px;background:linear-gradient(135deg,#7c5cbf,#5b3fa0);border-radius:50%;border:2px solid #1a1917;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.5);">👤</div>`,
            className: "", iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15],
          });
          const name = g.extracted.name || "Unknown";
          const cemetery = g.location?.cemetery || "";
          const html = `<div style="font-family:system-ui;min-width:160px;padding:12px;">
            <p style="font-family:Georgia,serif;font-size:15px;font-weight:600;color:#f5f2ed;margin:0 0 4px;">${name}</p>
            ${cemetery ? `<p style="font-size:11px;color:#c9a84c;margin:0;">${cemetery}</p>` : ""}
            <img src="${g.photoDataUrl}" style="width:100%;height:72px;object-fit:cover;border-radius:6px;margin-top:6px;" />
          </div>`;
          L.marker([g.location.lat, g.location.lng], { icon: relIcon }).addTo(notableLayer).bindPopup(html);
        });
      }

      return () => { map.removeLayer(notableLayer); };
    });
  }, [notableFigures, manualFigures, manualCemeteries, manualRelatives]);

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden h-screen">
      <div ref={mapRef} className="w-full h-full relative z-0" />
      {isSearching && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-[1002] flex justify-center pointer-events-none">
          <div className="bg-stone-900/95 border border-stone-800 px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-4 backdrop-blur-xl animate-fade-in">
            <div className="w-5 h-5 border-2 border-gold-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-stone-100 font-serif text-sm">Scanning radius...</p>
          </div>
        </div>
      )}
    </div>
  );
}
