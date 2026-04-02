/**
 * GraveLens user settings — stored in localStorage, applied globally via
 * CSS custom properties and data attributes on <html>.
 */

export type FontSize = "small" | "medium" | "large" | "xl";
export type Theme = "dark" | "system" | "light";
export type MapStyle = "standard" | "satellite" | "terrain";
export type SearchRadius = 1 | 5 | 10 | 25;
export type LocationPref = "always" | "ask" | "never";

export interface AppSettings {
  // Display
  fontSize: FontSize;
  theme: Theme;
  highContrast: boolean;

  // Map
  mapStyle: MapStyle;
  defaultSearchRadius: SearchRadius;
  autoDiscover: boolean;

  // Scan
  autoQualityCheck: boolean;
  saveLocation: LocationPref;
}

export const DEFAULT_SETTINGS: AppSettings = {
  fontSize: "medium",
  theme: "dark",
  highContrast: false,
  mapStyle: "standard",
  defaultSearchRadius: 5,
  autoDiscover: true,
  autoQualityCheck: true,
  saveLocation: "always",
};

const STORAGE_KEY = "gl_settings";

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

export function patchSettings(patch: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const next = { ...current, ...patch };
  saveSettings(next);
  applySettings(next);
  return next;
}

// ── CSS / DOM application ─────────────────────────────────────────────────

const FONT_SCALE_MAP: Record<FontSize, string> = {
  small:  "0.95",
  medium: "1",
  large:  "1.05",
  xl:     "1.1",
};

export function applySettings(settings: AppSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  // Font scale — applied as a CSS custom property consumed globally
  root.style.setProperty("--font-scale", FONT_SCALE_MAP[settings.fontSize]);

  // Theme
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const effectiveDark =
    settings.theme === "dark" ||
    (settings.theme === "system" && prefersDark);
  root.setAttribute("data-theme", effectiveDark ? "dark" : "light");

  // High contrast
  root.setAttribute("data-high-contrast", settings.highContrast ? "true" : "false");
}

/** Call once at app boot to apply stored settings immediately. */
export function applyStoredSettings(): void {
  applySettings(loadSettings());
}

// Map tile URL helpers
export const MAP_TILE_URLS: Record<MapStyle, string> = {
  standard:  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  terrain:   "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
};
