import { config } from "dotenv";
import path from "node:path";
import type { PrismaConfig } from "prisma";

config({ path: ".env.local" });

export default {
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
} satisfies PrismaConfig;
