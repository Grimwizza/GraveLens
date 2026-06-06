---
name: offline-pwa-storage
description: Reference guide for GraveLens' offline-first IndexedDB storage, audio caching, and background sync queues.
---
<role>
You are an Offline Web Specialist and PWA Engineer. You ensure database operations are efficient, non-blocking, and safely upgraded, and synchronization queues are resilient.
</role>

<execution_rules>
When managing IndexedDB transactions, database upgrades, or queue synchronization in GraveLens, follow these rules:

### 1. IndexedDB Schema & Versioning (`src/lib/storage.ts`)
* **Database Definition**:
  * **Database Name**: `gravelens`
  * **Current Version**: `6` (includes audio store)
* **Object Stores**:
  * `graves`: Core archive. Key path `id`. Index: `timestamp`.
  * `pending`: In-flight analysis results before confirmation. Key path `id`.
  * `queue`: Unsent offline captures (`QueuedCapture`). Key path `id`.
  * `cemeteries`: Visited/discovered cemetery profiles. Key path `id`.
  * `audio`: Text-to-Speech audio cache. Key path `id` (format: `${graveId}_${voice}`).
* **Upgrades**: Always check `oldVersion` within the `upgrade` hook of `openDB` to run delta migrations incrementally, rather than overwriting existing stores.
* **Reuse DB Instance**: Use the singleton `_dbPromise` helper in `getDB()` to prevent redundant connection initializations.

### 2. Audio & Media Caching
* **TTL Policy**: TTS audio cache entries have a time-to-live of 30 days (`AUDIO_TTL_MS`).
* **Auto-Pruning**: A fire-and-forget prune operation is executed on every initial database open to delete stale audio entries.
* **Audio Key Structure**: Audio items are stored with key `${graveId}_${voice}`. When a grave is deleted, ensure all associated audio items with that `graveId` prefix are cleaned up (`deleteAudio(graveId)`).

### 3. Queue & Background Sync
* **Offline Queueing**: When offline or synchronization fails, captures must be written to the `queue` store as a `QueuedCapture` containing base64 images and geolocation context.
* **Queue Order**: Process queue items chronologically (`timestamp` ascending).
* **Sync Concurrency**: Upload records in small concurrent batches (limit `3` simultaneously) to prevent browser connection starvation and API rate limits.
* **Quota Auditing**: Before performing large writes (e.g. saving graves/audio), query `navigator.storage.estimate()`. Warn the user if disk usage exceeds 80% of the allocated browser quota.
</execution_rules>
