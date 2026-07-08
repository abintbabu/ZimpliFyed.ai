import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import type { MembershipRole } from "@prisma/client";

const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export type SessionMembership = { tenantId: string; tenantSlug: string; role: MembershipRole };

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username;
        const password = credentials?.password;
        if (typeof username !== "string" || typeof password !== "string") return null;

        const allowed = checkRateLimit(
          `login:${username.trim().toLowerCase()}`,
          LOGIN_ATTEMPT_LIMIT,
          LOGIN_ATTEMPT_WINDOW_MS,
        );
        if (!allowed) return null;

        const user = await prisma.user.findUnique({ where: { email: username } });
        if (!user?.password) return null;

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return null;

        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
  ],
  pages: {
    signIn: "/login",
    newUser: "/signup",
  },
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
    async signIn({ user }) {
      // Consume any pending invites for this email — turns them into real
      // memberships now that the user has completed Google sign-in.
      if (!user.id || !user.email) return true;
      const pendingInvites = await prisma.invite.findMany({
        where: { email: user.email, acceptedAt: null },
      });
      for (const invite of pendingInvites) {
        await prisma.$transaction([
          prisma.membership.upsert({
            where: { userId_tenantId: { userId: user.id, tenantId: invite.tenantId } },
            create: { userId: user.id, tenantId: invite.tenantId, role: invite.role },
            update: {},
          }),
          prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
        ]);
      }
      return true;
    },
    async jwt({ token, user }) {
      // Only re-fetch memberships on sign-in (when `user` is present) or if
      // they haven't been loaded yet — avoids a DB hit on every request.
      if (user?.id || !token.memberships) {
        const userId = (user?.id ?? token.sub) as string | undefined;
        if (userId) {
          const memberships = await prisma.membership.findMany({
            where: { userId },
            include: { tenant: { select: { slug: true } } },
          });
          token.memberships = memberships.map((m) => ({
            tenantId: m.tenantId,
            tenantSlug: m.tenant.slug,
            role: m.role,
          })) satisfies SessionMembership[];
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.memberships = (token.memberships as SessionMembership[]) ?? [];
      return session;
    },
  },
});
