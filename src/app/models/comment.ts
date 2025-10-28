import mongoose, { Schema, Document, Types } from "mongoose";
export interface IComment extends Document {
  argument: Types.ObjectId;
  parent?: Types.ObjectId; // for threading
  body: string;
  createdBy: Types.ObjectId;
  isRemoved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CommentSchema = new Schema<IComment>({
  argument: { type: Schema.Types.ObjectId, ref: "Argument", required: true, index: true },
  parent: { type: Schema.Types.ObjectId, ref: "Comment" },
  body: { type: String, required: true, maxlength: 5000 },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  isRemoved: { type: Boolean, default: false, index: true },
}, { timestamps: true });

CommentSchema.index({ argument: 1, createdAt: 1 });

export const Comment = mongoose.model<IComment>("Comment", CommentSchema);
