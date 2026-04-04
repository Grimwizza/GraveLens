/**
 * Lightweight haptic feedback via the Vibration API (Android / Chrome).
 * iOS does not expose navigator.vibrate — calls are silently no-ops.
 */
export function haptic(pattern: "light" | "medium" | "heavy" = "light") {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  const ms: Record<typeof pattern, number> = { light: 10, medium: 20, heavy: 40 };
  try { navigator.vibrate(ms[pattern]); } catch { /* unsupported or permission denied */ }
}
