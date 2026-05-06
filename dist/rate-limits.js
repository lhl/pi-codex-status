import { SCHEMA_VERSION } from "./types.js";
function normalizeHeaderName(name) {
    return name.toLowerCase();
}
function headerValue(headers, name) {
    const wanted = normalizeHeaderName(name);
    for (const [key, value] of Object.entries(headers)) {
        if (normalizeHeaderName(key) === wanted && value !== undefined && value !== null) {
            return String(value);
        }
    }
    return undefined;
}
function numberHeader(headers, name) {
    const raw = headerValue(headers, name);
    if (raw === undefined || raw.trim() === "")
        return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
}
function boolHeader(headers, name) {
    const raw = headerValue(headers, name)?.trim().toLowerCase();
    if (raw === "true" || raw === "1")
        return true;
    if (raw === "false" || raw === "0")
        return false;
    return undefined;
}
function normalizeLimitId(id) {
    return id.trim().toLowerCase().replace(/-/g, "_");
}
function normalizeResetAt(value) {
    if (value === undefined)
        return undefined;
    return value > 10_000_000_000 ? Math.round(value / 1000) : value;
}
function parseWindow(headers, prefix, which) {
    const used = numberHeader(headers, `${prefix}-${which}-used-percent`);
    const minutes = numberHeader(headers, `${prefix}-${which}-window-minutes`);
    const resetAt = normalizeResetAt(numberHeader(headers, `${prefix}-${which}-reset-at`));
    if (used === undefined && minutes === undefined && resetAt === undefined)
        return undefined;
    const usedPercent = Math.max(0, Math.min(100, used ?? 0));
    return {
        usedPercent,
        leftPercent: Math.max(0, Math.min(100, 100 - usedPercent)),
        ...(minutes !== undefined ? { windowSeconds: minutes * 60 } : {}),
        ...(resetAt !== undefined ? { resetAt, resetAfterSeconds: Math.max(0, Math.round(resetAt - Date.now() / 1000)) } : {}),
    };
}
function parseCredits(headers) {
    const hasCredits = boolHeader(headers, "x-codex-credits-has-credits");
    const unlimited = boolHeader(headers, "x-codex-credits-unlimited");
    const balance = headerValue(headers, "x-codex-credits-balance");
    if (hasCredits === undefined && unlimited === undefined && balance === undefined)
        return undefined;
    return {
        ...(hasCredits !== undefined ? { hasCredits } : {}),
        ...(unlimited !== undefined ? { unlimited } : {}),
        ...(balance !== undefined && balance !== "" ? { balance } : {}),
    };
}
function parseLimit(headers, limitId) {
    const normalizedHeaderId = limitId.toLowerCase().replace(/_/g, "-");
    const prefix = `x-${normalizedHeaderId}`;
    const primary = parseWindow(headers, prefix, "primary");
    const secondary = parseWindow(headers, prefix, "secondary");
    const credits = parseCredits(headers);
    if (!primary && !secondary && !credits)
        return undefined;
    const name = headerValue(headers, `${prefix}-limit-name`) || (limitId === "codex" ? "Codex" : normalizeLimitId(limitId));
    return {
        id: normalizeLimitId(limitId),
        name,
        ...(primary ? { primary } : {}),
        ...(secondary ? { secondary } : {}),
    };
}
export function parseCodexRateLimitHeaders(headers) {
    const limitIds = new Set(["codex"]);
    for (const key of Object.keys(headers)) {
        const lower = key.toLowerCase();
        const suffix = "-primary-used-percent";
        if (!lower.endsWith(suffix) || !lower.startsWith("x-"))
            continue;
        limitIds.add(normalizeLimitId(lower.slice(2, -suffix.length)));
    }
    const limits = [...limitIds].map((id) => parseLimit(headers, id)).filter((x) => !!x);
    if (limits.length === 0)
        return undefined;
    const defaultLimit = limits.find((limit) => limit.id === "codex");
    const credits = parseCredits(headers);
    return {
        schemaVersion: SCHEMA_VERSION,
        source: "headers",
        fetchedAt: new Date().toISOString(),
        account: {},
        ...(defaultLimit ? { defaultLimit } : {}),
        additionalLimits: limits.filter((limit) => limit.id !== "codex"),
        ...(credits ? { credits } : {}),
    };
}
function eventWindowToLimitWindow(window) {
    if (!window || typeof window.used_percent !== "number")
        return undefined;
    const usedPercent = Math.max(0, Math.min(100, window.used_percent));
    const resetAt = normalizeResetAt(window.reset_at);
    return {
        usedPercent,
        leftPercent: Math.max(0, Math.min(100, 100 - usedPercent)),
        ...(typeof window.window_minutes === "number" ? { windowSeconds: window.window_minutes * 60 } : {}),
        ...(resetAt !== undefined ? { resetAt, resetAfterSeconds: Math.max(0, Math.round(resetAt - Date.now() / 1000)) } : {}),
    };
}
export function parseCodexRateLimitEvent(payload) {
    const event = typeof payload === "string" ? JSON.parse(payload) : payload;
    if (event.type !== "codex.rate_limits")
        return undefined;
    const id = normalizeLimitId(event.metered_limit_name || event.limit_name || "codex");
    const primary = eventWindowToLimitWindow(event.rate_limits?.primary);
    const secondary = eventWindowToLimitWindow(event.rate_limits?.secondary);
    const limit = {
        id,
        name: id === "codex" ? "Codex" : id,
        ...(primary ? { primary } : {}),
        ...(secondary ? { secondary } : {}),
    };
    const credits = event.credits
        ? {
            ...(event.credits.has_credits !== undefined ? { hasCredits: event.credits.has_credits } : {}),
            ...(event.credits.unlimited !== undefined ? { unlimited: event.credits.unlimited } : {}),
            ...(event.credits.balance !== undefined ? { balance: event.credits.balance } : {}),
        }
        : undefined;
    return {
        schemaVersion: SCHEMA_VERSION,
        source: "event",
        fetchedAt: new Date().toISOString(),
        account: {
            ...(event.plan_type ? { plan: event.plan_type } : {}),
        },
        ...(id === "codex" ? { defaultLimit: limit } : {}),
        additionalLimits: id === "codex" ? [] : [limit],
        ...(credits ? { credits } : {}),
    };
}
//# sourceMappingURL=rate-limits.js.map