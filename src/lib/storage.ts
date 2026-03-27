import { openDB, type IDBPDatabase } from "idb";
import type { GraveRecord } from "@/types";

const DB_NAME = "gravelens";
const DB_VERSION = 3; // bumped to force store creation
const STORE_NAME = "graves";
const PENDING_STORE = "pending";

async function getDB(): Promise<IDBPDatabase> {
  console.log(`[Storage] Opening DB version ${DB_VERSION}...`);
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion) {
      console.log(`[Storage] Upgrading DB from ${oldVersion} to ${newVersion}`);
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        console.log(`[Storage] Creating store: ${STORE_NAME}`);
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp");
      }
      if (!db.objectStoreNames.contains(PENDING_STORE)) {
        console.log(`[Storage] Creating store: ${PENDING_STORE}`);
        db.createObjectStore(PENDING_STORE, { keyPath: "id" });
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
// Photos can be 5–15 MB as base64, which exceeds sessionStorage quota.
// IndexedDB has no practical size limit.

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
