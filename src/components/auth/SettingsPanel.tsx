"use client";

import { useEffect, useState } from "react";
import {
  loadSettings,
  patchSettings,
  type AppSettings,
  type FontSize,
  type Theme,
  type MapStyle,
  type SearchRadius,
  type LocationPref,
} from "@/lib/settings";
import { getAllGraves, getAllCemeteries } from "@/lib/storage";

interface Props {
  onClose: () => void;
}

// ── Small reusable primitives ─────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 px-5 pt-5 pb-2">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.2)" }}
      >
        {icon}
      </div>
      <p className="text-[11px] uppercase tracking-widest font-semibold text-stone-500">{title}</p>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between px-5 py-3.5 border-b border-stone-800/60 last:border-0"
      style={{ background: "rgba(26,25,23,0.6)" }}
    >
      {children}
    </div>
  );
}

function Label({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex-1 min-w-0 pr-3">
      <p className="text-stone-200 text-sm font-medium">{title}</p>
      {sub && <p className="text-stone-500 text-[11px] mt-0.5 leading-relaxed">{sub}</p>}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="shrink-0 w-11 h-6 rounded-full relative transition-colors duration-200"
      style={{ background: on ? "#c9a84c" : "#3a3733" }}
      role="switch"
      aria-checked={on}
    >
      <span
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
        style={{ transform: on ? "translateX(1.25rem)" : "translateX(0.125rem)" }}
      />
    </button>
  );
}

function SegmentControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="flex rounded-xl overflow-hidden shrink-0"
      style={{ background: "#1a1917", border: "1px solid #2e2b28" }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className="px-3 py-1.5 text-xs font-semibold transition-colors"
          style={
            value === opt.value
              ? { background: "#c9a84c", color: "#1a1510" }
              : { color: "#6a6560" }
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SettingsPanel({ onClose }: Props) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [clearDone, setClearDone] = useState(false);

  // Keep settings in sync with any changes from this session
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    const next = patchSettings({ [key]: value } as Partial<AppSettings>);
    setSettings(next);
  }

  // ── Privacy actions ───────────────────────────────────────────────────────

  const handleClearData = async () => {
    setClearing(true);
    try {
      // Delete the IndexedDB database entirely then reload
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase("gravelens");
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      localStorage.removeItem("gl_settings");
      localStorage.removeItem("gl_viewed_ids");
      setClearDone(true);
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      setClearing(false);
      setClearConfirm(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const [graves, cemeteries] = await Promise.all([
        getAllGraves(),
        getAllCemeteries(),
      ]);
      const blob = new Blob(
        [JSON.stringify({ exportedAt: new Date().toISOString(), graves, cemeteries }, null, 2)],
        { type: "application/json" }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gravelens-archive-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-stone-950/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="relative w-full max-w-lg flex flex-col rounded-t-3xl overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #1e1c1a, #161412)",
          border: "1px solid rgba(255,255,255,0.07)",
          maxHeight: "92dvh",
        }}
      >
        {/* Handle + header */}
        <div className="shrink-0 flex flex-col">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-stone-700" />
          </div>
          <div className="flex items-center justify-between px-5 pt-2 pb-3 border-b border-stone-800">
            <div className="flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              <span className="font-serif text-stone-100 text-lg font-semibold">Settings</span>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-stone-500 active:text-stone-300"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="scroll-container flex-1 pb-safe">

          {/* ── DISPLAY ─────────────────────────────────────────────────── */}
          <SectionHeader
            title="Display"
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/><line x1="12" y1="2" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="22"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="2" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="22" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            }
          />
          <div className="mx-5 rounded-2xl overflow-hidden border border-stone-800/80 mb-1">
            <Row>
              <Label title="Font Size" sub="Adjusts text size throughout the app" />
              <SegmentControl<FontSize>
                value={settings.fontSize}
                onChange={(v) => update("fontSize", v)}
                options={[
                  { value: "small", label: "S" },
                  { value: "medium", label: "M" },
                  { value: "large", label: "L" },
                  { value: "xl", label: "XL" },
                ]}
              />
            </Row>
            <Row>
              <Label title="Theme" sub="Controls the app's colour scheme" />
              <SegmentControl<Theme>
                value={settings.theme}
                onChange={(v) => update("theme", v)}
                options={[
                  { value: "dark", label: "Dark" },
                  { value: "system", label: "Auto" },
                  { value: "light", label: "Light" },
                ]}
              />
            </Row>
            <Row>
              <Label title="High Contrast" sub="Boosts text contrast for readability" />
              <Toggle on={settings.highContrast} onChange={(v) => update("highContrast", v)} />
            </Row>
          </div>

          {/* ── MAP ─────────────────────────────────────────────────────── */}
          <SectionHeader
            title="Map"
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
                <line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
              </svg>
            }
          />
          <div className="mx-5 rounded-2xl overflow-hidden border border-stone-800/80 mb-1">
            <Row>
              <Label title="Map Style" sub="Visual style of the background map" />
              <SegmentControl<MapStyle>
                value={settings.mapStyle}
                onChange={(v) => update("mapStyle", v)}
                options={[
                  { value: "standard", label: "Street" },
                  { value: "satellite", label: "Satellite" },
                  { value: "terrain", label: "Terrain" },
                ]}
              />
            </Row>
            <Row>
              <Label title="Default Search Radius" sub="Pre-fills Local Discovery radius" />
              <SegmentControl<string>
                value={String(settings.defaultSearchRadius)}
                onChange={(v) => update("defaultSearchRadius", Number(v) as SearchRadius)}
                options={[
                  { value: "1", label: "1 km" },
                  { value: "5", label: "5 km" },
                  { value: "10", label: "10 km" },
                  { value: "25", label: "25 km" },
                ]}
              />
            </Row>
            <Row>
              <Label title="Auto-discover on Open" sub="Runs discovery when the map loads" />
              <Toggle on={settings.autoDiscover} onChange={(v) => update("autoDiscover", v)} />
            </Row>
          </div>

          {/* ── SCAN ─────────────────────────────────────────────────────── */}
          <SectionHeader
            title="Scan"
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            }
          />
          <div className="mx-5 rounded-2xl overflow-hidden border border-stone-800/80 mb-1">
            <Row>
              <Label title="Auto Quality Check" sub="Rescans with premium AI if data looks incorrect" />
              <Toggle on={settings.autoQualityCheck} onChange={(v) => update("autoQualityCheck", v)} />
            </Row>
            <Row>
              <Label title="Save Location with Scans" sub="Tags grave records with GPS coordinates" />
              <SegmentControl<LocationPref>
                value={settings.saveLocation}
                onChange={(v) => update("saveLocation", v)}
                options={[
                  { value: "always", label: "Always" },
                  { value: "ask", label: "Ask" },
                  { value: "never", label: "Never" },
                ]}
              />
            </Row>
          </div>

          {/* ── PRIVACY & DATA ────────────────────────────────────────── */}
          <SectionHeader
            title="Privacy & Data"
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            }
          />
          <div className="mx-5 rounded-2xl overflow-hidden border border-stone-800/80 mb-6">
            {/* Export */}
            <Row>
              <Label
                title="Export Archive"
                sub="Download all graves & cemeteries as JSON"
              />
              <button
                onClick={handleExport}
                disabled={exporting}
                className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
                style={{ background: "rgba(201,168,76,0.12)", color: "#c9a84c", border: "1px solid rgba(201,168,76,0.25)" }}
              >
                {exporting ? (
                  <div className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#c9a84c transparent #c9a84c #c9a84c" }} />
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                )}
                Export
              </button>
            </Row>

            {/* Clear data */}
            <div
              className="px-5 py-4"
              style={{ background: "rgba(26,25,23,0.6)" }}
            >
              {clearDone ? (
                <div className="flex items-center gap-2 text-green-400 text-sm">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Data cleared — reloading…
                </div>
              ) : !clearConfirm ? (
                <button
                  onClick={() => setClearConfirm(true)}
                  className="w-full py-2.5 rounded-xl text-sm font-medium text-red-400 border border-red-500/20 bg-red-500/5 active:bg-red-500/10 transition-colors"
                >
                  Clear All Local Data
                </button>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-stone-300 text-sm text-center font-medium">
                    This will permanently delete all locally stored graves, cemeteries, and settings. Cloud data is unaffected.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setClearConfirm(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm text-stone-400 border border-stone-700 bg-stone-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleClearData}
                      disabled={clearing}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 active:bg-red-700 disabled:opacity-60"
                    >
                      {clearing ? "Clearing…" : "Yes, Clear All"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* App version */}
          <p className="text-center text-[10px] text-stone-700 pb-6">
            GraveLens · Build {process.env.NEXT_PUBLIC_BUILD_TIME ?? "dev"}
          </p>
        </div>
      </div>
    </div>
  );
}
