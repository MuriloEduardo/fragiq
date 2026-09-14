import { prisma } from "./prisma";
import { appUrl } from "./env";
import { registrar } from "./eventos";

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

/**
 * O aviso das partidas, no chat, para quem já jogou o bastante para sentir
 * falta delas. O de privacidade tem a sua própria rotina em
 * `mensagem-steam.ts`, disparada quando uma captura desiste; este dispara
 * depois de uma coleta que fechou sessão, que é o momento em que "cadê a
 * partida?" faz sentido.
 */
export async function avisarPartidasSePreciso(userId: string, steamId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      avisoSteam: true,
      avisoPartidasEm: true,
      partidasAtivadasEm: true,
      botAmigoDesde: true,
      games: { where: { gameAppId: 730 }, select: { _count: { select: { snapshots: { where: { matchMode: { not: null } } } } } } },
    },
  });
  if (!user || !user.avisoSteam || user.avisoPartidasEm || user.partidasAtivadasEm || !user.botAmigoDesde) return false;
  if ((user.games[0]?._count.snapshots ?? 0) < SESSOES_ANTES_DO_AVISO) return false;

  const texto = [
    "FragIQ · Suas sessões já estão entrando, mas as partidas oficiais (placar, scoreboard dos dez, Premier separado do Competitivo) ainda não — falta o código de histórico da Steam.",
    "É uma vez só, e o código não abre inventário, chat nem nada da conta: só o histórico de partidas.",
    `Ligar: ${appUrl()}/games/730/partidas · para não receber mais: ${appUrl()}/seguranca`,
  ].join("\n");

  await prisma.$transaction([
    prisma.steamMessage.create({ data: { userId, steamId, texto } }),
    prisma.user.update({ where: { id: userId }, data: { avisoPartidasEm: new Date() } }),
  ]);
  await registrar("aviso.partidas", { userId });
  return true;
}
