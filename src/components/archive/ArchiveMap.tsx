"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GraveRecord, NotableFigure } from "@/types";
import { getNotableFiguresInBounds } from "@/lib/apis/wikidata";
import { formatOpeningHours } from "@/lib/apis/cemetery";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CemeteryFeature {
  lat: number;
  lng: number;
  name: string;
  osmId?: string;
  openingHours?: string;
  phone?: string;
  website?: string;
  wikipedia?: string;
}

interface HeritagePlace {
  lat: number;
  lng: number;
  name: string;
  type: string;
  wikipedia?: string;
}

export type SearchType = "all" | "cemeteries" | "political" | "military" | "artist" | "musician" | "actor" | "relatives" | "other";
const RELATIVE_TAGS = ["family", "relative", "ancestor", "kin", "grandparent", "parent", "mother", "father"];

// ── Icon SVGs ─────────────────────────────────────────────────────────────────

const GRAVE_ICON_HTML = `
<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.6))">
  <rect x="2" y="14" width="24" height="18" rx="2" fill="#c9a84c"/>
  <path d="M2 16 Q2 2 14 2 Q26 2 26 16" fill="#c9a84c"/>
  <line x1="14" y1="6" x2="14" y2="12" stroke="#1a1917" stroke-width="2" stroke-linecap="round"/>
  <line x1="10" y1="9" x2="18" y2="9" stroke="#1a1917" stroke-width="2" stroke-linecap="round"/>
  <rect x="10" y="20" width="8" height="9" rx="1" fill="#1a1917" opacity="0.3"/>
</svg>`.trim();

// ── Zoom-tier helpers ─────────────────────────────────────────────────────────

function wikidataMinSitelinks(zoom: number): number {
  if (zoom >= 13) return 2;
  if (zoom >= 10) return 15;
  if (zoom >= 8)  return 40;
  return 75;
}

// ── Overpass: cemeteries ──────────────────────────────────────────────────────

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
      const osmId = `${el.type}/${el.id}`;
      const openingHours = el.tags?.opening_hours;
      const phone = el.tags?.phone ?? el.tags?.["contact:phone"];
      const website = el.tags?.website ?? el.tags?.["contact:website"] ?? el.tags?.url;
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (!lat || !lng) continue;
      const wikiRaw: string | undefined = el.tags?.wikipedia;
      const wikipedia = wikiRaw
        ? `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiRaw.replace(/^en:/, "").replace(/ /g, "_"))}`
        : undefined;
      results.push({ lat, lng, name, osmId, openingHours, phone, website, wikipedia });
    }
    const seen = new Set<string>();
    return results.filter((c) => { if (seen.has(c.name)) return false; seen.add(c.name); return true; });
  } catch {
    return [];
  }
}

// ── Overpass: heritage/historic sites (zoom-tiered) ──────────────────────────

async function fetchHeritageInBounds(
  south: number,
  west: number,
  north: number,
  east: number,
  zoom: number
): Promise<HeritagePlace[]> {
  const bb = `(${south},${west},${north},${east})`;

  let filters: string;
  if (zoom >= 13) {
    // Local: all historic tags
    filters = `
      node["historic"]${bb};
      way["historic"]${bb};
      node["memorial"]${bb};`;
  } else if (zoom >= 10) {
    // Regional: named significant sites only
    filters = `
      node["historic"~"battlefield|monument|memorial|fort|castle|ruins"]${bb};
      way["historic"~"battlefield|monument|memorial|fort|castle|ruins"]${bb};
      node["heritage"]${bb};
      way["heritage"]${bb};`;
  } else {
    // State: nationally significant only
    filters = `
      node["historic"="battlefield"]${bb};
      way["historic"="battlefield"]${bb};
      node["heritage"="1"]${bb};
      way["heritage"="1"]${bb};`;
  }

  const query = `[out:json][timeout:12];\n(\n${filters}\n);\nout center tags;`.trim();

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];

    const data = await res.json();
    const results: HeritagePlace[] = [];
    const seen = new Set<string>();

    for (const el of data.elements ?? []) {
      const name = el.tags?.name;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (!lat || !lng) continue;
      const type = el.tags?.historic ?? el.tags?.memorial ?? "heritage";
      const wikiRaw: string | undefined = el.tags?.wikipedia;
      const wikipedia = wikiRaw
        ? `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiRaw.replace(/^en:/, "").replace(/ /g, "_"))}`
        : undefined;
      results.push({ lat, lng, name, type, wikipedia });
    }
    return results;
  } catch {
    return [];
  }
}

