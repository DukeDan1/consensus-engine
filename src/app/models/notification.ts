import mongoose, { Schema, Document, Types } from "mongoose";

export type NotificationType = "comment_reply";

export interface INotification extends Document {
  recipient: Types.ObjectId;
  actor?: Types.ObjectId;
  type: NotificationType;
  topic?: Types.ObjectId;
  argument?: Types.ObjectId;
  comment?: Types.ObjectId;
  message?: string;
  topicTitle?: string;
  argumentSnippet?: string;
  commentSnippet?: string;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    recipient: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    actor: { type: Schema.Types.ObjectId, ref: "User" },
    type: { type: String, enum: ["comment_reply"], required: true, index: true },
    topic: { type: Schema.Types.ObjectId, ref: "Topic", index: true },
    argument: { type: Schema.Types.ObjectId, ref: "Argument", index: true },
    comment: { type: Schema.Types.ObjectId, ref: "Comment", index: true },
    message: { type: String, maxlength: 500 },
    topicTitle: { type: String, maxlength: 240 },
    argumentSnippet: { type: String, maxlength: 500 },
    commentSnippet: { type: String, maxlength: 500 },
    readAt: { type: Date, index: true },
  },
  { timestamps: true }
);

NotificationSchema.index({ recipient: 1, createdAt: -1 });

export const Notification =
  (mongoose.models.Notification as mongoose.Model<INotification>) ||
  mongoose.model<INotification>("Notification", NotificationSchema);
