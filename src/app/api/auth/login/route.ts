import { NextRequest, NextResponse } from "next/server";
import User from "@/app/models/user";

export async function POST(req: NextRequest) {
  try {
    // Get client IP address (works on Vercel and locally)
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";

    // Parse request body
    const body = await req.json();
    const email = body.email;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { success: false, message: "Valid email is required" },
        { status: 400 }
      );
    }
    
    User.findOne({ email }).then(async (user) => {
      if (user) {
        // Update login history
        user.loginHistory = user.loginHistory || [];
        user.loginHistory.push({ ip, timestamp: new Date() });
        await user.save();
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Login log error:", err);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
