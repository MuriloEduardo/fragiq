/**
 * O globaloffensive também não publica tipos. Só o que usamos: conexão com o
 * Game Coordinator do CS2 e o pedido de uma partida por share code.
 */
declare module "globaloffensive" {
  import type SteamUser from "steam-user";

  export interface RoundStats {
    reservation?: { account_ids?: number[]; game_type?: number };
    map?: string | null;
    round?: number;
    kills?: number[];
    assists?: number[];
    deaths?: number[];
    scores?: number[];
    mvps?: number[];
    enemy_kills?: number[];
    enemy_headshots?: number[];
    team_scores?: number[];
    match_duration?: number;
    match_result?: number;
    reservationid?: unknown;
  }

  export interface MatchInfo {
    matchid?: unknown;
    matchtime?: number;
    roundstatsall?: RoundStats[];
    roundstats_legacy?: RoundStats;
    watchablematchinfo?: { tv_port?: number; server_ip?: number };
  }

  export default class GlobalOffensive {
    constructor(client: SteamUser);
    readonly haveGCSession: boolean;
    requestGame(shareCodeOrDetails: string | { matchId: string; outcomeId: string; token: number }): void;
    requestRecentGames(steamid: string): boolean | undefined;
    on(event: "connectedToGC", cb: () => void): this;
    on(event: "disconnectedFromGC", cb: (reason: number) => void): this;
    on(event: "matchList", cb: (matches: MatchInfo[], raw: unknown) => void): this;
  }
}

declare module "globaloffensive-sharecode" {
  export class ShareCode {
    constructor(code: string);
    decode(): { matchId: string; outcomeId: string; token: string };
  }
}
