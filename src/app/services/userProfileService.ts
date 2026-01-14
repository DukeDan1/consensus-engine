import User from "@/app/models/user";
import { deleteFileFromUrl } from "@/app/services/gcsService";

const allowedUpdates = [
  "name",
  "nickname",
  "bio",
  "avatarUrl",
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

  let existingAvatar: string | undefined;
  if ("avatarUrl" in update) {
    const existing = await User.findOne(query).select({ avatarUrl: 1 }).lean();
    existingAvatar = existing?.avatarUrl ?? undefined;
  }

  const updated = await User.findOneAndUpdate(
    query,
    { $set: update },
    { new: true, runValidators: true }
  ).lean();

  if ("avatarUrl" in update && existingAvatar && existingAvatar !== update.avatarUrl) {
    try {
      await deleteFileFromUrl(existingAvatar);
    } catch (err) {
      console.error("Failed to delete previous avatar", err);
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
