import { NextResponse } from 'next/server';
import { sendEmail } from '@/app/services/emailService';
import UserPasswordResetCodeModel from '@/app/models/userPasswordResetCode';
import User from '@/app/models/user';
import { dbConnect } from '@/app/lib/mongoose';
import PasswordResetEmail from '@/app/emails/templates/PasswordResetEmail';
import { renderEmail } from '@/app/emails/renderEmail';

type ForgotPasswordDeps = {
  dbConnect: typeof dbConnect;
  userModel: typeof User;
  resetCodeModel: typeof UserPasswordResetCodeModel;
  sendEmail: typeof sendEmail;
  randomUUID: () => string;
};

const deps: ForgotPasswordDeps = {
  dbConnect,
  userModel: User,
  resetCodeModel: UserPasswordResetCodeModel,
  sendEmail,
  randomUUID: crypto.randomUUID
};

function createSecureCode(randomUUID: () => string) {
  return [randomUUID(), randomUUID(), randomUUID()].join('-');
}

export async function handleForgotPassword(
  payload: { email?: string },
  injectedDeps: ForgotPasswordDeps = deps
) {
  const { email } = payload;
  if (!email) {
    return { status: 400, body: { error: 'You must enter an email address.' } };
  }

  await injectedDeps.dbConnect();
  const user = await injectedDeps.userModel.findOne({ email });
  if (!user) {
    return { status: 404, body: { error: 'User not found.' } };
  }

  const secureCode = createSecureCode(injectedDeps.randomUUID);
  const code = await injectedDeps.resetCodeModel.create({
    user: user.id,
    expiresAt: new Date(Date.now() + 3600000),
    code: secureCode
  });

  const serverUrl = process.env.NEXTJS_APP_BASE_URL || 'https://ce.dukedan.uk';
  const resetLink = `${serverUrl}/reset-password?token=${code.code}`;

  const { html, text } = await renderEmail(PasswordResetEmail({
    name: user.name || 'User',
    resetLink,
  }));
  await injectedDeps.sendEmail(user.email, 'Password reset', html, text);

  return { status: 200, body: { success: true } };
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const result = await handleForgotPassword(payload);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
