import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { findUserByEmailOrPhone, createUser } from "@/app/services/authService";

export async function GET(req: Request) {
  await mongoose.connect(process.env.MONGODB_URI!);

  const { email, phone } = await req.json();
  let user = await findUserByEmailOrPhone(email, phone);

  if (!user) {
    user = await createUser({ email, phone });
  }

  // For now just return the user document (omit sensitive fields if any)
  return NextResponse.json({ user });
}
