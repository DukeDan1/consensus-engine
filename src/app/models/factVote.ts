import mongoose, { Schema, Document, Types } from "mongoose";

export type FactVoteValue = 1 | -1;

export interface IFactVote extends Document {
  user: Types.ObjectId;
  fact: Types.ObjectId;
  value: FactVoteValue;        // 1 = upvote, -1 = downvote
  reason?: string;             // optional rationale for the vote
  createdAt: Date;
  updatedAt: Date;
}

const FactVoteSchema = new Schema<IFactVote>({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  fact: { type: Schema.Types.ObjectId, ref: "Fact", required: true, index: true },
  value: { type: Number, enum: [1, -1], required: true },
  reason: { type: String, trim: true, maxlength: 2000 },
}, { timestamps: true });

// One vote per user per fact
FactVoteSchema.index({ user: 1, fact: 1 }, { unique: true });

export default mongoose.models.FactVote || mongoose.model<IFactVote>("FactVote", FactVoteSchema);
