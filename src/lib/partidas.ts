import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { env } from "./env";
import { decodificarShareCode, normalizarShareCode, shareCodeValido } from "./sharecode";
import { getPlayerSummaries } from "./steam/api";
import { CogniflowApiError, invocar } from "./cogniflow-api";
import { registrar, reportarErro } from "./eventos";

/**
 * Partidas detalhadas: o caminho que o csstats usa, com o mínimo de atrito.
 *
 * A Steam não entrega o histórico de partidas de ninguém para terceiros —
 * nem pela Web API nem pelo Game Coordinator (testado: o GC ignora em
 * silêncio o pedido de histórico de outra conta). O que ela dá é uma
 * corrente: com o código de autenticação de histórico (que a pessoa gera
 * numa página da própria Steam) e UM share code conhecido, a Web API diz
 * "o próximo depois desse". Seguindo a corrente a cada coleta, nunca mais
 * pedimos nada a ninguém. O share code vai ao GC pelo bot, que devolve o
 * scoreboard completo da partida — dos dez jogadores — sem baixar demo.
 *
 * Duas colas, uma vez, e as partidas passam a chegar sozinhas.
 */

const FORMATO_AUTH = /^[A-Z0-9]{4}-[A-Z0-9]{5}-[A-Z0-9]{4}$/i;
/** Quantos elos da corrente seguimos por coleta. A Steam limita chamadas; quem ficou semanas fora vai em várias. */
const MAX_POR_RODADA = 8;
/** Depois disso o bot desiste da partida. O GC costuma responder na primeira. */
const MAX_TENTATIVAS = 4;

/* ---------------------------------- cifra --------------------------------- */

/**
 * O código de autenticação só serve para ler a corrente de share codes,
 * mas é um segredo da pessoa: fica cifrado com uma chave derivada do
 * AUTH_SECRET, e nunca sai do servidor (nem no export, nem em log).
 */
function chave() {
  return createHash("sha256").update(`${env().AUTH_SECRET}:partidas`).digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", chave(), iv);
  const corpo = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), corpo]).toString("base64url");
}

export function decifrar(cifrado: string): string {
  const bytes = Buffer.from(cifrado, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", chave(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
}

/* --------------------------------- Web API -------------------------------- */

export class CodigoInvalido extends Error {
  constructor(
    readonly campo: "auth" | "share" | "steam",
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "CodigoInvalido";
  }
}

export function authCodeValido(codigo: string) {
  return FORMATO_AUTH.test(codigo.trim());
}

/**
 * "Qual é o share code depois deste?" — `null` quando o conhecido é o mais
 * recente. 403 é o código de autenticação errado (ou revogado: gerar outro
 * na Steam invalida o anterior); 412 é um share code que não é da pessoa
 * ou velho demais para a corrente.
 */
export async function proximoShareCode(steamId: string, authCode: string, conhecido: string): Promise<string | null> {
  let proximo: string | null;
  try {
    ({ next_code: proximo } = await invocar<{ next_code: string | null }>("steam.match.code.next", {
      steam_id: steamId,
      auth_code: authCode.trim().toUpperCase(),
      known_code: conhecido,
    }));
  } catch (err) {
    if (!(err instanceof CogniflowApiError)) throw err;
    // O cogniflow devolve o status da própria Steam quando ela recusa; é o
    // que separa "seu código está errado" de "tente de novo".
    if (err.providerStatus === 403) throw new CodigoInvalido("auth", "A Steam não aceitou o código de autenticação. Confira se copiou o código inteiro — gerar um novo na Steam invalida o anterior.");
    if (err.providerStatus === 412) throw new CodigoInvalido("share", "A Steam não reconhece esse share code como seu, ou ele é antigo demais. Use o da última partida, que aparece na mesma página do código.");
    if (err.providerStatus === 429 || !err.permanente) throw new CodigoInvalido("steam", "A Steam pediu para esperar um pouco. Tente de novo em um minuto.");
    if (err.status === 400) throw new CodigoInvalido("share", "Os códigos não têm o formato que a Steam espera. Confira os dois e cole de novo.");
    throw new CodigoInvalido("steam", `A Steam respondeu ${err.providerStatus ?? err.status}. Tente de novo em instantes.`);
  }
  if (!proximo) return null;
  if (!shareCodeValido(proximo)) throw new CodigoInvalido("steam", "A Steam devolveu um código que não entendemos.");
  return proximo;
}

/* -------------------------------- ativação -------------------------------- */

/**
 * Liga a corrente para uma pessoa. Valida os dois códigos contra a Steam
 * antes de guardar qualquer coisa: uma cola errada tem que virar uma frase
 * clara na hora, não uma fila que nunca anda.
 */
export async function ativarPartidas(userId: string, steamId: string, authCode: string, shareCode: string) {
  await registrar("corrente.ativada", { userId });
  const share = normalizarShareCode(shareCode);
  if (!authCodeValido(authCode)) throw new CodigoInvalido("auth", "O código de autenticação tem o formato XXXX-XXXXX-XXXX.");
  if (!shareCodeValido(share)) throw new CodigoInvalido("share", "O share code tem o formato CSGO-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx (pode colar o link inteiro).");

  await proximoShareCode(steamId, authCode, share);

  await prisma.user.update({
    where: { id: userId },
    data: {
      steamAuthCode: cifrar(authCode.trim().toUpperCase()),
      shareCodeAtual: share,
      partidasErro: null,
      partidasAtivadasEm: new Date(),
    },
  });
  await registrarPartida(share, userId);
  return descobrirPartidas(userId);
}

export async function desativarPartidas(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { steamAuthCode: null, shareCodeAtual: null, partidasErro: null, partidasAtivadasEm: null },
  });
}

