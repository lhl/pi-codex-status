import type { CodexUsageSnapshot } from "./types.js";
export declare function defaultCacheFile(): string;
export declare function readCachedSnapshot(path?: string): Promise<CodexUsageSnapshot | undefined>;
export declare function cacheAgeMs(snapshot: CodexUsageSnapshot): number;
export declare function writeCachedSnapshot(snapshot: CodexUsageSnapshot, path?: string): Promise<void>;
export declare function isFresh(snapshot: CodexUsageSnapshot | undefined, maxAgeMs: number): snapshot is CodexUsageSnapshot;
