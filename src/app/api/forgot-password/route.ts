import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { EmailClient, EmailMessage } from "@azure/communication-email";

export async function POST(req: Request) {
    try {
        const { email } = await req.json();
        if (!email) return NextResponse.json({ error: "You must enter an email address." }, { status: 400 });
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

        const secureCode = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()].join("-");
        const code = await prisma.userPasswordResetCode.create({
            data: {
                user: { connect: { id: user.id } },
                expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
                code: secureCode,
            }
        });

        const serverUrl = process.env.NEXTJS_APP_BASE_URL || "https://ce.dukedan.uk";
        const resetLink = `${serverUrl}/reset-password?token=${code.code}`;

        const message: EmailMessage = {
            senderAddress: "Consensus Engine <DoNotReply@m.dukedan.uk>",
            content: {
            subject: "Password reset",
            plainText: `Hi ${user.name || "User"}, here's your password reset link: ${resetLink}\n\nIf you did not request this, please ignore this email.`,
            html: `<html><body><p>Hi ${user.name || "User"},</p><p>Here's your password reset link:</p><p><a href="${resetLink}">Reset password</a></p><p>If you did not request this, please ignore this email.</p></body></html>`,
            },
            recipients: {
                to: [
                    {
                        address: user.email,
                        displayName: user.name || "User" 
                    }
                ]
            }
        };

        const connectionString = process.env.AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING;
        if (!connectionString) {
            console.error("AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING is not set");
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        const client = new EmailClient(connectionString);
        const poller = await client.beginSend(message);
        const response = await poller.pollUntilDone();
        if (response.status !== "Succeeded") {
            console.error("Email sending failed:", response);
            return NextResponse.json({ error: "Failed to send reset email." }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
