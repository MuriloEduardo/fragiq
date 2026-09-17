import { prisma } from "./prisma";
import { REGRA_VERSAO } from "./sessao/atribuir";
import { REGRAS_EM_VIGOR } from "./insights/regras";

/**
 * O painel de dados (docs/dados-confiaveis.md §3.4, fase 5): cobertura de
 * modo, regras em vigor contra o que está materializado, e a cadeia de um
 * trace. Só consultas — nada aqui recalcula.
 */
const CS2_APPID = 730;

export type Cobertura = {
  porConfianca: { confianca: string; sessoes: number; rounds: number; partidas: number }[];
  porJogador: { persona: string; sessoes: number; mistas: number; rounds: number; roundsProvados: number; ultima: Date | null; maiorBuracoH: number | null }[];
  regras: { regra: string; escopo: string; versao: number; emDia: number; atrasados: number }[];
  sessoesRegra: { versao: number; emDia: number; atrasadas: number };
};

export async function carregarCobertura(): Promise<Cobertura> {
  const [grupos, sessoes, insights, sessoesVersao] = await Promise.all([
    prisma.session.groupBy({ by: ["modoConfianca"], where: { gameAppId: CS2_APPID }, _count: { _all: true }, _sum: { rounds: true, partidas: true } }),
    prisma.session.findMany({ where: { gameAppId: CS2_APPID }, select: { userId: true, rounds: true, modoConfianca: true, de: true, ate: true }, orderBy: { ate: "asc" } }),
    prisma.insight.groupBy({ by: ["regra", "escopo", "regraVersao"], where: { gameAppId: CS2_APPID }, _count: { _all: true } }),
    prisma.session.groupBy({ by: ["regraVersao"], where: { gameAppId: CS2_APPID }, _count: { _all: true } }),
  ]);

  const porConfianca = ["EXATA", "INFERIDA", "MISTA"].map((c) => {
    const g = grupos.find((x) => x.modoConfianca === c);
    return { confianca: c, sessoes: g?._count._all ?? 0, rounds: g?._sum.rounds ?? 0, partidas: g?._sum.partidas ?? 0 };
  });

  const porUser = new Map<string, typeof sessoes>();
  for (const s of sessoes) porUser.set(s.userId, [...(porUser.get(s.userId) ?? []), s]);
  const users = porUser.size ? await prisma.user.findMany({ where: { id: { in: [...porUser.keys()] } }, select: { id: true, personaName: true } }) : [];
  const nome = new Map(users.map((u) => [u.id, u.personaName]));
  const porJogador = [...porUser.entries()]
    .map(([userId, ss]) => {
      // O maior buraco entre o fim de uma sessão e o início da seguinte: o
      // tempo em que a Steam acumulou e ninguém coletou.
      let maior = 0;
      for (let i = 1; i < ss.length; i++) maior = Math.max(maior, ss[i].de.getTime() - ss[i - 1].ate.getTime());
      return {
        persona: nome.get(userId) ?? userId,
        sessoes: ss.length,
        mistas: ss.filter((s) => s.modoConfianca === "MISTA").length,
        rounds: ss.reduce((a, s) => a + s.rounds, 0),
        roundsProvados: ss.filter((s) => s.modoConfianca !== "MISTA").reduce((a, s) => a + s.rounds, 0),
        ultima: ss[ss.length - 1]?.ate ?? null,
        maiorBuracoH: ss.length > 1 ? Math.round(maior / 3_600_000) : null,
      };
    })
    .sort((a, b) => b.rounds - a.rounds);

  const regras = REGRAS_EM_VIGOR.map((r) => {
    const linhas = insights.filter((i) => i.regra === r.regra && i.escopo === r.escopo);
    return {
      regra: r.regra,
      escopo: r.escopo,
      versao: r.versao,
      emDia: linhas.filter((l) => l.regraVersao === r.versao).reduce((a, l) => a + l._count._all, 0),
      atrasados: linhas.filter((l) => l.regraVersao !== r.versao).reduce((a, l) => a + l._count._all, 0),
    };
  });

  return {
    porConfianca,
    porJogador,
    regras,
    sessoesRegra: {
      versao: REGRA_VERSAO,
      emDia: sessoesVersao.filter((v) => v.regraVersao === REGRA_VERSAO).reduce((a, v) => a + v._count._all, 0),
      atrasadas: sessoesVersao.filter((v) => v.regraVersao !== REGRA_VERSAO).reduce((a, v) => a + v._count._all, 0),
    },
  };
}

export type Cadeia = {
  traceId: string;
  observacoes: { kind: string; map: string | null; mode: string | null; score: string | null; observedAt: Date; steamId: string }[];
  captura: { tentativa: number; proximaEm: Date; createdAt: Date } | null;
  runs: { id: string; trigger: string; status: string; startedAt: Date; finishedAt: Date | null; error: string | null }[];
  snapshots: { id: string; capturedAt: Date; trigger: string | null; matchMode: string | null; gameAppId: number }[];
  sessoes: { id: string; de: Date; ate: Date; rounds: number; modo: string | null; modoConfianca: string; regraVersao: number }[];
  insights: { regra: string; regraVersao: number; linha: string; tom: string }[];
  logs: { nivel: string; mensagem: string; em: Date }[];
  eventos: { nome: string; createdAt: Date; dados: unknown }[];
};

/** Tudo o que carrega um `traceId`, na ordem em que aconteceu. */
export async function carregarCadeia(traceId: string): Promise<Cadeia> {
  const [observacoes, captura, runs, snapshots, logs, eventos] = await Promise.all([
    prisma.botObservation.findMany({ where: { traceId }, orderBy: { observedAt: "asc" }, select: { kind: true, map: true, mode: true, score: true, observedAt: true, steamId: true } }),
    prisma.pendingCapture.findFirst({ where: { traceId }, select: { tentativa: true, proximaEm: true, createdAt: true } }),
    prisma.syncRun.findMany({ where: { traceId }, orderBy: { startedAt: "asc" }, select: { id: true, trigger: true, status: true, startedAt: true, finishedAt: true, error: true } }),
    prisma.statSnapshot.findMany({ where: { traceId }, orderBy: { capturedAt: "asc" }, select: { id: true, capturedAt: true, trigger: true, matchMode: true, userGame: { select: { gameAppId: true } } } }),
    prisma.botLog.findMany({ where: { traceId }, orderBy: { em: "asc" }, select: { nivel: true, mensagem: true, em: true } }),
    prisma.evento.findMany({ where: { traceId }, orderBy: { createdAt: "asc" }, select: { nome: true, createdAt: true, dados: true } }),
  ]);
  const ids = snapshots.map((s) => s.id);
  const sessoes = ids.length
    ? await prisma.session.findMany({ where: { ateSnapshotId: { in: ids } }, select: { id: true, de: true, ate: true, rounds: true, modo: true, modoConfianca: true, regraVersao: true } })
    : [];
  const insights = sessoes.length
    ? await prisma.insight.findMany({ where: { escopo: "SESSAO", escopoId: { in: sessoes.map((s) => s.id) } }, orderBy: { regra: "asc" }, select: { regra: true, regraVersao: true, linha: true, tom: true } })
    : [];
  return {
    traceId,
    observacoes,
    captura,
    runs,
    snapshots: snapshots.map((s) => ({ id: s.id, capturedAt: s.capturedAt, trigger: s.trigger, matchMode: s.matchMode, gameAppId: s.userGame.gameAppId })),
    sessoes,
    insights,
    logs,
    eventos,
  };
}
