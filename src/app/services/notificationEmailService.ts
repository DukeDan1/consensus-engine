import User from "@/app/models/user";
import { sendEmail } from "@/app/services/emailService";
import { renderEmail } from "@/app/emails/renderEmail";
import ActivityNotificationEmail from "@/app/emails/templates/ActivityNotificationEmail";

type PreferenceKey = "emailTopics" | "emailArguments" | "emailUsers";

type NotificationEmailOptions = {
  recipientIds: string[];
  preferenceKey: PreferenceKey;
  subject: string;
  message: string;
  actionUrl: string;
  actionLabel?: string;
  preview?: string;
};

function getBaseUrlFromActionUrl(actionUrl: string): string | undefined {
  try {
    return new URL(actionUrl).origin;
  } catch {
    return process.env.NEXTJS_APP_BASE_URL || undefined;
  }
}

function getDisplayName(user: { name?: string | null; nickname?: string | null }) {
  return user.name?.trim() || user.nickname?.trim() || "there";
}

export async function sendNotificationEmails(options: NotificationEmailOptions): Promise<string[]> {
  const uniqueIds = Array.from(new Set(options.recipientIds.filter(Boolean)));
  if (!uniqueIds.length) return [];

  const prefPath = `preferences.notifications.${options.preferenceKey}`;
  const recipients = await User.find({
    _id: { $in: uniqueIds },
    email: { $exists: true, $ne: "" },
    "preferences.notifications.email": { $ne: false },
    [prefPath]: { $ne: false },
  })
    .select({ _id: 1, email: 1, name: 1, nickname: 1 })
    .lean();

  if (!recipients.length) return [];

  await Promise.all(
    recipients.map(async (recipient) => {
      if (!recipient?.email) return;
      const name = getDisplayName(recipient);
      const appUrl = getBaseUrlFromActionUrl(options.actionUrl);
      const { html, text } = await renderEmail(ActivityNotificationEmail({
        name,
        message: options.message,
        actionUrl: options.actionUrl,
        actionLabel: options.actionLabel,
        preview: options.preview,
        appUrl,
      }));
      await sendEmail(recipient.email, options.subject, html, text);
    })
  );

  return recipients
    .map((recipient) => recipient?._id?.toString?.() ?? "")
    .filter(Boolean);
}
