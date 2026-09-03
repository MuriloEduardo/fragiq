/**
 * O steam-user não publica tipos. Declaramos só o que usamos, em vez de
 * cair num `any` global — assim um erro de nome de evento ou de método
 * aparece na compilação.
 */
declare module "steam-user" {
  export interface SteamID {
    getSteamID64(): string;
  }

  export interface PersonaUser {
    gameid?: string | number;
    game_name?: string;
    game_extra_info?: string;
    persona_state?: number;
    player_name?: string;
    /** Chave/valor publicado pelo jogo, quando ele publica. */
    rich_presence?: { key: string; value: string }[];
    rich_presence_string?: string;
  }

  export interface LogOnDetails {
    accountName?: string;
    password?: string;
    refreshToken?: string;
  }

  export interface RichPresence {
    [key: string]: string;
  }

  export interface RichPresenceResponse {
    users: Record<string, { richPresence?: RichPresence; localizedString?: string } | undefined>;
  }

  export default class SteamUser {
    constructor(options?: { autoRelogin?: boolean });

    readonly steamID: SteamID | null;

    static EPersonaState: { Offline: 0; Online: 1; Busy: 2; Away: 3 };
    static EFriendRelationship: {
      None: 0;
      Blocked: 1;
      RequestRecipient: 2;
      Friend: 3;
      RequestInitiator: 4;
    };

    logOn(details: LogOnDetails): void;
    logOff(): void;
    setPersona(state: number): void;
    addFriend(steamID: SteamID | string): void;
    getPersonas(
      steamIDs: (SteamID | string)[],
      callback: (err: Error | null, personas: Record<string, PersonaUser>) => void,
    ): void;
    requestRichPresence(
      appid: number,
      steamIDs: (SteamID | string)[],
      language: string,
      callback: (err: Error | null, res: RichPresenceResponse) => void,
    ): void;

    on(event: "loggedOn", cb: () => void): this;
    on(event: "refreshToken", cb: (token: string) => void): this;
    on(event: "error", cb: (err: Error) => void): this;
    on(event: "disconnected", cb: (eresult: number, msg: string) => void): this;
    on(
      event: "steamGuard",
      cb: (
        domain: string | null,
        callback: (code: string) => void,
        lastCodeWrong: boolean,
      ) => void | Promise<void>,
    ): this;
    on(event: "friendRelationship", cb: (steamID: SteamID, relationship: number) => void): this;
    on(event: "user", cb: (steamID: SteamID, user: PersonaUser) => void): this;
  }
}
