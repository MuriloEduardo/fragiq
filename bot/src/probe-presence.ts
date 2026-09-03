import SteamUser from "steam-user";
import { CS2_APPID, config } from "./config.js";

/**
 * Experimento: o CS2 publica o mapa em algum canal que o bot consiga ler?
 *
 * Se publicar, dá para rastrear mapa sem parsear demo — o que contornaria a
 * ausência de Mirage, Ancient, Anubis e Overpass nos contadores da Steam.
 *
 * Consulta as duas fontes possíveis, porque elas são alimentadas de formas
 * diferentes: o estado de persona chega de graça para amigos, e o rich
 * presence é um pedido explícito ao servidor.
 *
 *   npm run probe -- <SteamID64>
 *
 * Rode com o alvo dentro de uma partida de matchmaking. Treino com bots roda
 * em servidor local e pode não publicar nada.
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
  console.error("Steam Guard exigido — rode o bot uma vez para gerar o token.");
  process.exit(1);
});

client.on("error", (err) => {
  console.error("Falhou:", err.message);
  process.exit(1);
});

const achados: string[] = [];

client.on("loggedOn", () => {
  client.setPersona(SteamUser.EPersonaState.Online);
  console.log("Conectado. Consultando", alvo, "\n");
  setTimeout(consultarPersona, 1500);
});

/** Fonte 1: estado de persona, entregue automaticamente para amigos. */
function consultarPersona() {
  client.getPersonas([alvo], (err, personas) => {
    console.log("=== estado de persona ===");

    if (err) console.log("  erro:", err.message);
    const p = personas?.[alvo];

    if (!p) {
      console.log("  (nada — confirme que o bot é amigo do alvo)");
    } else {
      const emCs2 = String(p.gameid ?? "0") === String(CS2_APPID);
      console.log("  nome            :", p.player_name ?? "—");
      console.log("  gameid          :", p.gameid ?? "—", emCs2 ? "(CS2 ✓)" : "");
      console.log("  game_name       :", p.game_name ?? "—");
      console.log("  game_extra_info :", p.game_extra_info ?? "—");

      const rp = p.rich_presence ?? [];
      console.log("  rich_presence   :", rp.length ? `${rp.length} campo(s)` : "(vazio)");
      for (const kv of rp) {
        console.log(`      ${kv.key} = ${kv.value}`);
        achados.push(`${kv.key}=${kv.value}`);
      }

      console.log("  texto exibido   :", p.rich_presence_string ?? "—");
      if (p.rich_presence_string) achados.push(p.rich_presence_string);
      if (p.game_extra_info) achados.push(p.game_extra_info);
    }

    console.log();
    consultarRichPresence();
  });
}

/** Fonte 2: pedido explícito de rich presence ao servidor. */
function consultarRichPresence() {
  console.log("=== requestRichPresence ===");

  client.requestRichPresence(CS2_APPID, [alvo], "portuguese", (err, res) => {
    if (err) {
      console.log("  falhou:", err.message);
      return concluir();
    }

    const dados = res.users?.[alvo];
    const campos = dados?.richPresence ? Object.entries(dados.richPresence) : [];

    if (campos.length === 0) {
      console.log("  (vazio)");
    } else {
      for (const [k, v] of campos) {
        console.log(`  ${k.padEnd(22)} ${v}`);
        achados.push(`${k}=${v}`);
      }
      if (dados?.localizedString) {
        console.log("  texto exibido:", dados.localizedString);
        achados.push(dados.localizedString);
      }
    }

    concluir();
  });
}

function concluir() {
  const texto = achados.join(" ").toLowerCase();
  const temMapa = /\b(de|cs|ar)_[a-z0-9]+/.test(texto) || /\bmap\b/.test(texto);

  console.log("\n=== veredito ===");
  if (achados.length === 0) {
    console.log("  Nada publicado neste estado.");
    console.log("  Repita dentro de uma partida de matchmaking — treino com");
    console.log("  bots roda em servidor local e tende a não publicar nada.");
  } else if (temMapa) {
    console.log("  MAPA PRESENTE — dá para rastrear mapa sem parsear demo.");
  } else {
    console.log("  Há presença publicada, mas sem o mapa.");
    console.log("  Campos vistos:", achados.join(" | ").slice(0, 300));
  }

  client.logOff();
  process.exit(0);
}
