import { z } from "zod";
import { env } from "../env";

const BASE = "https://api.steampowered.com";

async function call<T>(path: string, params: Record<string, string>, shape: z.ZodType<T>) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("key", env().STEAM_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { cache: "no-store" });

  // 403 = chave inválida; 400/500 costuma ser "esse appid não tem stats" ou
  // perfil privado. Quem chama decide se isso é fatal.
  if (!res.ok) throw new SteamApiError(path, res.status);

  return shape.parse(await res.json());
}

export class SteamApiError extends Error {
  constructor(
    readonly endpoint: string,
    readonly status: number,
  ) {
    super(`Steam API ${endpoint} respondeu ${status}`);
    this.name = "SteamApiError";
  }
}

/* ---------------------------------- perfil --------------------------------- */

const playerSummary = z.object({
  steamid: z.string(),
  personaname: z.string(),
  avatarfull: z.string().optional(),
  profileurl: z.string().optional(),
  loccountrycode: z.string().optional(),
  // 1 = público. Menos que isso e a biblioteca/stats vêm vazias.
  communityvisibilitystate: z.number().optional(),
});

export type SteamPlayer = z.infer<typeof playerSummary>;

export async function getPlayerSummary(steamId: string): Promise<SteamPlayer | null> {
  const data = await call(
    "/ISteamUser/GetPlayerSummaries/v2/",
    { steamids: steamId },
    z.object({ response: z.object({ players: z.array(playerSummary) }) }),
  );
  return data.response.players[0] ?? null;
}

/* -------------------------------- biblioteca ------------------------------- */

const ownedGame = z.object({
  appid: z.number(),
  name: z.string().optional(),
  playtime_forever: z.number().default(0),
  playtime_2weeks: z.number().default(0),
  img_icon_url: z.string().optional(),
  rtime_last_played: z.number().optional(),
});

export type OwnedGame = z.infer<typeof ownedGame>;

export async function getOwnedGames(steamId: string): Promise<OwnedGame[]> {
  const data = await call(
    "/IPlayerService/GetOwnedGames/v1/",
    {
      steamid: steamId,
      include_appinfo: "1",
      include_played_free_games: "1", // sem isto CS2 e Dota somem da lista.
    },
    z.object({ response: z.object({ games: z.array(ownedGame).optional() }) }),
  );
  return data.response.games ?? [];
}

/* --------------------------- estatísticas por jogo -------------------------- */

export type GameStats = {
  metrics: Record<string, number>;
  achievementsUnlocked: number | null;
  achievementsTotal: number | null;
};

/**
 * Retorna null (em vez de lançar) quando o jogo simplesmente não expõe stats
 * ou o perfil está privado — nesse caso a Steam responde 400, e um sync de
 * centenas de jogos não pode morrer por causa disso.
 */
export async function getUserStatsForGame(
  steamId: string,
  appId: number,
): Promise<GameStats | null> {
  let data;
  try {
    data = await call(
      "/ISteamUserStats/GetUserStatsForGame/v2/",
      { steamid: steamId, appid: String(appId) },
      z.object({
        playerstats: z
          .object({
            stats: z.array(z.object({ name: z.string(), value: z.number() })).optional(),
            achievements: z
              .array(z.object({ name: z.string(), achieved: z.number() }))
              .optional(),
          })
          .optional(),
      }),
    );
  } catch (err) {
    if (err instanceof SteamApiError && err.status !== 403) return null;
    throw err;
  }

  const stats = data.playerstats?.stats ?? [];
  const achievements = data.playerstats?.achievements ?? [];
  if (stats.length === 0 && achievements.length === 0) return null;

  return {
    metrics: Object.fromEntries(stats.map((s) => [s.name, s.value])),
    achievementsUnlocked: achievements.length
      ? achievements.filter((a) => a.achieved === 1).length
      : null,
    achievementsTotal: achievements.length || null,
  };
}

/** Nomes legíveis das stats de um jogo. Igual para todo mundo — cacheamos. */
export async function getGameStatSchema(
  appId: number,
): Promise<Record<string, string> | null> {
  try {
    const data = await call(
      "/ISteamUserStats/GetSchemaForGame/v2/",
      { appid: String(appId) },
      z.object({
        game: z
          .object({
            availableGameStats: z
              .object({
                stats: z
                  .array(z.object({ name: z.string(), displayName: z.string().optional() }))
                  .optional(),
              })
              .optional(),
          })
          .optional(),
      }),
    );

    const stats = data.game?.availableGameStats?.stats ?? [];
    if (stats.length === 0) return null;

    return Object.fromEntries(
      stats.map((s) => [s.name, s.displayName?.trim() || s.name]),
    );
  } catch {
    return null;
  }
}

export function gameIconUrl(appId: number, iconHash: string | null) {
  if (!iconHash) return null;
  return `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/${iconHash}.jpg`;
}

export function gameHeaderUrl(appId: number) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

/* ------------------------------- vanity URL -------------------------------- */

/**
 * steamcommunity.com/id/<apelido> → SteamID64. Null quando o apelido não
 * existe. É a única forma de aceitar o link do perfil como as pessoas o
 * copiam da barra de endereço.
 */
export async function resolveVanityUrl(vanity: string): Promise<string | null> {
  const data = await call(
    "/ISteamUser/ResolveVanityURL/v1/",
    { vanityurl: vanity },
    z.object({
      response: z.object({ success: z.number(), steamid: z.string().optional() }),
    }),
  );
  return data.response.success === 1 ? (data.response.steamid ?? null) : null;
}
