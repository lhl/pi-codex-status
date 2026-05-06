import type { CodexUsageSnapshot } from "./types.js";
export interface FormatOptions {
    box?: boolean;
    width?: number;
    now?: Date;
}
export declare function formatReset(resetAt: number | undefined, now?: Date): string;
export declare function formatDuration(seconds: number | undefined): string;
export declare function bar(leftPercent: number | undefined, width?: number): string;
export declare function formatStatus(snapshot: CodexUsageSnapshot, options?: FormatOptions): string;
export declare function formatStatusline(snapshot: CodexUsageSnapshot, now?: Date): string;
export declare function formatJson(snapshot: CodexUsageSnapshot): string;
