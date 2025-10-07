import { NextResponse } from "next/server";
import { dbConnect } from "@/app/lib/mongoose";
import User from "@/app/models/user";

export async function GET() {
  try {
    await dbConnect();
    const users = await User.find({}, "email phone name authProvider createdAt").lean();
    return NextResponse.json({ users });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
