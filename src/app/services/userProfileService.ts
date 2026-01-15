import User from "@/app/models/user";
import { deleteFileFromUrl } from "@/app/services/gcsService";

const allowedUpdates = [
  "name",
  "nickname",
  "bio",
  "avatarUrl",
  "avatarThumbUrl",
  "preferences.theme",
  "preferences.language",
  "preferences.notifications",
];

export function buildProfileUpdate(payload: Record<string, any>) {
  const update: Record<string, any> = {};
  for (const key of allowedUpdates) {
    const value = key.split(".").reduce((obj, k) => obj?.[k], payload);
    if (value !== undefined) {
      update[key] = value;
    }
  }
  return update;
}

async function updateUserProfile(query: Record<string, any>, payload: Record<string, any>) {
  const update = buildProfileUpdate(payload);
  if (!Object.keys(update).length) return null;

  let existingAvatarUrl: string | undefined;
  let existingAvatarThumbUrl: string | undefined;
  const hasAvatarUpdate = "avatarUrl" in update || "avatarThumbUrl" in update;
  if (hasAvatarUpdate) {
    const existing = await User.findOne(query).select({ avatarUrl: 1, avatarThumbUrl: 1 }).lean();
    existingAvatarUrl = existing?.avatarUrl ?? undefined;
    existingAvatarThumbUrl = existing?.avatarThumbUrl ?? undefined;
  }

  const updated = await User.findOneAndUpdate(
    query,
    { $set: update },
    { new: true, runValidators: true }
  ).lean();

  if (hasAvatarUpdate) {
    const nextAvatarUrl = "avatarUrl" in update ? update.avatarUrl : existingAvatarUrl;
    const nextAvatarThumbUrl = "avatarThumbUrl" in update ? update.avatarThumbUrl : existingAvatarThumbUrl;

    if (existingAvatarUrl && existingAvatarUrl !== nextAvatarUrl) {
      try {
        await deleteFileFromUrl(existingAvatarUrl);
      } catch (err) {
        console.error("Failed to delete previous avatar", err);
      }
    }

    if (existingAvatarThumbUrl && existingAvatarThumbUrl !== nextAvatarThumbUrl) {
      try {
        await deleteFileFromUrl(existingAvatarThumbUrl);
      } catch (err) {
        console.error("Failed to delete previous avatar thumbnail", err);
      }
    }
  }

  return updated;
}

export async function updateUserProfileByEmail(email: string, payload: Record<string, any>) {
  return updateUserProfile({ email }, payload);
}

export async function updateUserProfileById(userId: string, payload: Record<string, any>) {
  return updateUserProfile({ _id: userId }, payload);
}
