import { prisma } from "./prisma";
import { parseStatSchema } from "./stats";
import { metricCatalog, type SnapshotRow } from "./series";
import type { Fonte } from "./analista";

/**
 * O mesmo balde que a página do jogo carrega, para quem não é a página.
 *
 * O endpoint de dados do analista responde sobre a série de um jogador, e
 * precisa ler exatamente o que a tela lê — mesmo teto de pontos, mesma
 * ordenação, mesma coerção dos contadores. Duas leituras diferentes seriam
 * duas verdades.
 */

/** Teto de pontos, igual ao da página: a análise recalcula tudo em memória. */
export const MAX_SNAPSHOTS = 500;

export async function carregarFonte(userId: string, appId: number): Promise<Fonte | null> {
  const userGame = await prisma.userGame.findUnique({
    where: { userId_gameAppId: { userId, gameAppId: appId } },
    select: {
      playtimeForeverMin: true,
      game: { select: { name: true, statSchema: true } },
      snapshots: {
        orderBy: { capturedAt: "asc" },
        take: MAX_SNAPSHOTS,
        select: {
          capturedAt: true,
          playtimeForeverMin: true,
          metrics: true,
          matchMap: true,
          matchMode: true,
          matchScore: true,
        },
      },
    },
  });
  if (!userGame) return null;

  const rows: SnapshotRow[] = userGame.snapshots.map((s) => ({
    capturedAt: s.capturedAt,
    playtimeForeverMin: s.playtimeForeverMin,
    metrics: coerce(s.metrics),
    matchMap: s.matchMap,
    matchMode: s.matchMode,
    matchScore: s.matchScore,
  }));

  return {
    appId,
    gameName: userGame.game.name,
    playtimeForeverMin: userGame.playtimeForeverMin,
    rows,
    catalog: metricCatalog(rows, parseStatSchema(userGame.game.statSchema)),
  };
}

export function coerce(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
  }
  return out;
}
