import mongoose, { Schema, Document, Types } from 'mongoose';

interface IUserPasswordResetCode extends Document {
    user: Types.ObjectId; // Reference to User
    code: string;
    expiresAt: Date;
    isUsed: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const UserPasswordResetCodeSchema = new Schema<IUserPasswordResetCode>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        code: { type: String, required: true },
        expiresAt: { type: Date, required: true },
        isUsed: { type: Boolean, default: false },
    },
    { timestamps: true }
);

export default mongoose.model<IUserPasswordResetCode>('UserPasswordResetCode', UserPasswordResetCodeSchema);