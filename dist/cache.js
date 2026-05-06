import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
export function defaultCacheFile() {
    const base = process.env.XDG_CACHE_HOME || join(process.env.HOME || process.env.USERPROFILE || ".", ".cache");
    return join(base, "pi-codex-status", "usage.json");
}
export async function readCachedSnapshot(path = defaultCacheFile()) {
    try {
        const parsed = JSON.parse(await readFile(path, "utf8"));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            return undefined;
        return parsed;
    }
    catch {
        return undefined;
    }
}
export function cacheAgeMs(snapshot) {
    const time = Date.parse(snapshot.fetchedAt);
    return Number.isFinite(time) ? Date.now() - time : Number.POSITIVE_INFINITY;
}
export async function writeCachedSnapshot(snapshot, path = defaultCacheFile()) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
}
export function isFresh(snapshot, maxAgeMs) {
    return !!snapshot && cacheAgeMs(snapshot) >= 0 && cacheAgeMs(snapshot) <= maxAgeMs;
}
//# sourceMappingURL=cache.js.map