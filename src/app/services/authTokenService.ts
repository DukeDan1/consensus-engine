import { encode, getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

export const AUTH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function getAuthSecret(): string | undefined {
  return process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
}

export async function issueBearerToken(payload: Record<string, any>, maxAgeSeconds = AUTH_TOKEN_MAX_AGE_SECONDS) {
  const secret = getAuthSecret();
  if (!secret) {
    throw new Error("Missing NEXTAUTH_SECRET");
  }
  return encode({
    token: payload,
    secret,
    maxAge: maxAgeSeconds,
  });
}

export async function getAuthTokenFromRequest(req: NextRequest) {
  const secret = getAuthSecret();
  if (!secret) {
    return null;
  }
  return getToken({ req, secret });
}
