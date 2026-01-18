import mongoose, { Schema, Document, Types } from "mongoose";

export type NotificationTargetType = "topic" | "argument";

export interface INotificationSubscription extends Document {
  userId: Types.ObjectId;
  targetType: NotificationTargetType;
  targetId: Types.ObjectId;
  muted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSubscriptionSchema = new Schema<INotificationSubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    targetType: { type: String, enum: ["topic", "argument"], required: true, index: true },
    targetId: { type: Schema.Types.ObjectId, required: true, index: true },
    muted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

NotificationSubscriptionSchema.index(
  { userId: 1, targetType: 1, targetId: 1 },
  { unique: true }
);

export const NotificationSubscription =
  (mongoose.models.NotificationSubscription as mongoose.Model<INotificationSubscription>) ||
  mongoose.model<INotificationSubscription>("NotificationSubscription", NotificationSubscriptionSchema);
