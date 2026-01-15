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
  bio?: string;
  avatarUrl?: string;
  avatarThumbUrl?: string;
  avatarOriginalUrl?: string;
  avatarOriginalThumbUrl?: string;
  avatarModeration?: {
    status?: "flagged" | "approved" | "removed";
    reasons?: string[];
    flaggedAt?: Date;
    reviewedAt?: Date;
    reviewedBy?: string;
  };
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
  loginHistory?: Array<{
    ip?: string;
    timestamp: Date;
    userAgent?: string;
  }> | undefined;

  // Moderation / reputation
  isAdmin?: boolean;
  isSuspended?: boolean;
  suspendedAt?: Date;
  trustScore?: number;
  trustTier?: 'low' | 'new' | 'standard' | 'trusted' | 'high';
  trustUpdatedAt?: Date;
  trustEvents?: Array<{
    ts: Date;
    delta: number;
    reason: string;
    meta?: Record<string, unknown>;
  }>;

  // TODO possible extension - lightweight anti-spam rate limiting
  lastPostAt?: Date;
  postWindowStartAt?: Date;
  postsInWindow?: number;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: false, unique: true, sparse: true, lowercase: true, trim: true },
    phone: { type: String, required: false, unique: true, sparse: true },
    name: { type: String },
    nickname: { type: String },
    bio: { type: String, maxlength: 1000 },
    avatarUrl: { type: String },
    avatarThumbUrl: { type: String },
    avatarOriginalUrl: { type: String },
    avatarOriginalThumbUrl: { type: String },
    avatarModeration: {
      status: { type: String, enum: ["flagged", "approved", "removed"], default: undefined },
      reasons: { type: [String], default: [] },
      flaggedAt: { type: Date },
      reviewedAt: { type: Date },
      reviewedBy: { type: String },
    },
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
    loginHistory: [
      {
        ip: String,
        timestamp: { type: Date, default: Date.now },
        userAgent: String,
      },
    ],

    trustScore: { type: Number, default: 50, min: 0, max: 100, index: true },
    isAdmin: { type: Boolean, default: false, index: true },
    isSuspended: { type: Boolean, default: false, index: true },
    suspendedAt: { type: Date },
    trustTier: {
      type: String,
      enum: ['low', 'new', 'standard', 'trusted', 'high'],
      default: 'new',
      index: true,
    },
    trustUpdatedAt: { type: Date },
    trustEvents: [
      {
        ts: { type: Date, default: Date.now },
        delta: { type: Number, default: 0 },
        reason: { type: String, default: '' },
        meta: { type: Schema.Types.Mixed, default: {} },
      },
    ],

    lastPostAt: { type: Date },
    postWindowStartAt: { type: Date },
    postsInWindow: { type: Number, default: 0 },
  },
  { timestamps: true, strict: true }
);

// Optional indexes
// UserSchema.index({ email: 1 });
// UserSchema.index({ phone: 1 });

export default mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
