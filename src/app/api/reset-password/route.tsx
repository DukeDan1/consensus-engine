import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
    try {
        const { token, newPassword } = await req.json();
        if (!token || !newPassword) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

        const resetToken = await prisma.userPasswordResetCode.findFirst({ where: { code: token, isUsed: false } });
        if (!resetToken) return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });

        const hash = await bcrypt.hash(newPassword, 12);

        await prisma.user.update({
            where: { id: resetToken.userId },
            data: { password: hash },
        });

        await prisma.userPasswordResetCode.update({
            where: { id: resetToken.id },
            data: { isUsed: true },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error resetting password:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
