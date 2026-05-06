import type { AuthSource } from "./types.js";
export declare const OPENAI_CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
export interface AuthCredentials {
    source: "pi" | "codex";
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
export declare function resolveAuth(options?: ResolveAuthOptions): Promise<AuthCredentials>;
export declare function shouldRefresh(auth: AuthCredentials, refreshSkewMs?: number): boolean;
export declare function refreshIfNeeded(auth: AuthCredentials, refreshSkewMs?: number): Promise<AuthCredentials>;
export declare function refreshAuth(auth: AuthCredentials): Promise<AuthCredentials>;
export declare function authSearchPaths(): string[];
export declare function ensureAuthDirectory(path: string): Promise<void>;
