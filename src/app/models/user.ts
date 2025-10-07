import mongoose, { Schema, Document } from "mongoose";

interface UserPreferences {
  theme?: "light" | "dark";
  notifications?: {
    email: boolean;
    sms: boolean;
    push?: boolean; // added push for mobile/web apps
  };
  language?: "en" | "fr" | "es" | "de" | "hi" | "ml"; // can expand later
  custom?: Record<string, string | number | boolean>;
}

export interface IUser extends Document {
  email?: string;
  phone?: string;
  name?: string;        // full legal name
  nickname?: string;    // casual display name
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
  signupIP?: string;
  lastLoginIP?: string;
  authProvider?: "email" | "phone" | "google" | "apple" | "password";
  passwordHash?: string; // hashed password only
  gdprConsent?: {
    accepted: boolean;
    acceptedAt?: Date;
    version?: string; // version of your GDPR statement
  };
  profileCompleted?: boolean; // overall onboarding flag
  onboardingStep?: number;    // track step in progressive profile flow
  preferences?: UserPreferences;
  createdAt?: Date;
  updatedAt?: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: false, unique: true, sparse: true, lowercase: true, trim: true },
    phone: { type: String, required: false, unique: true, sparse: true },
    name: { type: String },
    nickname: { type: String },
    address: {
      line1: { type: String },
      line2: { type: String },
      city: { type: String },
      postalCode: { type: String },
      country: { type: String },
    },
    signupIP: String,
    lastLoginIP: String,
    authProvider: {
      type: String,
      enum: ["email", "phone", "google", "apple", "password"],
      default: "email",
    },
    passwordHash: { type: String },
    gdprConsent: {
      accepted: { type: Boolean, default: false },
      acceptedAt: { type: Date },
      version: { type: String }, // helpful if you update your privacy terms
    },
    profileCompleted: { type: Boolean, default: false },
    onboardingStep: { type: Number, default: 0 }, // progressive profile completion
    preferences: {
      theme: { type: String, enum: ["light", "dark"], default: "light" },
      notifications: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
        push: { type: Boolean, default: false },
      },
      language: { type: String, enum: ["en", "fr", "es", "de", "hi", "ml"], default: "en" },
      custom: { type: Map, of: Schema.Types.Mixed },
    },
  },
  { timestamps: true, strict: true }
);

// Optional indexes
// UserSchema.index({ email: 1 });
// UserSchema.index({ phone: 1 });

export default mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
