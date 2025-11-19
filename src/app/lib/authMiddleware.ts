import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

/**
 * Authentication middleware for API routes.
 * Checks if the user has a valid session.
 * Returns null if authenticated, or an error response if not.
 * 
 * Usage:
 * ```
 * const authError = await requireAuth();
 * if (authError) return authError;
 * ```
 */
export async function requireAuth(): Promise<NextResponse | null> {
  const session = await getServerSession();
  
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Unauthorized. Please log in to access this resource." },
      { status: 401 }
    );
  }
  
  return null;
}

/**
 * Gets the current authenticated session.
 * Throws an error response if not authenticated.
 * Returns the session if authenticated.
 */
export async function getAuthenticatedSession() {
  const session = await getServerSession();
  
  if (!session?.user?.email) {
    throw NextResponse.json(
      { error: "Unauthorized. Please log in to access this resource." },
      { status: 401 }
    );
  }
  
  return session;
}
