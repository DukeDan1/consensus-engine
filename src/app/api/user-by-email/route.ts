import { NextResponse } from "next/server";
import {dbConnect} from "@/app/lib/mongoose";
import User from "@/app/models/user";

export async function POST(req: Request) {
  await dbConnect();

  const { email } = await req.json();
  const user = await User.findOne({ email }).lean();

  if (!user) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ user }, { status: 200 });
}
