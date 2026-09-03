import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncUser } from "@/lib/steam/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Coleta agendada. Sem ela a série temporal só existe nos dias em que o
 * usuário abriu a app — e uma plataforma de evolução com buracos não serve.
 *
 * Não varremos a base inteira: priorizamos quem jogou nas últimas duas
 * semanas. Para quem está inativo, coletar diariamente só grava a mesma
 * linha reta.
 */

// Quantos usuários por execução. Mantém o job dentro do limite de tempo da
// serverless function; o restante entra na execução seguinte.
const BATCH_SIZE = 50;

// Não recoleta quem já foi sincronizado há pouco (ex.: acabou de logar).
const MIN_AGE_HOURS = 20;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET não configurado." }, { status: 500 });
  }

  // A Vercel envia este header nos cron jobs; qualquer outro chamador precisa
  // apresentar o mesmo bearer token.
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - MIN_AGE_HOURS * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: {
      OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: cutoff } }],
      // Ativo = tem ao menos um jogo tocado nas últimas duas semanas.
      games: { some: { playtimeTwoWeeksMin: { gt: 0 } } },
    },
    orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
    take: BATCH_SIZE,
    select: { id: true, steamId: true },
  });

  let synced = 0;
  let failed = 0;
  let snapshots = 0;

  // Sequencial de propósito: rajadas paralelas contra a Steam Web API são o
  // caminho mais curto para a chave ser limitada.
  for (const user of users) {
    try {
      const result = await syncUser(user.id, user.steamId, "CRON");
      snapshots += result.snapshotsCreated;
      synced++;
    } catch (err) {
      console.error(`[cron] sync falhou para ${user.steamId}`, err);
      failed++;
    }
  }

  return NextResponse.json({ candidates: users.length, synced, failed, snapshots });
}
