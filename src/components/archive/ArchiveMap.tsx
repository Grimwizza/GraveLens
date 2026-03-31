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

// ── Gravestone icon HTML ──────────────────────────────────────────────────────

const GRAVE_ICON_HTML = `
<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.6))">
  <rect x="2" y="14" width="24" height="18" rx="2" fill="#c9a84c"/>
  <path d="M2 16 Q2 2 14 2 Q26 2 26 16" fill="#c9a84c"/>
  <line x1="14" y1="6" x2="14" y2="12" stroke="#1a1917" stroke-width="2" stroke-linecap="round"/>
  <line x1="10" y1="9" x2="18" y2="9" stroke="#1a1917" stroke-width="2" stroke-linecap="round"/>
  <rect x="10" y="20" width="8" height="9" rx="1" fill="#1a1917" opacity="0.3"/>
</svg>`.trim();

// ── Overpass cemetery query ───────────────────────────────────────────────────

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
        ? `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiRaw.replace(/^en:/, "").replace(/ /g, "_"))}`
        : undefined;
      results.push({ lat, lng, name, wikipedia });
    }

    const seen = new Set<string>();
    return results.filter((c) => {
      if (seen.has(c.name)) return false;
      seen.add(c.name);
      return true;
    });
  } catch {
    return [];
  }
}

// ── Get user geolocation ──────────────────────────────────────────────────────

