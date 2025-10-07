// src/app/services/authService.ts
import User, { IUser } from "@/app/models/user";

/**
 * Find a user by email OR phone
 */
 export async function findUserByEmailOrPhone(email?: string, phone?: string) {
   if (!email && !phone) return null;
   return User.findOne({
     $or: [
       ...(email ? [{ email }] : []),
       ...(phone ? [{ phone }] : [])
     ]
   }).exec();
 }
/**
 * Create a new user (partial profile allowed)
 */
 export async function createUser(user: Partial<IUser>) {
   const newUser = new User(user);
   return newUser.save(); // automatically sets createdAt and updatedAt
 }

 /**
  * Update an existing user by ID
  */
 export async function updateUser(id: string, updates: Partial<IUser>) {
   return User.findByIdAndUpdate(
     id,
     { ...updates },
     { new: true } // returns updated document
   ).exec();
 }
