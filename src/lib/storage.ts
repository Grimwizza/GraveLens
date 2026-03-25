import { openDB, type IDBPDatabase } from "idb";
import type { GraveRecord } from "@/types";

const DB_NAME = "gravelens";
const DB_VERSION = 2; // bumped to add pending store
const STORE_NAME = "graves";
const PENDING_STORE = "pending";

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp");
      }
      if (!db.objectStoreNames.contains(PENDING_STORE)) {
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
  const db = await getDB();
  const records = await db.getAll(STORE_NAME);
  return records.sort((a, b) => b.timestamp - a.timestamp);
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
