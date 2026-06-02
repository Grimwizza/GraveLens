/**
 * Ghost Tour: watch GPS position, auto-play cached story audio when
 * the user walks within TRIGGER_METERS of a saved grave.
 */

import { getAudio } from "@/lib/storage";
import type { GraveRecord } from "@/types";

const TRIGGER_METERS = 30;
const COOLDOWN_MS    = 60_000; // minimum gap between plays for the same grave

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface TourEvent {
  type: "entered" | "playing" | "no_audio" | "error";
  grave: GraveRecord;
}

export class TourMode {
  private watchId: number | null = null;
  private lastPlayed = new Map<string, number>();
  private audio: HTMLAudioElement | null = null;
  private onEvent: (e: TourEvent) => void;
  private graves: GraveRecord[] = [];

  constructor(onEvent: (e: TourEvent) => void) {
    this.onEvent = onEvent;
  }

  updateGraves(graves: GraveRecord[]) {
    this.graves = graves;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        reject(new Error("Geolocation not available"));
        return;
      }

      this.watchId = navigator.geolocation.watchPosition(
        (pos) => {
          this.handlePosition(pos.coords.latitude, pos.coords.longitude);
          resolve();
        },
        (err) => reject(err),
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
    });
  }

  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.audio?.pause();
    this.audio = null;
  }

  private async handlePosition(lat: number, lng: number) {
    const now = Date.now();

    for (const grave of this.graves) {
      const gLat = grave.location?.lat;
      const gLng = grave.location?.lng;
      if (!gLat || !gLng) continue;

      const dist = haversineMeters(lat, lng, gLat, gLng);
      if (dist > TRIGGER_METERS) continue;

      const lastTime = this.lastPlayed.get(grave.id) ?? 0;
      if (now - lastTime < COOLDOWN_MS) continue;

      this.lastPlayed.set(grave.id, now);
      this.onEvent({ type: "entered", grave });

      // Try to find cached audio with any voice key
      const voiceKeys = ["story_alloy", "story_shimmer", "story_nova", "story_onyx", "story_echo", "story_fable"];
      let dataUrl: string | undefined;
      for (const key of voiceKeys) {
        dataUrl = await getAudio(grave.id, key).catch(() => undefined);
        if (dataUrl) break;
        // Also try person-indexed keys
        dataUrl = await getAudio(grave.id, `${key}_p0`).catch(() => undefined);
        if (dataUrl) break;
      }

      if (!dataUrl) {
        this.onEvent({ type: "no_audio", grave });
        continue;
      }

      this.onEvent({ type: "playing", grave });
      this.audio?.pause();
      this.audio = new Audio(dataUrl);
      this.audio.play().catch(() => this.onEvent({ type: "error", grave }));
      break; // play one grave at a time
    }
  }
}
