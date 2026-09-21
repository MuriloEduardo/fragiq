import { ladosPorRound, roundsJogados } from "./metricas";
import type { DemoPayload, Lado } from "./payload";

/**
 * A conversão de cada time numa partida: o que ele fez com as vantagens
 * que teve.
 *
 * É a primeira métrica de **time** da demo — as de `metricas.ts` são de
 * jogador, e nenhuma delas responde a pergunta que mais explica placar:
 * o 5v4 virou round? a bomba plantada virou round? Função pura e
 * versionada pela mesma `REGRAS_VERSAO` das métricas de jogador, porque
 * saem dos mesmos fatos e são refeitas pelo mesmo recompute.
 *
 * Duas decisões que o número carrega (docs/demos.md §4.1):
 *
 * - **Vantagem é um momento criado no round, não o estado dele.** Só
 *   contam rounds que começam iguais; quando alguém saiu da partida o
 *   round inteiro é desigual, e chamar isso de vantagem convertida
 *   transformaria a métrica em taxa de vitória.
 * - **A última morte não é vantagem.** Ficar 1v0 é o round ganho, não uma
 *   situação a converter: a vantagem só conta com inimigo vivo.
 *
 * O time é identificado pelo lado em que começou a partida (`ladoInicial`),
 * que é o que sobrevive à troca de lados do intervalo — a demo não tem
 * "time A" e "time B".
 */

export type ConversaoDeTime = {
  /** Lado em que o time começou a partida; é a identidade dele na demo. */
  ladoInicial: Lado;
  /** Quem jogou por este time em algum round. */
  jogadores: string[];
  rounds: number;
  roundsGanhos: number;
  /** Rounds que começaram iguais em que este time, como CT, ficou com mais gente viva — e quantos virou round. */
  vantagensCT: number;
  vantagensCTGanhas: number;
  /** O mesmo, jogando de T. */
  vantagensT: number;
  vantagensTGanhas: number;
  /** Rounds em que este time, como T, plantou a bomba — e quantos venceu. */
  plants: number;
  plantsGanhos: number;
};

const LADOS = ["CT", "T"] as const;
const oposto = (l: Lado): Lado => (l === "CT" ? "T" : "CT");

type Time = { ladoInicial: Lado; jogadores: Set<string> };

/** Um time da partida, identificado pelo lado em que começou. */
export type TimeDaDemo = { ladoInicial: Lado; jogadores: string[] };
/** Em cada round jogado, qual time (0 = começou de CT, 1 = de T) ocupou cada lado. */
export type DonoDoLado = Map<number, Record<Lado, 0 | 1>>;

/**
 * Os dois times, pelo primeiro round jogado: quem estava de CT nele é o
 * time "CT", e assim segue o resto da partida, inclusive depois da troca.
 */
function timesDaPartida(lados: Map<number, Map<string, Lado>>, rounds: ReturnType<typeof roundsJogados>): Time[] {
  const times: Time[] = LADOS.map((ladoInicial) => ({ ladoInicial, jogadores: new Set<string>() }));
  const primeiro = rounds.map((r) => lados.get(r.n)).find((l) => l && l.size > 0);
  for (const [quem, lado] of primeiro ?? []) times[lado === "CT" ? 0 : 1].jogadores.add(quem);
  return times;
}

/**
 * Qual time está em cada lado neste round: o que tem mais gente conhecida
 * ali. Empate (ou lado sem ninguém conhecido) cai na identidade — o time
 * "CT" de CT —, e quem apareceu depois do primeiro round entra na
 * escalação do time em que jogou.
 */
function donoDoLado(doRound: Map<string, Lado>, times: Time[]): Record<Lado, Time> {
  const escolha = (lado: Lado) => {
    const doLado = [...doRound].filter(([, l]) => l === lado).map(([quem]) => quem);
    const contagem = times.map((t) => doLado.filter((quem) => t.jogadores.has(quem)).length);
    if (contagem[0] === contagem[1]) return times.find((t) => t.ladoInicial === lado)!;
    return contagem[0] > contagem[1] ? times[0] : times[1];
  };
  const dono = { CT: escolha("CT"), T: escolha("T") };
  // Os dois lados não podem ser o mesmo time: nesse caso ninguém sabe quem é quem, e a identidade decide.
  if (dono.CT === dono.T) for (const l of LADOS) dono[l] = times.find((t) => t.ladoInicial === l)!;
  for (const [quem, lado] of doRound) dono[lado].jogadores.add(quem);
  return dono;
}

/**
 * Quem é quem em cada round jogado: os dois times da partida e o lado que
 * cada um ocupou em cada round.
 *
 * Mora aqui e é exportado porque a identidade do time é a parte cara da
 * conversão — escalação que muda, troca de lado, gente que entra no meio —
 * e qualquer outra métrica de time (`ritmo.ts`) precisa exatamente dela.
 * Duas versões disso dariam dois times diferentes na mesma partida.
 */
