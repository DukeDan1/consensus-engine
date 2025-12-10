import { NextResponse } from 'next/server';
import User from '@/app/models/user';
import UserPasswordResetCode from '@/app/models/userPasswordResetCode';
import { hashPassword } from '@/app/services/passwordService';
import { dbConnect } from '@/app/lib/mongoose';

type ResetPasswordDeps = {
  dbConnect: typeof dbConnect;
  userModel: typeof User;
  resetCodeModel: typeof UserPasswordResetCode;
  hashPassword: typeof hashPassword;
};

const deps: ResetPasswordDeps = {
  dbConnect,
  userModel: User,
  resetCodeModel: UserPasswordResetCode,
  hashPassword
};

export async function handleResetPassword(
  payload: { token?: string; newPassword?: string },
  injectedDeps: ResetPasswordDeps = deps
) {
  const { token, newPassword } = payload;
  if (!token || !newPassword) {
    return { status: 400, body: { error: 'Invalid request' } };
  }

  await injectedDeps.dbConnect();

  const resetToken = await injectedDeps.resetCodeModel.findOne({
    isUsed: false,
    code: token
  });

  if (!resetToken || resetToken.expiresAt < new Date()) {
    return { status: 400, body: { error: 'Invalid or expired token' } };
  }

  const hash = await injectedDeps.hashPassword(newPassword);
  await injectedDeps.userModel.updateOne(
    { _id: resetToken.user },
    { $set: { passwordHash: hash } }
  );

  await injectedDeps.resetCodeModel.updateOne(
    { _id: resetToken._id },
    { $set: { isUsed: true } }
  );

  return { status: 200, body: { success: true } };
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const result = await handleResetPassword(payload);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Error resetting password:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
