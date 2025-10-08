import mongoose, { Schema, Document, Types } from "mongoose";
export type ArgumentSide = "pro" | "con";

export interface IArgument extends Document {
  topic: Types.ObjectId;
  side: ArgumentSide;
  body: string;
  createdBy: Types.ObjectId;
  upvoteCount: number;
  downvoteCount: number;
  score: number;          // up - down
  createdAt: Date;
  updatedAt: Date;
  editedAt?: Date;
  isRemoved: boolean;
}

const ArgumentSchema = new Schema<IArgument>({
  topic: { type: Schema.Types.ObjectId, ref: "Topic", required: true, index: true },
  side: { type: String, enum: ["pro", "con"], required: true, index: true },
  body: { type: String, required: true, trim: true, maxlength: 10000 },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  upvoteCount: { type: Number, default: 0 },
  downvoteCount: { type: Number, default: 0 },
  score: { type: Number, default: 0 },
  editedAt: { type: Date },
  isRemoved: { type: Boolean, default: false, index: true },
}, { timestamps: true });

ArgumentSchema.index({ topic: 1, score: -1, createdAt: -1 });
ArgumentSchema.index({ topic: 1, side: 1, createdAt: -1 });

export const Argument = mongoose.model<IArgument>("Argument", ArgumentSchema);
