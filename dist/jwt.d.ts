export interface DecodedAccountClaims {
    accountId?: string;
    plan?: string;
    email?: string;
    expiresAtMs?: number;
}
export declare function decodeJwtPayload(token: string | undefined): Record<string, unknown> | undefined;
export declare function extractAccountClaims(...tokens: Array<string | undefined>): DecodedAccountClaims;
