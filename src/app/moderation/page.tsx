import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { dbConnect } from "@/app/lib/mongoose";
import User from "@/app/models/user";
import Topic from "@/app/models/topic";
import Argument from "@/app/models/argument";
import Comment from "@/app/models/comment";
import ModerationQueue from "@/app/components/moderation/ModerationQueue";
import { getSignedReadUrlFromUrl } from "@/app/services/gcsService";

export const dynamic = "force-dynamic";

const reviewFilter = {
  $or: [
    { "visibility.status": { $in: ["hidden", "needs_review", "blocked"] } },
    { "visibility.categories": "spam" },
    { "visibility.spamLikelihood": { $gte: 50 } },
  ],
};

function toIso(date?: Date) {
  return date?.toISOString();
}

function toUserSummary(user?: { _id?: any; name?: string } | null) {
  if (!user) return undefined;
  const id = typeof user._id?.toString === "function" ? user._id.toString() : undefined;
  return { _id: id, name: user.name };
}

export default async function ModerationPage() {
  const session = await getServerSession();
  if (!session?.user?.email) {
    redirect("/login?unauthed=true");
  }

  await dbConnect();

  const user = await User.findOne({ email: session.user.email }).select({ isAdmin: 1 }).lean();
  if (!user?.isAdmin) {
    redirect("/topics");
  }

  const topicsRaw = await Topic.find({ isActive: true, ...reviewFilter })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate({ path: "createdBy", select: "name" })
    .lean();

  const argumentsRaw = await Argument.find({ isRemoved: false, ...reviewFilter })
    .sort({ createdAt: -1 })
    .limit(75)
    .populate({ path: "createdBy", select: "name" })
    .populate({ path: "topic", select: "title" })
    .lean();

  const commentsRaw = await Comment.find({ isRemoved: false, ...reviewFilter })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate({ path: "createdBy", select: "name" })
    .populate({ path: "argument", select: "body topic", populate: { path: "topic", select: "title" } })
    .lean();

  const avatarsRaw = await User.find({ "avatarModeration.status": "flagged" })
    .sort({ "avatarModeration.flaggedAt": -1 })
    .limit(50)
    .select({ name: 1, email: 1, avatarUrl: 1, avatarThumbUrl: 1, avatarOriginalUrl: 1, avatarOriginalThumbUrl: 1, avatarModeration: 1 })
    .lean();

  const topics = topicsRaw.map((topic: any) => ({
    id: topic._id.toString(),
    title: topic.title,
    description: topic.description,
    createdAt: toIso(topic.createdAt),
    createdBy: toUserSummary(topic.createdBy),
    visibility: topic.visibility,
  }));

  const argumentsList = argumentsRaw.map((argument: any) => ({
    id: argument._id.toString(),
    body: argument.body,
    createdAt: toIso(argument.createdAt),
    createdBy: toUserSummary(argument.createdBy),
    topic: argument.topic
      ? {
        id: typeof argument.topic._id?.toString === "function" ? argument.topic._id.toString() : undefined,
        title: argument.topic.title,
      }
      : undefined,
    visibility: argument.visibility,
  }));

  const comments = commentsRaw.map((comment: any) => {
    const argument = comment.argument;
    const topic = argument?.topic;
    return {
      id: comment._id.toString(),
      body: comment.body,
      createdAt: toIso(comment.createdAt),
      createdBy: toUserSummary(comment.createdBy),
      argument: argument
        ? {
          id: typeof argument._id?.toString === "function" ? argument._id.toString() : undefined,
          body: argument.body,
        }
        : undefined,
      topic: topic
        ? {
          id: typeof topic._id?.toString === "function" ? topic._id.toString() : undefined,
          title: topic.title,
        }
        : undefined,
      visibility: comment.visibility,
    };
  });

  const avatars = await Promise.all(
    (avatarsRaw ?? []).map(async (user: any) => {
      const signedAvatarUrl = user?.avatarUrl
        ? await getSignedReadUrlFromUrl(user.avatarUrl).catch(() => user.avatarUrl)
        : null;
      const signedThumbUrl = user?.avatarThumbUrl
        ? await getSignedReadUrlFromUrl(user.avatarThumbUrl).catch(() => user.avatarThumbUrl)
        : null;
      const signedOriginalUrl = user?.avatarOriginalUrl
        ? await getSignedReadUrlFromUrl(user.avatarOriginalUrl).catch(() => user.avatarOriginalUrl)
        : null;
      const signedOriginalThumbUrl = user?.avatarOriginalThumbUrl
        ? await getSignedReadUrlFromUrl(user.avatarOriginalThumbUrl).catch(() => user.avatarOriginalThumbUrl)
        : null;

      return {
        id: user._id?.toString?.() ?? "",
        name: user.name ?? "Unknown",
        email: user.email ?? null,
        avatarUrl: signedAvatarUrl,
        avatarThumbUrl: signedThumbUrl,
        avatarOriginalUrl: signedOriginalUrl,
        avatarOriginalThumbUrl: signedOriginalThumbUrl,
        moderation: user.avatarModeration
          ? {
              ...user.avatarModeration,
              flaggedAt: user.avatarModeration.flaggedAt?.toISOString?.() ?? null,
            }
          : null,
      };
    })
  );

  return (
    <div className="container py-4">
      <div className="mb-4">
        <h1 className="h4 mb-1">Moderation Queue</h1>
        <p className="text-muted mb-0">Review content flagged by moderation signals.</p>
      </div>
      <ModerationQueue topics={topics} arguments={argumentsList} comments={comments} avatars={avatars} />
    </div>
  );
}
