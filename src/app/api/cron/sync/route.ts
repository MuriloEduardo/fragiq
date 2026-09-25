import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlayerSummaries, type SteamPlayer } from "@/lib/steam/api";
import { syncUser } from "@/lib/steam/sync";
import { processarCapturasDevidas } from "@/lib/capturas";
import { lembrarPendenciasNoSteam } from "@/lib/pendencias";
import { reportarErro } from "@/lib/eventos";

export const dynamic = "force-dynamic";

// Teto da Vercel: 60s no Hobby, até 300s no Pro. Declaramos 300 porque no
// Hobby o valor é simplesmente reduzido ao máximo do plano.
export const maxDuration = 300;

/**
 * Coleta agendada. Sem ela a série temporal só existe nos dias em que o
 * usuário abriu a app — e uma plataforma de evolução com buracos não serve.
 *
 * Não varremos a base inteira: priorizamos quem jogou nas últimas duas
 * semanas. Para quem está inativo, coletar diariamente só grava a mesma
 * linha reta.
 */

// Teto de usuários que buscamos por execução.
const BATCH_SIZE = 50;

/**
 * Orçamento de tempo, não de quantidade.
 *
 * Contar usuários não protege de estouro: um sync leva de 1s (ninguém jogou)
 * a 40s (biblioteca grande com muitos jogos tocados). 50 usuários podem levar
 * 90s e a função é morta no meio, perdendo o lote inteiro.
 *
 * Paramos por relógio e deixamos o resto para a próxima execução. Como a
 * ordenação é por lastSyncedAt ascendente, quem sobrou vem primeiro na
 * próxima — a fila gira sozinha, sem estado extra.
 *
 * O padrão de 45s cabe no limite de 60s do plano Hobby. Com maxDuration
 * maior, suba via CRON_TIME_BUDGET_MS.
 */
const TIME_BUDGET_MS = Number(process.env.CRON_TIME_BUDGET_MS ?? 45_000);

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

  // Registra a invocação antes de qualquer trabalho: uma execução sem
  // candidatos precisa deixar rastro, senão não há como distinguir
  // "agendador parado" de "nada a coletar".
  // O que o bot deixou pendente e o tick não alcançou (bot fora do ar, por
  // exemplo) entra antes da varredura geral, com o contexto que ele viu.
  await processarCapturasDevidas(20).catch((e) => console.error("[cron] capturas pendentes:", e));
  // Os lembretes do bot (privacidade, corrente de partidas) têm cadência de
  // dias; o cron diário é o relógio deles.
  const lembretes = await lembrarPendenciasNoSteam().catch((e) => {
    console.error("[cron] lembretes:", e);
    return null;
  });
  if (lembretes && (lembretes.stats || lembretes.partidas || lembretes.convites)) console.log("[cron] lembretes enfileirados:", lembretes);

  const run = await prisma.cronRun.create({
    data: { status: "RUNNING", candidates: users.length },
  });

  // Os perfis do lote numa chamada só: a Steam aceita 100 SteamIDs por
  // GetPlayerSummaries, e o lote é de 50. Uma chamada por usuário era o
  // item mais caro da coleta de quem não jogou (docs/roadmap-dados.md).
  // Se a leitura em lote falhar, cada coleta volta a ler o próprio perfil.
  const perfis: Map<string, SteamPlayer> | null =
    users.length > 0
      ? await getPlayerSummaries(users.map((u) => u.steamId)).catch(async (e) => {
          await reportarErro("cron.perfis", e);
          return null;
        })
      : null;

  const deadline = Date.now() + TIME_BUDGET_MS;

  let synced = 0;
  let failed = 0;
  let snapshots = 0;
  let skipped = 0;

  // Sequencial de propósito: rajadas paralelas contra a Steam Web API são o
  // caminho mais curto para a chave ser limitada.
  for (const user of users) {
    if (Date.now() >= deadline) {
      skipped = users.length - synced - failed;
      break;
    }

    try {
      const perfil = perfis ? (perfis.get(user.steamId) ?? null) : undefined;
      const result = await syncUser(user.id, user.steamId, "CRON", undefined, undefined, { perfil });
      snapshots += result.snapshotsCreated;
      synced++;
    } catch (err) {
      await reportarErro("cron.sync", err, user.id);
      failed++;
    }
  }

  await prisma.cronRun.update({
    where: { id: run.id },
    data: {
      status: failed > 0 && synced === 0 ? "FAILED" : "SUCCESS",
      finishedAt: new Date(),
      synced,
      failed,
      skipped,
      snapshots,
    },
  });

  return NextResponse.json({
    runId: run.id,
    candidates: users.length,
    synced,
    failed,
    // > 0 significa que a fila não está sendo vazada no ritmo do agendamento:
    // ou aumente a frequência do cron, ou mova para um worker dedicado.
    skipped,
    snapshots,
  });
}
