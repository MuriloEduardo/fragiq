import { prisma } from "./prisma";

/**
 * Preços do Mercado da Comunidade, lidos pelo bot.
 *
 * A Steam responde 429 ao `priceoverview` para o IP da plataforma (ECS)
 * — medido em 17/09/2026 — e 200 para o host do bot. Então o bot é quem
 * lê, como faz com o GC e o chat: busca aqui a fila de nomes vencidos
 * (`GET /api/bot/precos`), lê um por vez com espaçamento, e devolve
 * (`POST /api/bot/precos`). O site só decide o que está vencido e guarda.
 * Um item fora do mercado fica registrado como tal por 7 dias.
 */
export const VALIDADE_MS = 24 * 60 * 60_000;
const VALIDADE_NAO_LISTADO_MS = 7 * VALIDADE_MS;

/** Os `market_hash_name` cujo preço venceu (ou nunca foi lido), o mais velho primeiro. */
export async function nomesParaPrecificar(limite = 10): Promise<string[]> {
  const nomes = await prisma.inventoryItem.findMany({
    where: { saiuEm: null, marketable: true, marketHashName: { not: null } },
    distinct: ["marketHashName"],
    select: { marketHashName: true },
  });
  if (nomes.length === 0) return [];
  const lista = nomes.map((n) => n.marketHashName as string);
  const precos = await prisma.itemPrice.findMany({ where: { marketHashName: { in: lista } }, select: { marketHashName: true, atualizadoEm: true, listado: true } });
  const porNome = new Map(precos.map((p) => [p.marketHashName, p]));
  const agora = Date.now();
  return lista
    .map((nome) => ({ nome, p: porNome.get(nome) }))
    .filter(({ p }) => !p || agora - p.atualizadoEm.getTime() > (p.listado ? VALIDADE_MS : VALIDADE_NAO_LISTADO_MS))
    .sort((a, b) => (a.p?.atualizadoEm.getTime() ?? 0) - (b.p?.atualizadoEm.getTime() ?? 0))
    .slice(0, limite)
    .map((x) => x.nome);
}

export type PrecoLido = { listado: boolean; menorCents: number | null; medianaCents: number | null; volume: number | null };

export async function gravarPreco(marketHashName: string, r: PrecoLido): Promise<void> {
  await prisma.itemPrice.upsert({
    where: { marketHashName },
    create: { marketHashName, listado: r.listado, menorCents: r.menorCents, medianaCents: r.medianaCents, volume: r.volume },
    update: { listado: r.listado, menorCents: r.menorCents, medianaCents: r.medianaCents, volume: r.volume, atualizadoEm: new Date() },
  });
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
