import {
  normalDe,
  ultimoPar,
  type ContextFilter,
  type EspecificacaoSerie,
  type Lente,
  type Normal,
  type SeriesSpec,
  type SnapshotRow,
} from "./series";
import { rotularModo } from "./cs2-labels";

/**
 * A referência contra a qual um número da sessão é lido — a mesma da tela.
 *
 * Havia duas: o hero e os cartões usavam `normalDe` (o acumulado do modo
 * sem a sessão lida, e só com base suficiente), enquanto as leituras e as
 * views do analista usavam o acumulado do modo *com* a sessão dentro e sem
 * mínimo nenhum. Na primeira sessão de Premier o segundo dava
 * `periodo == vitalicio`, variação zero e "praticamente o seu normal" —
 * falso, e contradizendo o cartão ao lado. Aqui só existe um caminho, e ele
 * diz de que tipo é o normal que devolveu, para o texto não chamar de
 * "vitalício" o que é o acumulado do modo, nem de "normal do Premier" o
 * vitalício de tudo por falta de base.
 */

const AMOSTRA_PADRAO = { de: "rounds", minimo: 10 } as const;

/** O que uma view devolve sobre a referência, além do valor. */
export type ReferenciaDTO = {
  valor: number | null;
  /** `modo`: acumulado do modo com base; `vitalicio`: sem lente; `vitalicio-fraco`: lente sem base; `nenhum`. */
  tipo: Normal["tipo"];
  rotulo: string;
  /** Sessões na base do normal do modo, quando `tipo === "modo"`. */
  sessoes: number | null;
  /** Quantas sessões o modo já tem e quantas precisa, quando `tipo === "vitalicio-fraco"`. */
  progresso: { sessoes: number; minimo: number } | null;
};

export function lenteDe(filter?: ContextFilter): Lente {
  return { modo: filter?.mode ?? null };
}

/** A coleta que fechou a sessão lida: é ela que sai do normal. */
export function sessaoLida(rows: SnapshotRow[], filter?: ContextFilter): string | null {
  return ultimoPar(rows, "total_rounds_played", filter)?.curr.id ?? null;
}

/** O normal de uma razão qualquer, pela regra única, com a amostra padrão de rounds. */
export function referenciaDe(
  rows: SnapshotRow[],
  spec: Omit<SeriesSpec, "id" | "filter">,
  lente: Lente,
  sessaoId: string | null,
  amostra: EspecificacaoSerie["amostra"] = AMOSTRA_PADRAO,
): Normal {
  // Um `filter` que venha junto da spec é do período, não do normal: com
  // ele dentro o vitalício viraria o acumulado do modo com a sessão lida.
  const { metric, denominator, mode, scale, kind } = spec as SeriesSpec;
  return normalDe(rows, { spec: { metric, denominator, mode, scale, kind }, amostra }, lente, sessaoId, rotularModo);
}

export function valorDe(normal: Normal): number | null {
  return normal.tipo === "nenhum" ? null : normal.valor;
}

export function serializar(normal: Normal): ReferenciaDTO {
  return {
    valor: valorDe(normal),
    tipo: normal.tipo,
    rotulo: normal.tipo === "nenhum" ? `sem referência (${normal.motivo})` : normal.rotulo,
    sessoes: normal.tipo === "modo" ? normal.sessoes : null,
    progresso: normal.tipo === "vitalicio-fraco" ? normal.progresso : null,
  };
}

/**
 * Como a referência é nomeada dentro de uma frase: "do seu Premier (7
 * sessões)", "de vitalício" ou, sem base no modo, "de vitalício — o Premier
 * ainda não tem base (2 de 5 sessões)". Nunca "do seu Premier" quando o
 * número é o vitalício.
 */
export function nomeDaReferencia(normal: Normal, lente: Lente): string {
  if (normal.tipo === "modo") return `do seu ${rotularModo(lente.modo!)} (${normal.sessoes} sessões)`;
  if (normal.tipo === "vitalicio-fraco") {
    return `de vitalício — o ${rotularModo(lente.modo!)} ainda não tem base (${normal.progresso.sessoes} de ${normal.progresso.minimo} sessões)`;
  }
  return "de vitalício";
}
