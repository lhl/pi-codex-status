import { type ApiUsageResponse, type CacheOptions, type CodexUsageSnapshot, type FetchUsageOptions, type LimitWindow } from "./types.js";
export declare const DEFAULT_USAGE_ENDPOINT = "https://chatgpt.com/backend-api/codex/usage";
export declare function normalizeWindow(window: unknown, nowMs?: number): LimitWindow | undefined;
export declare function normalizeApiUsage(api: ApiUsageResponse, meta?: {
    endpoint?: string;
    authSource?: "pi" | "codex";
    includeRaw?: boolean;
}): CodexUsageSnapshot;
export declare function fetchCodexUsage(options?: FetchUsageOptions): Promise<CodexUsageSnapshot>;
export declare function getCodexUsage(options?: CacheOptions): Promise<CodexUsageSnapshot>;
