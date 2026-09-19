import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { registrar } from "./eventos";
import { demoPayload, type DemoPayload } from "./demo/payload";
import { metricasDaDemo, REGRAS_VERSAO, type Metricas } from "./demo/metricas";
import { conversaoDaDemo, type ConversaoDeTime } from "./demo/conversao";

/**
 * Demos: a fila para o bot e o que fazer com o que ele traz.
 *
 * Toda partida que o GC respondeu tem uma URL de demo, e a Valve a mantém
 * por ~30 dias. O bot (`bot/src/demos.ts`) pergunta o que falta ler, baixa,
 * reduz a eventos e devolve; aqui os eventos viram `MatchDemo.dados` (o
 * fato, guardado inteiro) e as métricas por jogador viram
 * `MatchPlayerDemo` (a regra, versionada, recalculável). Ver docs/demos.md.
 */

/** Depois disso a Valve costuma ter apagado a demo; não vale pedir. */
const JANELA_DIAS = 30;
/** Tentativas de download/parser antes de desistir. */
const MAX_TENTATIVAS = 3;

export type DemoPendente = { matchId: string; shareCode: string; demoUrl: string };

/** A próxima demo a ler: a mais recente que ainda não foi lida nem esgotou as tentativas. */
export async function filaDeDemos(limite = 1): Promise<DemoPendente[]> {
  const desde = new Date(Date.now() - JANELA_DIAS * 86_400_000);
  const partidas = await prisma.match.findMany({
    where: {
      status: "DONE",
      demoUrl: { not: null },
      jogadaEm: { gte: desde },
      OR: [{ demo: null }, { demo: { status: "PENDING", tentativas: { lt: MAX_TENTATIVAS } } }],
    },
    orderBy: { jogadaEm: "desc" },
    take: limite,
    select: { id: true, shareCode: true, demoUrl: true },
  });
  return partidas.map((p) => ({ matchId: p.id, shareCode: p.shareCode, demoUrl: p.demoUrl! }));
}

function linhaDe(matchId: string, m: Metricas): Prisma.MatchPlayerDemoCreateManyInput {
  const { rating, zonas, ...resto } = m;
  return {
    ...resto,
    matchId,
    versaoRegras: REGRAS_VERSAO,
    zonas: zonas as Prisma.InputJsonValue,
    ratingTipo: rating?.tipo ?? null,
    ratingAntes: rating?.antes ?? null,
    ratingDepois: rating?.depois ?? null,
    ratingMudanca: rating?.mudanca ?? null,
    ratingVitorias: rating?.vitorias ?? null,
  };
}

function linhaDoTime(matchId: string, c: ConversaoDeTime): Prisma.MatchTeamDemoCreateManyInput {
  const { jogadores, ...resto } = c;
  return { ...resto, matchId, versaoRegras: REGRAS_VERSAO, jogadores: jogadores as Prisma.InputJsonValue };
}

/** Eventos gravados inteiros, métricas calculadas e gravadas; o mapa da partida ganha o do cabeçalho se ainda não tinha. */
export async function gravarDemo(matchId: string, bruto: unknown): Promise<{ jogadores: number }> {
  const payload: DemoPayload = demoPayload.parse(bruto);
  const metricas = metricasDaDemo(payload);
  const conversao = conversaoDaDemo(payload);
  await prisma.$transaction([
    prisma.matchDemo.upsert({
      where: { matchId },
      create: { matchId, status: "DONE", versao: payload.versao, parser: payload.parser, ticks: payload.ticks, dados: payload as Prisma.InputJsonValue },
      update: { status: "DONE", error: null, versao: payload.versao, parser: payload.parser, ticks: payload.ticks, dados: payload as Prisma.InputJsonValue },
    }),
    prisma.matchPlayerDemo.deleteMany({ where: { matchId } }),
    prisma.matchPlayerDemo.createMany({ data: metricas.map((m) => linhaDe(matchId, m)) }),
    prisma.matchTeamDemo.deleteMany({ where: { matchId } }),
    prisma.matchTeamDemo.createMany({ data: conversao.map((c) => linhaDoTime(matchId, c)) }),
    prisma.match.updateMany({ where: { id: matchId, mapa: null, NOT: { demo: null } }, data: { mapa: payload.mapa, servidor: payload.servidor } }),
  ]);
  await registrar("demo.lida", { dados: { matchId, rounds: payload.rounds.length, eventos: payload.eventos.length, jogadores: metricas.length } });
  return { jogadores: metricas.length };
}

export async function registrarFalhaDaDemo(matchId: string, motivo: "EXPIRED" | "FAILED", error?: string) {
  const atual = await prisma.matchDemo.findUnique({ where: { matchId }, select: { tentativas: true } });
  const tentativas = (atual?.tentativas ?? 0) + 1;
  const desiste = motivo === "EXPIRED" || tentativas >= MAX_TENTATIVAS;
  await prisma.matchDemo.upsert({
    where: { matchId },
    create: { matchId, status: desiste ? motivo : "PENDING", tentativas, error: error ?? null },
    update: { status: desiste ? motivo : "PENDING", tentativas, error: error ?? null },
  });
}

/** Refaz as métricas de todas as demos gravadas com a regra atual (`npm run recompute:demos`). */
export async function recomputarMetricasDasDemos(): Promise<number> {
  const demos = await prisma.matchDemo.findMany({ where: { status: "DONE", dados: { not: Prisma.JsonNull } }, select: { matchId: true, dados: true } });
  let n = 0;
  for (const d of demos) {
    const parsed = demoPayload.safeParse(d.dados);
    if (!parsed.success) continue;
    const metricas = metricasDaDemo(parsed.data);
    const conversao = conversaoDaDemo(parsed.data);
    await prisma.$transaction([
      prisma.matchPlayerDemo.deleteMany({ where: { matchId: d.matchId } }),
      prisma.matchPlayerDemo.createMany({ data: metricas.map((m) => linhaDe(d.matchId, m)) }),
      prisma.matchTeamDemo.deleteMany({ where: { matchId: d.matchId } }),
      prisma.matchTeamDemo.createMany({ data: conversao.map((c) => linhaDoTime(d.matchId, c)) }),
    ]);
    n++;
  }
  return n;
}

/* --------------------------------- leitura -------------------------------- */

export type MetricasDaPartida = Map<string, Prisma.MatchPlayerDemoGetPayload<object>>;
export type ConversaoGravada = Prisma.MatchTeamDemoGetPayload<object>;

/** As métricas dos jogadores de uma partida, por SteamID; vazio quando a demo ainda não foi lida. */
export async function metricasDaPartida(
  matchId: string,
): Promise<{ status: string | null; porJogador: MetricasDaPartida; times: ConversaoGravada[] }> {
  const [demo, linhas, times] = await Promise.all([
    prisma.matchDemo.findUnique({ where: { matchId }, select: { status: true } }),
    prisma.matchPlayerDemo.findMany({ where: { matchId } }),
    prisma.matchTeamDemo.findMany({ where: { matchId } }),
  ]);
  const porJogador: MetricasDaPartida = new Map();
  for (const linha of linhas) porJogador.set(linha.steamId, linha);
  return { status: demo?.status ?? null, porJogador, times };
}

