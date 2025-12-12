import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { findUserByEmailOrPhone, createUser } from "@/app/services/authService";

export async function GET(req: Request) {
  await mongoose.connect(process.env.MONGODB_URI!);

  const url = new URL(req.url);
  const emailFromQuery = url.searchParams.get("email") || undefined;
  const phoneFromQuery = url.searchParams.get("phone") || undefined;

  let email = emailFromQuery;
  let phone = phoneFromQuery;

  // Fallback to body parsing for non-GET clients that still send JSON
  if (!email && !phone) {
    try {
      const parsed = await req.json();
      email = parsed?.email;
      phone = parsed?.phone;
    } catch {
      // ignore body parsing errors for GET without body
    }
  }

  if (!email && !phone) {
    return NextResponse.json({ error: "Missing email or phone" }, { status: 400 });
  }

  let user = await findUserByEmailOrPhone(email, phone);

  if (!user) {
    user = await createUser({ email, phone });
  }

  // For now just return the user document (omit sensitive fields if any)
  return NextResponse.json({ user });
}
