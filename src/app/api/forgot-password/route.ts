import { NextResponse } from "next/server";
import { sendEmail } from "@/app/services/emailService";
import UserPasswordResetCodeSchema from "@/app/models/userPasswordResetCode";
import User from "@/app/models/user";
import { dbConnect } from "@/app/lib/mongoose";

export async function POST(req: Request) {
    try {
        await dbConnect();
        const { email } = await req.json();
        if (!email) return NextResponse.json({ error: "You must enter an email address." }, { status: 400 });
        const user = await User.findOne({ email });
        if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

        const secureCode = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()].join("-");
        const code = await UserPasswordResetCodeSchema.create({
            user: user.id,
            expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
            code: secureCode,
        });

        const serverUrl = process.env.NEXTJS_APP_BASE_URL || "https://ce.dukedan.uk";
        const resetLink = `${serverUrl}/reset-password?token=${code.code}`;

        await sendEmail(
            user.email,
            "Password reset",
            `<html><body><p>Hi ${user.name || "User"},</p><p>Here's your password reset link:</p><p><a href="${resetLink}">Reset password</a></p><p>If you did not request this, please ignore this email.</p></body></html>`,
            `Hi ${user.name || "User"}, here's your password reset link: ${resetLink}\n\nIf you did not request this, please ignore this email.`
        );

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}