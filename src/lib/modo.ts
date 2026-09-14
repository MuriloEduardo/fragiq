import type { ContextFilter, SnapshotRow } from "./series";
import { rotularModo } from "./cs2-labels";

/**
 * O modo de jogo como eixo da navegação, não como filtro.
 *
 * Premier, Competitivo e Casual não se misturam: são jogos diferentes com
 * os mesmos contadores. A Steam soma tudo num total só — o que distingue
 * uma sessão da outra é o rich presence que o bot observou, ou o que a
 * pessoa marcou à mão. Por isso o modo é um submenu sob as abas, e vale
 * para todas elas de uma vez: quem escolheu Premier vê o resumo, as
 * sessões, as partidas e as análises do Premier até escolher outra coisa.
 *
 * "Tudo" continua existindo porque é o único recorte que cobre as coletas
 * sem contexto (cron diário, gente sem o bot), e porque o vitalício da
 * Steam é, por natureza, de tudo.
 */
export const TUDO = "tudo";

export type Modo = string;

/** Modos que ganham aba, na ordem em que aparecem. O resto vai para o fim. */
const ORDEM = ["premier", "competitive", "casual", "scrimcomp2v2", "deathmatch"];

export const COOKIE_MODO = "fragiq_modo";

export type AbaDeModo = { modo: Modo; rotulo: string; sessoes: number };

/**
 * Os modos com pelo menos uma sessão marcada — só esses viram aba. Um
 * submenu com "Premier (0)" só diria que falta algo, e para isso existe o
 * aviso de pendências.
 */
export function abasDeModo(rows: SnapshotRow[], partidasPorModo: Map<string, number> = new Map()): AbaDeModo[] {
  const contagem = new Map<string, number>();
  for (const s of rows) if (s.matchMode) contagem.set(s.matchMode, (contagem.get(s.matchMode) ?? 0) + 1);
  for (const [modo, n] of partidasPorModo) if (!contagem.has(modo)) contagem.set(modo, n);

  return [...contagem.entries()]
    .map(([modo, sessoes]) => ({ modo, rotulo: rotularModo(modo), sessoes }))
    .sort((a, b) => posicao(a.modo) - posicao(b.modo) || b.sessoes - a.sessoes);
}

function posicao(modo: string) {
  const i = ORDEM.indexOf(modo);
  return i === -1 ? ORDEM.length : i;
}

/**
 * O modo pedido, entre o que a URL diz e o que o cookie lembra. A URL vence
 * — é o que torna o link compartilhável — e um modo que não existe na
 * série cai para "tudo" em vez de mostrar uma página vazia.
 */
export function resolverModo(
  daUrl: string | string[] | undefined,
  doCookie: string | undefined,
  disponiveis: AbaDeModo[],
): Modo {
  const pedido = (Array.isArray(daUrl) ? daUrl[0] : daUrl) ?? doCookie ?? TUDO;
  if (pedido === TUDO) return TUDO;
  return disponiveis.some((a) => a.modo === pedido) ? pedido : TUDO;
}

export function filtroDoModo(modo: Modo): ContextFilter | undefined {
  return modo === TUDO ? undefined : { mode: modo };
}

/** `?modo=` só quando não é "tudo": a URL sem parâmetro é a página de sempre. */
export function comModo(href: string, modo: Modo) {
  if (modo === TUDO) return href;
  return `${href}${href.includes("?") ? "&" : "?"}modo=${encodeURIComponent(modo)}`;
}

export function rotuloDoModo(modo: Modo) {
  return modo === TUDO ? "Tudo" : rotularModo(modo);
}
