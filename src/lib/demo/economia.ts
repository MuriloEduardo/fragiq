import { roundsJogados } from "./metricas";
import { timesPorRound } from "./conversao";
import type { DemoPayload, Lado } from "./payload";

/**
 * A economia de cada time numa partida: com quanto ele entrou em cada
 * round, e o que fez com isso.
 *
 * A dimensão **recursos** da linguagem tática (docs/demos.md §4.3). Sem
 * ela, ADR num eco é lido como ADR e perder um round sem arma conta igual
 * a perder um round de fuzil.
 *
 * Três decisões que a classe carrega:
 *
 * - **A amostra é o fim do freeze** (`round.economia`, payload v2), o
 *   mesmo zero do ritmo: o equipamento que cada um carrega ali é a compra
 *   do round, com as armas guardadas do anterior.
 * - **A classe é do time, pela média do equipamento de quem estava no
 *   lado**, não pela soma: round de 4v5 porque alguém saiu não vira eco
 *   por ter um jogador a menos.
 * - **Pistol é o primeiro round de cada metade** (o primeiro da partida,
 *   ou o primeiro depois da troca de lado) **com equipamento de eco.** O
 *   limite de valor é o que separa o pistol da prorrogação, que também
 *   começa depois de uma troca, mas com dinheiro de compra cheia.
 *
 * Demo lida antes do payload v2 não tem amostra: a função não inventa
 * classe e devolve lista vazia.
 */

export type ClasseEconomica = "pistol" | "eco" | "meia" | "cheia";

/** Média de equipamento por jogador abaixo da qual o round é eco: pistola e colete, no máximo. */
export const LIMITE_ECO = 1500;
/** Média a partir da qual a compra é cheia: fuzil com colete e capacete (AK 2 700 + 1 000). */
export const LIMITE_CHEIA = 3500;

export type EconomiaDoRound = {
  n: number;
  /** 0 = o time que começou de CT, 1 = o de T (a identidade de `timesPorRound`). */
  time: 0 | 1;
  lado: Lado;
  classe: ClasseEconomica;
  /** Média do equipamento de quem estava no lado, em dólares do jogo. */
  equipamento: number;
  venceu: boolean;
};

export type EconomiaDeTime = {
  ladoInicial: Lado;
  pistol: number;
  pistolGanhos: number;
  eco: number;
  ecoGanhos: number;
  meia: number;
  meiaGanhas: number;
  cheia: number;
  cheiaGanhas: number;
};

type Contagem = Exclude<keyof EconomiaDeTime, "ladoInicial">;
const CAMPOS: Record<ClasseEconomica, [Contagem, Contagem]> = {
  pistol: ["pistol", "pistolGanhos"],
  eco: ["eco", "ecoGanhos"],
  meia: ["meia", "meiaGanhas"],
  cheia: ["cheia", "cheiaGanhas"],
};

export function classe(media: number, primeiroDaMetade: boolean): ClasseEconomica {
  if (media < LIMITE_ECO) return primeiroDaMetade ? "pistol" : "eco";
  return media < LIMITE_CHEIA ? "meia" : "cheia";
}

/** A classe de cada time em cada round jogado que tem amostra de economia. */
export function economiaDosRounds(p: DemoPayload): EconomiaDoRound[] {
  const { dono } = timesPorRound(p);
  const linhas: EconomiaDoRound[] = [];
  let anterior: Record<Lado, 0 | 1> | null = null;
  for (const round of roundsJogados(p)) {
    const quem = dono.get(round.n);
    if (!quem) continue;
    // Metade nova: o primeiro round jogado, ou o time de CT mudou.
    const primeiroDaMetade = anterior == null || anterior.CT !== quem.CT;
    anterior = quem;
    const amostra = round.economia ?? [];
    for (const lado of ["CT", "T"] as const) {
      const doLado = amostra.filter((e) => e.lado === lado);
      if (doLado.length === 0) continue;
      const media = Math.round(doLado.reduce((s, e) => s + e.equipamento, 0) / doLado.length);
      linhas.push({ n: round.n, time: quem[lado], lado, classe: classe(media, primeiroDaMetade), equipamento: media, venceu: round.vencedor === lado });
    }
  }
  return linhas;
}

/** Quantos rounds de cada classe cada time jogou e venceu; vazia se a demo não tem amostra. */
export function economiaDaDemo(p: DemoPayload): EconomiaDeTime[] {
  const linhas = economiaDosRounds(p);
  if (linhas.length === 0) return [];
  const { times } = timesPorRound(p);
  const acc: EconomiaDeTime[] = times.map((t) => ({
    ladoInicial: t.ladoInicial,
    pistol: 0,
    pistolGanhos: 0,
    eco: 0,
    ecoGanhos: 0,
    meia: 0,
    meiaGanhas: 0,
    cheia: 0,
    cheiaGanhas: 0,
  }));
  for (const l of linhas) {
    const [jogados, ganhos] = CAMPOS[l.classe];
    acc[l.time][jogados]++;
    if (l.venceu) acc[l.time][ganhos]++;
  }
  return acc.filter((a) => a.pistol + a.eco + a.meia + a.cheia > 0);
}