async function registrarPartida(shareCode: string, descobertaPorId: string) {
  const { matchId } = decodificarShareCode(shareCode);
  return prisma.match.upsert({
    where: { id: matchId.toString() },
    create: { id: matchId.toString(), shareCode, descobertaPorId },
    update: {},
  });
}

/* -------------------------------- corrente -------------------------------- */

/**
 * Segue a corrente de uma pessoa até o fim (ou até o teto da rodada) e
 * deixa cada partida nova na fila do bot. Erro de código fica gravado para
 * a página explicar; erro transitório da Steam só espera a próxima coleta.
 * Devolve quantas partidas novas encontrou.
 */
export async function descobrirPartidas(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { steamId: true, steamAuthCode: true, shareCodeAtual: true },
  });
  if (!user?.steamAuthCode || !user.shareCodeAtual) return 0;

  const authCode = decifrar(user.steamAuthCode);
  let atual = user.shareCodeAtual;
  let novas = 0;
  try {
    while (novas < MAX_POR_RODADA) {
      const proximo = await proximoShareCode(user.steamId, authCode, atual);
      if (!proximo) break;
      await registrarPartida(proximo, userId);
      await prisma.user.update({ where: { id: userId }, data: { shareCodeAtual: proximo, partidasErro: null } });
      atual = proximo;
      novas++;
    }
  } catch (err) {
    if (err instanceof CodigoInvalido && err.campo !== "steam") {
      await prisma.user.update({ where: { id: userId }, data: { partidasErro: err.message } });
      await registrar("corrente.parou", { userId, dados: { campo: err.campo } });
    } else {
      await reportarErro("partidas.corrente", err, userId);
    }
  }
  return novas;
}

/** Para o cron: todo mundo que ligou a corrente, um por vez. */
export async function descobrirPartidasDeTodos() {
  const users = await prisma.user.findMany({
    where: { steamAuthCode: { not: null } },
    select: { id: true },
  });
  let total = 0;
  for (const u of users) total += await descobrirPartidas(u.id);
  return { users: users.length, novas: total };
}

/* ---------------------------------- do GC --------------------------------- */

/** O que o bot manda depois de perguntar ao GC por um share code. */
export type PartidaDoGC = {
  matchId: string;
  matchtime: number;
  duracaoS: number;
  rounds: number;
  gameType: number | null;
  demoUrl: string | null;
  /** Do cabeçalho da demo, quando o bot conseguiu ler. */
  mapa?: string | null;
  servidor?: string | null;
  /** accountids na ordem da reserva: cinco do time A, cinco do time B. */
  contas: number[];
  kills: number[];
  assists: number[];
  deaths: number[];
  mvps: number[];
  scores: number[];
  hs: number[];
  placar: [number, number];
};

const BASE_STEAMID64 = 76561197960265728n;

export function steamId64(accountId: number) {
  return (BASE_STEAMID64 + BigInt(accountId)).toString();
}

/**
 * Grava o scoreboard. As dez linhas entram de uma vez, com o userId de
 * quem tem conta aqui — inclusive quem não ligou a corrente: uma partida
 * descoberta por um jogador é a mesma partida dos outros nove.
 */
