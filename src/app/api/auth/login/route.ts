import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/app/lib/mongoose";
import User from "@/app/models/user";
import { findUserByEmailOrPhone } from "@/app/services/authService";
import { comparePassword } from "@/app/services/passwordService";
import { issueBearerToken, AUTH_TOKEN_MAX_AGE_SECONDS } from "@/app/services/authTokenService";

function extractClientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function recordLogin(email: string, ip?: string) {
  if (!email) return;
  try {
    await dbConnect();
    const user = await User.findOne({ email });
    if (!user) return;
    user.loginHistory = user.loginHistory || [];
    user.loginHistory.push({ ip: ip || "unknown", timestamp: new Date() });
    await user.save();
  } catch (err) {
    console.error("Login log error:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: "Valid email and password are required" },
        { status: 400 }
      );
    }

    await dbConnect();
    const user = await findUserByEmailOrPhone(email);
    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { success: false, message: "Invalid email or password" },
        { status: 401 }
      );
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { success: false, message: "Invalid email or password" },
        { status: 401 }
      );
    }
    if (user.isSuspended) {
      return NextResponse.json(
        { success: false, message: "Account suspended" },
        { status: 403 }
      );
    }

    const ip = extractClientIp(req.headers);
    void recordLogin(user.email, ip);

    const token = await issueBearerToken({
      id: user._id.toString(),
      email: user.email,
      name: user.name ?? null,
      avatarUrl: user.avatarUrl ?? null,
      isAdmin: !!user.isAdmin,
    });

    return NextResponse.json({
      success: true,
      token,
      tokenType: "Bearer",
      expiresIn: AUTH_TOKEN_MAX_AGE_SECONDS,
    });
  } catch (err) {
    console.error("Login log error:", err);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
