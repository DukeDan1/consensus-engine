import mongoose, { Schema, Document, Types } from "mongoose";

export interface IFact extends Document {
    linkedArguments: Types.ObjectId[]; // arguments that assert this fact
    topic: Types.ObjectId;             // owning topic for easier queries
    text: string;                      // factual extraction text
    sourceArgument: Types.ObjectId;    // primary argument fact was derived from
    status?: "active" | "candidate" | "demoted";
    promotionSource?: "ai" | "community";
    promotedAt?: Date;
    demotedAt?: Date;
    promotionHistory?: Array<{
        status: "active" | "candidate" | "demoted";
        reason?: string;
        upvoteCount?: number;
        downvoteCount?: number;
        uniqueVoters?: number;
        netVotes?: number;
        createdAt?: Date;
    }>;
    createdAt: Date;
    updatedAt: Date;
}

const FactSchema = new Schema<IFact>({
    linkedArguments: [{ type: Schema.Types.ObjectId, ref: "Argument", index: true }],
    topic: { type: Schema.Types.ObjectId, ref: "Topic", required: true, index: true },
    text: { type: String, required: true, trim: true, maxlength: 5000 },
    sourceArgument: { type: Schema.Types.ObjectId, ref: "Argument", required: true, index: true },
    status: { type: String, enum: ["active", "candidate", "demoted"], default: "active", index: true },
    promotionSource: { type: String, enum: ["ai", "community"], default: "ai" },
    promotedAt: { type: Date },
    demotedAt: { type: Date },
    promotionHistory: {
        type: [
            {
                status: { type: String, enum: ["active", "candidate", "demoted"], required: true },
                reason: { type: String },
                upvoteCount: { type: Number },
                downvoteCount: { type: Number },
                uniqueVoters: { type: Number },
                netVotes: { type: Number },
                createdAt: { type: Date, default: Date.now },
            },
        ],
        default: [],
    },
}, { timestamps: true });

FactSchema.index({ topic: 1, createdAt: -1 });
FactSchema.index({ topic: 1, status: 1, createdAt: -1 });

export const Fact = mongoose.models.Fact || mongoose.model<IFact>("Fact", FactSchema);
