import { prisma } from "./prisma";
import { appUrl } from "./env";
import { registrar } from "./eventos";
import { CONVITES, LEMBRETES_PARTIDAS, LEMBRETES_PRIVACIDADE } from "./lembretes-texto";

export { CODIGOS_STEAM, CONVITES, LEMBRETES_PRIVACIDADE } from "./lembretes-texto";

/**
 * O que a pessoa ainda não compartilhou — e que o site sente falta.
 *
 * Três portas, cada uma com um dado atrás: "Detalhes do jogo" privado
 * (nenhuma estatística entra), o bot que não é amigo (as sessões chegam
 * sem modo nem mapa, e o submenu de modos fica vazio) e a corrente de
 * share codes desligada (nenhuma partida oficial). O onboarding do Resumo
 * lista as três com calma; isto é a versão que persegue: um aviso curto em
 * toda aba do jogo e, para quem o bot alcança, uma mensagem no chat da
 * Steam — uma vez só por porta.
 */
export type Pendencia = {
  id: "stats" | "bot" | "partidas";
  titulo: string;
  texto: string;
  acao: { rotulo: string; href: string; externa?: boolean };
};

export const PRIVACIDADE_STEAM = "https://steamcommunity.com/my/edit/settings";

/** Sessões a partir das quais a falta das partidas oficiais vira aviso no chat. */
const SESSOES_ANTES_DO_AVISO = 3;

export async function pendenciasDe(userId: string): Promise<Pendencia[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      botAmigoDesde: true,
      partidasAtivadasEm: true,
      games: { where: { gameAppId: 730 }, select: { _count: { select: { snapshots: true } } } },
    },
  });
  if (!user) return [];
  const cs2 = user.games[0];
  const pendencias: Pendencia[] = [];

  if (cs2 && cs2._count.snapshots === 0) {
    pendencias.push({
      id: "stats",
      titulo: "A Steam não deixa ler as suas estatísticas",
      texto: "Os \"Detalhes do jogo\" do seu perfil estão privados. Sem isso, nenhuma partida entra.",
      acao: { rotulo: "Abrir a privacidade da Steam", href: PRIVACIDADE_STEAM, externa: true },
    });
  }
  if (!user.botAmigoDesde) {
    pendencias.push({
      id: "bot",
      titulo: "Sem o bot, as sessões chegam sem modo nem mapa",
      texto: "Premier, Competitivo e Casual só se separam quando o bot é seu amigo e vê o fim da partida.",
      acao: { rotulo: "Adicionar o bot", href: "/games/730#bot" },
    });
  }
  if (!user.partidasAtivadasEm) {
    pendencias.push({
      id: "partidas",
      titulo: "As partidas oficiais ainda não chegam",
      texto: "Com o código de histórico da Steam, cada partida entra com placar e scoreboard dos dez.",
      acao: { rotulo: "Ligar as partidas", href: "/games/730/partidas" },
    });
  }
  return pendencias;
}

/* ------------------------------ lembretes ------------------------------- */

/**
 * O bot insiste, com educação e com teto.
 *
 * Um aviso só não converte: quem não ligou a corrente na primeira semana
 * costuma ter deixado para depois, não decidido contra. Então o bot volta
 * de tempos em tempos — no chat, para quem é amigo dele — e para quando a
 * pessoa liga, desliga os avisos ou já ouviu o bastante.
 *
 * Cadência: o primeiro lembrete depois de alguns dias de amizade (ou da
 * terceira sessão sem partida, o que vier antes), os seguintes a cada
 * semana, até `MAX_LEMBRETES`. O texto muda a cada vez para não parecer
 * um robô repetindo, e todos dizem o mesmo no fundo: é seguro, é uma vez
 * só, e é assim que todas as plataformas de estatísticas funcionam.
 */
const MAX_LEMBRETES = 3;
const INTERVALO_MS = 7 * 86_400_000;
const CARENCIA_AMIZADE_MS = 2 * 86_400_000;

type Lembrete = {
  id: "stats" | "partidas";
  campoQuando: "avisoPrivacidadeEm" | "avisoPartidasEm";
  campoQuantos: "avisosPrivacidade" | "avisosPartidas";
  textos: (site: string) => string[];
  evento: string;
};

const LEMBRETES: Lembrete[] = [
  { id: "stats", campoQuando: "avisoPrivacidadeEm", campoQuantos: "avisosPrivacidade", textos: LEMBRETES_PRIVACIDADE, evento: "aviso.privacidade" },
  { id: "partidas", campoQuando: "avisoPartidasEm", campoQuantos: "avisosPartidas", textos: LEMBRETES_PARTIDAS, evento: "aviso.partidas" },
];

/**
 * Chamado pelo cron diário: enfileira, para cada pessoa que o bot alcança,
 * o próximo lembrete devido. Devolve quantos saíram.
 */
