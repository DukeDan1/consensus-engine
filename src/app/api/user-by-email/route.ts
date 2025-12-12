import { NextResponse } from 'next/server';
import { dbConnect } from '@/app/lib/mongoose';
import User from '@/app/models/user';

type UserByEmailDeps = {
  dbConnect: typeof dbConnect;
  userModel: typeof User;
};

const deps: UserByEmailDeps = {
  dbConnect,
  userModel: User
};

export async function handleUserByEmail(
  payload: { email?: string },
  injectedDeps: UserByEmailDeps = deps
) {
  const { email } = payload;
  if (!email) {
    return { status: 400, body: { message: 'Email is required' } };
  }

  await injectedDeps.dbConnect();
  const user = await injectedDeps.userModel.findOne({ email }).lean();

  if (!user) {
    return { status: 404, body: { message: 'User not found' } };
  }

  return { status: 200, body: { user } };
}

export async function POST(req: Request) {
  const payload = await req.json();
  const result = await handleUserByEmail(payload);
  return NextResponse.json(result.body, { status: result.status });
}
