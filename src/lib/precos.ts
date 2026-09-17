import { prisma } from "./prisma";
import { getMarketPrice, SteamApiError } from "./steam/api";
import { reportarErro } from "./eventos";

/**
 * Preços do Mercado da Comunidade, um item por vez.
 *
 * A Steam limita o endpoint a ~20 chamadas por minuto por IP, então nada
 * aqui busca em lote: `atualizarUmPreco` pega o `market_hash_name` mais
 * velho (ou nunca lido) entre os itens atuais e marketáveis de todos os
 * jogadores, lê um preço e grava. Quem chama é o tick do bot — a cada 30 s
 * — o mesmo relógio das capturas: ~2.800 preços por dia, muito além do
 * que a base precisa, sem cron novo. Um 429 só adia; um item fora do
 * mercado fica registrado como tal e não é perguntado de novo por 7 dias.
 */
export const VALIDADE_MS = 24 * 60 * 60_000;
const VALIDADE_NAO_LISTADO_MS = 7 * VALIDADE_MS;

export async function atualizarUmPreco(): Promise<{ nome: string; estado: "lido" | "nao-listado" | "adiado" } | null> {
  const nomes = await prisma.inventoryItem.findMany({
    where: { saiuEm: null, marketable: true, marketHashName: { not: null } },
    distinct: ["marketHashName"],
    select: { marketHashName: true },
  });
  if (nomes.length === 0) return null;
  const lista = nomes.map((n) => n.marketHashName as string);
  const precos = await prisma.itemPrice.findMany({ where: { marketHashName: { in: lista } }, select: { marketHashName: true, atualizadoEm: true, listado: true } });
  const porNome = new Map(precos.map((p) => [p.marketHashName, p]));
  const agora = Date.now();
  const vencidos = lista
    .map((nome) => ({ nome, p: porNome.get(nome) }))
    .filter(({ p }) => !p || agora - p.atualizadoEm.getTime() > (p.listado ? VALIDADE_MS : VALIDADE_NAO_LISTADO_MS))
    .sort((a, b) => (a.p?.atualizadoEm.getTime() ?? 0) - (b.p?.atualizadoEm.getTime() ?? 0));
  const alvo = vencidos[0];
  if (!alvo) return null;

  try {
    const r = await getMarketPrice(alvo.nome);
    await prisma.itemPrice.upsert({
      where: { marketHashName: alvo.nome },
      create: { marketHashName: alvo.nome, listado: r.listed, menorCents: r.lowest_cents, medianaCents: r.median_cents, volume: r.volume },
      update: { listado: r.listed, menorCents: r.lowest_cents, medianaCents: r.median_cents, volume: r.volume, atualizadoEm: new Date() },
    });
    return { nome: alvo.nome, estado: r.listed ? "lido" : "nao-listado" };
  } catch (err) {
    if (!(err instanceof SteamApiError) || err.status !== 429) await reportarErro("precos.leitura", err);
    return { nome: alvo.nome, estado: "adiado" };
  }
}

export type PrecoDoItem = { menorCents: number | null; medianaCents: number | null; atualizadoEm: Date } | null;

/** Preços conhecidos para uma lista de nomes; ausente = ainda não lido. */
export async function precosDe(nomes: (string | null)[]): Promise<Map<string, PrecoDoItem>> {
  const lista = [...new Set(nomes.filter((n): n is string => Boolean(n)))];
  if (lista.length === 0) return new Map();
  const precos = await prisma.itemPrice.findMany({ where: { marketHashName: { in: lista }, listado: true }, select: { marketHashName: true, menorCents: true, medianaCents: true, atualizadoEm: true } });
  return new Map(precos.map((p) => [p.marketHashName, { menorCents: p.menorCents, medianaCents: p.medianaCents, atualizadoEm: p.atualizadoEm }]));
}

export function formatarBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
