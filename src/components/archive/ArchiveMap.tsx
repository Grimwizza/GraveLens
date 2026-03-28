"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { GraveRecord } from "@/types";

interface CemeteryFeature {
  lat: number;
  lng: number;
  name: string;
  wikipedia?: string;
}

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

    // Ways have lat/lng directly; relations expose a "center" object
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

  // Deduplicate by name (multiple OSM elements can cover same cemetery)
  const seen = new Set<string>();
  return results.filter((c) => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });
}

// ── Haversine distance (km) ───────────────────────────────────────────────

function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Component ─────────────────────────────────────────────────────────────

export default function ArchiveMap({
  graves,
  allGraves,
}: {
  graves: GraveRecord[];
  allGraves: GraveRecord[];
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current || mapInstanceRef.current) return;

      // Fix default marker icon paths broken by webpack/turbopack
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      // Inject dark popup styles once
      if (!document.getElementById("gl-leaflet-dark")) {
        const style = document.createElement("style");
        style.id = "gl-leaflet-dark";
        style.textContent = `
          .leaflet-popup-content-wrapper {
            background: #242220 !important;
            color: #f5f2ed !important;
            border: 1px solid #2e2b28 !important;
            border-radius: 12px !important;
            box-shadow: 0 4px 24px rgba(0,0,0,0.6) !important;
            padding: 0 !important;
          }
          .leaflet-popup-content { margin: 0 !important; }
          .leaflet-popup-tip { background: #242220 !important; }
          .leaflet-popup-close-button {
            color: #8a8580 !important;
            top: 8px !important; right: 10px !important;
            font-size: 18px !important;
          }
        `;
        document.head.appendChild(style);
      }

      const validGraves = graves.filter(
        (g) => g.location?.lat && g.location?.lng
      );

      const center: [number, number] =
        validGraves.length > 0
          ? [validGraves[0].location.lat, validGraves[0].location.lng]
          : [39.8283, -98.5795];

      const zoom = validGraves.length > 0 ? 14 : 5;

      const map = L.map(mapRef.current!, { center, zoom, zoomControl: true });
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // ── Grave marker icon (gold teardrop) ──────────────────────────────
      const graveIcon = L.divIcon({
        html: `<div style="
          width:28px;height:28px;
          background:linear-gradient(135deg,#c9a84c,#a07830);
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          border:2px solid #1a1917;
          box-shadow:0 2px 8px rgba(0,0,0,0.5);
        "></div>`,
        className: "",
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -32],
      });

      // ── Cemetery icon (sage-green square with arch) ────────────────────
      const cemeteryIcon = L.divIcon({
        html: `<div style="
          width:34px;height:34px;
          background:linear-gradient(135deg,#5a7a52,#3d5938);
          border-radius:8px;
          border:2px solid #1a1917;
          box-shadow:0 2px 10px rgba(0,0,0,0.55);
          display:flex;align-items:center;justify-content:center;
        ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.75" stroke-linecap="round">
            <path d="M3 21V10l9-7 9 7v11"/>
            <path d="M9 21v-6h6v6"/>
            <path d="M12 3v4"/>
          </svg>
        </div>`,
        className: "",
        iconSize: [34, 34],
        iconAnchor: [17, 34],
        popupAnchor: [0, -38],
      });

      // ── Grave markers ──────────────────────────────────────────────────
      validGraves.forEach((grave) => {
        const { name, birthDate, deathDate } = grave.extracted;
        const dateStr = [birthDate, deathDate].filter(Boolean).join(" — ");
        const cemetery = grave.location.cemetery ?? "";

        const popupHtml = `
          <div style="font-family:system-ui;min-width:160px;padding:12px;">
            <p style="font-family:Georgia,serif;font-size:15px;font-weight:600;color:#f5f2ed;margin:0 0 4px;">${name || "Unknown"}</p>
            ${dateStr ? `<p style="font-size:12px;color:#8a8580;margin:0 0 2px;">${dateStr}</p>` : ""}
            ${cemetery ? `<p style="font-size:11px;color:#5c5854;margin:0 0 8px;">${cemetery}</p>` : ""}
            <img src="${grave.photoDataUrl}" alt="${name}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;" />
          </div>`;

        L.marker([grave.location.lat, grave.location.lng], { icon: graveIcon })
          .addTo(map)
          .bindPopup(popupHtml, { maxWidth: 220 });
      });

      if (validGraves.length > 1) {
        const bounds = L.latLngBounds(
          validGraves.map(
            (g) => [g.location.lat, g.location.lng] as [number, number]
          )
        );
        map.fitBounds(bounds, { padding: [40, 40] });
      }

      requestAnimationFrame(() => {
        if (!cancelled) map.invalidateSize();
      });

      // ── Cemetery overlay (Overpass) ────────────────────────────────────
      // Use ALL graves (not filtered) for the bounding box so cemetery
      // markers are stable regardless of the active search filter.
      const sourceGraves = (allGraves.length > 0 ? allGraves : graves).filter(
        (g) => g.location?.lat && g.location?.lng
      );

      if (sourceGraves.length > 0) {
        const lats = sourceGraves.map((g) => g.location.lat);
        const lngs = sourceGraves.map((g) => g.location.lng);
        const pad = 0.06; // ~6 km padding
        const south = Math.min(...lats) - pad;
        const north = Math.max(...lats) + pad;
        const west  = Math.min(...lngs) - pad;
        const east  = Math.max(...lngs) + pad;

        fetchCemeteriesInBounds(south, west, north, east)
          .then((cemeteries) => {
            if (cancelled) return;

            cemeteries.forEach((c) => {
              // Count user's documented graves within 1 km of this cemetery centre
              const gravesHere = allGraves.filter(
                (g) =>
                  g.location?.lat &&
                  haversineKm(g.location.lat, g.location.lng, c.lat, c.lng) <= 1
              ).length;

              const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=driving`;
              const appleUrl  = `https://maps.apple.com/?daddr=${c.lat},${c.lng}&dirflg=d`;

              const popupHtml = `
                <div style="font-family:system-ui;min-width:190px;padding:14px 14px 10px;">
                  <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                    <div style="width:8px;height:8px;border-radius:2px;background:#5a7a52;flex-shrink:0;"></div>
                    <p style="font-family:Georgia,serif;font-size:15px;font-weight:600;color:#f5f2ed;margin:0;line-height:1.2;">${c.name}</p>
                  </div>
                  ${gravesHere > 0
                    ? `<p style="font-size:11px;color:#c9a84c;margin:0 0 8px;">${gravesHere} grave${gravesHere !== 1 ? "s" : ""} documented here</p>`
                    : `<p style="font-size:11px;color:#5c5854;margin:0 0 8px;">No graves documented yet</p>`
                  }
                  ${c.wikipedia
                    ? `<a href="${c.wikipedia}" target="_blank" rel="noopener" style="display:block;font-size:11px;color:#8a8580;text-decoration:underline;margin-bottom:10px;">Wikipedia →</a>`
                    : ""
                  }
                  <div style="display:flex;gap:6px;">
                    <a href="${appleUrl}" target="_blank" rel="noopener" style="
                      flex:1;display:flex;align-items:center;justify-content:center;gap:4px;
                      padding:7px 8px;border-radius:8px;text-decoration:none;font-size:11px;font-weight:600;
                      background:#2e2b28;color:#f5f2ed;border:1px solid #3a3633;
                    ">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 11 7 11s7-5.75 7-11c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                      Apple Maps
                    </a>
                    <a href="${googleUrl}" target="_blank" rel="noopener" style="
                      flex:1;display:flex;align-items:center;justify-content:center;gap:4px;
                      padding:7px 8px;border-radius:8px;text-decoration:none;font-size:11px;font-weight:600;
                      background:#2e2b28;color:#f5f2ed;border:1px solid #3a3633;
                    ">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 11 7 11s7-5.75 7-11c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                      Google Maps
                    </a>
                  </div>
                </div>`;

              L.marker([c.lat, c.lng], { icon: cemeteryIcon })
                .addTo(map)
                .bindPopup(popupHtml, { maxWidth: 260 });
            });
          })
          .catch(() => {/* Overpass unavailable — silently skip cemetery overlay */});
      }
    });

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapInstanceRef.current as any).remove();
        mapInstanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graves]);

  const hasNoLocation = graves.every((g) => !g.location?.lat || !g.location?.lng);

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden">
      <div
        ref={mapRef}
        style={{ height: "calc(100dvh - 160px)", width: "100%" }}
      />

      {hasNoLocation && (
        <div className="absolute inset-0 flex items-center justify-center bg-stone-900/80 backdrop-blur-sm">
          <p className="text-stone-400 text-sm text-center leading-relaxed px-8">
            No location data found for saved markers.
            <br />
            Photos taken with a GPS-enabled device will appear on the map.
          </p>
        </div>
      )}

      <div className="bg-stone-900 border-t border-stone-800 px-5 py-3 shrink-0">
        <div className="flex items-center justify-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ background: "linear-gradient(135deg,#c9a84c,#a07830)" }} />
            <p className="text-stone-500 text-xs">
              {graves.length} grave{graves.length !== 1 ? "s" : ""}
              {graves.filter((g) => g.location?.lat).length < graves.length &&
                ` · ${graves.filter((g) => !g.location?.lat).length} without GPS`}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: "#5a7a52" }} />
            <p className="text-stone-500 text-xs">Cemeteries from OSM</p>
          </div>
        </div>
      </div>
    </div>
  );
}
