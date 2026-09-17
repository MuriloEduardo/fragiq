import { prisma } from "../prisma";
import type { InsightLinha } from "@/components/insight";

/**
 * O que a tela lê: os insights da última sessão da lente e os do modo.
 * Só consulta; nada é calculado aqui (docs/dados-confiaveis.md §3.3).
 */
const CS2_APPID = 730;

const ORDEM_SESSAO = ["sessao.classificacao", "kd.vs.normal", "adr.vs.normal", "hs.vs.normal"];
const ORDEM_MODO = ["tendencia.kd.5", "forma.vs.vitalicio", "mapa.ranking", "consistencia", "cobertura.modo"];

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

/** Os insights do modo (ou de "tudo"). */
export async function insightsDoModo(userId: string, modo: string | null): Promise<InsightLinha[]> {
  const linhas = await prisma.insight.findMany({ where: { userId, gameAppId: CS2_APPID, escopo: "MODO", escopoId: modo ?? "tudo" }, orderBy: { regraVersao: "desc" } });
  const porRegra = new Map<string, (typeof linhas)[number]>();
  for (const l of linhas) if (!porRegra.has(l.regra)) porRegra.set(l.regra, l);
  return [...porRegra.values()].map(paraLinha).sort(ordenar(ORDEM_MODO));
}
