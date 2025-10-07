import mongoose, { Schema, Document } from 'mongoose';

interface UserPreferences {
  theme?: 'light' | 'dark';
  notifications?: {
    email: boolean;
    sms: boolean;
  };
  language?: 'en' | 'fr' | 'es';
  custom?: Record<string, string | number | boolean>;
}

export interface IUser extends Document {
  email: string;
  name?: string;
  signupIP: string;
  lastLoginIP: string;
  preferences?: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  email: { type: String, required: true },
  name: String,
  signupIP: String,
  lastLoginIP: String,
  preferences: {
    theme: { type: String, enum: ['light', 'dark'] },
    notifications: {
      email: Boolean,
      sms: Boolean,
    },
    language: { type: String, enum: ['en', 'fr', 'es'] },
  }
},  { timestamps: true, strict: true });

export default mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
