import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { extractAccountClaims } from "./jwt.js";
import type { AuthSource } from "./types.js";

export const OPENAI_CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const DEFAULT_REFRESH_SKEW_MS = 5 * 60 * 1000;

export interface AuthCredentials {
  source: "multicodex" | "pi" | "codex";
  path: string;
  accessToken: string;
  refreshToken?: string;
  accountId?: string;
  email?: string;
  plan?: string;
  expiresAtMs?: number;
  raw: Record<string, unknown>;
}

export interface ResolveAuthOptions {
  source?: AuthSource;
  authFile?: string;
  refreshSkewMs?: number;
}

interface RefreshResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
}

function homePath(relative: string): string {
  return join(process.env.HOME || process.env.USERPROFILE || ".", relative);
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  const text = await readFile(path, "utf8");
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path} is not a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await chmod(tmp, 0o600).catch(() => undefined);
  await rename(tmp, path);
}

function parsePiAuth(raw: Record<string, unknown>, path: string): AuthCredentials | undefined {
  const entry = raw["openai-codex"];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
  const obj = entry as Record<string, unknown>;
  const accessToken = stringField(obj.access);
  if (!accessToken) return undefined;

  const claims = extractAccountClaims(accessToken);
  const refreshToken = stringField(obj.refresh);
  const accountId = stringField(obj.accountId) ?? claims.accountId;
  const expiresAtMs = numberField(obj.expires) ?? claims.expiresAtMs;
  return {
    source: "pi",
    path,
    accessToken,
    ...(refreshToken !== undefined ? { refreshToken } : {}),
    ...(accountId !== undefined ? { accountId } : {}),
    ...(claims.email !== undefined ? { email: claims.email } : {}),
    ...(claims.plan !== undefined ? { plan: claims.plan } : {}),
    ...(expiresAtMs !== undefined ? { expiresAtMs } : {}),
    raw,
  };
}

