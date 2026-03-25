import { openDB, type IDBPDatabase } from "idb";
import type { GraveRecord } from "@/types";

const DB_NAME = "gravelens";
const DB_VERSION = 1;
const STORE_NAME = "graves";

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp");
      }
    },
  });
}

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
