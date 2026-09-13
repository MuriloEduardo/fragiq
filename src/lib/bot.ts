import { getPlayerSummary, type SteamPlayer } from "./steam/api";
import { getFriendIds } from "./steam/api";

/**
 * O bot de presença, visto do site.
 *
 * É uma conta comum da Steam que, sendo sua amiga, enxerga o rich presence
 * do CS2 — mapa, modo e placar — e avisa o site no fim de cada partida. A
 * foto e o nome vêm da Steam ao vivo, para a pessoa conferir que é a mesma
 * conta que está adicionando.
 */
export const BOT_STEAM_ID = process.env.BOT_STEAM_ID ?? "76561198647798293";

const CACHE_MS = 10 * 60_000;
let cache: { em: number; perfil: SteamPlayer | null } | null = null;
const amizade = new Map<string, { em: number; amigo: boolean }>();

export async function perfilDoBot(): Promise<SteamPlayer | null> {
  if (cache && Date.now() - cache.em < CACHE_MS) return cache.perfil;
  const perfil = await getPlayerSummary(BOT_STEAM_ID).catch(() => null);
  cache = { em: Date.now(), perfil };
  return perfil;
}

/** A pessoa já é amiga do bot? Null quando a lista de amigos é privada. */
export async function botEhAmigo(steamId: string): Promise<boolean | null> {
  const hit = amizade.get(steamId);
  if (hit && Date.now() - hit.em < CACHE_MS) return hit.amigo;
  const ids: string[] = await getFriendIds(steamId).catch(() => []);
  const amigo = ids.includes(BOT_STEAM_ID);
  amizade.set(steamId, { em: Date.now(), amigo });
  return ids.length === 0 ? null : amigo;
}
