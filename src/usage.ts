import { resolveAuth, refreshAuth } from "./auth.js";
import { defaultCacheFile, isFresh, readCachedSnapshot, writeCachedSnapshot } from "./cache.js";
import { SCHEMA_VERSION, type ApiRateLimit, type ApiUsageResponse, type CacheOptions, type CodexUsageSnapshot, type FetchUsageOptions, type LimitWindow, type RateLimit } from "./types.js";

export const DEFAULT_USAGE_ENDPOINT = "https://chatgpt.com/backend-api/wham/usage";

function numberValue(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function tuple2(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const a = numberValue(value[0]);
  const b = numberValue(value[1]);
  return a === undefined || b === undefined ? undefined : [a, b];
}

function normalizeResetAt(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  // API uses Unix seconds. Some headers/tools may use milliseconds; normalize defensively.
  return value > 10_000_000_000 ? Math.round(value / 1000) : value;
}

export function normalizeWindow(window: unknown, nowMs = Date.now()): LimitWindow | undefined {
  if (!window || typeof window !== "object" || Array.isArray(window)) return undefined;
  const obj = window as Record<string, unknown>;
  const usedPercent = numberValue(obj.used_percent) ?? numberValue(obj.usedPercent);
  if (usedPercent === undefined) return undefined;

  const resetAt = normalizeResetAt(numberValue(obj.reset_at) ?? numberValue(obj.resetAt));
  const resetAfterSeconds =
    numberValue(obj.reset_after_seconds) ??
    numberValue(obj.resetAfterSeconds) ??
    (resetAt !== undefined ? Math.max(0, Math.round(resetAt - nowMs / 1000)) : undefined);
  const explicitWindowSeconds = numberValue(obj.limit_window_seconds) ?? numberValue(obj.windowSeconds);
  const windowMinutes = numberValue(obj.window_minutes) ?? numberValue(obj.windowMinutes);
  const windowSeconds = explicitWindowSeconds ?? (windowMinutes !== undefined ? windowMinutes * 60 : undefined);

  const clampedUsed = Math.max(0, Math.min(100, usedPercent));
  return {
    usedPercent: clampedUsed,
    leftPercent: Math.max(0, Math.min(100, 100 - clampedUsed)),
    ...(windowSeconds !== undefined ? { windowSeconds } : {}),
    ...(resetAt !== undefined ? { resetAt } : {}),
    ...(resetAfterSeconds !== undefined ? { resetAfterSeconds } : {}),
  };
}

function normalizeRateLimit(
  id: string,
  name: string,
  apiRateLimit: ApiRateLimit | null | undefined,
  options: { meteredFeature?: string; reachedType?: string | null } = {},
): RateLimit | undefined {
  if (!apiRateLimit) return undefined;
  const primary = normalizeWindow(apiRateLimit.primary_window);
  const secondary = normalizeWindow(apiRateLimit.secondary_window);
  if (!primary && !secondary && apiRateLimit.allowed === undefined && apiRateLimit.limit_reached === undefined) {
    return undefined;
  }

  return {
    id,
    name,
    ...(options.meteredFeature ? { meteredFeature: options.meteredFeature } : {}),
    ...(apiRateLimit.allowed !== undefined ? { allowed: apiRateLimit.allowed } : {}),
    ...(apiRateLimit.limit_reached !== undefined ? { limitReached: apiRateLimit.limit_reached } : {}),
    ...(options.reachedType !== undefined ? { reachedType: options.reachedType } : {}),
    ...(primary ? { primary } : {}),
    ...(secondary ? { secondary } : {}),
  };
}

export function normalizeApiUsage(
  api: ApiUsageResponse,
  meta: {
    endpoint?: string;
    authSource?: "multicodex" | "pi" | "codex";
    includeRaw?: boolean;
  } = {},
): CodexUsageSnapshot {
  const additionalLimits: RateLimit[] = [];

  for (const item of api.additional_rate_limits ?? []) {
    const name = item.limit_name || item.metered_feature || "Additional Codex limit";
    const id = item.metered_feature || name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const normalized = normalizeRateLimit(id || "additional", name, item.rate_limit, {
      ...(item.metered_feature !== undefined ? { meteredFeature: item.metered_feature } : {}),
    });
    if (normalized) additionalLimits.push(normalized);
  }

  const codeReview = normalizeRateLimit("code_review", "Code Review", api.code_review_rate_limit);
  if (codeReview) additionalLimits.push(codeReview);

  const approxLocalMessages = tuple2(api.credits?.approx_local_messages);
  const approxCloudMessages = tuple2(api.credits?.approx_cloud_messages);
  const credits = api.credits
    ? {
        ...(api.credits.has_credits !== undefined ? { hasCredits: api.credits.has_credits } : {}),
        ...(api.credits.unlimited !== undefined ? { unlimited: api.credits.unlimited } : {}),
        ...(api.credits.overage_limit_reached !== undefined
          ? { overageLimitReached: api.credits.overage_limit_reached }
          : {}),
        ...(api.credits.balance !== undefined ? { balance: String(api.credits.balance) } : {}),
        ...(approxLocalMessages ? { approxLocalMessages } : {}),
        ...(approxCloudMessages ? { approxCloudMessages } : {}),
      }
    : undefined;

  const defaultLimit = normalizeRateLimit("codex", "Codex", api.rate_limit, {
    ...(api.rate_limit_reached_type !== undefined ? { reachedType: api.rate_limit_reached_type } : {}),
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    source: "api",
    fetchedAt: new Date().toISOString(),
    ...(meta.endpoint ? { endpoint: meta.endpoint } : {}),
    ...(meta.authSource ? { authSource: meta.authSource } : {}),
    account: {
      ...(api.email ? { email: api.email } : {}),
      ...(api.plan_type ? { plan: api.plan_type } : {}),
      ...(api.account_id ? { accountId: api.account_id } : {}),
    },
    ...(defaultLimit ? { defaultLimit } : {}),
    additionalLimits,
    ...(credits ? { credits } : {}),
    ...(api.spend_control
      ? {
          spendControl: {
            ...(api.spend_control.reached !== undefined ? { reached: api.spend_control.reached } : {}),
            ...(api.spend_control.individual_limit !== undefined
              ? { individualLimit: api.spend_control.individual_limit }
              : {}),
          },
        }
      : {}),
    ...(meta.includeRaw ? { raw: api } : {}),
  };
}

async function parseErrorBody(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) return response.statusText || "request failed";
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string; code?: string; type?: string } };
    return parsed.error?.message || parsed.error?.code || parsed.error?.type || text.slice(0, 500);
  } catch {
    return text.slice(0, 500);
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchCodexUsage(options: FetchUsageOptions = {}): Promise<CodexUsageSnapshot> {
  const endpoint = options.endpoint ?? DEFAULT_USAGE_ENDPOINT;
  let auth = await resolveAuth({
    ...(options.authSource !== undefined ? { source: options.authSource } : {}),
    ...(options.authFile !== undefined ? { authFile: options.authFile } : {}),
    ...(options.refreshSkewMs !== undefined ? { refreshSkewMs: options.refreshSkewMs } : {}),
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetchWithTimeout(
      endpoint,
      {
        headers: {
          authorization: `Bearer ${auth.accessToken}`,
          ...(auth.accountId ? { "chatgpt-account-id": auth.accountId } : {}),
          accept: "application/json",
          "user-agent": "pi-codex-status/0.1.0",
        },
      },
      options.timeoutMs ?? 15_000,
    );

    if (response.ok) {
      const api = (await response.json()) as ApiUsageResponse;
      return normalizeApiUsage(api, {
        endpoint,
        authSource: auth.source,
        ...(options.includeRaw !== undefined ? { includeRaw: options.includeRaw } : {}),
      });
    }

    if ((response.status === 401 || response.status === 403) && attempt === 0 && auth.refreshToken) {
      auth = await refreshAuth(auth);
      continue;
    }

    throw new Error(`Codex usage request failed (${response.status}): ${await parseErrorBody(response)}`);
  }

  throw new Error("Codex usage request failed after refresh");
}

export async function getCodexUsage(options: CacheOptions = {}): Promise<CodexUsageSnapshot> {
  const cacheFile = options.cacheFile ?? defaultCacheFile();
  const maxAgeMs = options.maxAgeMs ?? 60_000;

  if (!options.noCache) {
    const cached = await readCachedSnapshot(cacheFile);
    if (isFresh(cached, maxAgeMs)) return { ...cached, source: cached.source === "cache" ? "cache" : cached.source };
  }

  const snapshot = await fetchCodexUsage(options);
  await writeCachedSnapshot(snapshot, cacheFile).catch(() => undefined);
  return snapshot;
}
