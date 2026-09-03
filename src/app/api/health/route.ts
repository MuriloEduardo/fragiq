import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Quanto tempo sem coletar antes de considerar o agendador quebrado.
 *
 * O cron roda 1x/dia; 26h dá folga para atraso do agendador sem deixar passar
 * um dia inteiro perdido.
 */
const COLETA_VENCE_EM_MS = 26 * 60 * 60 * 1000;

/**
 * Prova que o runtime alcança o banco e que o coletor agendado continua vivo.
 *
 * Devolve 503 quando qualquer um dos dois falha, para servir de alvo a um
 * monitor de uptime gratuito — que é o mecanismo de alerta mais barato
 * possível. Sem isso, um cron parado só apareceria como buraco na série
 * semanas depois, e dado perdido não volta: a Steam só sabe o total de hoje.
 */
export async function GET() {
  const started = Date.now();

  let ultima: { startedAt: Date; status: string } | null = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    ultima = await prisma.cronRun.findFirst({
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, status: true },
    });
  } catch (err) {
    console.error("[health] banco inacessível", err);
    return NextResponse.json({ status: "degraded", db: "unreachable" }, { status: 503 });
  }

  // Sem nenhuma execução registrada não dá para distinguir projeto recém
  // implantado de agendador quebrado — reportamos, mas não alarmamos.
  if (!ultima) {
    return NextResponse.json({
      status: "ok",
      dbLatencyMs: Date.now() - started,
      collector: "unknown",
    });
  }

  const idadeMs = Date.now() - ultima.startedAt.getTime();
  const vencido = idadeMs > COLETA_VENCE_EM_MS;

  return NextResponse.json(
    {
      status: vencido ? "degraded" : "ok",
      dbLatencyMs: Date.now() - started,
      collector: vencido ? "stale" : "ok",
      lastCollectionAt: ultima.startedAt.toISOString(),
      lastCollectionAgeHours: +(idadeMs / 3_600_000).toFixed(1),
      lastCollectionStatus: ultima.status,
    },
    { status: vencido ? 503 : 200 },
  );
}
