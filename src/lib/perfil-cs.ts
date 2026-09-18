import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { getInventory, getOwnedGames } from "./steam/api";
import { posicaoDaRaridade, type ItemDoInventario } from "./inventario";
import { rotularMapa, rotularModo } from "./cs2-labels";

/**
 * O que o FragIQ sabe de um SteamID **sem depender da privacidade da Steam**.
 *
 * "Detalhes do jogo" privado esconde os contadores vitalícios, mas não o
 * que já passou por aqui: o scoreboard do GC e a demo de cada partida
 * oficial (públicos para os dez de cada partida), o rich presence que o
 * bot viu, o inventário quando a pessoa o deixa aberto. A página pública
 * mostra isso em qualquer estado, e os contadores por cima quando existem.
 */

const CS2 = 730;
/** A Steam limita o endpoint de inventário por IP com força: uma leitura por SteamID a cada 6 h. */
const INVENTARIO_TTL_MS = 6 * 60 * 60_000;
/** Uma leitura que falhou (429, 403 ambíguo) espera 1 h antes de tentar de novo. */
const INVENTARIO_FALHA_MS = 60 * 60_000;
const VITRINE = 40;

export type DemoPublica = {
  partidas: number;
  rounds: number;
  adr: number;
  kast: number;
  hs: number | null;
  aberturas: number;
  aberturasPerdidas: number;
  trocas: number;
  clutches: number;
  clutchesGanhos: number;
  /** O CS Rating do Premier: o mais recente e a trilha, da partida mais antiga à mais nova. */
  rating: { atual: number; vitorias: number; trilha: { em: Date; depois: number; mudanca: number }[] } | null;
};

export type PresencaPublica = { quando: Date; mapa: string | null; modo: string | null; placar: string | null };

export type PerfilCS = {
  /** Horas de CS2 pela biblioteca, quando ela é pública e os contadores não. */
  horasBiblioteca: number | null;
  demo: DemoPublica | null;
  presenca: PresencaPublica | null;
  inventario: { publico: boolean; total: number; itens: ItemDoInventario[] } | null;
};

export async function carregarPerfilCS(steamId: string, opts: { userId: string | null; horasConhecidas: boolean; lerInventario: boolean }): Promise<PerfilCS> {
  const [demo, presenca, inventario, horasBiblioteca] = await Promise.all([
    demoDe(steamId),
    presencaDe(steamId),
    opts.lerInventario ? inventarioPublicoDe(steamId) : null,
    opts.horasConhecidas ? null : horasDaBiblioteca(steamId),
  ]);
  return { horasBiblioteca, demo, presenca, inventario };
}

/** As métricas de todas as partidas com demo em que o SteamID esteve, em média ponderada por rounds. */
async function demoDe(steamId: string): Promise<DemoPublica | null> {
  const linhas = await prisma.matchPlayerDemo.findMany({
    where: { steamId, rounds: { gt: 0 } },
    select: {
      rounds: true,
      kills: true,
      hs: true,
      dano: true,
      adr: true,
      kast: true,
      aberturas: true,
      aberturasPerdidas: true,
      trocas: true,
      clutches: true,
      clutchesGanhos: true,
      ratingTipo: true,
      ratingDepois: true,
      ratingMudanca: true,
      ratingVitorias: true,
      match: { select: { jogadaEm: true, createdAt: true } },
    },
    orderBy: { match: { jogadaEm: "asc" } },
  });
  if (linhas.length === 0) return null;
  const rounds = linhas.reduce((s, l) => s + l.rounds, 0);
  const kills = linhas.reduce((s, l) => s + l.kills, 0);
  const soma = (f: (l: (typeof linhas)[number]) => number) => linhas.reduce((s, l) => s + f(l), 0);
  // Só o Premier (tipo 11) tem um número que muda de partida em partida; 0 é "sem rating ainda".
  const premier = linhas.filter((l) => l.ratingTipo === 11 && l.ratingDepois);
  const ultimo = premier.at(-1);
  return {
    partidas: linhas.length,
    rounds,
    adr: rounds ? Math.round((soma((l) => l.dano) / rounds) * 10) / 10 : 0,
    kast: rounds ? Math.round((soma((l) => l.kast * l.rounds) / rounds) * 1000) / 1000 : 0,
    hs: kills ? Math.round((soma((l) => l.hs) / kills) * 1000) / 10 : null,
    aberturas: soma((l) => l.aberturas),
    aberturasPerdidas: soma((l) => l.aberturasPerdidas),
    trocas: soma((l) => l.trocas),
    clutches: soma((l) => l.clutches),
    clutchesGanhos: soma((l) => l.clutchesGanhos),
    rating: ultimo
      ? {
          atual: ultimo.ratingDepois!,
          vitorias: ultimo.ratingVitorias ?? 0,
          trilha: premier.map((l) => ({ em: l.match.jogadaEm ?? l.match.createdAt, depois: l.ratingDepois!, mudanca: l.ratingMudanca ?? 0 })),
        }
      : null,
  };
}

