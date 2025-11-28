import mongoose, { Schema, Document, Types } from "mongoose";

export interface IFact extends Document {
    linkedArguments: Types.ObjectId[]; // arguments that assert this fact
    topic: Types.ObjectId;             // owning topic for easier queries
    text: string;                      // factual extraction text
    sourceArgument: Types.ObjectId;    // primary argument fact was derived from
    createdAt: Date;
    updatedAt: Date;
}

const FactSchema = new Schema<IFact>({
    linkedArguments: [{ type: Schema.Types.ObjectId, ref: "Argument", index: true }],
    topic: { type: Schema.Types.ObjectId, ref: "Topic", required: true, index: true },
    text: { type: String, required: true, trim: true, maxlength: 5000 },
    sourceArgument: { type: Schema.Types.ObjectId, ref: "Argument", required: true, index: true },
}, { timestamps: true });

FactSchema.index({ topic: 1, createdAt: -1 });

export const Fact = mongoose.models.Fact || mongoose.model<IFact>("Fact", FactSchema);