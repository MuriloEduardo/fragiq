import type { SyncTrigger } from "@/generated/prisma/enums";
import { prisma } from "../prisma";
import {
  getGameStatSchema,
  getOwnedGames,
  getPlayerSummary,
  getUserStatsForGame,
  type OwnedGame,
} from "./api";

/**
 * Estratégia de coleta.
 *
 * A Steam não oferece webhooks para dados de jogador — a Web API é só pull.
 * Então a única questão é como puxar sem queimar a cota de 100k chamadas/dia
 * da chave.
 *
 * O gate está em GetOwnedGames: UMA chamada devolve o playtime_forever de
 * TODA a biblioteca. Se o playtime de um jogo não mudou desde o último sync,
 * o jogador não jogou, e buscar as stats dele daria um ponto idêntico ao
 * anterior. Pulamos.
 *
 * Custo por usuário que não jogou nada: 2 chamadas (perfil + biblioteca).
 * Só quem realmente jogou paga as chamadas por jogo.
 */

const MAX_GAMES_WITH_STATS = 40;
const SCHEMA_TTL_DAYS = 30;

// Abaixo disso o jogo é ruído na biblioteca (demo, teste, jogo de bundle).
const MIN_PLAYTIME_MIN = 30;

export type SyncResult = {
  gamesSeen: number;
  gamesStored: number;
  snapshotsCreated: number;
  statCallsSpent: number;
  /**
   * appIds cujas stats foram buscadas e vieram iguais ao último ponto. Para
   * o bot de presença isso significa "a Steam ainda não publicou a partida":
   * ela demora minutos, não segundos, e o valor varia — então quem avisou
   * precisa saber que deve tentar de novo.
   */
  unchanged: number[];
};

/**
 * Contexto observado pelo bot de presença no momento em que a partida
 * terminou. A Web API não sabe em que mapa nem em que modo você jogou; o
 * rich presence sabe, e é a única forma de atribuir o delta.
 */
export type MatchContext = {
  map?: string | null;
  mode?: string | null;
  score?: string | null;
};

export async function syncUser(
  userId: string,
  steamId: string,
  trigger: SyncTrigger = "MANUAL",
  context?: MatchContext,
): Promise<SyncResult> {
  const run = await prisma.syncRun.create({
    data: { userId, trigger, status: "RUNNING" },
  });

  try {
    const result = await runSync(userId, steamId, context);

    await prisma.$transaction([
      prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCESS",
          finishedAt: new Date(),
          gamesSeen: result.gamesSeen,
          gamesStored: result.gamesStored,
        },
      }),
      prisma.user.update({ where: { id: userId }, data: { lastSyncedAt: new Date() } }),
    ]);

    return result;
  } catch (err) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}

async function runSync(
  userId: string,
  steamId: string,
  context?: MatchContext,
): Promise<SyncResult> {
  const summary = await getPlayerSummary(steamId);
  if (summary) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        personaName: summary.personaname,
        avatarUrl: summary.avatarfull ?? null,
        profileUrl: summary.profileurl ?? null,
        countryCode: summary.loccountrycode ?? null,
      },
    });
  }

  // Estado anterior lido ANTES do upsert — é a base da comparação de playtime.
  const previous = new Map(
    (
      await prisma.userGame.findMany({
        where: { userId },
        select: {
          gameAppId: true,
          playtimeForeverMin: true,
          _count: { select: { snapshots: true } },
        },
      })
    ).map((ug) => [
      ug.gameAppId,
      { playtime: ug.playtimeForeverMin, snapshots: ug._count.snapshots },
    ]),
  );

  const played = await listarJogados(steamId, previous.size > 0);

  for (const game of played) await upsertGameAndOwnership(userId, game);

  // Só vale gastar chamadas em quem jogou desde a última coleta — ou em quem
  // ainda não tem nenhum ponto na série (primeira carga).
  const dirty = played.filter((g) => {
    if (g.playtime_forever < MIN_PLAYTIME_MIN) return false;
    const prev = previous.get(g.appid);
    if (!prev) return true;
    if (prev.snapshots === 0) return true;
    return g.playtime_forever > prev.playtime;
  });

  // Prioridade: quem jogou mais recentemente primeiro, caso o teto corte.
  dirty.sort(
    (a, b) => b.playtime_2weeks - a.playtime_2weeks || b.playtime_forever - a.playtime_forever,
  );

  let snapshotsCreated = 0;
  let statCallsSpent = 0;
  const unchanged: number[] = [];

  for (const game of dirty) {
    if (statCallsSpent >= MAX_GAMES_WITH_STATS) break;

    const record = await prisma.game.findUnique({
      where: { appId: game.appid },
      select: { supportsStats: true },
    });
    if (record && !record.supportsStats) continue; // já sabemos que não expõe stats.

    statCallsSpent++;
    const outcome = await captureSnapshot(userId, steamId, game, context);
    if (outcome === "created") snapshotsCreated++;
    if (outcome === "unchanged") unchanged.push(game.appid);
  }

  return {
    gamesSeen: played.length,
    gamesStored: played.length,
    snapshotsCreated,
    statCallsSpent,
    unchanged,
  };
}

/**
 * A Steam devolve lista vazia de forma intermitente, e vazio é
 * indistinguível de "perfil privado" na resposta. Tratar os dois igual custa
 * caro: numa coleta disparada por fim de partida, pular significa perder
 * aquele ponto para sempre — a API só sabe o total de hoje.
 *
 * Quando já conhecemos jogos deste usuário, uma lista vazia é quase
 * certamente falha transitória, então tentamos de novo antes de desistir.
 */