function parseCodexAuth(raw: Record<string, unknown>, path: string): AuthCredentials | undefined {
  const tokens = raw.tokens;
  if (!tokens || typeof tokens !== "object" || Array.isArray(tokens)) return undefined;
  const obj = tokens as Record<string, unknown>;
  const accessToken = stringField(obj.access_token);
  if (!accessToken) return undefined;

  const idToken = stringField(obj.id_token);
  const claims = extractAccountClaims(accessToken, idToken);
  const refreshToken = stringField(obj.refresh_token);
  const accountId = stringField(obj.account_id) ?? claims.accountId;
  return {
    source: "codex",
    path,
    accessToken,
    ...(refreshToken !== undefined ? { refreshToken } : {}),
    ...(accountId !== undefined ? { accountId } : {}),
    ...(claims.email !== undefined ? { email: claims.email } : {}),
    ...(claims.plan !== undefined ? { plan: claims.plan } : {}),
    ...(claims.expiresAtMs !== undefined ? { expiresAtMs: claims.expiresAtMs } : {}),
    raw,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseMulticodexAuth(raw: Record<string, unknown>, path: string): AuthCredentials | undefined {
  const accounts = Array.isArray(raw.accounts) ? raw.accounts.filter(isRecord) : [];
  if (accounts.length === 0) return undefined;

  const activeEmail = stringField(raw.activeEmail);
  const active = activeEmail ? accounts.find((account) => account.email === activeEmail) : undefined;
  const fallback = accounts.find((account) => !account.needsReauth);
  const account = active ?? fallback;
  if (!account) return undefined;

  const accessToken = stringField(account.accessToken);
  if (!accessToken) return undefined;

  const claims = extractAccountClaims(accessToken);
  const refreshToken = stringField(account.refreshToken);
  const accountId = stringField(account.accountId) ?? claims.accountId;
  const expiresAtMs = numberField(account.expiresAt) ?? claims.expiresAtMs;
  const email = stringField(account.email) ?? claims.email;
  return {
    source: "multicodex",
    path,
    accessToken,
    ...(refreshToken !== undefined ? { refreshToken } : {}),
    ...(accountId !== undefined ? { accountId } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(claims.plan !== undefined ? { plan: claims.plan } : {}),
    ...(expiresAtMs !== undefined ? { expiresAtMs } : {}),
    raw,
  };
}

async function tryReadSource(
  source: "multicodex" | "pi" | "codex",
  authFile?: string,
): Promise<AuthCredentials | undefined> {
  const path =
    authFile ??
    (source === "multicodex"
      ? homePath(".pi/agent/codex-accounts.json")
      : source === "pi"
        ? homePath(".pi/agent/auth.json")
        : homePath(".codex/auth.json"));
  try {
    const raw = await readJson(path);
    if (source === "multicodex") return parseMulticodexAuth(raw, path);
    return source === "pi" ? parsePiAuth(raw, path) : parseCodexAuth(raw, path);
  } catch {
    return undefined;
  }
}

export async function resolveAuth(options: ResolveAuthOptions = {}): Promise<AuthCredentials> {
  if (options.source === "multicodex" || options.source === "pi" || options.source === "codex") {
    const auth = await tryReadSource(options.source, options.authFile);
    if (!auth) throw new Error(`No usable ${options.source} Codex OAuth credentials found`);
    return refreshIfNeeded(auth, options.refreshSkewMs);
  }

  const multicodex = await tryReadSource("multicodex", options.authFile);
  if (multicodex) return refreshIfNeeded(multicodex, options.refreshSkewMs);

  const pi = await tryReadSource("pi", options.authFile);
  if (pi) return refreshIfNeeded(pi, options.refreshSkewMs);

  const codex = await tryReadSource("codex", options.authFile);
  if (codex) return refreshIfNeeded(codex, options.refreshSkewMs);

  throw new Error(
    "No usable Codex OAuth credentials found. Run /multicodex use, pi /login for OpenAI Codex, or `codex login` first.",
  );
}

export function shouldRefresh(auth: AuthCredentials, refreshSkewMs = DEFAULT_REFRESH_SKEW_MS): boolean {
  if (!auth.refreshToken) return false;
  if (!auth.expiresAtMs) return false;
  return auth.expiresAtMs <= Date.now() + refreshSkewMs;
}

export async function refreshIfNeeded(
  auth: AuthCredentials,
  refreshSkewMs = DEFAULT_REFRESH_SKEW_MS,
): Promise<AuthCredentials> {
  if (!shouldRefresh(auth, refreshSkewMs)) return auth;
  return refreshAuth(auth);
}

function encodeForm(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

export async function refreshAuth(auth: AuthCredentials): Promise<AuthCredentials> {
  if (!auth.refreshToken) {
    throw new Error(`Cannot refresh ${auth.source} auth: no refresh token`);
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: encodeForm({
      grant_type: "refresh_token",
      refresh_token: auth.refreshToken,
      client_id: OPENAI_CODEX_CLIENT_ID,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to refresh ${auth.source} auth (${response.status}): ${body.slice(0, 300)}`);
  }

  const refreshed = (await response.json()) as RefreshResponse;
  if (!refreshed.access_token) {
    throw new Error(`Refresh response for ${auth.source} auth did not include access_token`);
  }

  const refreshToken = refreshed.refresh_token ?? auth.refreshToken;
  const expiresAtMs = refreshed.expires_in
    ? Date.now() + refreshed.expires_in * 1000
    : extractAccountClaims(refreshed.access_token).expiresAtMs;
  const claims = extractAccountClaims(refreshed.access_token, refreshed.id_token);

  const accountId = claims.accountId ?? auth.accountId;
  const email = claims.email ?? auth.email;
  const plan = claims.plan ?? auth.plan;
  const nextExpiresAtMs = expiresAtMs ?? auth.expiresAtMs;
  const next: AuthCredentials = {
    ...auth,
    accessToken: refreshed.access_token,
    refreshToken,
    ...(accountId !== undefined ? { accountId } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(plan !== undefined ? { plan } : {}),
    ...(nextExpiresAtMs !== undefined ? { expiresAtMs: nextExpiresAtMs } : {}),
  };

  await persistRefresh(next, refreshed);
  return next;
}

async function persistRefresh(auth: AuthCredentials, refreshed: RefreshResponse): Promise<void> {
  // Re-read so we do not overwrite unrelated auth changes made after resolveAuth().
  const raw = await readJson(auth.path).catch(() => auth.raw);

  if (auth.source === "multicodex") {
    const accounts = Array.isArray(raw.accounts) ? raw.accounts.filter(isRecord) : [];
    const account = accounts.find(
      (candidate) => candidate.email === auth.email || (auth.accountId && candidate.accountId === auth.accountId),
    );
    if (account) {
      account.accessToken = auth.accessToken;
      if (auth.refreshToken) account.refreshToken = auth.refreshToken;
      if (auth.expiresAtMs) account.expiresAt = auth.expiresAtMs;
      if (auth.accountId) account.accountId = auth.accountId;
      delete account.needsReauth;
    }
  } else if (auth.source === "pi") {
    const entry = raw["openai-codex"];
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const obj = entry as Record<string, unknown>;
      obj.access = auth.accessToken;
      if (auth.refreshToken) obj.refresh = auth.refreshToken;
      if (auth.expiresAtMs) obj.expires = auth.expiresAtMs;
      if (auth.accountId) obj.accountId = auth.accountId;
    }
  } else {
    const tokens = raw.tokens;
    if (tokens && typeof tokens === "object" && !Array.isArray(tokens)) {
      const obj = tokens as Record<string, unknown>;
      obj.access_token = auth.accessToken;
      if (auth.refreshToken) obj.refresh_token = auth.refreshToken;
      if (refreshed.id_token) obj.id_token = refreshed.id_token;
      if (auth.accountId) obj.account_id = auth.accountId;
    }
    raw.last_refresh = new Date().toISOString();
  }

  await writeJsonAtomic(auth.path, raw);
}

export function authSearchPaths(): string[] {
  return [homePath(".pi/agent/codex-accounts.json"), homePath(".pi/agent/auth.json"), homePath(".codex/auth.json")];
}

export async function ensureAuthDirectory(path: string): Promise<void> {
  await import("node:fs/promises").then((fs) => fs.mkdir(dirname(path), { recursive: true }));
}
