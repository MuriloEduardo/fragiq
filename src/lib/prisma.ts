import { PrismaPg } from "@prisma/adapter-pg";
import type { PoolConfig } from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";
import { SUPABASE_ROOT_CA } from "./supabase-ca";

// Em dev o hot reload recria o módulo a cada edição; sem o cache global
// cada reload abriria um novo pool de conexões até estourar o Postgres.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * `sslmode=require` faz o `pg` avisar em toda requisição que trata o modo
 * como `verify-full` — e é o que ele faz, então dizemos isso na URL e o
 * aviso some. Sem SSL na URL (Postgres local) nada muda.
 *
 * O Supabase assina com uma CA própria, que o Node não conhece: lá o
 * `sslmode` sai da URL (senão ele sobrescreve o objeto `ssl`) e a
 * verificação continua completa, só que contra a raiz deles.
 */
function poolConfig(): PoolConfig {
  const url = env().DATABASE_URL;
  if (/@[^/]*\.supabase\.com[:/]/.test(url)) {
    const semSslmode = url.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
    return { connectionString: semSslmode, ssl: { ca: SUPABASE_ROOT_CA } };
  }
  return { connectionString: url.replace(/([?&])sslmode=(require|prefer|verify-ca)\b/, "$1sslmode=verify-full") };
}

function create() {
  return new PrismaClient({
    adapter: new PrismaPg(poolConfig()),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? create();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
