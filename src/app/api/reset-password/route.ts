import { NextResponse } from "next/server";
import User from "@/app/models/user";
import UserPasswordResetCode from "@/app/models/userPasswordResetCode";
import { hashPassword } from "@/app/services/passwordService";
import { dbConnect } from "@/app/lib/mongoose";

export async function POST(req: Request) {
    try {
        const { token, newPassword } = await req.json();
        if (!token || !newPassword) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

        await dbConnect();

        const resetToken = await UserPasswordResetCode.findOne({
            isUsed: false,
            code: token
        });
        if (!resetToken) return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });

        const hash = await hashPassword(newPassword);
        await User.updateOne(
            { _id: resetToken.user._id },
            { $set: { passwordHash: hash } }
        );

        await UserPasswordResetCode.updateOne(
            { _id: resetToken._id },
            { $set: { isUsed: true } }
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error resetting password:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}