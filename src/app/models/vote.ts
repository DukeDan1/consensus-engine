import mongoose, { Schema, Document, Types } from "mongoose";
export type VoteValue = 1 | -1;
export type VotableModel = "Argument" | "Topic"; // optional

export interface IVote extends Document {
  user: Types.ObjectId;
  targetId: Types.ObjectId;
  targetType: VotableModel;  // "Argument" or "Topic"
  value: VoteValue;          // 1 = upvote, -1 = downvote
  createdAt: Date;
  updatedAt: Date;
}

const VoteSchema = new Schema<IVote>({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  targetId: { type: Schema.Types.ObjectId, required: true, index: true },
  targetType: { type: String, enum: ["Argument", "Topic"], required: true, index: true },
  value: { type: Number, enum: [1, -1], required: true },
}, { timestamps: true });

// Prevent duplicate votes by same user on same target
VoteSchema.index({ user: 1, targetType: 1, targetId: 1 }, { unique: true });

export const Vote = mongoose.model<IVote>("Vote", VoteSchema);
