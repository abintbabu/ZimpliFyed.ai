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
  }
}
