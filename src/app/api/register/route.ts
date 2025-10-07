import { NextResponse } from "next/server";
import User from "@/app/models/user";
import { validate } from "email-validator";
import { signIn } from "next-auth/react";
import { sendEmail } from "@/app/services/emailService";
import { hashPassword } from "@/app/services/passwordService";
import { dbConnect } from "@/app/lib/mongoose";

async function sendWelcomeEmail(emailAddress: string, name: string): Promise<void> {
    sendEmail(emailAddress, 
      "Welcome!", 
      `<p>Thank you for signing up, ${name}!</p>`, 
      `Thank you for signing up, ${name}!`
    ).catch((err: any) => {
        console.error("Failed to send welcome email:", err);
    });
}

export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json();
    if (!email || !password) return NextResponse.json({ error: "You must enter an email and password." }, { status: 400 });
    if (!validate(email)) return NextResponse.json({ error: "Invalid email address." }, { status: 400 });

    await dbConnect();
    const existing = await User.findOne({ email });
    if (existing) return NextResponse.json({ error: "This email address is already in use. Please log in or choose another one." }, { status: 409 });
    
    const hash = await hashPassword(password);
    const user = await User.create({ email, passwordHash: hash, name });

    sendWelcomeEmail(user.email, user.name || "User");
    signIn("email", { email, callbackUrl: "/profile" });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}