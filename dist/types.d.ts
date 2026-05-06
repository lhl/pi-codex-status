export declare const SCHEMA_VERSION = 1;
export type AuthSource = "auto" | "pi" | "codex";
export interface LimitWindow {
    usedPercent: number;
    leftPercent: number;
    windowSeconds?: number;
    resetAt?: number;
    resetAfterSeconds?: number;
}
export interface RateLimit {
    id: string;
    name: string;
    meteredFeature?: string;
    allowed?: boolean;
    limitReached?: boolean;
    reachedType?: string | null;
    primary?: LimitWindow;
    secondary?: LimitWindow;
}
export interface CreditsSnapshot {
    hasCredits?: boolean;
    unlimited?: boolean;
    overageLimitReached?: boolean;
    balance?: string;
    approxLocalMessages?: [number, number];
    approxCloudMessages?: [number, number];
}
export interface SpendControlSnapshot {
    reached?: boolean;
    individualLimit?: number | null;
}
export interface AccountSnapshot {
    email?: string;
    plan?: string;
    accountId?: string;
}
export interface CodexUsageSnapshot {
    schemaVersion: typeof SCHEMA_VERSION;
    source: "api" | "headers" | "event" | "cache";
    fetchedAt: string;
    endpoint?: string;
    authSource?: "pi" | "codex";
    account: AccountSnapshot;
    defaultLimit?: RateLimit;
    additionalLimits: RateLimit[];
    credits?: CreditsSnapshot;
    spendControl?: SpendControlSnapshot;
    raw?: unknown;
}
export interface FetchUsageOptions {
    authSource?: AuthSource;
    authFile?: string;
    endpoint?: string;
    timeoutMs?: number;
    includeRaw?: boolean;
    refreshSkewMs?: number;
}
export interface CacheOptions extends FetchUsageOptions {
    maxAgeMs?: number;
    noCache?: boolean;
    cacheFile?: string;
}
export interface ApiWindow {
    used_percent?: number;
    limit_window_seconds?: number;
    reset_after_seconds?: number;
    reset_at?: number;
}
export interface ApiRateLimit {
    allowed?: boolean;
    limit_reached?: boolean;
    primary_window?: ApiWindow | null;
    secondary_window?: ApiWindow | null;
}
export interface ApiAdditionalRateLimit {
    limit_name?: string;
    metered_feature?: string;
    rate_limit?: ApiRateLimit | null;
}
export interface ApiUsageResponse {
    user_id?: string;
    account_id?: string;
    email?: string;
    plan_type?: string;
    rate_limit?: ApiRateLimit | null;
    code_review_rate_limit?: ApiRateLimit | null;
    additional_rate_limits?: ApiAdditionalRateLimit[] | null;
    credits?: {
        has_credits?: boolean;
        unlimited?: boolean;
        overage_limit_reached?: boolean;
        balance?: string | number;
        approx_local_messages?: [number, number];
        approx_cloud_messages?: [number, number];
    } | null;
    spend_control?: {
        reached?: boolean;
        individual_limit?: number | null;
    } | null;
    rate_limit_reached_type?: string | null;
    promo?: unknown;
    referral_beacon?: unknown;
}
