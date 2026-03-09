import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export interface Series {
  id: string;
  primaryLanguage: string | null;
  preferredOutputLanguage: string | null;
  mode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SeriesUpdates {
  primaryLanguage?: string;
  preferredOutputLanguage?: string;
  mode?: string;
}

interface StoredSeries {
  id: string;
  primaryLanguage: string | null;
  preferredOutputLanguage: string | null;
  mode: string | null;
  createdAt: string;
  updatedAt: string;
}

const STORE_PATH =
  process.env.SERIES_STORE_PATH ?? join(process.cwd(), "data", "series.json");

function loadStore(): Record<string, StoredSeries> {
  if (!existsSync(STORE_PATH)) return {};
  try {
    const data = readFileSync(STORE_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveStore(store: Record<string, StoredSeries>): void {
  const dir = join(STORE_PATH, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function getSeries(id: string): Series | null {
  const store = loadStore();
  const row = store[id];
  return row ?? null;
}

export function updateSeries(id: string, updates: SeriesUpdates): void {
  const store = loadStore();
  const existing = store[id];
  if (!existing) return;

  const now = new Date().toISOString();
  store[id] = {
    ...existing,
    ...(updates.primaryLanguage !== undefined && {
      primaryLanguage: updates.primaryLanguage,
    }),
    ...(updates.preferredOutputLanguage !== undefined && {
      preferredOutputLanguage: updates.preferredOutputLanguage,
    }),
    ...(updates.mode !== undefined && { mode: updates.mode }),
    updatedAt: now,
  };
  saveStore(store);
}

export function upsertSeries(
  id: string,
  data: { primaryLanguage?: string; preferredOutputLanguage?: string; mode?: string }
): void {
  const store = loadStore();
  const now = new Date().toISOString();
  const existing = store[id];

  store[id] = {
    id,
    primaryLanguage: data.primaryLanguage ?? existing?.primaryLanguage ?? null,
    preferredOutputLanguage:
      data.preferredOutputLanguage ??
      existing?.preferredOutputLanguage ??
      null,
    mode: data.mode ?? existing?.mode ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  saveStore(store);
}
