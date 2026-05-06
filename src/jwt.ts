const OPENAI_AUTH_CLAIM = "https://api.openai.com/auth";
const OPENAI_PROFILE_CLAIM = "https://api.openai.com/profile";

export interface DecodedAccountClaims {
  accountId?: string;
  plan?: string;
  email?: string;
  expiresAtMs?: number;
}

export function decodeJwtPayload(token: string | undefined): Record<string, unknown> | undefined {
  if (!token) return undefined;
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return undefined;

  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function extractAccountClaims(...tokens: Array<string | undefined>): DecodedAccountClaims {
  const result: DecodedAccountClaims = {};

  for (const token of tokens) {
    const payload = decodeJwtPayload(token);
    if (!payload) continue;

    const auth = objectValue(payload[OPENAI_AUTH_CLAIM]);
    const profile = objectValue(payload[OPENAI_PROFILE_CLAIM]);

    const accountId = stringValue(auth?.chatgpt_account_id);
    if (result.accountId === undefined && accountId !== undefined) result.accountId = accountId;

    const plan = stringValue(auth?.chatgpt_plan_type);
    if (result.plan === undefined && plan !== undefined) result.plan = plan;

    const email = stringValue(profile?.email) ?? stringValue(payload.email);
    if (result.email === undefined && email !== undefined) result.email = email;

    const exp = numberValue(payload.exp);
    if (result.expiresAtMs === undefined && exp !== undefined) {
      result.expiresAtMs = exp * 1000;
    }
  }

  return result;
}
