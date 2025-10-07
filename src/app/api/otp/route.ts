// src/app/api/otp/route.ts


import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { createOTP } from "@/app/services/otpService";

async function connectDB() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI!);
  }
}

export async function POST(req: Request) {
  const { phone } = await req.json();
  if (!phone) {
    return NextResponse.json({ error: "Phone number required" }, { status: 400 });
  }

  await connectDB();
  const code = await createOTP(phone);

  // Replace this with actual SMS or email send
  console.log(`OTP for ${phone}: ${code}`);

  return NextResponse.json({ success: true });
}