/** A última partida que o bot viu esta pessoa terminar (rich presence: mapa, modo, placar). */
async function presencaDe(steamId: string): Promise<PresencaPublica | null> {
  const o = await prisma.botObservation.findFirst({
    where: { steamId, kind: "MATCH_ENDED", OR: [{ map: { not: null } }, { mode: { not: null } }] },
    orderBy: { observedAt: "desc" },
    select: { observedAt: true, map: true, mode: true, score: true },
  });
  if (!o) return null;
  return { quando: o.observedAt, mapa: o.map ? rotularMapa(o.map) : null, modo: o.mode ? rotularModo(o.mode) : null, placar: o.score };
}

async function horasDaBiblioteca(steamId: string): Promise<number | null> {
  try {
    const jogos = await getOwnedGames(steamId);
    const cs2 = jogos.find((g) => g.appid === CS2);
    return cs2 ? Math.round(cs2.playtime_forever / 60) : null;
  } catch {
    return null;
  }
}

type ItemGuardado = Omit<ItemDoInventario, "primeiraVezEm" | "precoCents"> & { primeiraVezEm: string };

/**
 * O inventário de quem não tem conta: lido da Steam na primeira visita e
 * guardado por 6 h; a segunda visita no mesmo período não toca a Steam.
 * Sem preço — a vitrine é o que o perfil da Steam já mostra a qualquer um.
 */
async function inventarioPublicoDe(steamId: string): Promise<PerfilCS["inventario"]> {
  const cache = await prisma.inventarioPublico.findUnique({ where: { steamId } });
  const idade = cache ? Date.now() - cache.lidoEm.getTime() : Infinity;
  const falhou = cache && cache.total === 0 && !cache.publico;
  if (cache && idade < (falhou ? INVENTARIO_FALHA_MS : INVENTARIO_TTL_MS)) return doCache(cache.publico, cache.total, cache.itens);

  try {
    const lido = await getInventory(steamId);
    const itens: ItemGuardado[] = lido.items
      .map((i) => ({
        id: i.asset_id,
        name: i.name ?? i.market_hash_name ?? "Item",
        marketHashName: i.market_hash_name,
        imageUrl: i.image,
        rarity: i.rarity,
        rarityKey: i.rarity_key,
        rarityColor: i.rarity_color,
        exterior: i.exterior,
        weapon: i.weapon,
        category: i.category,
        stattrak: i.stattrak,
        souvenir: i.souvenir,
        tradable: i.tradable,
        primeiraVezEm: new Date().toISOString(),
      }))
      .sort((a, b) => posicaoDaRaridade(a.rarityKey) - posicaoDaRaridade(b.rarityKey) || a.name.localeCompare(b.name))
      .slice(0, VITRINE);
    await prisma.inventarioPublico.upsert({
      where: { steamId },
      create: { steamId, publico: lido.public, total: lido.total, itens: itens as unknown as Prisma.InputJsonValue, lidoEm: new Date() },
      update: { publico: lido.public, total: lido.total, itens: itens as unknown as Prisma.InputJsonValue, lidoEm: new Date() },
    });
    return doCache(lido.public, lido.total, itens);
  } catch (e) {
    console.warn("[perfil] inventário público não leu:", e instanceof Error ? e.message : e);
    // A falha fica registrada como "privado, 0 itens" para não insistir por 1 h; o que já tínhamos continua valendo.
    if (!cache) await prisma.inventarioPublico.create({ data: { steamId, publico: false, total: 0, itens: [], lidoEm: new Date() } }).catch(() => undefined);
    return cache ? doCache(cache.publico, cache.total, cache.itens) : null;
  }
}

function doCache(publico: boolean, total: number, itens: unknown): PerfilCS["inventario"] {
  const lista = Array.isArray(itens) ? (itens as ItemGuardado[]) : [];
  return { publico, total, itens: lista.map((i) => ({ ...i, precoCents: null, primeiraVezEm: new Date(i.primeiraVezEm) })) };
}
