import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../prisma";
import { coerce } from "../fonte";
import { REGRA_VERSAO, type Evidencia } from "./atribuir";
import { montarSessao, type PontoDaSessao, type SessaoMontada } from "./montar";

/**
 * Fechar uma sessão: da coleta que acabou de ser gravada até a anterior.
 *
 * Roda na ingestão (`captureSnapshot`) e no `recompute:sessions`. É
 * idempotente por `ateSnapshotId`: a mesma coleta fecha sempre a mesma
 * sessão, e rodar de novo só sobrescreve com a regra vigente. Quando o
 * intervalo não tem rounds (cron num dia sem jogo, ou contador que
 * regrediu), a sessão não existe — e uma que existia é apagada.
 *
 * A parte pura (deltas + atribuição) está em `montar.ts`, testada sem
 * banco; aqui só se busca o que ela precisa: a coleta anterior, as
 * observações do bot e as partidas do GC dentro do intervalo.
 */

const CS2_APPID = 730;

const selecao = {
  id: true,
  capturedAt: true,
  playtimeForeverMin: true,
  metrics: true,
  matchMode: true,
  matchMap: true,
  matchScore: true,
  traceId: true,
  userGameId: true,
} satisfies Prisma.StatSnapshotSelect;

type Linha = Prisma.StatSnapshotGetPayload<{ select: typeof selecao }>;

function ponto(l: Linha): PontoDaSessao {
  return { ...l, metrics: coerce(l.metrics) };
}

/** As provas do intervalo (prev, curr]: observações do bot e partidas do GC do jogador. */
async function evidenciasDe(userId: string, steamId: string, de: Date, ate: Date): Promise<Evidencia[]> {
  const [observacoes, partidas] = await Promise.all([
    prisma.botObservation.findMany({
      where: { steamId, kind: "MATCH_ENDED", observedAt: { gt: de, lte: ate } },
      select: { id: true, mode: true, map: true, score: true },
    }),
    prisma.match.findMany({
      where: {
        status: "DONE",
        jogadores: { some: { userId } },
        // A partida conta no intervalo pelo fim dela (início + duração);
        // uma folga de 10 min cobre o atraso da Steam em publicar.
        jogadaEm: { gt: new Date(de.getTime() - 3 * 60 * 60_000), lte: ate },
      },
      select: { id: true, modo: true, mapa: true, placarA: true, placarB: true, jogadaEm: true, duracaoS: true },
    }),
  ]);
  const noIntervalo = partidas.filter((p) => {
    const fim = p.jogadaEm!.getTime() + (p.duracaoS ?? 0) * 1000;
    return fim > de.getTime() - 10 * 60_000 && fim <= ate.getTime();
  });
  return [
    ...noIntervalo.map((p) => ({
      fonte: "match" as const,
      id: p.id,
      modo: p.modo,
      mapa: p.mapa,
      placar: p.placarA !== null && p.placarB !== null ? `${p.placarA}:${p.placarB}` : null,
    })),
    ...observacoes.map((o) => ({ fonte: "observacao" as const, id: o.id, modo: o.mode, mapa: o.map, placar: o.score })),
  ];
}

/** Fecha (ou refaz) a sessão que a coleta `ateSnapshotId` encerra. Devolve o que gravou, ou null. */
export async function fecharSessao(ateSnapshotId: string): Promise<SessaoMontada | null> {
  const curr = await prisma.statSnapshot.findUnique({
    where: { id: ateSnapshotId },
    select: { ...selecao, userGame: { select: { userId: true, gameAppId: true, user: { select: { steamId: true } } } } },
  });
  if (!curr || curr.userGame.gameAppId !== CS2_APPID) return null;

  const prev = await prisma.statSnapshot.findFirst({
    where: { userGameId: curr.userGameId, capturedAt: { lt: curr.capturedAt } },
    orderBy: { capturedAt: "desc" },
    select: selecao,
  });
  if (!prev) return null;

  const { userId, user } = curr.userGame;
  const evidencias = await evidenciasDe(userId, user.steamId, prev.capturedAt, curr.capturedAt);
  const montada = montarSessao(ponto(prev), ponto(curr), evidencias);

  if (!montada) {
    await prisma.session.deleteMany({ where: { ateSnapshotId } });
    return null;
  }
  const dados = {
    userId,
    gameAppId: CS2_APPID,
    userGameId: curr.userGameId,
    deSnapshotId: prev.id,
    ...montada,
    regraVersao: REGRA_VERSAO,
    traceId: curr.traceId,
  };
  await prisma.session.upsert({ where: { ateSnapshotId }, create: { ateSnapshotId, ...dados }, update: dados });
  return montada;
}

/** Refaz todas as sessões de CS2 (de um jogador, ou de todos). Idempotente. */
export async function recomputarSessoes(userId?: string): Promise<{ jogadores: number; sessoes: number; porConfianca: Record<string, number> }> {
  const userGames = await prisma.userGame.findMany({
    where: { gameAppId: CS2_APPID, ...(userId ? { userId } : {}) },
    select: { id: true, snapshots: { orderBy: { capturedAt: "asc" }, select: { id: true } } },
  });
  const porConfianca: Record<string, number> = { EXATA: 0, INFERIDA: 0, MISTA: 0 };
  let sessoes = 0;
  for (const ug of userGames) {
    for (const s of ug.snapshots.slice(1)) {
      const r = await fecharSessao(s.id);
      if (r) {
        sessoes += 1;
        porConfianca[r.modoConfianca] += 1;
      }
    }
  }
  return { jogadores: userGames.length, sessoes, porConfianca };
}
