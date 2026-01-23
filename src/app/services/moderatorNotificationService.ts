import Notification from "@/app/models/notification";
import { sendNotificationEmails } from "@/app/services/notificationEmailService";

type ModeratorAction = "promoted" | "removed";
type ModeratorSource = "auto" | "admin" | "community";

type ModeratorNotificationParams = {
  recipientId: string;
  topicId: string;
  topicTitle: string;
  action: ModeratorAction;
  source: ModeratorSource;
  actorId?: string | null;
  actorName?: string | null;
  baseUrl?: string;
};

function buildCopy(params: Pick<ModeratorNotificationParams, "action" | "source" | "topicTitle" | "actorName">) {
  const safeTitle = params.topicTitle || "this topic";
  if (params.action === "promoted") {
    if (params.source === "admin") {
      const adminName = params.actorName?.trim() || "An administrator";
      return {
        subject: "You're now a moderator",
        message: `${adminName} promoted you to moderator for "${safeTitle}".`,
      };
    }
    return {
      subject: "You're now a moderator",
      message: `You were automatically promoted to moderator for "${safeTitle}".`,
    };
  }

  if (params.source === "admin") {
    const adminName = params.actorName?.trim() || "An administrator";
    return {
      subject: "Moderator access removed",
      message: `${adminName} removed you as a moderator for "${safeTitle}".`,
    };
  }

  if (params.source === "community") {
    return {
      subject: "Moderator access removed",
      message: `You were removed as a moderator for "${safeTitle}" due to community feedback.`,
    };
  }

  return {
    subject: "Moderator access removed",
    message: `You were removed as a moderator for "${safeTitle}".`,
  };
}

function resolveTopicUrl(baseUrl: string | undefined, topicId: string) {
  const origin = baseUrl?.trim() || process.env.NEXTJS_APP_BASE_URL || "";
  if (!origin) return `/topics/${topicId}`;
  return `${origin.replace(/\/+$/, "")}/topics/${topicId}`;
}

export async function notifyModeratorStatusChange(params: ModeratorNotificationParams) {
  try {
    if (!params.recipientId || !params.topicId) return;
    const { subject, message } = buildCopy(params);
    const topicUrl = resolveTopicUrl(params.baseUrl, params.topicId);

    await Notification.create({
      recipient: params.recipientId,
      actor: params.actorId || undefined,
      type: "user_activity",
      topic: params.topicId,
      message,
      topicTitle: params.topicTitle,
    });

    const emailTask = sendNotificationEmails({
      recipientIds: [params.recipientId],
      preferenceKey: "emailModeration",
      subject,
      message,
      actionUrl: topicUrl,
      actionLabel: "View topic",
      preview: message,
    });
    emailTask.catch((err) => {
      console.error("Failed to send moderator notification email", err);
    });
  } catch (err) {
    console.error("Failed to dispatch moderator status notification", err);
  }
}
