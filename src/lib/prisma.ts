import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

// Em dev o hot reload recria o módulo a cada edição; sem o cache global
// cada reload abriria um novo pool de conexões até estourar o Postgres.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: env().DATABASE_URL }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? create();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