export function timesPorRound(p: DemoPayload): { times: TimeDaDemo[]; dono: DonoDoLado } {
  const rounds = roundsJogados(p);
  const lados = ladosPorRound(p);
  const times = timesDaPartida(lados, rounds);
  const dono: DonoDoLado = new Map();
  for (const round of rounds) {
    const doRound = lados.get(round.n);
    if (!doRound || doRound.size === 0) continue;
    const quem = donoDoLado(doRound, times);
    dono.set(round.n, { CT: times.indexOf(quem.CT) as 0 | 1, T: times.indexOf(quem.T) as 0 | 1 });
  }
  return { times: times.map((t) => ({ ladoInicial: t.ladoInicial, jogadores: [...t.jogadores] })), dono };
}

function vazio(t: TimeDaDemo): ConversaoDeTime {
  return {
    ladoInicial: t.ladoInicial,
    jogadores: [],
    rounds: 0,
    roundsGanhos: 0,
    vantagensCT: 0,
    vantagensCTGanhas: 0,
    vantagensT: 0,
    vantagensTGanhas: 0,
    plants: 0,
    plantsGanhos: 0,
  };
}

export function conversaoDaDemo(p: DemoPayload): ConversaoDeTime[] {
  const rounds = roundsJogados(p);
  const lados = ladosPorRound(p);
  const { times, dono: donoPorRound } = timesPorRound(p);
  const acc = times.map(vazio);

  const porRound = new Map<number, DemoPayload["eventos"]>();
  for (const e of p.eventos) {
    if (e.t === "rank") continue;
    if (!porRound.has(e.round)) porRound.set(e.round, []);
    porRound.get(e.round)!.push(e);
  }

  for (const round of rounds) {
    const doRound = lados.get(round.n);
    const dono = donoPorRound.get(round.n);
    if (!doRound || !dono) continue;
    const eventos = porRound.get(round.n) ?? [];
    for (const lado of LADOS) {
      const a = acc[dono[lado]];
      a.rounds++;
      if (round.vencedor === lado) a.roundsGanhos++;
    }

    const vivos: Record<Lado, Set<string>> = { CT: new Set(), T: new Set() };
    for (const [quem, lado] of doRound) vivos[lado].add(quem);
    // Round que já começa desigual não tem vantagem a converter: ele é a desigualdade.
    if (vivos.CT.size === vivos.T.size) {
      const saidas = eventos
        .filter((e) => e.t === "morte" || e.t === "saiu")
        .sort((a, b) => a.tick - b.tick);
      const abriu = new Set<Lado>();
      for (const e of saidas) {
        if (e.t === "morte") vivos[e.ladoVitima].delete(e.vitima);
        else {
          const lado = doRound.get(e.jogador);
          if (lado) vivos[lado].delete(e.jogador);
        }
        for (const lado of LADOS) {
          const outro = oposto(lado);
          if (abriu.has(lado) || vivos[outro].size < 1 || vivos[lado].size <= vivos[outro].size) continue;
          abriu.add(lado);
          const a = acc[dono[lado]];
          if (lado === "CT") {
            a.vantagensCT++;
            if (round.vencedor === "CT") a.vantagensCTGanhas++;
          } else {
            a.vantagensT++;
            if (round.vencedor === "T") a.vantagensTGanhas++;
          }
        }
      }
    }

    if (eventos.some((e) => e.t === "bomba" && e.acao === "plantada")) {
      const a = acc[dono.T];
      a.plants++;
      if (round.vencedor === "T") a.plantsGanhos++;
    }
  }

  return acc.map((c, i) => ({ ...c, jogadores: times[i].jogadores })).filter((c) => c.rounds > 0);
}

/** Total das vantagens dos dois lados — o "converteu N de M" da tela. */
export function vantagens(c: Pick<ConversaoDeTime, "vantagensCT" | "vantagensT" | "vantagensCTGanhas" | "vantagensTGanhas">): {
  situacoes: number;
  convertidas: number;
} {
  return { situacoes: c.vantagensCT + c.vantagensT, convertidas: c.vantagensCTGanhas + c.vantagensTGanhas };
}

/**
 * A linha de cada time do placar, na ordem em que as escalações vierem: a
 * demo identifica time pelo lado em que ele começou e o placar pelos cinco
 * da reserva, e o que liga os dois é quem jogou. A linha de maior
 * interseção é a certa, e uma linha nunca serve a dois times — sem
 * interseção (escalação que não bate) fica `null`, e a tela não inventa um
 * número.
 */
export function conversaoDosTimes<T extends { jogadores: unknown }>(linhas: T[], escalacoes: string[][]): (T | null)[] {
  const pares = linhas.flatMap((linha) => {
    const escalacao = new Set(Array.isArray(linha.jogadores) ? (linha.jogadores as unknown[]).map(String) : []);
    return escalacoes.map((steamIds, i) => ({ linha, i, n: steamIds.filter((s) => escalacao.has(s)).length }));
  });
  const resposta: (T | null)[] = escalacoes.map(() => null);
  const usadas = new Set<T>();
  for (const par of pares.sort((a, b) => b.n - a.n)) {
    if (par.n === 0 || usadas.has(par.linha) || resposta[par.i]) continue;
    resposta[par.i] = par.linha;
    usadas.add(par.linha);
  }
  return resposta;
}
