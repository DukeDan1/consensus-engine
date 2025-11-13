import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { dbConnect } from "@/app/lib/mongoose";
import User from "@/app/models/user";

export default async function ProfilePage() {
    const session = await getServerSession();

    if (!session?.user?.email) {
        redirect("/login?unauthed=true");
    }

    await dbConnect();

    const user = await User.findOne({ email: session.user.email }).select({ _id: 1 }).lean<{ _id: string }>().exec();

    if (!user?._id) {
        redirect("/login?unauthed=true");
    }

    redirect(`/profile/${user._id.toString()}`);
}