import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { dbConnect } from "@/app/lib/mongoose";
import User from "@/app/models/user";

const PUBLIC_ROUTES = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
]);

const PUBLIC_API_PREFIXES = [
  "/api/auth",
  "/api/register",
  "/api/forgot-password",
  "/api/reset-password",
  "/api/top-topics"
];

function isPublicRoute(pathname: string) {
  if (PUBLIC_ROUTES.has(pathname)) return true;
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

async function isUserSuspended(token: any) {
  await dbConnect();
  const user = await User.findById(token.id).select({ isSuspended: 1 }).lean();
  return !!user?.isSuspended;
}

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const normalisedPath = pathname !== "/" && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

  if (isPublicRoute(normalisedPath)) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  const suspended = token ? await isUserSuspended(token) : false;
  if (!token || suspended) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    loginUrl.searchParams.set("unauthed", "true");
    const response = NextResponse.redirect(loginUrl);
    if (suspended) {
      response.cookies.set("next-auth.session-token", "", { maxAge: 0, path: "/" });
      response.cookies.set("__Secure-next-auth.session-token", "", { maxAge: 0, path: "/" });
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