function getUserLocation(): Promise<[number, number] | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
      () => resolve(null),
      { timeout: 6000, maximumAge: 60000 }
    );
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

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
  const graveLayerRef = useRef<any>(null);
  const overlayLayerRef = useRef<any>(null);
  const autoFetchTimerRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  // Ref so the auto-discovery closure always sees current value
  const hasManualResultsRef = useRef(false);

  const [notableFigures, setNotableFigures] = useState<NotableFigure[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [manualFigures, setManualFigures] = useState<NotableFigure[] | null>(null);
  const [manualCemeteries, setManualCemeteries] = useState<CemeteryFeature[] | null>(null);
  const [manualRelatives, setManualRelatives] = useState<GraveRecord[] | null>(null);
  const [locating, setLocating] = useState(false);

  const hasManualResults = !!(manualFigures || manualCemeteries || manualRelatives);

  // Keep ref in sync so closures see the latest value
  useEffect(() => {
    hasManualResultsRef.current = hasManualResults;
  }, [hasManualResults]);

  // Sync state to parent
  useEffect(() => {
    onSearchStateChange(isSearching, hasManualResults);
  }, [isSearching, hasManualResults, onSearchStateChange]);

  // ── Map initialisation (runs once) ──────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default ?? await import("leaflet");

      if (cancelled || !mapRef.current) return;

      // Suppress default icon path resolution
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({ iconUrl: "", shadowUrl: "" });

      // Determine initial center: user GPS → first grave → US center
      const validGraves = graves.filter((g) => g.location?.lat && g.location?.lng);
      let center: [number, number] = [39.8283, -98.5795];
      let zoom = 5;

      const userPos = await getUserLocation();
      if (cancelled) return;

      if (userPos) {
        center = userPos;
        zoom = 14;
      } else if (validGraves.length > 0) {
        center = [validGraves[0].location.lat, validGraves[0].location.lng];
        zoom = 14;
      }

      const map = L.map(mapRef.current!, { center, zoom, zoomControl: false });
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Grave layer (managed separately so it can update without reiniting the map)
      graveLayerRef.current = L.layerGroup().addTo(map);

      // Overlay layer (notable figures / search results)
      overlayLayerRef.current = L.layerGroup().addTo(map);

      // User location dot — place immediately if we got a position, then watch
      const userIcon = L.divIcon({
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#4a90e2;border:3px solid #fff;box-shadow:0 0 0 4px rgba(74,144,226,0.25),0 2px 8px rgba(0,0,0,0.4);"></div>`,
        className: "",
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      const placeUserDot = (lat: number, lng: number) => {
        if (userMarkerRef.current) {
          userMarkerRef.current.setLatLng([lat, lng]);
        } else {
          userMarkerRef.current = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 500 }).addTo(map);
        }
      };

      if (userPos) placeUserDot(userPos[0], userPos[1]);

      if (navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => { if (!cancelled) placeUserDot(pos.coords.latitude, pos.coords.longitude); },
          () => {},
          { enableHighAccuracy: true, maximumAge: 10000 }
        );
      }

      // Auto-discovery on move
      const fetchFigures = async () => {
        if (hasManualResultsRef.current) return;
        if (autoFetchTimerRef.current) clearTimeout(autoFetchTimerRef.current);
        autoFetchTimerRef.current = setTimeout(async () => {
          if (cancelled || hasManualResultsRef.current) return;
          if (map.getZoom() < 13) { setNotableFigures([]); return; }
          const b = map.getBounds();
          const sw = b.getSouthWest();
          const ne = b.getNorthEast();
          const figures = await getNotableFiguresInBounds(sw.lat, sw.lng, ne.lat, ne.lng);
          if (!cancelled && !hasManualResultsRef.current) setNotableFigures(figures);
        }, 600);
      };

      map.on("moveend", fetchFigures);
      fetchFigures();
    })();

    return () => {
      cancelled = true;
      if (autoFetchTimerRef.current) clearTimeout(autoFetchTimerRef.current);
      if (watchIdRef.current !== null) navigator.geolocation?.clearWatch(watchIdRef.current);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      graveLayerRef.current = null;
      overlayLayerRef.current = null;
      userMarkerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Grave marker layer — re-renders whenever graves prop changes ─────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = graveLayerRef.current;
    if (!map || !layer) return;

    import("leaflet").then((mod) => {
      const L = (mod as any).default ?? mod;
      layer.clearLayers();

      const validGraves = graves.filter((g) => g.location?.lat && g.location?.lng);

      const graveIcon = L.divIcon({
        html: GRAVE_ICON_HTML,
        className: "",
        iconSize: [28, 36],
        iconAnchor: [14, 36],
        popupAnchor: [0, -38],
      });

      validGraves.forEach((grave) => {
        const name = grave.extracted.name || "Unknown";
        const dates = [grave.extracted.birthDate, grave.extracted.deathDate].filter(Boolean).join(" – ");
        const popupHtml = `
          <div style="font-family:system-ui;min-width:160px;padding:12px;background:#1a1917;border-radius:10px;">
            <p style="font-family:Georgia,serif;font-size:15px;font-weight:600;color:#f5f2ed;margin:0 0 2px;">${name}</p>
            ${dates ? `<p style="font-size:11px;color:#c9a84c;margin:0 0 6px;">${dates}</p>` : ""}
            <img src="${grave.photoDataUrl}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;" />
          </div>`;
        L.marker([grave.location.lat, grave.location.lng], { icon: graveIcon })
          .addTo(layer)
          .bindPopup(popupHtml, { className: "dark-popup" });
      });

      // Fit to all grave bounds when first loaded with multiple graves
      if (validGraves.length > 1 && map.getZoom() <= 5) {
        const bounds = L.latLngBounds(validGraves.map((g) => [g.location.lat, g.location.lng] as [number, number]));
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    });
  }, [graves]);

  // ── Overlay layer — notable figures, cemeteries, relatives ──────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = overlayLayerRef.current;
    if (!map || !layer) return;

    // Synchronously clear before the async import so stale markers never linger
    layer.clearLayers();

    import("leaflet").then((mod) => {
      const L = (mod as any).default ?? mod;

      const activeFigures = manualFigures ?? notableFigures;
      const iconMap: Record<string, string> = {
        political: "🏛️", military: "⚔️", artist: "🎨",
        musician: "🎵", actor: "🎭", other: "📍",
      };

      activeFigures.forEach((n: NotableFigure) => {
        const catIcon = iconMap[n.category] ?? "📍";
        const icon = L.divIcon({
          html: `<div style="width:32px;height:32px;background:#1a1917;border-radius:50%;border:2px solid #2e2b28;display:flex;align-items:center;justify-content:center;font-size:18px;">${catIcon}</div>`,
          className: "", iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -16],
        });
        const html = `<div style="font-family:system-ui;min-width:180px;padding:14px;background:#1a1917;border-radius:10px;">
          <p style="font-family:Georgia,serif;font-size:15px;font-weight:600;color:#f5f2ed;margin:0;">${n.label}</p>
          <p style="font-size:11px;color:#c9a84c;margin-top:2px;">${n.occupationLabel || n.category}</p>
          ${n.wikipediaUrl ? `<a href="${n.wikipediaUrl}" target="_blank" style="display:block;margin-top:10px;padding:8px;background:#c9a84c;color:#1a1917;text-align:center;border-radius:8px;font-weight:bold;text-decoration:none;">Wikipedia →</a>` : ""}
        </div>`;
        L.marker([n.lat, n.lng], { icon }).addTo(layer).bindPopup(html);
      });

      if (manualCemeteries) {
        manualCemeteries.forEach((c) => {
          const icon = L.divIcon({
            html: `<div style="width:34px;height:34px;background:linear-gradient(135deg,#4a4845,#2e2c2a);border-radius:6px;border:2px solid #1a1917;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,0.5);">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 21h12"/><path d="M7 21v-8a5 5 0 0 1 10 0v8"/><path d="M12 7v4"/><path d="M10 9h4"/>
              </svg>
            </div>`,
            className: "", iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -38],
          });
          const popup = `<div style="padding:10px;font-family:system-ui;background:#1a1917;border-radius:8px;min-width:140px;">
            <b style="color:#f5f2ed;">${c.name}</b>
            ${c.wikipedia ? `<br/><a href="${c.wikipedia}" target="_blank" style="color:#c9a84c;font-size:12px;">Wikipedia →</a>` : ""}
          </div>`;
          L.marker([c.lat, c.lng], { icon }).addTo(layer).bindPopup(popup);
        });
      }

      if (manualRelatives) {
        manualRelatives.forEach((g) => {
          const relIcon = L.divIcon({
            html: `<div style="width:30px;height:30px;background:linear-gradient(135deg,#7c5cbf,#5b3fa0);border-radius:50%;border:2px solid #1a1917;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.5);">👤</div>`,
            className: "", iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15],
          });
          const name = g.extracted.name || "Unknown";
          const cemetery = g.location?.cemetery || "";
          const html = `<div style="font-family:system-ui;min-width:160px;padding:12px;background:#1a1917;border-radius:10px;">
            <p style="font-family:Georgia,serif;font-size:15px;font-weight:600;color:#f5f2ed;margin:0 0 4px;">${name}</p>
            ${cemetery ? `<p style="font-size:11px;color:#c9a84c;margin:0;">${cemetery}</p>` : ""}
            <img src="${g.photoDataUrl}" style="width:100%;height:72px;object-fit:cover;border-radius:6px;margin-top:6px;" />
          </div>`;
          L.marker([g.location.lat, g.location.lng], { icon: relIcon }).addTo(layer).bindPopup(html);
        });
      }
    });
  }, [notableFigures, manualFigures, manualCemeteries, manualRelatives]);

  // ── Handle Find / Clear triggered from parent ─────────────────────────────
  useEffect(() => {
    if (findTrigger > 0) handleFind();
    if (findTrigger === -1) clearFind();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findTrigger]);

  const handleFind = async () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    setIsSearching(true);
    try {
      const center = map.getCenter();
      const lat = center.lat;
      const lng = center.lng;
      const latDelta = findRadius / 69;
      const lngDelta = findRadius / (69 * Math.cos((lat * Math.PI) / 180));
      const s = lat - latDelta; const n = lat + latDelta;
      const w = lng - lngDelta; const e = lng + lngDelta;

      const promises: Promise<void>[] = [];

      if (findType === "all" || findType === "cemeteries") {
        promises.push(fetchCemeteriesInBounds(s, w, n, e).then(setManualCemeteries));
      } else {
        setManualCemeteries(null);
      }

      if (findType !== "relatives" && findType !== "cemeteries") {
        promises.push(
          getNotableFiguresInBounds(s, w, n, e).then((figs) => {
            setManualFigures(
              findType === "all" || findType === "other"
                ? figs
                : figs.filter((f) => f.category === findType)
            );
          })
        );
      } else {
        setManualFigures(null);
      }

      if (findType === "all" || findType === "relatives") {
        setManualRelatives(
          allGraves.filter(
            (g) =>
              g.location?.lat &&
              g.location.lat >= s && g.location.lat <= n &&
              g.location.lng >= w && g.location.lng <= e &&
              (g.tags || []).some((t) => RELATIVE_TAGS.includes(t.toLowerCase()))
          )
        );
      } else {
        setManualRelatives(null);
      }

      await Promise.all(promises);
      map.fitBounds([[s, w], [n, e]], { padding: [20, 20] });
    } finally {
      setIsSearching(false);
    }
  };

  const clearFind = () => {
    setManualFigures(null);
    setManualCemeteries(null);
    setManualRelatives(null);
    setNotableFigures([]);
    onClearFind();
  };

  const handleMyLocation = async () => {
    const map = mapInstanceRef.current;
    if (!map || locating) return;
    setLocating(true);
    try {
      const pos = await getUserLocation();
      if (pos) {
        map.setView(pos, 15, { animate: true });
        if (userMarkerRef.current) {
          userMarkerRef.current.setLatLng(pos);
        }
      }
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden h-screen">
      <div ref={mapRef} className="w-full h-full relative z-0" />

      {/* My Location button */}
      <button
        onClick={handleMyLocation}
        disabled={locating}
        aria-label="My location"
        className="absolute bottom-28 right-4 z-[1000] w-11 h-11 rounded-full flex items-center justify-center shadow-xl transition-all active:scale-95 disabled:opacity-60"
        style={{ background: "#1a1917", border: "2px solid #2e2b28" }}
      >
        {locating ? (
          <div className="w-4 h-4 border-2 border-stone-500 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            <circle cx="12" cy="12" r="9" strokeOpacity="0.3" />
          </svg>
        )}
      </button>

      {/* Searching indicator */}
      {isSearching && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-[1002] flex justify-center pointer-events-none">
          <div className="bg-stone-900/95 border border-stone-800 px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-4 backdrop-blur-xl">
            <div className="w-5 h-5 border-2 border-stone-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-stone-100 font-serif text-sm">Scanning radius…</p>
          </div>
        </div>
      )}
    </div>
  );
}
