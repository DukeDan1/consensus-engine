import mongoose, { Schema, Document, Types } from "mongoose";
export interface IComment extends Document {
  argument: Types.ObjectId;
  parent?: Types.ObjectId; // for threading
  body: string;
  createdBy: Types.ObjectId;
  isRemoved: boolean;
  upvoteCount: number;
  downvoteCount: number;
  score: number;
  createdAt: Date;
  updatedAt: Date;
  ontologyCategories: Array<{
    id: string;
    label: string;
    description?: string;
    confidence?: number;
    similarity?: number;
  }>;

  evidence?: Array<{
    url: string;
    kind: 'link' | 'file';
    fileName?: string;
    contentType?: string;
    label?: string;
    previewUrl?: string;
    originalUrl?: string;
    originalPreviewUrl?: string;
    blurred?: boolean;
    blurReasons?: string[];
    factCheck?: {
      verdict?: "verified" | "false" | "mixed" | "unverified";
      qualityScore?: number;
      confidence?: number;
      summary?: string;
      checkedAt?: Date;
      model?: string;
    };
  }>;

  evidenceRankScore?: number;

  visibility?: {
    status: 'visible' | 'hidden' | 'needs_review' | 'blocked';
    rankPenalty?: number;
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

const CommentSchema = new Schema<IComment>({
  argument: { type: Schema.Types.ObjectId, ref: "Argument", required: true, index: true },
  parent: { type: Schema.Types.ObjectId, ref: "Comment" },
  body: { type: String, required: true, maxlength: 5000 },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  isRemoved: { type: Boolean, default: false, index: true },
  upvoteCount: { type: Number, default: 0 },
  downvoteCount: { type: Number, default: 0 },
  score: { type: Number, default: 0 },
  ontologyCategories: {
    type: [
      {
        id: { type: String, required: true },
        label: { type: String, required: true },
        description: { type: String },
        confidence: { type: Number },
        similarity: { type: Number },
      }
    ],
    default: [],
  },
  evidence: {
    type: [
      {
        url: { type: String, required: true },
        kind: { type: String, enum: ['link', 'file'], default: 'link' },
        fileName: { type: String },
        contentType: { type: String },
        label: { type: String },
        previewUrl: { type: String },
        originalUrl: { type: String },
        originalPreviewUrl: { type: String },
        blurred: { type: Boolean },
        blurReasons: { type: [String], default: [] },
        factCheck: {
          verdict: { type: String, enum: ["verified", "false", "mixed", "unverified"] },
          qualityScore: { type: Number },
          confidence: { type: Number },
          summary: { type: String },
          checkedAt: { type: Date },
          model: { type: String },
        },
      }
    ],
    default: [],
  },
  evidenceRankScore: { type: Number, default: 0 },
  visibility: {
    status: { type: String, enum: ['visible', 'hidden', 'needs_review', 'blocked'], default: 'visible', index: true },
    rankPenalty: { type: Number, default: 0 },
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
}, { timestamps: true });

CommentSchema.index({ argument: 1, createdAt: 1 });
CommentSchema.index({ "ontologyCategories.id": 1, argument: 1 });
CommentSchema.index({ argument: 1, "visibility.status": 1, createdAt: -1 });


export default mongoose.models.Comment || mongoose.model<IComment>("Comment", CommentSchema);
