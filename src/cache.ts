import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CodexUsageSnapshot } from "./types.js";

export function defaultCacheFile(): string {
  const base = process.env.XDG_CACHE_HOME || join(process.env.HOME || process.env.USERPROFILE || ".", ".cache");
  return join(base, "pi-codex-usage", "usage.json");
}

export async function readCachedSnapshot(path = defaultCacheFile()): Promise<CodexUsageSnapshot | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return parsed as CodexUsageSnapshot;
  } catch {
    return undefined;
  }
}

export function cacheAgeMs(snapshot: CodexUsageSnapshot): number {
  const time = Date.parse(snapshot.fetchedAt);
  return Number.isFinite(time) ? Date.now() - time : Number.POSITIVE_INFINITY;
}

export async function writeCachedSnapshot(
  snapshot: CodexUsageSnapshot,
  path = defaultCacheFile(),
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
}

export function isFresh(snapshot: CodexUsageSnapshot | undefined, maxAgeMs: number): snapshot is CodexUsageSnapshot {
  return !!snapshot && cacheAgeMs(snapshot) >= 0 && cacheAgeMs(snapshot) <= maxAgeMs;
}
