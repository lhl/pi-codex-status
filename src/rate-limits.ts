import { SCHEMA_VERSION, type CodexUsageSnapshot, type CreditsSnapshot, type LimitWindow, type RateLimit } from "./types.js";

export type HeaderLike = Record<string, string | number | boolean | undefined | null>;

function normalizeHeaderName(name: string): string {
  return name.toLowerCase();
}

function headerValue(headers: HeaderLike, name: string): string | undefined {
  const wanted = normalizeHeaderName(name);
  for (const [key, value] of Object.entries(headers)) {
    if (normalizeHeaderName(key) === wanted && value !== undefined && value !== null) {
      return String(value);
    }
  }
  return undefined;
}

function numberHeader(headers: HeaderLike, name: string): number | undefined {
  const raw = headerValue(headers, name);
  if (raw === undefined || raw.trim() === "") return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function boolHeader(headers: HeaderLike, name: string): boolean | undefined {
  const raw = headerValue(headers, name)?.trim().toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return undefined;
}

function normalizeLimitId(id: string): string {
  return id.trim().toLowerCase().replace(/-/g, "_");
}

function normalizeResetAt(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return value > 10_000_000_000 ? Math.round(value / 1000) : value;
}

function parseWindow(headers: HeaderLike, prefix: string, which: "primary" | "secondary"): LimitWindow | undefined {
  const used = numberHeader(headers, `${prefix}-${which}-used-percent`);
  const minutes = numberHeader(headers, `${prefix}-${which}-window-minutes`);
  const resetAt = normalizeResetAt(numberHeader(headers, `${prefix}-${which}-reset-at`));

  if (used === undefined && minutes === undefined && resetAt === undefined) return undefined;
  const usedPercent = Math.max(0, Math.min(100, used ?? 0));
  return {
    usedPercent,
    leftPercent: Math.max(0, Math.min(100, 100 - usedPercent)),
    ...(minutes !== undefined ? { windowSeconds: minutes * 60 } : {}),
    ...(resetAt !== undefined ? { resetAt, resetAfterSeconds: Math.max(0, Math.round(resetAt - Date.now() / 1000)) } : {}),
  };
}

function parseCredits(headers: HeaderLike): CreditsSnapshot | undefined {
  const hasCredits = boolHeader(headers, "x-codex-credits-has-credits");
  const unlimited = boolHeader(headers, "x-codex-credits-unlimited");
  const balance = headerValue(headers, "x-codex-credits-balance");
  if (hasCredits === undefined && unlimited === undefined && balance === undefined) return undefined;
  return {
    ...(hasCredits !== undefined ? { hasCredits } : {}),
    ...(unlimited !== undefined ? { unlimited } : {}),
    ...(balance !== undefined && balance !== "" ? { balance } : {}),
  };
}

function parseLimit(headers: HeaderLike, limitId: string): RateLimit | undefined {
  const normalizedHeaderId = limitId.toLowerCase().replace(/_/g, "-");
  const prefix = `x-${normalizedHeaderId}`;
  const primary = parseWindow(headers, prefix, "primary");
  const secondary = parseWindow(headers, prefix, "secondary");
  const credits = parseCredits(headers);

  if (!primary && !secondary && !credits) return undefined;

  const name = headerValue(headers, `${prefix}-limit-name`) || (limitId === "codex" ? "Codex" : normalizeLimitId(limitId));
  return {
    id: normalizeLimitId(limitId),
    name,
    ...(primary ? { primary } : {}),
    ...(secondary ? { secondary } : {}),
  };
}

export function parseCodexRateLimitHeaders(headers: HeaderLike): CodexUsageSnapshot | undefined {
  const limitIds = new Set<string>(["codex"]);
  for (const key of Object.keys(headers)) {
    const lower = key.toLowerCase();
    const suffix = "-primary-used-percent";
    if (!lower.endsWith(suffix) || !lower.startsWith("x-")) continue;
    limitIds.add(normalizeLimitId(lower.slice(2, -suffix.length)));
  }

  const limits = [...limitIds].map((id) => parseLimit(headers, id)).filter((x): x is RateLimit => !!x);
  if (limits.length === 0) return undefined;

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

function eventWindowToLimitWindow(window: RateLimitEventWindow | undefined): LimitWindow | undefined {
  if (!window || typeof window.used_percent !== "number") return undefined;
  const usedPercent = Math.max(0, Math.min(100, window.used_percent));
  const resetAt = normalizeResetAt(window.reset_at);
  return {
    usedPercent,
    leftPercent: Math.max(0, Math.min(100, 100 - usedPercent)),
    ...(typeof window.window_minutes === "number" ? { windowSeconds: window.window_minutes * 60 } : {}),
    ...(resetAt !== undefined ? { resetAt, resetAfterSeconds: Math.max(0, Math.round(resetAt - Date.now() / 1000)) } : {}),
  };
}

export function parseCodexRateLimitEvent(payload: string | RateLimitEventPayload): CodexUsageSnapshot | undefined {
  const event = typeof payload === "string" ? (JSON.parse(payload) as RateLimitEventPayload) : payload;
  if (event.type !== "codex.rate_limits") return undefined;

  const id = normalizeLimitId(event.metered_limit_name || event.limit_name || "codex");
  const primary = eventWindowToLimitWindow(event.rate_limits?.primary);
  const secondary = eventWindowToLimitWindow(event.rate_limits?.secondary);
  const limit: RateLimit = {
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