export async function gravarPartidaDoGC(shareCode: string, p: PartidaDoGC): Promise<string[]> {
  const registro = await prisma.match.findUnique({ where: { shareCode }, select: { id: true } });
  if (!registro) return [];
  const matchId = registro.id;
  const steamIds = p.contas.map(steamId64);
  const usuarios = await prisma.user.findMany({
    where: { steamId: { in: steamIds } },
    select: { id: true, steamId: true },
  });
  const userPorSteam = new Map(usuarios.map((u) => [u.steamId, u.id]));
  const metade = Math.ceil(steamIds.length / 2);
  const [a, b] = p.placar;
  const vencedor = a === b ? null : a > b ? 0 : 1;
  const jogadaEm = new Date(p.matchtime * 1000);

  const jogadores = steamIds.map((steamId, i) => {
    const time = i < metade ? 0 : 1;
    return {
      steamId,
      userId: userPorSteam.get(steamId) ?? null,
      time,
      kills: p.kills[i] ?? 0,
      assists: p.assists[i] ?? 0,
      deaths: p.deaths[i] ?? 0,
      mvps: p.mvps[i] ?? 0,
      score: p.scores[i] ?? 0,
      hs: p.hs[i] ?? 0,
      venceu: vencedor === null ? null : vencedor === time,
    };
  });

  const presenca = await contextoPelaPresenca([...userPorSteam.values()], jogadaEm, p.duracaoS);
  const mapa = p.mapa ?? presenca.mapa;
  const modo = modoDoGameType(p.gameType) ?? presenca.modo;

  await prisma.$transaction([
    prisma.match.update({
      where: { id: matchId },
      data: {
        status: "DONE",
        error: null,
        jogadaEm,
        duracaoS: p.duracaoS,
        rounds: p.rounds,
        gameType: p.gameType,
        modo,
        demoUrl: p.demoUrl,
        placarA: a,
        placarB: b,
        mapa,
        servidor: p.servidor ?? null,
      },
    }),
    prisma.matchPlayer.deleteMany({ where: { matchId } }),
    prisma.matchPlayer.createMany({ data: jogadores.map((j) => ({ ...j, matchId })) }),
  ]);
  return [...userPorSteam.values()];
}

/**
 * O `game_type` que o GC devolve na reserva da partida, traduzido para o
 * vocabulário do rich presence — o mesmo das sessões, para que o submenu
 * de modos junte as duas fontes.
 *
 * Os valores vêm de partidas observadas, não de documentação da Valve
 * (não existe): 8 é o competitivo clássico desde o CS:GO e 264 o Wingman.
 * O Premier do CS2 ainda não foi visto com certeza — enquanto um valor
 * não estiver aqui, a reserva é a presença de quem jogou, que o bot marca
 * como "premier" sem ambiguidade. Um valor desconhecido devolve null em
 * vez de chutar: um modo errado numa aba é pior que uma partida em "tudo".
 */
const MODO_POR_GAME_TYPE: Record<number, string> = {
  8: "competitive",
  264: "scrimcomp2v2",
};

export function modoDoGameType(gameType: number | null | undefined): string | null {
  if (gameType === null || gameType === undefined) return null;
  return MODO_POR_GAME_TYPE[gameType] ?? null;
}

/**
 * Reserva para o que o GC não diz: o bot de presença grava mapa e modo no
 * snapshot da coleta que veio logo depois da partida. Se algum dos dez
 * jogadores tem um snapshot assim na janela certa, é este.
 */
async function contextoPelaPresenca(
  userIds: string[],
  jogadaEm: Date,
  duracaoS: number,
): Promise<{ mapa: string | null; modo: string | null }> {
  if (userIds.length === 0) return { mapa: null, modo: null };
  const fim = new Date(jogadaEm.getTime() + duracaoS * 1000);
  const snap = await prisma.statSnapshot.findFirst({
    where: {
      userGame: { userId: { in: userIds }, gameAppId: 730 },
      OR: [{ matchMap: { not: null } }, { matchMode: { not: null } }],
      capturedAt: { gte: fim, lte: new Date(fim.getTime() + 40 * 60_000) },
    },
    orderBy: { capturedAt: "asc" },
    select: { matchMap: true, matchMode: true },
  });
  return { mapa: snap?.matchMap ?? null, modo: snap?.matchMode ?? null };
}

/** Só o mapa, lido depois. Sem mapa conta como tentativa, para não ficar pedindo para sempre. */
export async function gravarMapaDaDemo(shareCode: string, mapa: string | null, servidor: string | null) {
  await prisma.match.updateMany({
    where: { shareCode, status: "DONE" },
    data: mapa ? { mapa, servidor } : { tentativas: { increment: 1 } },
  });
}

export async function registrarFalhaDoGC(shareCode: string, motivo: "EXPIRED" | "FAILED", error?: string) {
  const partida = await prisma.match.findUnique({ where: { shareCode }, select: { tentativas: true } });
  if (!partida) return;
  const tentativas = partida.tentativas + 1;
  const desiste = motivo === "EXPIRED" || tentativas >= MAX_TENTATIVAS;
  await prisma.match.update({
    where: { shareCode },
    data: { tentativas, error: error ?? null, status: desiste ? motivo : "PENDING" },
  });
}

