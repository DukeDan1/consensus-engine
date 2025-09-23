import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import bcrypt from "bcryptjs";
import { createSession } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) return NextResponse.json({ error: "You must enter an email and password." }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ error: "Your email or password is incorrect." }, { status: 401 });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return NextResponse.json({ error: "Your email or password is incorrect." }, { status: 401 });

    const token = await createSession({ userId: user.id, email: user.email });
    const res = NextResponse.json({ success: true, token });
    res.cookies.set("session", token, { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
