import mongoose, { Schema, Document, Types } from "mongoose";

export interface ISummaryPoint {
    argument?: Types.ObjectId;
    text: string;
    stance: "for" | "against" | "neutral";
    lastUpdatedAt?: Date;
}

export interface ITopicSummary extends Document {
    topic: Types.ObjectId;
    generatedAt: Date;
    points: {
        for: ISummaryPoint[];
        against: ISummaryPoint[];
        neutral: ISummaryPoint[];
    };
}

const SummaryPointSchema = new Schema<ISummaryPoint>({
    argument: { type: Schema.Types.ObjectId, ref: "Argument" },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    stance: { type: String, enum: ["for", "against", "neutral"], required: true },
    lastUpdatedAt: { type: Date, default: Date.now },
}, { _id: false });

const TopicSummarySchema = new Schema<ITopicSummary>({
    topic: { type: Schema.Types.ObjectId, ref: "Topic", required: true, unique: true },
    generatedAt: { type: Date, default: Date.now, index: true },
    points: {
        for: { type: [SummaryPointSchema], default: [] },
        against: { type: [SummaryPointSchema], default: [] },
        neutral: { type: [SummaryPointSchema], default: [] },
    },
});

export const TopicSummary = mongoose.models.TopicSummary || mongoose.model<ITopicSummary>("TopicSummary", TopicSummarySchema);
