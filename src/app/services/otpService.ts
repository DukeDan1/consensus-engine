// src/app/services/otpService.ts

import mongoose, { Schema, Document } from "mongoose";

interface IOTP extends Document {
  phone: string;
  code: string;
  expiresAt: Date;
}

const OTPSchema = new Schema<IOTP>(
  {
    phone: { type: String, required: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// Auto-delete expired OTPs using TTL index
OTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const OTPModel =
  mongoose.models.OTP || mongoose.model<IOTP>("OTP", OTPSchema);

/** Generate a 6-digit code and save to MongoDB */
export async function createOTP(phone: string): Promise<string> {
  const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

  await OTPModel.create({ phone, code, expiresAt });
  return code;
}

/** Verify if the OTP is valid and not expired */
export async function verifyOTP(phone: string, code: string): Promise<boolean> {
  const record = await OTPModel.findOne({ phone, code });
  return !!record; // true if exists (auto-expired if TTL passed)
}

/** Delete OTP after successful verification (optional) */
export async function consumeOTP(phone: string, code: string): Promise<void> {
  await OTPModel.deleteOne({ phone, code });
}
