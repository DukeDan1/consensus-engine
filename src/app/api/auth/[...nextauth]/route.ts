'use server';

import NextAuth from 'next-auth/next';
import CredentialsProvider from 'next-auth/providers/credentials';
import { MongoDBAdapter } from '@next-auth/mongodb-adapter';

import { getConnectedMongoClient } from '@/app/lib/mongodbClient';
import { findUserByEmailOrPhone, createUser } from '@/app/services/authService';
import { hashPassword, comparePassword } from '@/app/services/passwordService';
import { dbConnect } from '@/app/lib/mongoose';
import User from '@/app/models/user';
import { getSignedReadUrlFromUrl } from '@/app/services/gcsService';

// Extend the Session user type to include 'id'
declare module 'next-auth' {
  interface Session {
    user?: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      avatarUrl?: string | null;
      isAdmin?: boolean;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    isAdmin?: boolean;
    avatarUrl?: string | null;
  }
}

const handler = NextAuth({
  adapter: MongoDBAdapter(getConnectedMongoClient()),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
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
        await dbConnect();

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

        if (user.isSuspended) return null;

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl ?? null,
          isAdmin: !!user.isAdmin,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      await dbConnect();

      if (user.email) {
        let existing = await findUserByEmailOrPhone(user.email);

        if (!existing) {
          await createUser({
            email: user.email,
            name: user.name ?? undefined,
            authProvider: 'password',
          });
        } else if (existing.isSuspended) {
          return false;
        }
      }

      return true;
    },

    async jwt({ token, user, trigger }) {
      if (user?.id) token.id = user.id;
      if (typeof (user as { isAdmin?: boolean } | undefined)?.isAdmin === 'boolean') {
        token.isAdmin = (user as { isAdmin?: boolean }).isAdmin;
      }
      if (typeof (user as { avatarUrl?: string | null } | undefined)?.avatarUrl === 'string') {
        token.avatarUrl = (user as { avatarUrl?: string }).avatarUrl ?? null;
      }
      
      // On session update trigger, always refetch avatarUrl from database
      const shouldRefetch = trigger === 'update' || typeof token.isAdmin !== 'boolean' || typeof token.avatarUrl === 'undefined';
      
      if (token.id && shouldRefetch) {
        await dbConnect();
        const dbUser = await User.findById(token.id).select({ isAdmin: 1, avatarUrl: 1 }).lean();
        if (typeof token.isAdmin !== 'boolean') {
          token.isAdmin = !!dbUser?.isAdmin;
        }
        if (typeof token.avatarUrl === 'undefined' || trigger === 'update') {
          token.avatarUrl = dbUser?.avatarUrl ?? null;
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (!session.user) {
        session.user = {};
      }
      
      if (token?.id) session.user.id = typeof token.id === 'string' ? token.id : String(token.id);
      session.user.isAdmin = typeof token.isAdmin === 'boolean' ? token.isAdmin : undefined;
      session.user.avatarUrl = typeof token.avatarUrl === 'string' ? token.avatarUrl : null;
      
      const avatarUrl = session.user.avatarUrl;
      if (avatarUrl) {
        session.user.image = await getSignedReadUrlFromUrl(avatarUrl).catch(() => avatarUrl);
      } else {
        session.user.image = null;
      }
      
      return session;
    },
  },
});

export { handler as GET, handler as POST };
