import type { DefaultSession } from "next-auth";
import type { SessionMembership } from "@/auth";
import type { PlatformRole } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      memberships: SessionMembership[];
      platformRole: PlatformRole;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    memberships?: SessionMembership[];
    platformRole?: PlatformRole;
    /** Epoch ms when memberships/platformRole were last read from the DB. Drives the
     * MEMBERSHIP_TTL_MS re-fetch in src/auth.ts so role changes and removals take effect
     * within minutes instead of at token expiry. */
    membershipsAt?: number;
  }
}
