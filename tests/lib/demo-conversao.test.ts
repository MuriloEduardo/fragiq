import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoPayload, type DemoPayload, type Evento, type Lado } from "@/lib/demo/payload";
import { conversaoDaDemo, conversaoDosTimes, vantagens } from "@/lib/demo/conversao";

/** A mesma partida real de Premier em Ancient de `demo-metricas.test.ts`: 8 rounds, um jogador saiu no 3º, rendição no 8º. */
const ancient = demoPayload.parse(JSON.parse(readFileSync(new URL("../fixtures/demo-ancient.json", import.meta.url), "utf8")));

const TIME1 = ["a1", "a2", "a3", "a4", "a5"];
const TIME2 = ["b1", "b2", "b3", "b4", "b5"];

type RoundSpec = {
  n: number;
  /** Quem estava de cada lado neste round; a troca do intervalo é trocar as duas listas. */
  ct: string[];
  t: string[];
  vencedor: Lado;
  motivo?: string;
  eventos?: Evento[];
};

const base = (n: number) => n * 10_000;

/** Uma partida sintética: cada round declara quem esteve de cada lado, quem venceu e o que aconteceu. */
function partida(rounds: RoundSpec[]): DemoPayload {
  const eventos: Evento[] = [];
  for (const r of rounds) {
    for (const [lado, jogadores] of [["CT", r.ct], ["T", r.t]] as const) {
      for (const jogador of jogadores) eventos.push({ t: "zona", tick: base(r.n) + 100, round: r.n, jogador, lado, zona: "Spawn" });
    }
    eventos.push(...(r.eventos ?? []));
  }
  return {
    versao: 1,
    parser: "teste",
    mapa: "de_teste",
    servidor: null,
    ticks: base(rounds.length + 1),
    jogadores: [...TIME1, ...TIME2].map((steamId) => ({ steamId, nome: steamId })),
    rounds: rounds.map((r) => ({ n: r.n, inicio: base(r.n), jogo: base(r.n) + 200, fim: base(r.n) + 9_000, vencedor: r.vencedor, motivo: r.motivo ?? null })),
    eventos: eventos.sort((a, b) => a.tick - b.tick),
    tiros: {},
  };
}

function morte(round: number, dt: number, autor: string, ladoAutor: Lado, vitima: string, ladoVitima: Lado): Evento {
  return {
    t: "morte",
    tick: base(round) + dt,
    round,
    vitima,
    ladoVitima,
    zonaVitima: null,
    autor,
    ladoAutor,
    zonaAutor: null,
    assistente: null,
    flashAssist: false,
    arma: "ak47",
    hs: false,
    atravesSmoke: false,
    cego: false,
    noscope: false,
    penetrou: false,
    distancia: 10,
    pos: null,
    posAutor: null,
  };
}

const saiu = (round: number, dt: number, jogador: string): Evento => ({ t: "saiu", tick: base(round) + dt, round, jogador, motivo: 79 });
const plantada = (round: number, dt: number, autor: string): Evento => ({ t: "bomba", tick: base(round) + dt, round, acao: "plantada", autor, site: "A" });

/** O round em que o TIME1 está de CT, com quem venceu e o que aconteceu. */
const comoCT = (n: number, vencedor: Lado, eventos: Evento[] = [], motivo?: string): RoundSpec => ({ n, ct: TIME1, t: TIME2, vencedor, eventos, motivo });
/** O mesmo round depois da troca de lados: TIME1 de T. */
const comoT = (n: number, vencedor: Lado, eventos: Evento[] = []): RoundSpec => ({ n, ct: TIME2, t: TIME1, vencedor, eventos });

const time1 = (p: DemoPayload) => conversaoDaDemo(p).find((c) => c.ladoInicial === "CT")!;
const time2 = (p: DemoPayload) => conversaoDaDemo(p).find((c) => c.ladoInicial === "T")!;

