import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "@/app/models/user"; // Adjust path if needed

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI!;
if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable");
}

async function listUsers() {
  try {
    await mongoose.connect(MONGODB_URI);
    const users = await User.find({});
    console.log("Registered Users:");
    users.forEach((user) => {
      console.log({
        id: user._id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        provider: user.authProvider,
      });
    });
    mongoose.disconnect();
  } catch (error) {
    console.error("Error fetching users:", error);
  }
}

listUsers();
