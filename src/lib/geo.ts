/**
 * Request the device's current GPS position.
 * Returns null on denial, timeout, or any error — never rejects.
 * maximumAge: 0 forces a fresh fix so retries aren't served stale cache.
 */
export function getDeviceLocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 0, enableHighAccuracy: true }
    );
  });
}