describe("conversão do time — partida real", () => {
  const c = conversaoDaDemo(ancient);
  const iniciouCT = c.find((x) => x.ladoInicial === "CT")!;
  const iniciouT = c.find((x) => x.ladoInicial === "T")!;

  it("dois times de cinco, sete rounds jogados cada (o 8º foi rendição) e os rounds ganhos fecham o placar", () => {
    expect(c).toHaveLength(2);
    expect(iniciouCT.jogadores).toHaveLength(5);
    expect(iniciouT.jogadores).toHaveLength(5);
    expect(iniciouCT.jogadores.some((j) => iniciouT.jogadores.includes(j))).toBe(false);
    expect(iniciouCT.rounds).toBe(7);
    expect(iniciouT.rounds).toBe(7);
    expect(iniciouCT.roundsGanhos).toBe(5);
    expect(iniciouT.roundsGanhos).toBe(2);
  });

  it("as vantagens são as dos três rounds que começaram iguais — os outros quatro já começaram 5v4", () => {
    // Rounds 1, 2 e 3 começam 5v5; do 4º em diante um jogador já tinha saído da partida.
    expect(vantagens(iniciouCT)).toEqual({ situacoes: 2, convertidas: 2 });
    expect(vantagens(iniciouT)).toEqual({ situacoes: 2, convertidas: 1 });
    // Ninguém trocou de lado em 8 rounds: quem começou de CT não tem vantagem de T.
    expect(iniciouCT.vantagensT).toBe(0);
    expect(iniciouT.vantagensCT).toBe(0);
  });

  it("os dois plants da partida são do time que começou de T, e os dois viraram round", () => {
    expect(iniciouT).toMatchObject({ plants: 2, plantsGanhos: 2 });
    expect(iniciouCT).toMatchObject({ plants: 0, plantsGanhos: 0 });
  });
});

