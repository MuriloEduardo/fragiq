import SteamUser from "steam-user";
import { CS2_APPID, config } from "./config.js";

/**
 * Experimento: o rich presence do CS2 entrega o mapa?
 *
 * Se entregar, dá para saber em que mapa a pessoa está jogando sem parsear
 * demo — o que contornaria o fato de a API de estatísticas não ter Mirage,
 * Ancient, Anubis nem Overpass.
 *
 *   npm run probe -- <SteamID64>
 *
 * Rode com o alvo DENTRO de uma partida; fora dela não há o que reportar.
 */

const alvo = process.argv[2];
if (!alvo || !/^7656119\d{10}$/.test(alvo)) {
  console.error("Uso: npm run probe -- <SteamID64>");
  process.exit(1);
}

const client = new SteamUser({ autoRelogin: false });

if (config.refreshToken) client.logOn({ refreshToken: config.refreshToken });
else if (config.password)
  client.logOn({ accountName: config.accountName, password: config.password });
else {
  console.error("Defina STEAM_BOT_REFRESH_TOKEN ou STEAM_BOT_PASSWORD.");
  process.exit(1);
}

client.on("steamGuard", () => {
  console.error("Steam Guard exigido — gere o refresh token primeiro.");
  process.exit(1);
});

client.on("error", (err) => {
  console.error("Falhou:", err.message);
  process.exit(1);
});

client.on("loggedOn", () => {
  client.setPersona(SteamUser.EPersonaState.Online);
  console.log("Conectado. Consultando rich presence de", alvo, "\n");

  client.requestRichPresence(CS2_APPID, [alvo], "portuguese", (err, res) => {
    if (err) {
      console.error("requestRichPresence falhou:", err.message);
      process.exit(1);
    }

    const dados = res.users?.[alvo];
    if (!dados?.richPresence || Object.keys(dados.richPresence).length === 0) {
      console.log("Sem rich presence.");
      console.log("Causas possíveis: fora de partida, perfil restrito, ou");
      console.log("o bot não é amigo do alvo.");
      client.logOff();
      process.exit(0);
    }

    console.log("=== campos publicados ===");
    for (const [k, v] of Object.entries(dados.richPresence)) {
      console.log(`  ${k.padEnd(24)} ${v}`);
    }
    if (dados.localizedString) console.log("\n  texto exibido:", dados.localizedString);

    // A pergunta que o experimento existe para responder.
    const chaves = Object.keys(dados.richPresence).join(" ").toLowerCase();
    const valores = Object.values(dados.richPresence).join(" ").toLowerCase();
    const temMapa = /map|de_|cs_|ar_/.test(chaves + " " + valores);
    console.log(
      `\n  >> mapa presente? ${temMapa ? "SIM — dá para rastrear mapa sem demo" : "NAO"}`,
    );

    client.logOff();
    process.exit(0);
  });
});
