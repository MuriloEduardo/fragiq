import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Prova que o runtime alcança o banco.
 *
 * Sem isto, um erro de conexão em produção só aparece quando alguém tenta
 * logar — e aí o sintoma é uma tela de erro genérica, não a causa. Útil
 * também como alvo de uptime check.
 *
 * Não expõe nada: nem versão, nem host, nem contagem de usuários.
 */
export async function GET() {
  const started = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", dbLatencyMs: Date.now() - started });
  } catch (err) {
    console.error("[health] banco inacessível", err);
    return NextResponse.json({ status: "degraded", db: "unreachable" }, { status: 503 });
  }
}