describe("conversão do time — regras", () => {
  it("5v4 conta uma vez e é convertido quando o round é do lado que abriu", () => {
    const ganho = partida([comoCT(1, "CT", [morte(1, 500, "a1", "CT", "b1", "T"), morte(1, 900, "a2", "CT", "b2", "T")])]);
    expect(time1(ganho)).toMatchObject({ vantagensCT: 1, vantagensCTGanhas: 1, rounds: 1, roundsGanhos: 1 });
    expect(time2(ganho)).toMatchObject({ vantagensCT: 0, vantagensT: 0, roundsGanhos: 0 });

    const perdido = partida([comoCT(1, "T", [morte(1, 500, "a1", "CT", "b1", "T")])]);
    expect(time1(perdido)).toMatchObject({ vantagensCT: 1, vantagensCTGanhas: 0 });
  });

  it("vantagem que troca de mão conta para os dois, e só um converteu", () => {
    const p = partida([
      comoCT(1, "CT", [
        morte(1, 300, "a1", "CT", "b1", "T"), // 5v4 para o TIME1
        morte(1, 400, "b2", "T", "a1", "CT"),
        morte(1, 500, "b2", "T", "a2", "CT"),
        morte(1, 600, "b2", "T", "a3", "CT"), // 4v2 para o TIME2
        morte(1, 700, "a4", "CT", "b2", "T"),
        morte(1, 800, "a4", "CT", "b3", "T"),
        morte(1, 900, "a4", "CT", "b4", "T"),
      ]),
    ]);
    expect(vantagens(time1(p))).toEqual({ situacoes: 1, convertidas: 1 });
    expect(vantagens(time2(p))).toEqual({ situacoes: 1, convertidas: 0 });
  });

  it("round que já começa desigual fica fora do denominador, mas continua sendo round jogado", () => {
    const p = partida([
      { n: 1, ct: TIME1, t: TIME2.slice(1), vencedor: "CT", eventos: [morte(1, 500, "a1", "CT", "b2", "T")] },
    ]);
    expect(time1(p)).toMatchObject({ rounds: 1, roundsGanhos: 1, vantagensCT: 0 });
    expect(time2(p)).toMatchObject({ rounds: 1, roundsGanhos: 0 });
  });

  it("quem sai no meio do round entrega a vantagem ao outro lado, sem morte nenhuma", () => {
    const p = partida([comoCT(1, "T", [saiu(1, 400, "a1")])]);
    expect(time2(p)).toMatchObject({ vantagensT: 1, vantagensTGanhas: 1 });
    expect(time1(p).vantagensCT).toBe(0);
  });

  it("a última morte não é vantagem: o 1v0 do clutch é o round ganho, não uma situação convertida", () => {
    // O TIME1 perde quatro e o último vivo mata os cinco: ele nunca esteve à frente antes do 1v0.
    const p = partida([
      comoCT(1, "CT", [
        ...[2, 3, 4, 5].map((i, k) => morte(1, 300 + k * 100, "b1", "T", `a${i}`, "CT")),
        ...[1, 2, 3, 4, 5].map((i, k) => morte(1, 1000 + k * 100, "a1", "CT", `b${i}`, "T")),
      ]),
    ]);
    expect(vantagens(time1(p))).toEqual({ situacoes: 0, convertidas: 0 });
    // O outro lado teve a vantagem de verdade — 5v4 na primeira morte — e a perdeu.
    expect(vantagens(time2(p))).toEqual({ situacoes: 1, convertidas: 0 });

    // E a vantagem que existiu antes do wipe continua contando uma vez só.
    const wipe = partida([comoCT(1, "CT", [1, 2, 3, 4, 5].map((i, k) => morte(1, 300 + k * 100, "a1", "CT", `b${i}`, "T")))]);
    expect(vantagens(time1(wipe))).toEqual({ situacoes: 1, convertidas: 1 });
  });

  it("a plantada é do time que está de T naquele round, e venceu se o round foi do T", () => {
    const p = partida([comoCT(1, "T", [plantada(1, 600, "b1")]), comoCT(2, "CT", [plantada(2, 600, "b1")])]);
    expect(time2(p)).toMatchObject({ plants: 2, plantsGanhos: 1 });
    expect(time1(p)).toMatchObject({ plants: 0, plantsGanhos: 0 });
  });

  it("depois da troca de lados os números continuam com o time, separados pelo lado do round", () => {
    const p = partida([
      comoCT(1, "CT", [morte(1, 500, "a1", "CT", "b1", "T")]),
      comoT(2, "T", [morte(2, 500, "a1", "T", "b1", "CT"), plantada(2, 900, "a1")]),
    ]);
    const t1 = time1(p);
    expect(t1).toMatchObject({ rounds: 2, roundsGanhos: 2, vantagensCT: 1, vantagensCTGanhas: 1, vantagensT: 1, vantagensTGanhas: 1, plants: 1, plantsGanhos: 1 });
    expect(vantagens(t1)).toEqual({ situacoes: 2, convertidas: 2 });
    expect(time2(p)).toMatchObject({ rounds: 2, roundsGanhos: 0, plants: 0 });
  });

  it("round de rendição não é round jogado", () => {
    const p = partida([comoCT(1, "CT", [morte(1, 500, "a1", "CT", "b1", "T")]), comoCT(2, "CT", [morte(2, 500, "a1", "CT", "b1", "T")], "t_surrender")]);
    expect(time1(p).rounds).toBe(1);
    expect(vantagens(time1(p))).toEqual({ situacoes: 1, convertidas: 1 });
  });

  it("demo sem round jogado não produz linha de time nenhuma", () => {
    expect(conversaoDaDemo(partida([comoCT(1, "CT", [], "t_surrender")]))).toHaveLength(0);
  });
});

describe("casar a linha da demo com o time do placar", () => {
  const ct = { ladoInicial: "CT", jogadores: TIME1 };
  const t = { ladoInicial: "T", jogadores: TIME2 };

  it("cada time do placar fica com a linha de quem jogou nele, em qualquer ordem", () => {
    expect(conversaoDosTimes([ct, t], [TIME2, TIME1])).toEqual([t, ct]);
    expect(conversaoDosTimes([t, ct], [TIME1, TIME2])).toEqual([ct, t]);
  });

  it("escalação que não bate com nenhuma linha não ganha número", () => {
    expect(conversaoDosTimes([ct, t], [["z1", "z2"], TIME2])).toEqual([null, t]);
    expect(conversaoDosTimes([], [TIME1, TIME2])).toEqual([null, null]);
  });

  it("uma linha não serve a dois times: quem tem mais gente dela fica com ela", () => {
    const [a, b] = conversaoDosTimes([ct, t], [TIME1, [TIME1[0], ...TIME2.slice(0, 2)]]);
    expect(a).toBe(ct);
    expect(b).toBe(t);
  });
});