// ── Geolocation helper ────────────────────────────────────────────────────────

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

// ── Heritage icon emoji map ───────────────────────────────────────────────────

const HERITAGE_ICONS: Record<string, string> = {
  battlefield: "⚔️",
  monument: "🗿",
  memorial: "🕊️",
  fort: "🏰",
  castle: "🏰",
  ruins: "🏺",
  heritage: "🏛️",
};

function heritageIcon(type: string): string {
  return HERITAGE_ICONS[type.toLowerCase()] ?? "🏛️";
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
  const leafletRef = useRef<any>(null);
  const graveLayerRef = useRef<any>(null);
  const overlayLayerRef = useRef<any>(null);
  const autoFetchTimerRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const hasManualResultsRef = useRef(false);

  // Auto-discovery state
  const [autoFigures, setAutoFigures] = useState<NotableFigure[]>([]);
  const [autoHeritagePlaces, setAutoHeritagePlaces] = useState<HeritagePlace[]>([]);

  // Manual search state
  const [isSearching, setIsSearching] = useState(false);
  const [manualFigures, setManualFigures] = useState<NotableFigure[] | null>(null);
  const [manualCemeteries, setManualCemeteries] = useState<CemeteryFeature[] | null>(null);
  const [manualRelatives, setManualRelatives] = useState<GraveRecord[] | null>(null);

  const [locating, setLocating] = useState(false);

  const hasManualResults = !!(manualFigures || manualCemeteries || manualRelatives);

  useEffect(() => { hasManualResultsRef.current = hasManualResults; }, [hasManualResults]);
  useEffect(() => { onSearchStateChange(isSearching, hasManualResults); }, [isSearching, hasManualResults, onSearchStateChange]);

  // ── Map initialisation (runs once) ───────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default ?? await import("leaflet");
      leafletRef.current = L;
      if (cancelled || !mapRef.current) return;

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({ iconUrl: "", shadowUrl: "" });

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

      graveLayerRef.current = L.layerGroup().addTo(map);
      overlayLayerRef.current = L.layerGroup().addTo(map);

      // User location dot
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

      // ── Auto-discovery on move (zoom-tiered) ────────────────────────────────
      const runAutoDiscovery = () => {
        if (hasManualResultsRef.current) return;
        if (autoFetchTimerRef.current) clearTimeout(autoFetchTimerRef.current);
        autoFetchTimerRef.current = setTimeout(async () => {
          if (cancelled || hasManualResultsRef.current) return;

          const z = map.getZoom();

          // Nothing useful to show at very wide national zoom
          if (z < 6) {
            setAutoFigures([]);
            setAutoHeritagePlaces([]);
            return;
          }

          const b = map.getBounds();
          const sw = b.getSouthWest();
          const ne = b.getNorthEast();
          const minLinks = wikidataMinSitelinks(z);

          const tasks: Promise<void>[] = [];

          // Wikidata notable buried figures (all zoom levels ≥ 6)
          tasks.push(
            getNotableFiguresInBounds(sw.lat, sw.lng, ne.lat, ne.lng, minLinks)
              .then((figs) => { if (!cancelled) setAutoFigures(figs); })
              .catch(() => {})
          );

          // Overpass heritage — skip at very wide bounds (zoom < 8) to avoid timeouts
          if (z >= 8) {
            tasks.push(
              fetchHeritageInBounds(sw.lat, sw.lng, ne.lat, ne.lng, z)
                .then((places) => { if (!cancelled) setAutoHeritagePlaces(places); })
                .catch(() => {})
            );
          } else {
            setAutoHeritagePlaces([]);
          }

          await Promise.all(tasks);
        }, 600);
      };

      map.on("moveend", runAutoDiscovery);
      runAutoDiscovery();
    })();

    return () => {
      cancelled = true;
      if (autoFetchTimerRef.current) clearTimeout(autoFetchTimerRef.current);
      if (watchIdRef.current !== null) navigator.geolocation?.clearWatch(watchIdRef.current);
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
      graveLayerRef.current = null;
      overlayLayerRef.current = null;
      userMarkerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Grave marker layer ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = graveLayerRef.current;
    const L = leafletRef.current;
    if (!map || !layer || !L) return;

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
      const popup = `
        <div style="font-family:system-ui;min-width:160px;padding:12px;background:#1a1917;border-radius:10px;">
          <p style="font-family:Georgia,serif;font-size:15px;font-weight:600;color:#f5f2ed;margin:0 0 2px;">${name}</p>
          ${dates ? `<p style="font-size:11px;color:#c9a84c;margin:0 0 6px;">${dates}</p>` : ""}
          <img src="${grave.photoDataUrl}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;" />
        </div>`;
      L.marker([grave.location.lat, grave.location.lng], { icon: graveIcon })
        .addTo(layer)
        .bindPopup(popup);
    });

    if (validGraves.length > 1 && map.getZoom() <= 5) {
      const bounds = L.latLngBounds(validGraves.map((g) => [g.location.lat, g.location.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [graves]);

  // ── Overlay layer: auto + manual results ──────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = overlayLayerRef.current;
    const L = leafletRef.current;
    if (!map || !layer || !L) return;

    layer.clearLayers();

    const figureIconMap: Record<string, string> = {
      political: "🏛️", military: "⚔️", artist: "🎨",
      musician: "🎵", actor: "🎭", other: "📍",
    };

    const makeCircleIcon = (emoji: string, bg = "#1a1917", border = "#2e2b28") =>
      L.divIcon({
        html: `<div style="width:32px;height:32px;background:${bg};border-radius:50%;border:2px solid ${border};display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 2px 8px rgba(0,0,0,0.4);">${emoji}</div>`,
        className: "", iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -16],
      });

    if (!hasManualResults) {
      // ── Auto: Wikidata buried figures ─────────────────────────────────────
      autoFigures.forEach((n: NotableFigure) => {
        const icon = makeCircleIcon(figureIconMap[n.category] ?? "📍");
        const html = `<div style="font-family:system-ui;min-width:180px;padding:14px;background:#1a1917;border-radius:10px;">
          <p style="font-family:Georgia,serif;font-size:15px;font-weight:600;color:#f5f2ed;margin:0;">${n.label}</p>
          <p style="font-size:11px;color:#c9a84c;margin-top:2px;">${n.occupationLabel || n.category}</p>
          ${n.wikipediaUrl ? `<a href="${n.wikipediaUrl}" target="_blank" style="display:block;margin-top:10px;padding:8px;background:#c9a84c;color:#1a1917;text-align:center;border-radius:8px;font-weight:bold;text-decoration:none;">Wikipedia →</a>` : ""}
        </div>`;
        L.marker([n.lat, n.lng], { icon }).addTo(layer).bindPopup(html);
      });

      // ── Auto: Overpass heritage sites ─────────────────────────────────────
      autoHeritagePlaces.forEach((h: HeritagePlace) => {
        const icon = makeCircleIcon(heritageIcon(h.type), "#2e2b28", "#3a3733");
        const html = `<div style="font-family:system-ui;min-width:160px;padding:12px;background:#1a1917;border-radius:10px;">
          <p style="font-family:Georgia,serif;font-size:15px;font-weight:600;color:#f5f2ed;margin:0;">${h.name}</p>
          <p style="font-size:11px;color:#c9a84c;margin-top:2px;text-transform:capitalize;">${h.type}</p>
          ${h.wikipedia ? `<a href="${h.wikipedia}" target="_blank" style="display:block;margin-top:10px;padding:8px;background:#c9a84c;color:#1a1917;text-align:center;border-radius:8px;font-weight:bold;text-decoration:none;font-size:13px;">Wikipedia →</a>` : ""}
        </div>`;
        L.marker([h.lat, h.lng], { icon }).addTo(layer).bindPopup(html);
      });
    }

    // ── Manual search results ───────────────────────────────────────────────
    if (manualFigures) {
      manualFigures.forEach((n: NotableFigure) => {
        const icon = makeCircleIcon(figureIconMap[n.category] ?? "📍");
        const html = `<div style="font-family:system-ui;min-width:180px;padding:14px;background:#1a1917;border-radius:10px;">
          <p style="font-family:Georgia,serif;font-size:15px;font-weight:600;color:#f5f2ed;margin:0;">${n.label}</p>
          <p style="font-size:11px;color:#c9a84c;margin-top:2px;">${n.occupationLabel || n.category}</p>
          ${n.wikipediaUrl ? `<a href="${n.wikipediaUrl}" target="_blank" style="display:block;margin-top:10px;padding:8px;background:#c9a84c;color:#1a1917;text-align:center;border-radius:8px;font-weight:bold;text-decoration:none;">Wikipedia →</a>` : ""}
        </div>`;
        L.marker([n.lat, n.lng], { icon }).addTo(layer).bindPopup(html);
      });
    }

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

        const hoursLine = c.openingHours
          ? `<div style="display:flex;align-items:flex-start;gap:6px;margin-top:6px;">
               <span style="font-size:13px;flex-shrink:0;">🕐</span>
               <span style="font-size:11px;color:#a09585;line-height:1.4;">${formatOpeningHours(c.openingHours)}</span>
             </div>`
          : "";

        const phoneLine = c.phone
          ? `<div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
               <span style="font-size:13px;">📞</span>
               <a href="tel:${c.phone}" style="font-size:11px;color:#c9a84c;text-decoration:none;">${c.phone}</a>
             </div>`
          : "";

        const appleUrl = `https://maps.apple.com/?q=${encodeURIComponent(c.name)}&ll=${c.lat},${c.lng}`;
        const googleUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.name)}&center=${c.lat},${c.lng}`;

        const popup = `
          <div style="font-family:system-ui;min-width:220px;max-width:260px;padding:14px;background:#1a1917;border-radius:10px;">
            <p style="font-family:Georgia,serif;font-size:15px;font-weight:600;color:#f5f2ed;margin:0 0 2px;">${c.name}</p>
            <p style="font-size:10px;color:#6a6560;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px;">Cemetery</p>
            ${hoursLine}
            ${phoneLine}
            <div style="display:flex;gap:6px;margin-top:10px;">
              <a href="${appleUrl}" target="_blank"
                 style="flex:1;padding:7px 4px;background:#2e2b28;color:#f5f2ed;text-align:center;border-radius:8px;font-size:11px;font-weight:600;text-decoration:none;border:1px solid #3a3733;">
                🍎 Apple Maps
              </a>
              <a href="${googleUrl}" target="_blank"
                 style="flex:1;padding:7px 4px;background:#2e2b28;color:#f5f2ed;text-align:center;border-radius:8px;font-size:11px;font-weight:600;text-decoration:none;border:1px solid #3a3733;">
                🗺 Google Maps
              </a>
            </div>
            ${c.wikipedia ? `<a href="${c.wikipedia}" target="_blank" style="display:block;margin-top:6px;padding:6px;background:#c9a84c;color:#1a1917;text-align:center;border-radius:8px;font-size:11px;font-weight:700;text-decoration:none;">Wikipedia →</a>` : ""}
          </div>`;
        L.marker([c.lat, c.lng], { icon }).addTo(layer).bindPopup(popup, { maxWidth: 280 });
      });
    }


    if (manualRelatives) {
      manualRelatives.forEach((g) => {
        const icon = makeCircleIcon("👤", "linear-gradient(135deg,#7c5cbf,#5b3fa0)", "#1a1917");
        const name = g.extracted.name || "Unknown";
        const cemetery = g.location?.cemetery || "";
        const html = `<div style="font-family:system-ui;min-width:160px;padding:12px;background:#1a1917;border-radius:10px;">
          <p style="font-family:Georgia,serif;font-size:15px;font-weight:600;color:#f5f2ed;margin:0 0 4px;">${name}</p>
          ${cemetery ? `<p style="font-size:11px;color:#c9a84c;margin:0;">${cemetery}</p>` : ""}
          <img src="${g.photoDataUrl}" style="width:100%;height:72px;object-fit:cover;border-radius:6px;margin-top:6px;" />
        </div>`;
        L.marker([g.location.lat, g.location.lng], { icon }).addTo(layer).bindPopup(html);
      });
    }
  }, [autoFigures, autoHeritagePlaces, manualFigures, manualCemeteries, manualRelatives, hasManualResults]);

  // ── Manual search trigger ─────────────────────────────────────────────────────
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
      const lat = center.lat; const lng = center.lng;
      const latDelta = findRadius / 69;
      const lngDelta = findRadius / (69 * Math.cos((lat * Math.PI) / 180));
      const s = lat - latDelta; const n = lat + latDelta;
      const w = lng - lngDelta; const e = lng + lngDelta;
      const zoom = map.getZoom();

      const promises: Promise<void>[] = [];

      if (findType === "all" || findType === "cemeteries") {
        promises.push(fetchCemeteriesInBounds(s, w, n, e).then(setManualCemeteries));
      } else {
        setManualCemeteries(null);
      }

      if (findType !== "relatives" && findType !== "cemeteries") {
        promises.push(
          getNotableFiguresInBounds(s, w, n, e, wikidataMinSitelinks(zoom)).then((figs) => {
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
    setAutoFigures([]);
    setAutoHeritagePlaces([]);
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
        if (userMarkerRef.current) userMarkerRef.current.setLatLng(pos);
      }
    } finally {
      setLocating(false);
    }
  };

  // ── Legend entries — derived from active state ────────────────────────────
  const legendItems = useMemo(() => {
    const items: { icon: React.ReactNode; label: string }[] = [];

    const activeFigures = hasManualResults ? manualFigures ?? [] : autoFigures;
    const activeHeritage = hasManualResults ? [] : autoHeritagePlaces;

    const validGraves = graves.filter((g) => g.location?.lat && g.location?.lng);
    if (validGraves.length > 0) {
      items.push({
        icon: (
          <svg width="14" height="18" viewBox="0 0 28 36" fill="none">
            <rect x="2" y="14" width="24" height="18" rx="2" fill="#c9a84c"/>
            <path d="M2 16 Q2 2 14 2 Q26 2 26 16" fill="#c9a84c"/>
            <line x1="14" y1="6" x2="14" y2="12" stroke="#1a1917" strokeWidth="2" strokeLinecap="round"/>
            <line x1="10" y1="9" x2="18" y2="9" stroke="#1a1917" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        ),
        label: "Your graves",
      });
    }

    if (userMarkerRef.current) {
      items.push({
        icon: <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#4a90e2", border: "2px solid #fff", boxShadow: "0 0 0 3px rgba(74,144,226,0.3)" }} />,
        label: "Your location",
      });
    }

    // Figure categories present
    const figCategories = new Set(activeFigures.map((f) => f.category));
    const figCategoryMap: Record<string, string> = {
      political: "🏛️  Political figures",
      military:  "⚔️  Military figures",
      artist:    "🎨  Artists",
      musician:  "🎵  Musicians",
      actor:     "🎭  Actors",
      other:     "📍  Notable buried figures",
    };
    for (const cat of ["political", "military", "artist", "musician", "actor", "other"]) {
      if (figCategories.has(cat as any)) {
        items.push({ icon: <span style={{ fontSize: 14 }}>{figCategoryMap[cat].split("  ")[0]}</span>, label: figCategoryMap[cat].split("  ")[1] });
      }
    }

    // Heritage types present
    const heritageTypes = new Set(activeHeritage.map((h) => h.type.toLowerCase()));
    const heritageLabels: Record<string, string> = {
      battlefield: "⚔️  Battlefield",
      monument:    "🗿  Monument",
      memorial:    "🕊️  Memorial",
      fort:        "🏰  Fort / Castle",
      castle:      "🏰  Fort / Castle",
      ruins:       "🏺  Ruins",
      heritage:    "🏛️  Heritage site",
    };
    const shownHeritage = new Set<string>();
    for (const type of heritageTypes) {
      const label = heritageLabels[type];
      if (label && !shownHeritage.has(label)) {
        shownHeritage.add(label);
        items.push({ icon: <span style={{ fontSize: 14 }}>{label.split("  ")[0]}</span>, label: label.split("  ")[1] });
      }
    }

    if (manualCemeteries && manualCemeteries.length > 0) {
      items.push({
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 21h12"/><path d="M7 21v-8a5 5 0 0 1 10 0v8"/><path d="M12 7v4"/><path d="M10 9h4"/>
          </svg>
        ),
        label: "Cemeteries",
      });
    }

    if (manualRelatives && manualRelatives.length > 0) {
      items.push({ icon: <span style={{ fontSize: 13 }}>👤</span>, label: "Tagged relatives" });
    }

    return items;
  }, [graves, autoFigures, autoHeritagePlaces, manualFigures, manualCemeteries, manualRelatives, hasManualResults]);

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden h-screen">
      <div ref={mapRef} className="w-full h-full relative z-0" />

      {/* Legend */}
      {legendItems.length > 0 && (
        <div
          className="absolute bottom-28 left-4 z-[1000] rounded-xl px-3 py-2 flex flex-col gap-1.5"
          style={{ background: "rgba(26,25,23,0.88)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(8px)" }}
        >
          {legendItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-5 flex items-center justify-center shrink-0">{item.icon}</div>
              <span className="text-stone-300 text-[11px] font-medium">{item.label}</span>
            </div>
          ))}
        </div>
      )}

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
