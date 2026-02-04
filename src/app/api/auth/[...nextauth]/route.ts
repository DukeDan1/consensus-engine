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
import { recordLogin } from '../login/route';

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
    error?: string;
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
      async authorize(credentials, req) {
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

        if (user.isSuspended) {
          throw new Error('AccountSuspended');
        }

        const ip = req?.headers?.get?.("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
        void recordLogin(user.email, ip);

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

    async jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      if (typeof (user as { isAdmin?: boolean } | undefined)?.isAdmin === 'boolean') {
        token.isAdmin = (user as { isAdmin?: boolean }).isAdmin;
      }
      if (typeof (user as { avatarUrl?: string | null } | undefined)?.avatarUrl === 'string') {
        token.avatarUrl = (user as { avatarUrl?: string }).avatarUrl ?? null;
      }

      if (!token.id) return token;

      await dbConnect();
      const dbUser = await User.findById(token.id)
        .select({ isAdmin: 1, avatarUrl: 1, isSuspended: 1 })
        .lean();

      if (!dbUser || dbUser.isSuspended) {
        token.error = 'ACCOUNT_SUSPENDED';
        return token;
      }

      token.isAdmin = !!dbUser.isAdmin;
      token.avatarUrl = dbUser.avatarUrl ?? null;
      return token;
    },

    async session({ session, token }) {
      if (token?.error) {
        return {} as any;
      }
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
