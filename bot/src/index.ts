import SteamUser from "steam-user";
import { CS2_APPID, config } from "./config.js";

/**
 * Bot de presença.
 *
 * A coleta agendada é cega: roda uma vez por dia e captura o que houver.
 * Este processo troca isso por coleta reativa — ele fica online como amigo
 * dos usuários, percebe quando alguém termina de jogar CS2 e avisa a
 * aplicação para sincronizar naquele momento.
 *
 * Fica fora da Vercel de propósito: um cliente Steam mantém conexão TCP
 * persistente, o que serverless não comporta.
 */

const client = new SteamUser({ autoRelogin: true });

/** steamId -> estava jogando CS2 na última atualização de estado. */
const jogando = new Map<string, boolean>();
/** steamId -> timer de espera antes de avisar. */
const pendentes = new Map<string, NodeJS.Timeout>();

/* ---------------------------------- login --------------------------------- */

if (config.refreshToken) {
  client.logOn({ refreshToken: config.refreshToken });
} else if (config.password) {
  console.warn(
    "Logando com senha. O steam-user vai emitir um refresh token — guarde-o " +
      "em STEAM_BOT_REFRESH_TOKEN e remova a senha do ambiente.",
  );
  client.logOn({ accountName: config.accountName, password: config.password });
} else {
  console.error("Defina STEAM_BOT_REFRESH_TOKEN ou STEAM_BOT_PASSWORD.");
  process.exit(1);
}

client.on("refreshToken", (token: string) => {
  console.log(
    `\n=== GUARDE ISTO ===\nSTEAM_BOT_REFRESH_TOKEN=${token}\n` +
      "Com ele o bot reconecta sem senha e sem Steam Guard.\n",
  );
});

client.on("steamGuard", (domain, callback, lastCodeWrong) => {
  console.error(
    `Steam Guard exigido${domain ? ` (e-mail ${domain})` : " (app móvel)"}` +
      `${lastCodeWrong ? " — o código anterior estava errado" : ""}.`,
  );
  console.error(
    "Rode uma vez em terminal interativo com STEAM_BOT_PASSWORD para gerar o " +
      "refresh token, e depois use só o token.",
  );
  process.exit(1);
});

client.on("loggedOn", () => {
  console.log(`Conectado como ${client.steamID?.getSteamID64()}`);
  client.setPersona(SteamUser.EPersonaState.Online);
});

client.on("error", (err) => {
  console.error("Erro de conexão:", err.message);
  process.exit(1);
});

client.on("disconnected", (_, msg) => console.warn("Desconectado:", msg));

/* -------------------------------- amizades -------------------------------- */

client.on("friendRelationship", (steamID, relationship) => {
  const id = steamID.getSteamID64();

  if (relationship === SteamUser.EFriendRelationship.RequestRecipient) {
    if (!config.autoAccept) return console.log(`Pedido de amizade de ${id} (ignorado)`);
    client.addFriend(steamID);
    console.log(`Amizade aceita: ${id}`);
    return;
  }

  if (relationship === SteamUser.EFriendRelationship.None) {
    jogando.delete(id);
    limparPendente(id);
    console.log(`Removido da lista: ${id}`);
  }
});

/* ----------------------------- estado de jogo ----------------------------- */

client.on("user", (steamID, user) => {
  const id = steamID.getSteamID64();
  // gameid vem como string; "0" ou ausente significa fora de jogo.
  const agora = String(user.gameid ?? "0") === String(CS2_APPID);
  const antes = jogando.get(id) ?? false;

  if (agora === antes) return;
  jogando.set(id, agora);

  if (agora) {
    console.log(`${id} entrou no CS2`);
    // Entrar cancela um aviso pendente: voltou a jogar, então a partida
    // anterior ainda não é o estado final.
    limparPendente(id);
    return;
  }

  console.log(`${id} saiu do CS2 — sincronizando em ${config.graceMs / 1000}s`);
  limparPendente(id);
  pendentes.set(
    id,
    setTimeout(() => {
      pendentes.delete(id);
      void avisar(id);
    }, config.graceMs),
  );
});

function limparPendente(id: string) {
  const t = pendentes.get(id);
  if (t) {
    clearTimeout(t);
    pendentes.delete(id);
  }
}

/* --------------------------------- webhook -------------------------------- */

async function avisar(steamId: string) {
  try {
    const res = await fetch(config.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${config.webhookSecret}`,
      },
      body: JSON.stringify({ steamId, event: "match_ended" }),
    });

    const corpo = await res.text();
    console.log(`Webhook ${steamId}: ${res.status} ${corpo.slice(0, 120)}`);
  } catch (err) {
    console.error(`Webhook falhou para ${steamId}:`, err);
  }
}

/* ------------------------------- encerramento ------------------------------ */

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    console.log("Encerrando…");
    for (const t of pendentes.values()) clearTimeout(t);
    client.logOff();
    process.exit(0);
  });
}
