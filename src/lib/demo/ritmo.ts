import { ladosPorRound, roundsJogados, TICKS_POR_S } from "./metricas";
import { timesPorRound } from "./conversao";
import type { DemoPayload, Lado } from "./payload";

/**
 * O ritmo de cada time numa partida: a que segundo do round as coisas
 * acontecem.
 *
 * A dimensão **tempo** da linguagem tática (docs/demos.md §5): a conversão
 * diz o que o time fez com o que teve, e nada diz *quando*. Um time que
 * toca o inimigo aos 12 s joga outro jogo do que um que toca aos 40 —
 * mesmo com o mesmo placar, o mesmo ADR e a mesma conversão.
 *
 * Duas decisões que o número carrega:
 *
 * - **O zero é o fim do freeze**, não o início do round: antes dele
 *   ninguém anda, e contar o freeze somaria um tempo morto igual para
 *   todos. Round que a demo não marcou o freeze fica de fora — sem zero
 *   não há segundo.
 * - **O contato é do round; o que o torna do time é o lado.** O primeiro
 *   tiro que acerta vale para os dois times ao mesmo tempo, então dentro
 *   de uma partida o número de CT de um time é o de T do outro. O que
 *   separa os dois é quem decidiu: de T o time escolhe quando executar, e
 *   o segundo é o ritmo que ele **impôs**; de CT é o ritmo que ele
 *   **sofreu**. Em série, contra adversários diferentes, é uma assinatura
 *   do time.
 *
 * Mediana e não média: um round em que o T salva e ninguém se toca até os
 * 90 s não deve mover o ritmo dos outros onze.
 */

export type RitmoDoRound = {
  n: number;
  /** Segundos do fim do freeze até o primeiro dano ou morte entre lados opostos; `null` se ninguém se tocou. */
  contato: number | null;
  /** Segundos do fim do freeze até a bomba plantada; `null` no round sem plant. */
  plant: number | null;
};

export type RitmoDeTime = {
  ladoInicial: Lado;
  /** Mediana do segundo do primeiro contato nos rounds em que o time jogou de CT, e quantos rounds entraram na conta. */
  segundoContatoCT: number | null;
  contatosCT: number;
  /** O mesmo de T — aqui o time é quem escolhe a hora. */
  segundoContatoT: number | null;
  contatosT: number;
  /** Mediana do segundo da plantada nos rounds em que o time plantou (a base é `plants`, da conversão). */
  segundoPlant: number | null;
};

const segundos = (ticks: number) => Math.round((ticks / TICKS_POR_S) * 10) / 10;

/**
 * A mediana, arredondada ao décimo de segundo. Lista vazia não tem
 * mediana: devolve `null` em vez de 0, porque "não houve contato" e
 * "contato no tick zero" são coisas diferentes.
 */
export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = ordenados.length >> 1;
  const v = ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
  return Math.round(v * 10) / 10;
}

/**
 * O ritmo de cada round jogado que tem fim de freeze marcado. É o fato
 * intermediário — por round, sem time — de que sai a leitura por time, e
 * é dele que sairão "execução" e "rotação" quando existirem.
 */
export function ritmoDosRounds(p: DemoPayload): RitmoDoRound[] {
  const lados = ladosPorRound(p);
  const porRound = new Map<number, DemoPayload["eventos"]>();
  for (const e of p.eventos) {
    if (e.t === "rank") continue;
    if (!porRound.has(e.round)) porRound.set(e.round, []);
    porRound.get(e.round)!.push(e);
  }

  const ritmos: RitmoDoRound[] = [];
  for (const round of roundsJogados(p)) {
    const jogo = round.jogo;
    if (jogo == null) continue;
    const doRound = lados.get(round.n) ?? new Map<string, Lado>();
    let contato: number | null = null;
    let plant: number | null = null;
    for (const e of porRound.get(round.n) ?? []) {
      if (e.tick < jogo) continue;
      if (e.t === "bomba" && e.acao === "plantada") plant ??= e.tick;
      if (contato != null) continue;
      // Contato é dano trocado entre lados opostos: cegar ou fumaçar não
      // encosta em ninguém. Dano em si mesmo (queda, fogo próprio) e em
      // aliado caem no mesmo teste, porque o autor está do lado da vítima.
      if (e.t === "morte") {
        if (e.autor && e.ladoAutor && e.ladoAutor !== e.ladoVitima) contato = e.tick;
      } else if (e.t === "dano" && e.autor) {
        const autor = doRound.get(e.autor);
        const vitima = doRound.get(e.vitima);
        if (autor && vitima && autor !== vitima) contato = e.tick;
      }
    }
    ritmos.push({
      n: round.n,
      contato: contato == null ? null : segundos(contato - jogo),
      plant: plant == null ? null : segundos(plant - jogo),
    });
  }
  return ritmos;
}

/** O ritmo dos dois times, na mesma ordem e com a mesma identidade da conversão. */
export function ritmoDaDemo(p: DemoPayload): RitmoDeTime[] {
  const { times, dono } = timesPorRound(p);
  const contatos = times.map(() => ({ CT: [] as number[], T: [] as number[] }));
  const plants = times.map(() => [] as number[]);

  for (const r of ritmoDosRounds(p)) {
    const quem = dono.get(r.n);
    if (!quem) continue;
    if (r.contato != null) {
      contatos[quem.CT].CT.push(r.contato);
      contatos[quem.T].T.push(r.contato);
    }
    // A bomba é plantada por quem está de T: a plantada é do time daquele lado.
    if (r.plant != null) plants[quem.T].push(r.plant);
  }

  return times.map((t, i) => ({
    ladoInicial: t.ladoInicial,
    segundoContatoCT: mediana(contatos[i].CT),
    contatosCT: contatos[i].CT.length,
    segundoContatoT: mediana(contatos[i].T),
    contatosT: contatos[i].T.length,
    segundoPlant: mediana(plants[i]),
  }));
}
