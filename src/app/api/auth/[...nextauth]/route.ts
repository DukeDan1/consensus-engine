'use server';

import NextAuth from 'next-auth/next';
import CredentialsProvider from 'next-auth/providers/credentials';
import mongoose from 'mongoose';
import { MongoDBAdapter } from '@next-auth/mongodb-adapter';

import clientPromise from '@/app/lib/mongodb';
import { findUserByEmailOrPhone, createUser } from '@/app/services/authService';
import { hashPassword, comparePassword } from '@/app/services/passwordService';

// Extend the Session user type to include 'id'
declare module 'next-auth' {
  interface Session {
    user?: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

async function connectDB() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI!);
  }
}

if (!clientPromise) {
  throw new Error("MONGODB_URI is not defined");
}

const handler = NextAuth({
  adapter: MongoDBAdapter(clientPromise),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login', // ✅ Custom sign-in page
  },
  providers: [
    CredentialsProvider({
      id: 'email-password',
      name: 'Email + Password',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
        gdprConsent: { label: 'GDPR Consent', type: 'checkbox' },
      },
      async authorize(credentials) {
        const { email, password, gdprConsent } = credentials!;
        await connectDB();

        let user = await findUserByEmailOrPhone(email);

        if (!user) {
          if (!gdprConsent) return null;
          const hashed = await hashPassword(password);
          user = await createUser({
            email,
            passwordHash: hashed,
            authProvider: 'password',
            gdprConsent: { accepted: true, acceptedAt: new Date() },
            profileCompleted: false,
          });
        } else {
          const valid = await comparePassword(password, user.passwordHash!);
          if (!valid) return null;
        }

        return { id: user._id.toString(), email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      await connectDB();

      if (user.email) {
        let existing = await findUserByEmailOrPhone(user.email);

        if (!existing) {
          await createUser({
            email: user.email,
            name: user.name ?? undefined,
            authProvider: 'password',
          });
        }
      }

      return true;
    },

    async jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },

    async session({ session, token }) {
      if (token?.id && session.user) session.user.id = typeof token.id === 'string' ? token.id : String(token.id);
      return session;
    },
  },
});

export { handler as GET, handler as POST };
