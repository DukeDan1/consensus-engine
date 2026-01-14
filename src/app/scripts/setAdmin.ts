import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "@/app/models/user";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI!;
if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable");
}

const target = process.argv[2];
if (!target) {
  console.error("Usage: npm run set-admin -- <userId|email>");
  process.exit(1);
}

function buildFilter(value: string) {
  const trimmed = value.trim();
  if (trimmed.includes("@")) {
    return { email: trimmed.toLowerCase() };
  }
  if (mongoose.Types.ObjectId.isValid(trimmed)) {
    return { _id: trimmed };
  }
  return null;
}

async function setAdmin() {
  const filter = buildFilter(target);
  if (!filter) {
    console.error("Provide a valid user id or email.");
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGODB_URI);
    const updated = await User.findOneAndUpdate(filter, { isAdmin: true }, { new: true }).lean();
    if (!updated) {
      console.error("No user found for:", target);
      process.exit(1);
    }
    console.log("User promoted to admin:", {
      id: updated._id,
      email: updated.email,
      name: updated.name,
      isAdmin: updated.isAdmin,
    });
    await mongoose.disconnect();
  } catch (error) {
    console.error("Error updating user:", error);
    process.exit(1);
  }
}

setAdmin();
