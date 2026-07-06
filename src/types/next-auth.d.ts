import type { DefaultSession } from "next-auth";
import type { SessionMembership } from "@/auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      memberships: SessionMembership[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    memberships?: SessionMembership[];
  }
}
