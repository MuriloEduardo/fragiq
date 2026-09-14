import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

// Em dev o hot reload recria o módulo a cada edição; sem o cache global
// cada reload abriria um novo pool de conexões até estourar o Postgres.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * `sslmode=require` na URL do Neon faz o `pg` avisar em toda requisição que
 * trata o modo como `verify-full` — e é o que ele faz, então dizemos isso
 * na URL e o aviso some. Sem SSL na URL (Postgres local) nada muda.
 */
function connectionString() {
  return env().DATABASE_URL.replace(/([?&])sslmode=(require|prefer|verify-ca)\b/, "$1sslmode=verify-full");
}

function create() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString() }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? create();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
