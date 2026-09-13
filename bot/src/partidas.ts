import type SteamUser from "steam-user";
import GlobalOffensive, { type MatchInfo } from "globaloffensive";
import { ShareCode } from "globaloffensive-sharecode";
import { CS2_APPID, config } from "./config.js";

/**
 * A ponte com o Game Coordinator do CS2.
 *
 * O site descobre share codes pela Web API; quem transforma um share code
 * em scoreboard é o GC, e o GC só fala com um cliente Steam "dentro do
 * jogo". Este módulo abre essa sessão (a licença gratuita do CS2 é o que
 * faz a Steam aceitar o gamesPlayed), busca a fila do site e devolve o que
 * o GC contar sobre cada partida. Uma por vez: a resposta não diz a qual
 * pedido pertence, então casamos pelo matchid decodificado do código.
 */

type Pendente = { id: string; shareCode: string };

type Resultado = {
  shareCode: string;
  status: "DONE" | "EXPIRED" | "FAILED";
  error?: string;
  partida?: {
    matchId: string;
    matchtime: number;
    duracaoS: number;
    rounds: number;
    gameType: number | null;
    demoUrl: string | null;
    contas: number[];
    kills: number[];
    assists: number[];
    deaths: number[];
    mvps: number[];
    scores: number[];
    hs: number[];
    placar: [number, number];
  };
};

const TIMEOUT_MS = 20_000;

export function ligarPartidas(client: SteamUser) {
  const csgo = new GlobalOffensive(client);
  let esperando: { matchId: string; resolve: (m: MatchInfo | null) => void } | null = null;

  client.on("loggedOn", () => {
    client.requestFreeLicense([CS2_APPID], (err) => {
      if (err) console.warn("Licença do CS2:", err.message);
      client.gamesPlayed([CS2_APPID]);
    });
  });

  csgo.on("connectedToGC", () => console.log("GC do CS2 conectado."));
  csgo.on("disconnectedFromGC", (motivo) => console.warn("GC do CS2 desconectou:", motivo));

  csgo.on("matchList", (matches) => {
    if (!esperando) return;
    const achada = matches.find((m) => String(m.matchid) === esperando?.matchId) ?? null;
    if (achada || matches.length === 0) {
      const { resolve } = esperando;
      esperando = null;
      resolve(achada);
    }
  });

  function pedir(shareCode: string): Promise<MatchInfo | null | "timeout"> {
    const { matchId } = new ShareCode(shareCode).decode();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        esperando = null;
        resolve("timeout");
      }, TIMEOUT_MS);
      esperando = {
        matchId,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      };
      csgo.requestGame(shareCode);
    });
  }

  let rodando = false;

  async function processarFila() {
    if (rodando || !csgo.haveGCSession) return;
    rodando = true;
    try {
      const res = await fetch(config.partidasUrl, {
        headers: { authorization: `Bearer ${config.webhookSecret}` },
      });
      if (!res.ok) {
        console.warn(`Fila de partidas: ${res.status}`);
        return;
      }
      const { partidas } = (await res.json()) as { partidas: Pendente[] };
      for (const p of partidas) {
        const resultado = await consultar(p.shareCode);
        console.log(`Partida ${p.shareCode}: ${resultado.status}${resultado.error ? ` (${resultado.error})` : ""}`);
        await fetch(config.partidasUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", authorization: `Bearer ${config.webhookSecret}` },
          body: JSON.stringify(resultado),
        }).catch((err) => console.error("Fila de partidas: não gravou:", err));
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch (err) {
      console.error("Fila de partidas falhou:", err);
    } finally {
      rodando = false;
    }
  }

  async function consultar(shareCode: string): Promise<Resultado> {
    let info: MatchInfo | null | "timeout";
    try {
      info = await pedir(shareCode);
    } catch (err) {
      return { shareCode, status: "FAILED", error: String(err instanceof Error ? err.message : err).slice(0, 300) };
    }
    if (info === "timeout") return { shareCode, status: "FAILED", error: "o GC não respondeu" };
    if (!info) return { shareCode, status: "EXPIRED" };

    const fim = info.roundstatsall?.at(-1) ?? info.roundstats_legacy;
    const contas = fim?.reservation?.account_ids ?? [];
    if (!fim || contas.length === 0) return { shareCode, status: "FAILED", error: "resposta do GC sem scoreboard" };

    return {
      shareCode,
      status: "DONE",
      partida: {
        matchId: String(info.matchid),
        matchtime: info.matchtime ?? 0,
        duracaoS: fim.match_duration ?? 0,
        rounds: (fim.team_scores?.[0] ?? 0) + (fim.team_scores?.[1] ?? 0),
        gameType: fim.reservation?.game_type ?? null,
        demoUrl: fim.map ?? null,
        contas,
        kills: fim.kills ?? [],
        assists: fim.assists ?? [],
        deaths: fim.deaths ?? [],
        mvps: fim.mvps ?? [],
        scores: fim.scores ?? [],
        hs: fim.enemy_headshots ?? [],
        placar: [fim.team_scores?.[0] ?? 0, fim.team_scores?.[1] ?? 0],
      },
    };
  }

  return setInterval(() => void processarFila(), config.outboxPollMs);
}
