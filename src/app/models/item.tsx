import mongoose, { Schema, Document, Model } from "mongoose";

export interface IItem extends Document {
  name: string;
  description?: string;
}

const ItemSchema: Schema<IItem> = new Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
});

// Reuse model if already registered (important for Next.js)
export const Item: Model<IItem> =
  mongoose.models.Item || mongoose.model<IItem>("Item", ItemSchema);
