import SteamUser from "steam-user";
import GlobalOffensive from "globaloffensive";
import { CS2_APPID, config } from "./config.js";

/**
 * Sonda do Game Coordinator: confirma que a conta do bot abre sessão com o
 * GC do CS2 e mostra o que ele devolve para um SteamID (histórico recente)
 * e, se informado, para um share code. Roda com o bot parado — a Steam só
 * aceita uma sessão por conta.
 *
 *   npx tsx src/probe-gc.ts <steamid64> [CSGO-xxxxx-...]
 */
const [, , alvo, shareCode] = process.argv;
if (!alvo) {
  console.error("uso: probe-gc.ts <steamid64> [share code]");
  process.exit(1);
}

const client = new SteamUser({ autoRelogin: false });
const csgo = new GlobalOffensive(client);

client.on("accountLimitations", (limited, communityBanned, locked, canInvite) => {
  console.log("Limitações:", { limited, communityBanned, locked, canInvite });
});

client.on("loggedOn", () => {
  console.log(`Conectado como ${client.steamID?.getSteamID64()}; pedindo licença do CS2…`);
  client.requestFreeLicense([CS2_APPID], (err, pacotes, apps) => {
    console.log("Licença:", err?.message ?? "ok", { pacotes: pacotes?.length, apps });
    client.gamesPlayed([CS2_APPID]);
    console.log("gamesPlayed enviado; esperando GC…");
  });
});

client.on("error", (err) => {
  console.error("Erro:", err.message);
  process.exit(1);
});

csgo.on("connectedToGC", () => {
  console.log("GC conectado.");
  if (alvo !== "-") {
    console.log("Pedindo histórico de", alvo);
    csgo.requestRecentGames(alvo);
  }
  if (shareCode) {
    console.log("Pedindo partida", shareCode);
    csgo.requestGame(shareCode);
  }
});

csgo.on("disconnectedFromGC", (motivo) => console.log("GC desconectou:", motivo));

let respostas = 0;
csgo.on("matchList", (matches, raw) => {
  respostas++;
  console.log(`matchList #${respostas}: ${matches.length} partida(s)`);
  for (const m of matches) {
    const ultimo = m.roundstatsall?.at(-1);
    console.log(
      JSON.stringify(
        {
          matchid: String(m.matchid),
          matchtime: m.matchtime,
          rounds: m.roundstatsall?.length,
          demo: ultimo?.map,
          game_type: ultimo?.reservation?.game_type,
          contas: ultimo?.reservation?.account_ids,
          kills: ultimo?.kills,
          deaths: ultimo?.deaths,
          assists: ultimo?.assists,
          hs: ultimo?.enemy_headshots,
          mvps: ultimo?.mvps,
          scores: ultimo?.scores,
          placar: ultimo?.team_scores,
          duracao: ultimo?.match_duration,
        },
        null,
        0,
      ),
    );
  }
  if (matches.length === 0) console.log("bruto:", JSON.stringify(raw).slice(0, 400));
});

setTimeout(() => {
  console.log(`Fim: ${respostas} resposta(s).`);
  client.logOff();
  process.exit(0);
}, 45_000);

client.logOn(config.refreshToken ? { refreshToken: config.refreshToken } : { accountName: config.accountName, password: config.password ?? undefined });
