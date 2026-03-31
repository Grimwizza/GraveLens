import { openDB, type IDBPDatabase } from "idb";
import type { GraveRecord, QueuedCapture, CemeteryRecord } from "@/types";

const DB_NAME = "gravelens";
const DB_VERSION = 5;          // ← bumped from 4 to add cemetery store
const STORE_NAME = "graves";
const PENDING_STORE = "pending";
const QUEUE_STORE = "queue";
const CEMETERY_STORE = "cemeteries";

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion) {
      console.log(`[Storage] Upgrading DB from ${oldVersion} to ${newVersion}`);
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp");
      }
      if (!db.objectStoreNames.contains(PENDING_STORE)) {
        db.createObjectStore(PENDING_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CEMETERY_STORE)) {
        db.createObjectStore(CEMETERY_STORE, { keyPath: "id" });
      }
    },
  });
}

// ── Saved archive ─────────────────────────────────────────────────────────

export async function saveGrave(record: GraveRecord): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, record);
}

export async function getGrave(id: string): Promise<GraveRecord | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, id);
}

export async function getAllGraves(): Promise<GraveRecord[]> {
  try {
    const db = await getDB();
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      console.error(`[Storage] Store ${STORE_NAME} missing!`);
      return [];
    }
    const records = await db.getAll(STORE_NAME);
    return records.sort((a, b) => b.timestamp - a.timestamp);
  } catch (err) {
    console.error("[Storage] Failed to get all graves:", err);
    throw err;
  }
}

export async function deleteGrave(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}

export async function getGraveCount(): Promise<number> {
  const db = await getDB();
  return db.count(STORE_NAME);
}

// ── In-flight analysis results (replaces sessionStorage) ──────────────────

export async function savePendingResult(
  id: string,
  data: unknown
): Promise<void> {
  const db = await getDB();
  await db.put(PENDING_STORE, { id, data, timestamp: Date.now() });
}

export async function getPendingResult(
  id: string
): Promise<unknown | undefined> {
  const db = await getDB();
  const record = await db.get(PENDING_STORE, id);
  return record?.data;
}

export async function deletePendingResult(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(PENDING_STORE, id);
}

// ── Offline capture queue ──────────────────────────────────────────────────

export async function addToQueue(item: QueuedCapture): Promise<void> {
  const db = await getDB();
  await db.put(QUEUE_STORE, item);
}

export async function getQueuedItems(): Promise<QueuedCapture[]> {
  const db = await getDB();
  const items = await db.getAll(QUEUE_STORE);
  return items.sort((a, b) => a.timestamp - b.timestamp);
}

export async function updateQueueItem(item: QueuedCapture): Promise<void> {
  const db = await getDB();
  await db.put(QUEUE_STORE, item);
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(QUEUE_STORE, id);
}

export async function getQueueCount(): Promise<number> {
  const db = await getDB();
  return db.count(QUEUE_STORE);
}

// ── Cemetery archive ───────────────────────────────────────────────────────

export async function saveCemetery(record: CemeteryRecord): Promise<void> {
  const db = await getDB();
  await db.put(CEMETERY_STORE, record);
}

export async function getCemetery(id: string): Promise<CemeteryRecord | undefined> {
  const db = await getDB();
  return db.get(CEMETERY_STORE, id);
}

export async function getAllCemeteries(): Promise<CemeteryRecord[]> {
  const db = await getDB();
  const records = await db.getAll(CEMETERY_STORE);
  return records.sort((a, b) => b.lastVisited - a.lastVisited);
}

export async function deleteCemetery(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(CEMETERY_STORE, id);
}

/**
 * Upserts a cemetery visit.  If the cemetery already exists in the archive
 * the visitCount and lastVisited are incremented; otherwise a new record is
 * created with the supplied data.
 */
export async function recordCemeteryVisit(
  partial: Omit<CemeteryRecord, "visitCount" | "firstVisited" | "lastVisited"> & { id: string }
): Promise<CemeteryRecord> {
  const db = await getDB();
  const existing: CemeteryRecord | undefined = await db.get(CEMETERY_STORE, partial.id);
  const now = Date.now();

  const record: CemeteryRecord = existing
    ? {
        ...existing,
        // Merge enriched data if it arrives after the first visit
        ...Object.fromEntries(
          Object.entries(partial).filter(([, v]) => v !== undefined && v !== null)
        ),
        visitCount: existing.visitCount + 1,
        lastVisited: now,
      }
    : {
        ...partial,
        visitCount: 1,
        firstVisited: now,
        lastVisited: now,
      };

  await db.put(CEMETERY_STORE, record);
  return record;
}
