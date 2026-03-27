"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { GraveRecord } from "@/types";

export default function ArchiveMap({ graves }: { graves: GraveRecord[] }) {
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

      const validGraves = graves.filter(
        (g) => g.location?.lat && g.location?.lng
      );

      const center: [number, number] =
        validGraves.length > 0
          ? [validGraves[0].location.lat, validGraves[0].location.lng]
          : [39.8283, -98.5795];

      const zoom = validGraves.length > 0 ? 14 : 5;

      const map = L.map(mapRef.current!, {
        center,
        zoom,
        zoomControl: true,
      });

      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Custom gold teardrop pin
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

      validGraves.forEach((grave) => {
        const { name, birthDate, deathDate } = grave.extracted;
        const dateStr = [birthDate, deathDate].filter(Boolean).join(" — ");
        const cemetery = grave.location.cemetery ?? "";

        const popupHtml = `
          <div style="font-family:system-ui;min-width:160px;">
            <p style="font-family:Georgia,serif;font-size:15px;font-weight:600;color:#f5f2ed;margin:0 0 4px;">${name || "Unknown"}</p>
            ${dateStr ? `<p style="font-size:12px;color:#8a8580;margin:0 0 2px;">${dateStr}</p>` : ""}
            ${cemetery ? `<p style="font-size:11px;color:#5a5550;margin:0 0 6px;">${cemetery}</p>` : ""}
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

      // Leaflet needs a concrete container size — call invalidateSize after
      // the browser has painted so flex/dvh dimensions have resolved.
      requestAnimationFrame(() => {
        if (!cancelled) map.invalidateSize();
      });
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
      {/*
        Leaflet requires an explicit pixel height — flex-1 alone isn't enough.
        We account for header (~56px) + stats bar (~40px) + bottom nav (~64px).
      */}
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
        <p className="text-stone-500 text-xs text-center">
          {graves.length} grave{graves.length !== 1 ? "s" : ""} documented
          {graves.filter((g) => g.location?.lat).length < graves.length &&
            ` · ${graves.filter((g) => !g.location?.lat).length} without location`}
        </p>
      </div>
    </div>
  );
}
