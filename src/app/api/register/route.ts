import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import bcrypt from "bcryptjs";
import { createSession } from "@/lib/auth";
import { validate } from "email-validator";
import { EmailClient, EmailMessage } from "@azure/communication-email";

async function sendWelcomeEmail(emailAddress: string, name: string): Promise<void> {
    const message: EmailMessage = {
        senderAddress: "DoNotReply@m.dukedan.uk",
        content: {
            subject: "Welcome!",
            plainText: `Thank you for signing up, ${name}!`,
            html: `<html><body><p>Thank you for signing up, ${name}!</p></body></html>`,
        },
        recipients: {
            to: [
                {
                    address: emailAddress,
                    displayName: name
                }
            ]
        }
    };

    const connectionString = process.env.AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING;
    if (!connectionString) {
        console.error("AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING is not set");
        return;
    }
    
    const client = new EmailClient(connectionString);
    const poller = await client.beginSend(message);
    const response = await poller.pollUntilDone();
    if (response.status !== "Succeeded") {
        console.error("Email sending failed:", response);
        return;
    }
}

export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json();
    if (!email || !password) return NextResponse.json({ error: "You must enter an email and password." }, { status: 400 });
    if (!validate(email)) return NextResponse.json({ error: "Invalid email address." }, { status: 400 });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: "This email address is already in use. Please log in or choose another one." }, { status: 409 });

    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { email, password: hash, name } });

    const token = await createSession({ userId: user.id, email: user.email });
    const res = NextResponse.json({ success: true, token });
    res.cookies.set("session", token, { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    sendWelcomeEmail(user.email, user.name || "User");
    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
