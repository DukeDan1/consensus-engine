// models/Entry.ts
import mongoose, { Schema, Document, Model } from "mongoose";

interface IEntry extends Document {
  userId: string;
  title: string;
  description: string;
}

const EntrySchema: Schema<IEntry> = new Schema(
  {
    userId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
  },
  { timestamps: true }
);

// Prevent recompiling model in dev
const Entry: Model<IEntry> =
  mongoose.models.Entry || mongoose.model<IEntry>("Entry", EntrySchema);

export default Entry;
