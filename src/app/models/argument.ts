import mongoose, { Schema, Document, Types } from "mongoose";
export type ArgumentSide = "for" | "against" | "neutral";
import { FactCheckVerdict } from "@/app/lib/evidence";

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
  aiAnalysis?: {
    isFact: boolean;
    justification: string;
    aiSummary: string;
  };
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
      verdict?: FactCheckVerdict;
      qualityScore?: number;
      confidence?: number;
      summary?: string;
      checkedAt?: Date;
      model?: string;
    };
  }>;

  evidenceRankScore?: number;

  contentFactCheck?: {
    verdict?: FactCheckVerdict;
    confidence?: number;
    summary?: string;
    sources?: Array<{
      title?: string;
      url?: string;
      snippet?: string;
    }>;
    checkedAt?: Date;
    model?: string;
  };

  aiModerationProvider?: string;
  aiModerationModel?: string;

  visibility?: {
    status: 'visible' | 'hidden' | 'needs_review' | 'blocked' | 'noise';
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

const ArgumentSchema = new Schema<IArgument>({
  topic: { type: Schema.Types.ObjectId, ref: "Topic", required: true, index: true },
  side: { type: String, enum: ["for", "against", "neutral"], default: "neutral", index: true },
  body: { type: String, required: true, trim: true, maxlength: 10000 },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  upvoteCount: { type: Number, default: 0 },
  downvoteCount: { type: Number, default: 0 },
  score: { type: Number, default: 0 },
  editedAt: { type: Date },
  isRemoved: { type: Boolean, default: false, index: true },
  aiAnalysis: {
    isFact: { type: Boolean },
    justification: { type: String },
    aiSummary: { type: String },
  },
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
  }
  ,
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
          verdict: { type: String, enum: ["verified", "inaccurate", "mixed", "unverified"] },
          qualityScore: { type: Number },
          confidence: { type: Number },
          summary: { type: String },
          checkedAt: { type: Date },
          model: { type: String },
        },
      },
    ],
    default: [],
  },
  evidenceRankScore: { type: Number, default: 0 },
  contentFactCheck: {
    verdict: { type: String, enum: ["verified", "inaccurate", "mixed", "unverified"] },
    confidence: { type: Number },
    summary: { type: String },
    sources: {
      type: [
        {
          title: { type: String },
          url: { type: String },
          snippet: { type: String },
        },
      ],
      default: [],
    },
    checkedAt: { type: Date },
    model: { type: String },
  },
  aiModerationProvider: { type: String },
  aiModerationModel: { type: String },
  visibility: {
    status: { type: String, enum: ['visible', 'hidden', 'needs_review', 'blocked', 'noise'], default: 'visible', index: true },
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

ArgumentSchema.index({ topic: 1, score: -1, createdAt: -1 });
ArgumentSchema.index({ topic: 1, side: 1, createdAt: -1 });
ArgumentSchema.index({ "ontologyCategories.id": 1, topic: 1 });
ArgumentSchema.index({ topic: 1, "visibility.status": 1, score: -1, createdAt: -1 });


export default mongoose.models.Argument || mongoose.model<IArgument>("Argument", ArgumentSchema);
