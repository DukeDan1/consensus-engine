import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { dbConnect } from "@/app/lib/mongoose";
import { updateUserProfileByEmail } from "@/app/services/userProfileService";

export async function POST(req: Request) {
  await dbConnect();
  // Removed authOptions import to fix build error
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const user = await updateUserProfileByEmail(session.user.email, body);
  return NextResponse.json(user ?? {});
}
