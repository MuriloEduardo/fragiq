import { prisma } from "../prisma";
import type { InsightLinha } from "@/components/insight";

/**
 * O que a tela lê: os insights da última sessão da lente e os do modo.
 * Só consulta; nada é calculado aqui (docs/dados-confiaveis.md §3.3).
 */
const CS2_APPID = 730;

const ORDEM_SESSAO = ["sessao.classificacao", "kd.vs.normal", "adr.vs.normal", "hs.vs.normal"];
const ORDEM_MODO = ["tendencia.kd.5", "forma.vs.vitalicio", "mapa.ranking", "arma.destaque", "arma.precisao", "consistencia", "cobertura.modo"];

function paraLinha(i: {
  id: string;
  regra: string;
  tom: InsightLinha["tom"];
  confianca: InsightLinha["confianca"];
  base: unknown;
  visual: InsightLinha["visual"];
  dados: unknown;
  linha: string;
  valor: number | null;
  referencia: number | null;
}): InsightLinha {
  return { ...i, base: (i.base as InsightLinha["base"]) ?? {}, dados: (i.dados as Record<string, unknown>) ?? {} };
}

const ordenar = (ordem: string[]) => (a: InsightLinha, b: InsightLinha) => ordem.indexOf(a.regra) - ordem.indexOf(b.regra);

/** Os insights da sessão mais recente da lente (`modo` null = qualquer sessão). */
export async function insightsDaUltimaSessao(userId: string, modo: string | null): Promise<{ sessaoId: string; ate: Date; insights: InsightLinha[] } | null> {
  const sessao = await prisma.session.findFirst({
    where: { userId, gameAppId: CS2_APPID, ...(modo ? { modo, modoConfianca: { not: "MISTA" } } : {}) },
    orderBy: { ate: "desc" },
    select: { id: true, ate: true },
  });
  if (!sessao) return null;
  const linhas = await prisma.insight.findMany({ where: { escopo: "SESSAO", escopoId: sessao.id }, orderBy: { regraVersao: "desc" } });
  // Uma regra pode ter duas versões no banco durante um recompute; a mais nova vence.
  const porRegra = new Map<string, (typeof linhas)[number]>();
  for (const l of linhas) if (!porRegra.has(l.regra)) porRegra.set(l.regra, l);
  return { sessaoId: sessao.id, ate: sessao.ate, insights: [...porRegra.values()].map(paraLinha).sort(ordenar(ORDEM_SESSAO)) };
}

/**
 * O chip de K/D de cada sessão — o que a tabela de Sessões desenha por linha.
 *
 * A chave é `Session.ateSnapshotId`, a coleta que fechou a sessão, porque é
 * ela que a linha da tabela tem em mãos (`Sessao.snapshotId`, montada dos
 * snapshots em `listarSessoes`). Só `kd.vs.normal`: é o único insight de
 * sessão que a tabela mostra, e pedir os quatro seria trazer três por linha
 * para jogar fora.
 *
 * A referência não depende da lente — é o normal do modo da própria sessão,
 * ou o vitalício da coleta que a fechou quando não há base (`normalNaHora`).
 * Trocar de aba não muda mais o chip de uma linha, e a linha de legenda da
 * página diz isso.
 */
export async function chipsDeSessao(userId: string, appId: number): Promise<Map<string, InsightLinha>> {
  const sessoes = await prisma.session.findMany({ where: { userId, gameAppId: appId }, select: { id: true, ateSnapshotId: true } });
  if (sessoes.length === 0) return new Map();
  const linhas = await prisma.insight.findMany({
    where: { escopo: "SESSAO", escopoId: { in: sessoes.map((s) => s.id) }, regra: "kd.vs.normal" },
    orderBy: { regraVersao: "desc" },
  });
  // Mesmo cuidado de `insightsDaUltimaSessao`: durante um recompute uma regra
  // pode ter duas versões no banco, e a mais nova vence.
  const porSessao = new Map<string, (typeof linhas)[number]>();
  for (const l of linhas) if (!porSessao.has(l.escopoId)) porSessao.set(l.escopoId, l);
  const porColeta = new Map<string, InsightLinha>();
  for (const s of sessoes) {
    const l = porSessao.get(s.id);
    if (l) porColeta.set(s.ateSnapshotId, paraLinha(l));
  }
  return porColeta;
}

/**
 * Os insights por arma — o que a aba Estatísticas mostra em Destaques.
 *
 * É a mesma consulta do Resumo, recortada: arma é assunto da aba de
 * estatísticas, e o Resumo já repete de lá o painel de seis cartões.
 */
export async function insightsDeArma(userId: string, modo: string | null): Promise<InsightLinha[]> {
  return (await insightsDoModo(userId, modo)).filter((i) => i.regra.startsWith("arma."));
}

/** Os insights do modo (ou de "tudo"). */
export async function insightsDoModo(userId: string, modo: string | null): Promise<InsightLinha[]> {
  const linhas = await prisma.insight.findMany({ where: { userId, gameAppId: CS2_APPID, escopo: "MODO", escopoId: modo ?? "tudo" }, orderBy: { regraVersao: "desc" } });
  const porRegra = new Map<string, (typeof linhas)[number]>();
  for (const l of linhas) if (!porRegra.has(l.regra)) porRegra.set(l.regra, l);
  return [...porRegra.values()].map(paraLinha).sort(ordenar(ORDEM_MODO));
}