export async function lembrarPendenciasNoSteam(agora = new Date()): Promise<{ stats: number; partidas: number; convites: number }> {
  const site = appUrl();
  const saida = { stats: 0, partidas: 0, convites: 0 };
  saida.convites = await convidarAmigosSemConta(agora, site);
  const candidatos = await prisma.user.findMany({
    where: { avisoSteam: true, botAmigoDesde: { lte: new Date(agora.getTime() - CARENCIA_AMIZADE_MS) } },
    select: {
      id: true,
      steamId: true,
      partidasAtivadasEm: true,
      avisoPrivacidadeEm: true,
      avisosPrivacidade: true,
      avisoPartidasEm: true,
      avisosPartidas: true,
      games: { where: { gameAppId: 730 }, select: { _count: { select: { snapshots: true } } } },
    },
  });

  for (const u of candidatos) {
    const temStats = (u.games[0]?._count.snapshots ?? 0) > 0;
    const pendente = !temStats ? LEMBRETES[0] : !u.partidasAtivadasEm ? LEMBRETES[1] : null;
    if (!pendente) continue;

    const quantos = u[pendente.campoQuantos];
    const ultimo = u[pendente.campoQuando];
    if (quantos >= MAX_LEMBRETES) continue;
    if (ultimo && agora.getTime() - ultimo.getTime() < INTERVALO_MS) continue;

    const texto = pendente.textos(site)[Math.min(quantos, MAX_LEMBRETES - 1)];
    await prisma.$transaction([
      prisma.steamMessage.create({ data: { userId: u.id, steamId: u.steamId, texto } }),
      prisma.user.update({
        where: { id: u.id },
        data: { [pendente.campoQuando]: agora, [pendente.campoQuantos]: { increment: 1 } },
      }),
    ]);
    await registrar(pendente.evento, { userId: u.id, dados: { lembrete: quantos + 1 } });
    saida[pendente.id]++;
  }
  return saida;
}

/** Convites para quem adicionou o bot e nunca entrou: 1 dia de amizade, depois semanal, até `MAX_LEMBRETES`. */
const CARENCIA_CONVITE_MS = 1 * 86_400_000;

async function convidarAmigosSemConta(agora: Date, site: string): Promise<number> {
  const amigos = await prisma.botAmigo.findMany({
    where: { saiuEm: null, convites: { lt: MAX_LEMBRETES }, desde: { lte: new Date(agora.getTime() - CARENCIA_CONVITE_MS) } },
    select: { steamId: true, convites: true, ultimoConviteEm: true },
  });
  if (amigos.length === 0) return 0;
  const comConta = new Set(
    (await prisma.user.findMany({ where: { steamId: { in: amigos.map((a) => a.steamId) } }, select: { steamId: true } })).map((u) => u.steamId),
  );
  let enviados = 0;
  for (const a of amigos) {
    if (comConta.has(a.steamId)) continue;
    if (a.ultimoConviteEm && agora.getTime() - a.ultimoConviteEm.getTime() < INTERVALO_MS) continue;
    const texto = CONVITES(site, a.steamId)[Math.min(a.convites, MAX_LEMBRETES - 1)];
    await prisma.$transaction([
      prisma.steamMessage.create({ data: { userId: null, steamId: a.steamId, texto } }),
      prisma.botAmigo.update({ where: { steamId: a.steamId }, data: { convites: { increment: 1 }, ultimoConviteEm: agora } }),
    ]);
    await registrar("convite.steam", { dados: { steamId: a.steamId, convite: a.convites + 1 } });
    enviados++;
  }
  return enviados;
}

/**
 * O primeiro lembrete das partidas pode vir antes da carência: uma coleta
 * que fechou sessão é o momento em que "cadê a partida?" faz sentido.
 * Depois disso a cadência é a do cron.
 */
export async function avisarPartidasSePreciso(userId: string, steamId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      avisoSteam: true,
      avisosPartidas: true,
      partidasAtivadasEm: true,
      botAmigoDesde: true,
      games: { where: { gameAppId: 730 }, select: { _count: { select: { snapshots: { where: { matchMode: { not: null } } } } } } },
    },
  });
  if (!user || !user.avisoSteam || user.avisosPartidas > 0 || user.partidasAtivadasEm || !user.botAmigoDesde) return false;
  if ((user.games[0]?._count.snapshots ?? 0) < SESSOES_ANTES_DO_AVISO) return false;

  const texto = LEMBRETES_PARTIDAS(appUrl())[0];
  await prisma.$transaction([
    prisma.steamMessage.create({ data: { userId, steamId, texto } }),
    prisma.user.update({ where: { id: userId }, data: { avisoPartidasEm: new Date(), avisosPartidas: 1 } }),
  ]);
  await registrar("aviso.partidas", { userId, dados: { lembrete: 1 } });
  return true;
}
