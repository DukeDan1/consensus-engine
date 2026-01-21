import mongoose, { Schema, Document, Types } from "mongoose";

export interface IUserFollow extends Document {
  followerId: Types.ObjectId;
  targetUserId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const UserFollowSchema = new Schema<IUserFollow>(
  {
    followerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true }
);

UserFollowSchema.index({ followerId: 1, targetUserId: 1 }, { unique: true });
UserFollowSchema.index({ targetUserId: 1, createdAt: -1 });

export const UserFollow =
  (mongoose.models.UserFollow as mongoose.Model<IUserFollow>) ||
  mongoose.model<IUserFollow>("UserFollow", UserFollowSchema);
