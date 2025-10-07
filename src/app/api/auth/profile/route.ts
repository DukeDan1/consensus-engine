// src/app/api/profile/route.ts
import { NextResponse } from "next/server";
import { dbConnect } from "@/app/lib/mongoose";
import User from "@/app/models/user";

export async function POST(req: Request) {
  try {
    const { id, name, nickname, phone, onboardingStep } = await req.json();
    console.log("Incoming profile update:", { id, name, nickname, phone });
    if (!id) {
      return NextResponse.json(
        { message: "User ID is required" },
        { status: 400 }
      );
    }

    await dbConnect();

    const update: any = {};
    if (name !== undefined) update.name = name;
    if (nickname !== undefined) update.nickname = nickname;
    if (phone !== undefined) update.phone = phone;
    if (onboardingStep !== undefined) update.onboardingStep = onboardingStep;
    update.updatedAt = new Date();

  
    const user = await User.findByIdAndUpdate(id, update, { new: true });
    console.log("Updated user:", user);
    if (!user) {
      return NextResponse.json(
        { message: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: "Profile updated successfully", user },
      { status: 200 }
    );
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { message: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
