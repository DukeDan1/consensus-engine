import mongoose, { Schema, Document, Types } from "mongoose";

export interface IFactReassessment {
    reassessedAt: Date;
    action: "kept" | "updated" | "removed";
    previousText?: string;
    rationale: string;
    upvotesConsidered: number;
    downvotesConsidered: number;
    commentsConsidered: number;
    model?: string;
    triggeredBy: "system" | "moderator";
    triggeredByUser?: Types.ObjectId;
}

export interface IFact extends Document {
    linkedArguments: Types.ObjectId[]; // arguments that assert this fact
    linkedComments?: Types.ObjectId[]; // comments that assert this fact
    topic: Types.ObjectId;             // owning topic for easier queries
    text: string;                      // factual extraction text
    sourceArgument?: Types.ObjectId;   // primary argument fact was derived from
    sourceComment?: Types.ObjectId;    // primary comment fact was derived from
    upvoteCount: number;
    downvoteCount: number;
    score: number;
    status: "active" | "removed";
    removedAt?: Date;
    removedBy?: Types.ObjectId;
    removalReason?: string;
    lastCheckedAt?: Date;
    lastCheckedUpvoteCount: number;
    lastCheckedDownvoteCount: number;
    lastCheckedCommentCount: number;
    reassessmentHistory: IFactReassessment[];
    createdAt: Date;
    updatedAt: Date;
}

const FactReassessmentSchema = new Schema<IFactReassessment>({
    reassessedAt: { type: Date, required: true },
    action: { type: String, enum: ["kept", "updated", "removed"], required: true },
    previousText: { type: String },
    rationale: { type: String, required: true },
    upvotesConsidered: { type: Number, required: true },
    downvotesConsidered: { type: Number, required: true },
    commentsConsidered: { type: Number, required: true },
    model: { type: String },
    triggeredBy: { type: String, enum: ["system", "moderator"], required: true },
    triggeredByUser: { type: Schema.Types.ObjectId, ref: "User" },
}, { _id: false });

const FactSchema = new Schema<IFact>({
    linkedArguments: [{ type: Schema.Types.ObjectId, ref: "Argument", index: true }],
    linkedComments: [{ type: Schema.Types.ObjectId, ref: "Comment", index: true }],
    topic: { type: Schema.Types.ObjectId, ref: "Topic", required: true, index: true },
    text: { type: String, required: true, trim: true, maxlength: 5000 },
    sourceArgument: { type: Schema.Types.ObjectId, ref: "Argument", required: false, index: true },
    sourceComment: { type: Schema.Types.ObjectId, ref: "Comment", required: false, index: true },
    upvoteCount: { type: Number, default: 0 },
    downvoteCount: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "removed"], default: "active", index: true },
    removedAt: { type: Date },
    removedBy: { type: Schema.Types.ObjectId, ref: "User" },
    removalReason: { type: String },
    lastCheckedAt: { type: Date },
    lastCheckedUpvoteCount: { type: Number, default: 0 },
    lastCheckedDownvoteCount: { type: Number, default: 0 },
    lastCheckedCommentCount: { type: Number, default: 0 },
    reassessmentHistory: { type: [FactReassessmentSchema], default: [] },
}, { timestamps: true });

FactSchema.index({ topic: 1, createdAt: -1 });
FactSchema.index({ status: 1, lastCheckedAt: 1 });

FactSchema.pre("validate", function () {
    if (!this.sourceArgument && !this.sourceComment) {
        throw new Error("Fact must reference a source argument or source comment.");
    }
});


export default mongoose.models.Fact || mongoose.model<IFact>("Fact", FactSchema);