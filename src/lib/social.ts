import { prisma } from "./prisma";
import { getFriendIds } from "./steam/api";

/**
 * A parte social: amigos da Steam que já estão aqui, e quem segue quem.
 *
 * "Seguir" é pedir para ver a curva; só vale depois de aceito. Tudo aqui
 * é lido por quem está logado e sobre si mesmo — a lista de amigos da
 * Steam de alguém nunca é mostrada a terceiros.
 */

const CACHE_MS = 10 * 60_000;
const amigosCache = new Map<string, { em: number; ids: string[] }>();

export type Pessoa = {
  id: string;
  steamId: string;
  personaName: string;
  avatarUrl: string | null;
};

export type EstadoSeguir = "nada" | "pedido" | "seguindo";

async function idsDeAmigos(steamId: string): Promise<string[]> {
  const hit = amigosCache.get(steamId);
  if (hit && Date.now() - hit.em < CACHE_MS) return hit.ids;
  const ids = await getFriendIds(steamId);
  amigosCache.set(steamId, { em: Date.now(), ids });
  return ids;
}

/** Amigos da Steam que têm conta no FragIQ, com o estado de seguir de cada um. */
export async function amigosNoFragiq(
  meuId: string,
  meuSteamId: string,
): Promise<{ amigos: (Pessoa & { estado: EstadoSeguir; meSegue: boolean })[]; listaPrivada: boolean; totalAmigos: number }> {
  const ids = await idsDeAmigos(meuSteamId);
  if (ids.length === 0) return { amigos: [], listaPrivada: true, totalAmigos: 0 };

  const [pessoas, saidas, entradas] = await Promise.all([
    prisma.user.findMany({
      where: { steamId: { in: ids }, perfilPublico: true },
      select: { id: true, steamId: true, personaName: true, avatarUrl: true },
      orderBy: { personaName: "asc" },
    }),
    prisma.follow.findMany({ where: { seguidorId: meuId }, select: { seguidoId: true, status: true } }),
    prisma.follow.findMany({ where: { seguidoId: meuId, status: "ACCEPTED" }, select: { seguidorId: true } }),
  ]);
  const estadoPor = new Map(saidas.map((f) => [f.seguidoId, f.status === "ACCEPTED" ? "seguindo" : "pedido"] as const));
  const meSeguem = new Set(entradas.map((f) => f.seguidorId));

  return {
    amigos: pessoas.map((p) => ({ ...p, estado: estadoPor.get(p.id) ?? "nada", meSegue: meSeguem.has(p.id) })),
    listaPrivada: false,
    totalAmigos: ids.length,
  };
}

export async function estadoDeSeguir(meuId: string, alvoId: string): Promise<EstadoSeguir> {
  const f = await prisma.follow.findUnique({
    where: { seguidorId_seguidoId: { seguidorId: meuId, seguidoId: alvoId } },
    select: { status: true },
  });
  if (!f) return "nada";
  return f.status === "ACCEPTED" ? "seguindo" : "pedido";
}

const pessoa = { id: true, steamId: true, personaName: true, avatarUrl: true } as const;

export async function pedidosRecebidos(meuId: string): Promise<Pessoa[]> {
  const rows = await prisma.follow.findMany({
    where: { seguidoId: meuId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { seguidor: { select: pessoa } },
  });
  return rows.map((r) => r.seguidor);
}

export async function quemSigo(meuId: string): Promise<Pessoa[]> {
  const rows = await prisma.follow.findMany({
    where: { seguidorId: meuId, status: "ACCEPTED" },
    orderBy: { decididoEm: "desc" },
    select: { seguido: { select: pessoa } },
  });
  return rows.map((r) => r.seguido);
}

export async function quemMeSegue(meuId: string): Promise<Pessoa[]> {
  const rows = await prisma.follow.findMany({
    where: { seguidoId: meuId, status: "ACCEPTED" },
    orderBy: { decididoEm: "desc" },
    select: { seguidor: { select: pessoa } },
  });
  return rows.map((r) => r.seguidor);
}