async function listarJogados(steamId: string, jaConhecido: boolean): Promise<OwnedGame[]> {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const owned = await getOwnedGames(steamId);
    const played = owned.filter((g) => g.playtime_forever > 0);

    if (played.length > 0 || !jaConhecido) return played;

    if (tentativa < 3) {
      console.warn(
        `[sync] biblioteca vazia para ${steamId} (tentativa ${tentativa}) — ` +
          "provável falha transitória da Steam, tentando de novo",
      );
      await new Promise((r) => setTimeout(r, tentativa * 1000));
    }
  }

  // Persistiu vazio: pode ser perfil que virou privado. Não é erro fatal,
  // mas precisa aparecer no log em vez de sumir como coleta silenciosa.
  console.error(
    `[sync] biblioteca de ${steamId} veio vazia em 3 tentativas — ` +
      "perfil restrito ou indisponibilidade da Steam",
  );
  return [];
}

async function upsertGameAndOwnership(userId: string, game: OwnedGame) {
  const name = game.name?.trim() || `App ${game.appid}`;
  const lastPlayedAt = game.rtime_last_played
    ? new Date(game.rtime_last_played * 1000)
    : null;

  await prisma.game.upsert({
    where: { appId: game.appid },
    create: { appId: game.appid, name, iconHash: game.img_icon_url ?? null },
    update: { name, iconHash: game.img_icon_url ?? null },
  });

  await prisma.userGame.upsert({
    where: { userId_gameAppId: { userId, gameAppId: game.appid } },
    create: {
      userId,
      gameAppId: game.appid,
      playtimeForeverMin: game.playtime_forever,
      playtimeTwoWeeksMin: game.playtime_2weeks,
      lastPlayedAt,
    },
    update: {
      playtimeForeverMin: game.playtime_forever,
      playtimeTwoWeeksMin: game.playtime_2weeks,
      lastPlayedAt,
    },
  });
}

/**
 * "created" se um novo ponto foi gravado; "unchanged" se as stats vieram
 * iguais ao último ponto; "skipped" se não havia o que comparar.
 */
async function captureSnapshot(
  userId: string,
  steamId: string,
  game: OwnedGame,
  context?: MatchContext,
): Promise<"created" | "unchanged" | "skipped"> {
  const stats = await getUserStatsForGame(steamId, game.appid);

  if (!stats) {
    // Marca para não tentarmos de novo em todo sync futuro, de nenhum usuário.
    await prisma.game.update({
      where: { appId: game.appid },
      data: { supportsStats: false },
    });
    return "skipped";
  }

  await ensureStatSchema(game.appid);

  const userGame = await prisma.userGame.findUnique({
    where: { userId_gameAppId: { userId, gameAppId: game.appid } },
    select: { id: true },
  });
  if (!userGame) return "skipped";

  const latest = await prisma.statSnapshot.findFirst({
    where: { userGameId: userGame.id },
    orderBy: { capturedAt: "desc" },
    select: { capturedAt: true, metrics: true },
  });

  // Único critério: os contadores mudaram? Se não mudaram, o ponto seria
  // idêntico ao anterior e só engordaria a série.
  //
  // Não há janela mínima de tempo. Havia uma de 6 horas, e ela bloqueava
  // dado legítimo: quem jogava e sincronizava logo depois não ganhava ponto
  // nenhum. Como as stats do CS2 só são gravadas no fim da partida, sem a
  // janela cada sync durante uma sessão rende aproximadamente um ponto por
  // partida — a granularidade mais fina que a Web API permite.
  //
  // Isso não polui gráfico: a análise agrega por dia, semana ou mês na
  // hora da consulta. Guardar cru e agregar na leitura é o desenho.
  //
  // A comparação é por chave, não por JSON.stringify: a coluna é jsonb, e o
  // Postgres devolve as chaves em outra ordem da que a Steam manda. Com
  // stringify o check nunca batia, e a série ganhava pontos idênticos toda
  // vez que o playtime subia sem partida — tempo em menu, warmup, servidor
  // comunitário.
  if (latest && metricasIguais(latest.metrics as Record<string, number>, stats.metrics)) {
    return "unchanged";
  }

  await prisma.statSnapshot.create({
    data: {
      userGameId: userGame.id,
      playtimeForeverMin: game.playtime_forever,
      metrics: stats.metrics,
      achievementsUnlocked: stats.achievementsUnlocked,
      achievementsTotal: stats.achievementsTotal,
      // Só faz sentido no jogo que o bot observou; os demais jogos do mesmo
      // sync não têm nada a ver com aquela partida.
      matchMap: game.appid === 730 ? (context?.map ?? null) : null,
      matchMode: game.appid === 730 ? (context?.mode ?? null) : null,
      matchScore: game.appid === 730 ? (context?.score ?? null) : null,
    },
  });

  return "created";
}

function metricasIguais(a: Record<string, number>, b: Record<string, number>): boolean {
  const chavesA = Object.keys(a);
  if (chavesA.length !== Object.keys(b).length) return false;
  return chavesA.every((k) => a[k] === b[k]);
}

async function ensureStatSchema(appId: number) {
  const game = await prisma.game.findUnique({
    where: { appId },
    select: { schemaFetchedAt: true },
  });

  const ttl = Date.now() - SCHEMA_TTL_DAYS * 24 * 60 * 60 * 1000;
  if (game?.schemaFetchedAt && game.schemaFetchedAt.getTime() > ttl) return;

  const schema = await getGameStatSchema(appId);
  await prisma.game.update({
    where: { appId },
    data: { statSchema: schema ?? undefined, schemaFetchedAt: new Date() },
  });
}
