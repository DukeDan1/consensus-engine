import mongoose, { Schema, Document, Types } from "mongoose";

export interface ITopic extends Document {
  title: string;
  description?: string;
  createdBy: Types.ObjectId;
  isActive: boolean;
  ontologyCategories: Array<{
    id: string;
    label: string;
    description?: string;
    confidence?: number;
    similarity?: number;
  }>;
  argumentCounts: {
    pro: number;
    con: number;
    total: number;
  };
  score: number;          // optional: net score across all arguments
  upvotes?: Types.ObjectId[]; // array of user ids
  downvotes?: Types.ObjectId[]; // array of user ids
  createdAt: Date;
  updatedAt: Date;
  slug: string;           // for friendly URLs
  moderators?: Types.ObjectId[];
  autoModeratorEnabled?: boolean;

  aiModerationProvider?: string;
  aiModerationModel?: string;

  visibility?: {
    status: 'visible' | 'hidden' | 'needs_review' | 'blocked' | 'noise';
    moderatedAt?: Date;
    reason?: string;
    categories?: string[];
    spamLikelihood?: number;
    trollingLikelihood?: number;
    offTopicLikelihood?: number;
    illegalOrHarmfulLikelihood?: number;
    quality?: number;
    model?: string;
  };
}

const TopicSchema = new Schema<ITopic>({
  title: { type: String, required: true, trim: true, maxlength: 180 },
  description: { type: String },
  slug: { type: String, index: true, unique: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  isActive: { type: Boolean, default: true, index: true },
  ontologyCategories: {
    type: [
      {
        id: { type: String, required: true },
        label: { type: String, required: true },
        description: { type: String },
        confidence: { type: Number },
        similarity: { type: Number },
      },
    ],
    default: [],
  },
  argumentCounts: {
    pro: { type: Number, default: 0 },
    con: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  score: { type: Number, default: 0 }, // sum of argument scores if you want
  upvotes: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
  downvotes: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
  aiModerationProvider: { type: String },
  aiModerationModel: { type: String },
  visibility: {
    status: { type: String, enum: ['visible', 'hidden', 'needs_review', 'blocked', 'noise'], default: 'visible', index: true },
    moderatedAt: { type: Date },
    reason: { type: String },
    categories: { type: [String], default: [] },
    spamLikelihood: { type: Number },
    trollingLikelihood: { type: Number },
    offTopicLikelihood: { type: Number },
    illegalOrHarmfulLikelihood: { type: Number },
    quality: { type: Number },
    model: { type: String },
  },
  moderators: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
  autoModeratorEnabled: { type: Boolean, default: true },
}, { timestamps: true });

TopicSchema.index({ createdAt: -1 });
TopicSchema.index({ score: -1 });
TopicSchema.index({ "ontologyCategories.id": 1, createdAt: -1 });
TopicSchema.index({ "visibility.status": 1, createdAt: -1 });


export default mongoose.models.Topic || mongoose.model<ITopic>("Topic", TopicSchema);
