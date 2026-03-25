"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import BottomNav from "@/components/layout/BottomNav";
import { getAllGraves, deleteGrave } from "@/lib/storage";
import type { GraveRecord } from "@/types";
import Link from "next/link";

// Dynamically import the map to avoid SSR issues with Leaflet
const ArchiveMap = dynamic(() => import("./ArchiveMap"), { ssr: false });

type ViewMode = "map" | "list";

export default function ArchivePage() {
  const [graves, setGraves] = useState<GraveRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("map");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    getAllGraves().then((g) => {
      setGraves(g);
      setLoading(false);
    });
  }, []);

  const handleDelete = async (id: string) => {
    await deleteGrave(id);
    setGraves((prev) => prev.filter((g) => g.id !== id));
    setDeleteConfirm(null);
  };

  return (
    <div className="flex flex-col min-h-dvh bg-stone-900">
      {/* Header */}
      <header
        className="flex items-center justify-between px-5 py-3 bg-stone-900 sticky top-0 z-30 border-b border-stone-800"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
            <path d="M11 2L11 4M11 18L11 20M4 11L2 11M20 11L18 11" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="11" cy="11" r="4" stroke="#c9a84c" strokeWidth="1.5" />
          </svg>
          <span className="font-serif text-stone-100 text-lg font-semibold">
            Archive
          </span>
          {graves.length > 0 && (
            <span className="text-xs text-stone-500 ml-1">
              ({graves.length} {graves.length === 1 ? "marker" : "markers"})
            </span>
          )}
        </div>

        {/* View toggle */}
        {graves.length > 0 && (
          <div className="flex bg-stone-800 rounded-lg p-0.5">
            <button
              onClick={() => setView("map")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                view === "map"
                  ? "bg-stone-700 text-stone-100"
                  : "text-stone-500"
              }`}
            >
              Map
            </button>
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                view === "list"
                  ? "bg-stone-700 text-stone-100"
                  : "text-stone-500"
              }`}
            >
              List
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col pb-20">
        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <div className="w-6 h-6 border-2 border-gold-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : graves.length === 0 ? (
          <EmptyState />
        ) : view === "map" ? (
          <ArchiveMap graves={graves} />
        ) : (
          <GraveList
            graves={graves}
            deleteConfirm={deleteConfirm}
            onDeleteRequest={setDeleteConfirm}
            onDeleteConfirm={handleDelete}
            onDeleteCancel={() => setDeleteConfirm(null)}
          />
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 px-8 text-center animate-fade-in">
      <div className="w-20 h-20 rounded-full bg-stone-800 flex items-center justify-center">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#5a5550" strokeWidth="1.5">
          <path d="M3 6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6z"/>
          <path d="M3 12h18M3 18h18"/>
        </svg>
      </div>
      <div>
        <h2 className="font-serif text-xl text-stone-200 mb-2">
          Your archive is empty
        </h2>
        <p className="text-stone-500 text-sm leading-relaxed">
          When you photograph and save a grave marker, it will appear here as a pin on the map.
        </p>
      </div>
      <Link
        href="/"
        className="flex items-center justify-center gap-2 h-12 px-6 rounded-2xl font-semibold text-stone-900 text-sm"
        style={{ background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }}
      >
        Scan your first marker
      </Link>
    </div>
  );
}

function GraveList({
  graves,
  deleteConfirm,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: {
  graves: GraveRecord[];
  deleteConfirm: string | null;
  onDeleteRequest: (id: string) => void;
  onDeleteConfirm: (id: string) => void;
  onDeleteCancel: () => void;
}) {
  return (
    <div className="flex flex-col divide-y divide-stone-800">
      {graves.map((grave) => (
        <div key={grave.id} className="flex items-center gap-3 px-5 py-4">
          {/* Thumbnail */}
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-stone-800 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={grave.photoDataUrl}
              alt={grave.extracted.name}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="font-serif text-stone-100 font-medium truncate">
              {grave.extracted.name || "Unknown"}
            </p>
            <p className="text-stone-500 text-xs mt-0.5">
              {[grave.extracted.birthDate, grave.extracted.deathDate]
                .filter(Boolean)
                .join(" — ") || "Dates unknown"}
            </p>
            {grave.location?.cemetery && (
              <p className="text-stone-600 text-xs truncate">
                {grave.location.cemetery}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {deleteConfirm === grave.id ? (
              <div className="flex gap-2">
                <button
                  onClick={() => onDeleteConfirm(grave.id)}
                  className="text-xs text-red-400 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20"
                >
                  Delete
                </button>
                <button
                  onClick={onDeleteCancel}
                  className="text-xs text-stone-400"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => onDeleteRequest(grave.id)}
                className="w-8 h-8 flex items-center justify-center text-stone-600 active:text-red-400 rounded-lg"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
