import { NextResponse } from 'next/server';
import User from '@/app/models/user';
import { validate } from 'email-validator';
import { sendEmail } from '@/app/services/emailService';
import { hashPassword } from '@/app/services/passwordService';
import { dbConnect } from '@/app/lib/mongoose';
import WelcomeEmail from '@/app/emails/templates/WelcomeEmail';
import { renderEmail } from '@/app/emails/renderEmail';

type RegisterDeps = {
  dbConnect: typeof dbConnect;
  userModel: typeof User;
  hashPassword: typeof hashPassword;
  sendEmail: typeof sendEmail;
};

const deps: RegisterDeps = {
  dbConnect,
  userModel: User,
  hashPassword,
  sendEmail
};

async function queueWelcomeEmail(
  emailAddress: string,
  name: string,
  sendEmailFn: typeof sendEmail
): Promise<void> {
  try {
    const appUrl = process.env.NEXTJS_APP_BASE_URL || 'https://ce.dukedan.uk';
    const { html, text } = await renderEmail(WelcomeEmail({ name, appUrl }));
    await sendEmailFn(emailAddress, 'Welcome!', html, text);
  } catch (err: unknown) {
    console.error('Failed to send welcome email:', err);
  }
}

export async function handleRegister(
  payload: { email?: string; password?: string; name?: string },
  injectedDeps: RegisterDeps = deps
) {
  const { email, password, name } = payload;
  if (!email || !password) {
    return { status: 400, body: { error: 'You must enter an email and password.' } };
  }
  if (!validate(email)) {
    return { status: 400, body: { error: 'Invalid email address.' } };
  }

  await injectedDeps.dbConnect();
  const existing = await injectedDeps.userModel.findOne({ email });
  if (existing) {
    return {
      status: 409,
      body: { error: 'This email address is already in use. Please log in or choose another one.' }
    };
  }

  const hash = await injectedDeps.hashPassword(password);
  const user = await injectedDeps.userModel.create({ email, passwordHash: hash, name });

  void queueWelcomeEmail(user.email, user.name || 'User', injectedDeps.sendEmail);
  return { status: 200, body: { success: true } };
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const result = await handleRegister(payload);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
