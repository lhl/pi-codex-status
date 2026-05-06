import { type CodexUsageSnapshot } from "./types.js";
export type HeaderLike = Record<string, string | number | boolean | undefined | null>;
export declare function parseCodexRateLimitHeaders(headers: HeaderLike): CodexUsageSnapshot | undefined;
interface RateLimitEventWindow {
    used_percent?: number;
    window_minutes?: number;
    reset_at?: number;
}
interface RateLimitEventPayload {
    type?: string;
    plan_type?: string;
    metered_limit_name?: string;
    limit_name?: string;
    rate_limits?: {
        primary?: RateLimitEventWindow;
        secondary?: RateLimitEventWindow;
    };
    credits?: {
        has_credits?: boolean;
        unlimited?: boolean;
        balance?: string;
    };
}
export declare function parseCodexRateLimitEvent(payload: string | RateLimitEventPayload): CodexUsageSnapshot | undefined;
export {};
