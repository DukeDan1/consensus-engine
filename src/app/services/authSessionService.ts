import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { getAuthTokenFromRequest } from "@/app/services/authTokenService";

export type AuthSession = {
  email?: string | null;
  id?: string | null;
  token?: Record<string, any> | null;
};

export async function getAuthSession(req: NextRequest): Promise<AuthSession> {
  const token = await getAuthTokenFromRequest(req);
  if (token?.email) {
    return {
      email: typeof token.email === "string" ? token.email : null,
      id: typeof token.id === "string" ? token.id : null,
      token: token as Record<string, any>,
    };
  }

  const session = await getServerSession();
  return {
    email: session?.user?.email ?? null,
    id: session?.user?.id ?? null,
    token: null,
  };
}
