import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../prisma";
import { coerce } from "../fonte";
import { hashEntradas, insightsDaSessao, insightsDoModo, type InsightCalculado, type SessaoFato } from "./regras";

/**
 * Materializar insights: da sessão que acabou de fechar e do jogador.
 *
 * `gerarInsightsDaSessao` roda depois de `fecharSessao` (e no recompute):
 * os quatro insights de sessão, com o normal na hora, e depois os de
 * modo/período do jogador, porque uma sessão nova muda a tendência, a
 * forma, o ranking de mapas e a cobertura. Idempotente por
 * `(escopo, escopoId, regra, regraVersao)`.
 */

const CS2_APPID = 730;

const selecaoSessao = {
  id: true,
  ate: true,
  rounds: true,
  partidas: true,
  kills: true,
  deaths: true,
  headshots: true,
  dano: true,
  modo: true,
  modoConfianca: true,
  mapa: true,
  ateSnapshotId: true,
} satisfies Prisma.SessionSelect;

/** As sessões do jogador como fatos, com o vitalício da coleta que fechou cada uma. */
async function fatosDoJogador(userId: string): Promise<SessaoFato[]> {
  const sessoes = await prisma.session.findMany({ where: { userId, gameAppId: CS2_APPID }, orderBy: { ate: "asc" }, select: selecaoSessao });
  const ids = sessoes.map((s) => s.ateSnapshotId);
  const pontos = ids.length ? await prisma.statSnapshot.findMany({ where: { id: { in: ids } }, select: { id: true, metrics: true } }) : [];
  const vitalicioDe = new Map(
    pontos.map((p) => {
      const m = coerce(p.metrics);
      const ok = ["total_kills", "total_deaths", "total_kills_headshot", "total_damage_done", "total_rounds_played"].every((k) => k in m);
      return [p.id, ok ? { kills: m.total_kills, deaths: m.total_deaths, headshots: m.total_kills_headshot, dano: m.total_damage_done, rounds: m.total_rounds_played } : null] as const;
    }),
  );
  return sessoes.map((s) => ({
    id: s.id,
    ate: s.ate,
    rounds: s.rounds,
    partidas: s.partidas,
    kills: s.kills,
    deaths: s.deaths,
    headshots: s.headshots,
    dano: s.dano,
    modo: s.modo,
    confianca: s.modoConfianca,
    mapa: s.mapa,
    vitalicio: vitalicioDe.get(s.ateSnapshotId) ?? null,
  }));
}

async function gravar(userId: string, escopo: "SESSAO" | "MODO" | "PERIODO", escopoId: string, calculados: InsightCalculado[], entradas: unknown) {
  const entradasHash = hashEntradas(entradas);
  for (const c of calculados) {
    const dados = {
      userId,
      gameAppId: CS2_APPID,
      valor: c.valor,
      referencia: c.referencia,
      referenciaTipo: c.referenciaTipo,
      delta: c.delta,
      deltaUnidade: c.deltaUnidade,
      tom: c.tom,
      confianca: c.confianca,
      base: c.base,
      visual: c.visual,
      dados: c.dados as Prisma.InputJsonValue,
      linha: c.linha,
      entradasHash,
    };
    await prisma.insight.upsert({
      where: { escopo_escopoId_regra_regraVersao: { escopo, escopoId, regra: c.regra, regraVersao: c.regraVersao } },
      create: { escopo, escopoId, regra: c.regra, regraVersao: c.regraVersao, ...dados },
      update: dados,
    });
  }
}

/** Os insights de modo/período do jogador: "tudo" e cada modo com sessão provada. */
export async function gerarInsightsDoJogador(userId: string): Promise<number> {
  const fatos = await fatosDoJogador(userId);
  const modos = [null, ...new Set(fatos.filter((s) => s.confianca !== "MISTA" && s.modo).map((s) => s.modo as string))];
  let n = 0;
  for (const modo of modos) {
    const calculados = insightsDoModo(fatos, modo);
    await gravar(userId, "MODO", modo ?? "tudo", calculados, { modo, fatos });
    n += calculados.length;
  }
  // Modos que perderam todas as sessões provadas não têm mais insight.
  await prisma.insight.deleteMany({ where: { userId, gameAppId: CS2_APPID, escopo: "MODO", escopoId: { notIn: modos.map((m) => m ?? "tudo") } } });
  return n;
}

/** Os insights da sessão (normal na hora) e, em seguida, os do jogador. */
export async function gerarInsightsDaSessao(sessionId: string): Promise<number> {
  const sessao = await prisma.session.findUnique({ where: { id: sessionId }, select: { userId: true } });
  if (!sessao) return 0;
  const fatos = await fatosDoJogador(sessao.userId);
  const alvo = fatos.find((s) => s.id === sessionId);
  if (!alvo) return 0;
  const anteriores = fatos.filter((s) => s.ate < alvo.ate);
  const calculados = insightsDaSessao(alvo, anteriores);
  await gravar(sessao.userId, "SESSAO", sessionId, calculados, { alvo, anteriores });
  return calculados.length + (await gerarInsightsDoJogador(sessao.userId));
}

/** Refaz todos os insights (de um jogador ou de todos), com as regras vigentes. */
export async function recomputarInsights(userId?: string): Promise<{ jogadores: number; insights: number }> {
  const users = await prisma.session.findMany({ where: { gameAppId: CS2_APPID, ...(userId ? { userId } : {}) }, distinct: ["userId"], select: { userId: true } });
  let insights = 0;
  for (const { userId: u } of users) {
    const fatos = await fatosDoJogador(u);
    for (let i = 0; i < fatos.length; i++) {
      const calculados = insightsDaSessao(fatos[i], fatos.slice(0, i));
      await gravar(u, "SESSAO", fatos[i].id, calculados, { alvo: fatos[i], anteriores: fatos.slice(0, i) });
      insights += calculados.length;
    }
    insights += await gerarInsightsDoJogador(u);
    // Sessões que deixaram de existir levam os insights junto.
    await prisma.insight.deleteMany({ where: { userId: u, gameAppId: CS2_APPID, escopo: "SESSAO", escopoId: { notIn: fatos.map((f) => f.id) } } });
  }
  return { jogadores: users.length, insights };
}