/* --------------------------------- leitura -------------------------------- */

export type PartidaLinha = {
  id: string;
  shareCode: string;
  jogadaEm: Date;
  duracaoS: number;
  rounds: number;
  mapa: string | null;
  /** Vocabulário do rich presence (premier, competitive…); null quando nem o GC nem a presença disseram. */
  modo: string | null;
  placar: [number, number];
  demoUrl: string | null;
  eu: { kills: number; assists: number; deaths: number; mvps: number; score: number; hs: number; venceu: boolean | null; time: number };
  /** Os outros jogadores com conta no FragIQ, para ligar às páginas deles. */
  conhecidos: { steamId: string; time: number }[];
};

/** As partidas gravadas de um SteamID, mais recente primeiro; `modo` recorta pelo submenu. */
export async function listarPartidas(steamId: string, limite = 30, modo?: string | null): Promise<PartidaLinha[]> {
  const linhas = await prisma.matchPlayer.findMany({
    where: { steamId, match: { status: "DONE", ...(modo ? { modo } : {}) } },
    orderBy: { match: { jogadaEm: "desc" } },
    take: limite,
    include: {
      match: { include: { jogadores: { where: { userId: { not: null } }, select: { steamId: true, time: true } } } },
    },
  });
  return linhas.map((l) => ({
    id: l.match.id,
    shareCode: l.match.shareCode,
    jogadaEm: l.match.jogadaEm ?? l.match.createdAt,
    duracaoS: l.match.duracaoS ?? 0,
    rounds: l.match.rounds ?? 0,
    mapa: l.match.mapa,
    modo: l.match.modo,
    placar: l.time === 0 ? [l.match.placarA ?? 0, l.match.placarB ?? 0] : [l.match.placarB ?? 0, l.match.placarA ?? 0],
    demoUrl: l.match.demoUrl,
    eu: { kills: l.kills, assists: l.assists, deaths: l.deaths, mvps: l.mvps, score: l.score, hs: l.hs, venceu: l.venceu, time: l.time },
    conhecidos: l.match.jogadores.filter((j) => j.steamId !== steamId),
  }));
}

/* ------------------------------- uma partida ------------------------------ */

export type Scoreboard = {
  id: string;
  shareCode: string;
  jogadaEm: Date;
  duracaoS: number;
  mapa: string | null;
  servidor: string | null;
  placar: [number, number];
  demoUrl: string | null;
  times: {
    time: number;
    placar: number;
    venceu: boolean | null;
    jogadores: {
      steamId: string;
      userId: string | null;
      nome: string | null;
      avatar: string | null;
      kills: number;
      assists: number;
      deaths: number;
      mvps: number;
      score: number;
      hs: number;
    }[];
  }[];
};

/**
 * A partida inteira, os dois times, com nome e avatar de cada um pela
 * Steam (uma chamada para os dez). É o mesmo placar que o "Suas partidas"
 * do jogo mostra a qualquer um dos dez — público por natureza.
 */
export async function carregarScoreboard(matchId: string): Promise<Scoreboard | null> {
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    include: { jogadores: { orderBy: { score: "desc" } } },
  });
  if (!m || m.status !== "DONE") return null;

  const perfis = await getPlayerSummaries(m.jogadores.map((j) => j.steamId)).catch(() => new Map());
  const placar: [number, number] = [m.placarA ?? 0, m.placarB ?? 0];
  const vencedor = placar[0] === placar[1] ? null : placar[0] > placar[1] ? 0 : 1;

  return {
    id: m.id,
    shareCode: m.shareCode,
    jogadaEm: m.jogadaEm ?? m.createdAt,
    duracaoS: m.duracaoS ?? 0,
    mapa: m.mapa,
    servidor: m.servidor,
    placar,
    demoUrl: m.demoUrl,
    times: [0, 1].map((time) => ({
      time,
      placar: placar[time],
      venceu: vencedor === null ? null : vencedor === time,
      jogadores: m.jogadores
        .filter((j) => j.time === time)
        .map((j) => ({
          steamId: j.steamId,
          userId: j.userId,
          nome: perfis.get(j.steamId)?.personaname ?? null,
          avatar: perfis.get(j.steamId)?.avatarfull ?? null,
          kills: j.kills,
          assists: j.assists,
          deaths: j.deaths,
          mvps: j.mvps,
          score: j.score,
          hs: j.hs,
        })),
    })),
  };
}
