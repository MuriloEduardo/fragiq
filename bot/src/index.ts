import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import SteamUser from "steam-user";
import { CS2_APPID, config } from "./config.js";
import { gravarRefreshToken, secretId } from "./segredos.js";
import { ligarPartidas } from "./partidas.js";

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

// Conta limitada (nunca gastou US$5) não manda chat nem posta: vale saber
// no log antes de caçar o erro em outro lugar.
client.on("accountLimitations", (limited, communityBanned, locked) => {
  console.log(`Limitações da conta: limitada=${limited} banida=${communityBanned} travada=${locked}`);
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
    // Entrar cancela um aviso pendente (inclusive uma retentativa): voltou
    // a jogar, então a partida anterior ainda não é o estado final. O
    // contexto fica; se a próxima partida for em outro mapa ele é
    // substituído, e o delta das duas entra com o mapa da última.
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

/**
 * Esperas entre tentativas quando a aplicação responde 202: a Steam ainda
 * não publicou a partida. Medido em 12/09/2026: mais de 5 minutos depois de
 * sair do jogo as stats continuavam as velhas. O prazo varia, então um
 * grace fixo ou erra ou desperdiça — o jeito é perguntar até mudar.
 */
const RETRY_MS = [2, 4, 8, 16].map((min) => min * 60_000);

async function avisar(steamId: string, tentativa = 0) {
  // O contexto só é descartado quando a partida entrou de fato (ou quando
  // desistimos). Se for apagado na primeira tentativa, o mapa se perde e o
  // delta real, capturado mais tarde, entra sem atribuição.
  const ctx = contexto.get(steamId);

  let status: number | null = null;
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
    status = res.status;
    const corpo = await res.text();
    console.log(`Webhook ${steamId}: ${res.status} ${corpo.slice(0, 120)}`);
  } catch (err) {
    console.error(`Webhook falhou para ${steamId}:`, err);
  }

  // 202 = stats ainda velhas; null = rede falhou. Os dois merecem nova
  // tentativa. Qualquer outra resposta encerra: ou gravou, ou é erro nosso.
  if (status !== 202 && status !== null) {
    contexto.delete(steamId);
    return;
  }

  const espera = RETRY_MS[tentativa];
  if (espera === undefined) {
    console.warn(`Desistindo de ${steamId}: partida não apareceu em ${RETRY_MS.length} tentativas.`);
    contexto.delete(steamId);
    return;
  }

  console.log(`${steamId}: nova tentativa em ${espera / 60_000} min`);
  pendentes.set(
    steamId,
    setTimeout(() => {
      pendentes.delete(steamId);
      void avisar(steamId, tentativa + 1);
    }, espera),
  );
}

/* ------------------------------ chat da Steam ------------------------------ */

/**
 * A fila de mensagens do site, entregue no chat.
 *
 * O site enfileira a análise de cada sessão; este loop busca, manda para
 * quem é amigo e devolve o resultado. Quem não é amigo não recebe — o
 * chat da Steam só existe entre amigos, e é assim que tem que ser: a
 * pessoa que não adicionou o bot não pediu nada.
 */
type Mensagem = { id: string; steamId: string; texto: string };

let entregando = false;

async function entregarFila() {
  if (entregando || !client.steamID) return;
  entregando = true;
  try {
    const res = await fetch(config.outboxUrl, {
      headers: { authorization: `Bearer ${config.webhookSecret}` },
    });
    if (!res.ok) {
      console.warn(`Fila: ${res.status}`);
      return;
    }
    const { mensagens } = (await res.json()) as { mensagens: Mensagem[] };
    for (const m of mensagens) await entregar(m);
  } catch (err) {
    console.error("Fila falhou:", err);
  } finally {
    entregando = false;
  }
}

async function entregar(m: Mensagem) {
  const relacao = client.myFriends[m.steamId];
  const amigo = relacao === SteamUser.EFriendRelationship.Friend;
  let status: "SENT" | "FAILED" = "SENT";
  let error: string | undefined;

  if (!amigo) {
    status = "FAILED";
    error = "não é amigo do bot";
  } else {
    try {
      await client.chat.sendFriendMessage(m.steamId, m.texto);
    } catch (err) {
      status = "FAILED";
      error = String(err instanceof Error ? err.message : err).slice(0, 300);
    }
  }
  console.log(`Chat ${m.steamId}: ${status}${error ? ` (${error})` : ""}`);

  await fetch(config.outboxUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${config.webhookSecret}`,
    },
    body: JSON.stringify({ id: m.id, status, error }),
  }).catch((err) => console.error("Fila: não confirmou entrega:", err));
}

const filaTimer = setInterval(() => void entregarFila(), config.outboxPollMs);
const partidasTimer = ligarPartidas(client);

/* ------------------------------- encerramento ------------------------------ */

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    console.log("Encerrando…");
    for (const t of pendentes.values()) clearTimeout(t);
    clearInterval(filaTimer);
    clearInterval(partidasTimer);
    client.logOff();
    process.exit(0);
  });
}
