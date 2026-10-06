import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendMagicLinkEmail } from "@/lib/magic-link-email";
import type { MembershipRole, PlatformRole } from "@prisma/client";

const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

/**
 * How long a JWT may serve cached memberships before they're re-read from the DB.
 *
 * Memberships and roles are authorization data, and a JWT is not revocable — so caching them for
 * the token's whole lifetime meant removing or demoting a teammate had no effect until they next
 * signed in (up to SESSION_MAX_AGE_SEC). Five minutes bounds that window while still sparing the
 * DB a read on every request.
 */
const MEMBERSHIP_TTL_MS = 5 * 60 * 1000;

/** Absolute session lifetime. Short enough that a stolen token ages out, long enough not to
 * log an exporter out mid-workday; `updateAge` slides it on activity. */
const SESSION_MAX_AGE_SEC = 12 * 60 * 60;

export type SessionMembership = { tenantId: string; tenantSlug: string; role: MembershipRole };

// Magic-link sign-in only lights up once RESEND_API_KEY is set; otherwise
// the provider is omitted so local/dev environments keep working unchanged.
const magicLinkProvider = process.env.RESEND_API_KEY
  ? Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.RESEND_FROM_EMAIL ?? "Zimplifyed AI <no-reply@zimplifyed.ai>",
      sendVerificationRequest: sendMagicLinkEmail,
    })
  : null;

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SEC, updateAge: 60 * 60 },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    ...(magicLinkProvider ? [magicLinkProvider] : []),
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
    verifyRequest: "/login/check-email",
  },
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
    async redirect({ url, baseUrl }) {
      // Funnel every fresh sign-in through the post-auth resolver at /welcome,
      // unless the caller explicitly requested an in-app path.
      if (url.startsWith(baseUrl) && !url.includes('/dashboard') && !url.includes('/welcome')) {
        // Preserve callbackUrl-style same-origin relative redirects; default to /welcome.
        const path = url.replace(baseUrl, '');
        if (path === '' || path === '/' || path.startsWith('/login') || path.startsWith('/signup')) {
          return `${baseUrl}/welcome`;
        }
      }
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return `${baseUrl}/welcome`;
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
      // Re-read memberships on sign-in, if they've never been loaded, or once MEMBERSHIP_TTL_MS
      // has elapsed. The TTL is what makes removeMember()/updateMemberRole() actually take effect
      // on a live session — without it a JWT carries its original roles until the token expires.
      const loadedAt = (token.membershipsAt as number | undefined) ?? 0;
      const stale = Date.now() - loadedAt > MEMBERSHIP_TTL_MS;
      if (user?.id || !token.memberships || stale) {
        const userId = (user?.id ?? token.sub) as string | undefined;
        if (userId) {
          const [memberships, dbUser] = await Promise.all([
            prisma.membership.findMany({
              where: { userId },
              include: { tenant: { select: { slug: true } } },
            }),
            prisma.user.findUnique({ where: { id: userId }, select: { platformRole: true } }),
          ]);
          token.memberships = memberships.map((m) => ({
            tenantId: m.tenantId,
            tenantSlug: m.tenant.slug,
            role: m.role,
          })) satisfies SessionMembership[];
          token.platformRole = dbUser?.platformRole ?? 'user';
          token.membershipsAt = Date.now();
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.memberships = (token.memberships as SessionMembership[]) ?? [];
      session.user.platformRole = (token.platformRole as PlatformRole) ?? 'user';
      return session;
    },
  },
});
