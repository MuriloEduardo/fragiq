import { prisma } from "./prisma";
import { getInventory, SteamApiError } from "./steam/api";
import { registrar, reportarErro } from "./eventos";

/**
 * O inventário de CS2 de um jogador, como fato com história.
 *
 * A Steam entrega "o que a pessoa tem agora"; nós guardamos cada item com
 * quando apareceu, quando foi visto pela última vez e quando saiu — nada se
 * apaga. A leitura passa pelo cogniflow (`steam.inventory.read`), que fala
 * com o endpoint da comunidade, limitado por IP: por isso o intervalo
 * mínimo entre leituras e nada de ler em toda carga de página. Um
 * inventário privado é registrado como tal e a tela diz isso; não é erro.
 */

export const INTERVALO_MIN_MS = 6 * 60 * 60_000;

export type ResultadoInventario = { estado: "lido" | "recente" | "privado" | "indisponivel"; itens: number; novos: number; sairam: number };

export async function sincronizarInventario(userId: string, steamId: string, forcar = false): Promise<ResultadoInventario> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { inventarioLidoEm: true } });
  if (!forcar && user?.inventarioLidoEm && Date.now() - user.inventarioLidoEm.getTime() < INTERVALO_MIN_MS) {
    return { estado: "recente", itens: 0, novos: 0, sairam: 0 };
  }

  let leitura: Awaited<ReturnType<typeof getInventory>>;
  try {
    leitura = await getInventory(steamId);
  } catch (err) {
    // 429 é a Steam pedindo calma; o resto é integração quebrada. Nos dois
    // casos o que já temos continua valendo, e o painel fica sabendo.
    await reportarErro("inventario.leitura", err, userId);
    if (err instanceof SteamApiError) return { estado: "indisponivel", itens: 0, novos: 0, sairam: 0 };
    throw err;
  }

  const agora = new Date();
  if (!leitura.public) {
    await prisma.user.update({ where: { id: userId }, data: { inventarioPublico: false, inventarioLidoEm: agora } });
    return { estado: "privado", itens: 0, novos: 0, sairam: 0 };
  }

  const atuais = await prisma.inventoryItem.findMany({ where: { userId, saiuEm: null }, select: { assetId: true } });
  const vistos = new Set(leitura.items.map((i) => i.asset_id));
  const sairam = atuais.filter((a) => !vistos.has(a.assetId)).map((a) => a.assetId);
  const conhecidos = new Set(atuais.map((a) => a.assetId));
  const novos = leitura.items.filter((i) => !conhecidos.has(i.asset_id)).length;

  await prisma.$transaction([
    ...leitura.items.map((i) =>
      prisma.inventoryItem.upsert({
        where: { userId_assetId: { userId, assetId: i.asset_id } },
        create: {
          userId,
          assetId: i.asset_id,
          classId: i.class_id,
          amount: i.amount,
          name: i.name ?? i.market_hash_name ?? "Item",
          marketHashName: i.market_hash_name,
          type: i.type,
          imageUrl: i.image,
          rarity: i.rarity,
          rarityKey: i.rarity_key,
          rarityColor: i.rarity_color,
          exterior: i.exterior,
          exteriorKey: i.exterior_key,
          weapon: i.weapon,
          category: i.category,
          stattrak: i.stattrak,
          souvenir: i.souvenir,
          tradable: i.tradable,
          marketable: i.marketable,
          primeiraVezEm: agora,
          ultimaVezEm: agora,
        },
        // Um item que voltou (troca desfeita) reabre: `saiuEm` volta a nulo.
        update: { ultimaVezEm: agora, saiuEm: null, amount: i.amount, tradable: i.tradable, marketable: i.marketable },
      }),
    ),
    ...(sairam.length ? [prisma.inventoryItem.updateMany({ where: { userId, assetId: { in: sairam } }, data: { saiuEm: agora } })] : []),
    prisma.user.update({ where: { id: userId }, data: { inventarioPublico: true, inventarioLidoEm: agora } }),
  ]);

  if (novos || sairam.length) await registrar("inventario.mudou", { userId, dados: { novos, sairam: sairam.length, total: leitura.items.length } });
  return { estado: "lido", itens: leitura.items.length, novos, sairam: sairam.length };
}

/** A ordem de raridade da Steam, do mais raro ao comum, para ordenar a grade. */
const ORDEM_RARIDADE = [
  "Rarity_Contraband",
  "Rarity_Ancient_Weapon",
  "Rarity_Ancient",
  "Rarity_Legendary_Weapon",
  "Rarity_Legendary",
  "Rarity_Mythical_Weapon",
  "Rarity_Mythical",
  "Rarity_Rare_Weapon",
  "Rarity_Rare",
  "Rarity_Uncommon_Weapon",
  "Rarity_Uncommon",
  "Rarity_Common_Weapon",
  "Rarity_Common",
];

export function posicaoDaRaridade(key: string | null): number {
  const i = key ? ORDEM_RARIDADE.indexOf(key) : -1;
  return i === -1 ? ORDEM_RARIDADE.length : i;
}

export type ItemDoInventario = {
  id: string;
  name: string;
  imageUrl: string | null;
  rarity: string | null;
  rarityKey: string | null;
  rarityColor: string | null;
  exterior: string | null;
  weapon: string | null;
  category: string | null;
  stattrak: boolean;
  souvenir: boolean;
  tradable: boolean;
  primeiraVezEm: Date;
};

/** Os itens atuais, do mais raro ao comum, e o resumo por categoria. */
export async function listarInventario(userId: string): Promise<{ itens: ItemDoInventario[]; porCategoria: { categoria: string; n: number }[]; lidoEm: Date | null; publico: boolean | null; sairam30d: number }> {
  const [user, linhas, sairam30d] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { inventarioLidoEm: true, inventarioPublico: true } }),
    prisma.inventoryItem.findMany({
      where: { userId, saiuEm: null },
      select: { id: true, name: true, imageUrl: true, rarity: true, rarityKey: true, rarityColor: true, exterior: true, weapon: true, category: true, stattrak: true, souvenir: true, tradable: true, primeiraVezEm: true },
    }),
    prisma.inventoryItem.count({ where: { userId, saiuEm: { gt: new Date(Date.now() - 30 * 86_400_000) } } }),
  ]);
  const itens = linhas.sort((a, b) => posicaoDaRaridade(a.rarityKey) - posicaoDaRaridade(b.rarityKey) || a.name.localeCompare(b.name));
  const contagem = new Map<string, number>();
  for (const i of itens) contagem.set(i.category ?? "Outros", (contagem.get(i.category ?? "Outros") ?? 0) + 1);
  const porCategoria = [...contagem.entries()].map(([categoria, n]) => ({ categoria, n })).sort((a, b) => b.n - a.n);
  return { itens, porCategoria, lidoEm: user?.inventarioLidoEm ?? null, publico: user?.inventarioPublico ?? null, sairam30d };
}
