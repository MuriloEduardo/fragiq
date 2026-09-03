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
};

export async function syncUser(
  userId: string,
  steamId: string,
  trigger: SyncTrigger = "MANUAL",
): Promise<SyncResult> {
  const run = await prisma.syncRun.create({
    data: { userId, trigger, status: "RUNNING" },
  });

  try {
    const result = await runSync(userId, steamId);

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

async function runSync(userId: string, steamId: string): Promise<SyncResult> {
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

  const owned = await getOwnedGames(steamId);
  const played = owned.filter((g) => g.playtime_forever > 0);

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

  for (const game of dirty) {
    if (statCallsSpent >= MAX_GAMES_WITH_STATS) break;

    const record = await prisma.game.findUnique({
      where: { appId: game.appid },
      select: { supportsStats: true },
    });
    if (record && !record.supportsStats) continue; // já sabemos que não expõe stats.

    statCallsSpent++;
    if (await captureSnapshot(userId, steamId, game)) snapshotsCreated++;
  }

  return {
    gamesSeen: played.length,
    gamesStored: played.length,
    snapshotsCreated,
    statCallsSpent,
  };
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

/** Retorna true se um novo ponto foi gravado na série. */
async function captureSnapshot(
  userId: string,
  steamId: string,
  game: OwnedGame,
): Promise<boolean> {
  const stats = await getUserStatsForGame(steamId, game.appid);

  if (!stats) {
    // Marca para não tentarmos de novo em todo sync futuro, de nenhum usuário.
    await prisma.game.update({
      where: { appId: game.appid },
      data: { supportsStats: false },
    });
    return false;
  }

  await ensureStatSchema(game.appid);

  const userGame = await prisma.userGame.findUnique({
    where: { userId_gameAppId: { userId, gameAppId: game.appid } },
    select: { id: true },
  });
  if (!userGame) return false;

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
  // Isso não polui gráfico: o explorador agrega por dia, semana ou mês na
  // hora da consulta. Guardar cru e agregar na leitura é o desenho.
  if (latest && JSON.stringify(latest.metrics) === JSON.stringify(stats.metrics)) {
    return false;
  }

  await prisma.statSnapshot.create({
    data: {
      userGameId: userGame.id,
      playtimeForeverMin: game.playtime_forever,
      metrics: stats.metrics,
      achievementsUnlocked: stats.achievementsUnlocked,
      achievementsTotal: stats.achievementsTotal,
    },
  });

  return true;
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
