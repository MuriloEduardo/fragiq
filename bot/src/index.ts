import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import SteamUser from "steam-user";
import { CS2_APPID, config } from "./config.js";
import { gravarRefreshToken, secretId } from "./segredos.js";

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

/**
 * steamId -> última partida observada.
 *
 * A API de estatísticas da Steam não diz em que mapa nem em que modo você
 * jogou, e nem sequer conhece Mirage, Ancient, Anubis ou Overpass. O rich
 * presence do CS2 publica os dois para amigos — então guardamos aqui
 * enquanto a partida acontece e enviamos junto quando ela termina.
 */
type Contexto = { map?: string; mode?: string; score?: string };
const contexto = new Map<string, Contexto>();

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
  if (secretId) {
    gravarRefreshToken(token).then(
      () => console.log(`Refresh token renovado gravado em ${secretId}.`),
      (err) => console.error("Falha ao gravar o refresh token no Secrets Manager:", err),
    );
    return;
  }

  // Grava sozinho e apaga a senha: pedir para copiar à mão é onde se erra,
  // e senha esquecida no arquivo é senha vazada mais cedo ou mais tarde.
  try {
    const caminho = new URL("../.env", import.meta.url).pathname;
    const atual = readFileSync(caminho, "utf8");
    const novo = atual
      .replace(/^STEAM_BOT_REFRESH_TOKEN=.*$/m, `STEAM_BOT_REFRESH_TOKEN="${token}"`)
      .replace(/^STEAM_BOT_PASSWORD=.*$/m, 'STEAM_BOT_PASSWORD=""');
    writeFileSync(caminho, novo);
    console.log("\nRefresh token gravado em bot/.env e a senha foi apagada de lá.");
    console.log("Guarde a senha no seu gerenciador — daqui em diante o bot não precisa dela.\n");
  } catch {
    console.log(`\n=== GUARDE ISTO ===\nSTEAM_BOT_REFRESH_TOKEN=${token}\n`);
  }
});

client.on("steamGuard", async (domain, callback, lastCodeWrong) => {
  const origem = domain ? `e-mail ${domain}` : "app móvel";

  // Sem TTY não há como pedir o código: em produção o bot roda com refresh
  // token justamente para nunca chegar aqui.
  if (!process.stdin.isTTY) {
    console.error(
      `Steam Guard exigido (${origem}) mas o terminal não é interativo.\n` +
        "Rode uma vez localmente com STEAM_BOT_PASSWORD para gerar o refresh " +
        "token, e em produção use só STEAM_BOT_REFRESH_TOKEN.",
    );
    process.exit(1);
  }

  if (lastCodeWrong) console.error("O código anterior estava errado.");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const codigo = await rl.question(`Código do Steam Guard (${origem}): `);
  rl.close();
  callback(codigo.trim());
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
    contexto.delete(id);
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

  // Guardamos o contexto a cada atualização, não só na transição: o rich
  // presence muda durante a partida (o placar sobe), e quando a pessoa sai
  // ele já veio a zero. O último estado útil é o que vale.
  if (agora) {
    const rp = new Map((user.rich_presence ?? []).map((kv) => [kv.key, kv.value]));
    const mapa = rp.get("game:map");
    if (mapa) {
      contexto.set(id, {
        map: mapa,
        mode: rp.get("game:mode"),
        score: rp.get("game:score"),
      });
    }
  }

  if (agora === antes) return;
  jogando.set(id, agora);

  if (agora) {
    console.log(`${id} entrou no CS2`);
    // Entrar cancela um aviso pendente: voltou a jogar, então a partida
    // anterior ainda não é o estado final.
    limparPendente(id);
    return;
  }

  const ctx = contexto.get(id);
  console.log(
    `${id} saiu do CS2 — sincronizando em ${config.graceMs / 1000}s` +
      (ctx?.map ? ` (${ctx.mode ?? "?"} em ${ctx.map}${ctx.score ? ` ${ctx.score}` : ""})` : ""),
  );
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
  const ctx = contexto.get(steamId);
  contexto.delete(steamId);

  try {
    const res = await fetch(config.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${config.webhookSecret}`,
      },
      body: JSON.stringify({
        steamId,
        event: "match_ended",
        map: ctx?.map,
        mode: ctx?.mode,
        score: ctx?.score,
      }),
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
