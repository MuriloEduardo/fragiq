import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoPayload, type DemoPayload, type Evento, type Lado } from "@/lib/demo/payload";
import { mediana, ritmoDaDemo, ritmoDosRounds } from "@/lib/demo/ritmo";
import { TICKS_POR_S } from "@/lib/demo/metricas";

/** A mesma partida real de Premier em Ancient dos outros testes de demo. */
const ancient = demoPayload.parse(JSON.parse(readFileSync(new URL("../fixtures/demo-ancient.json", import.meta.url), "utf8")));

const TIME1 = ["a1", "a2", "a3", "a4", "a5"];
const TIME2 = ["b1", "b2", "b3", "b4", "b5"];

const base = (n: number) => n * 10_000;
/** O fim do freeze — o zero de todo segundo medido aqui. */
const jogo = (n: number) => base(n) + 200;
const s = (n: number, segundos: number) => jogo(n) + segundos * TICKS_POR_S;

type RoundSpec = { n: number; ct: string[]; t: string[]; vencedor: Lado; motivo?: string; semFreeze?: boolean; eventos?: Evento[] };

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
    rounds: rounds.map((r) => ({
      n: r.n,
      inicio: base(r.n),
      jogo: r.semFreeze ? null : jogo(r.n),
      fim: base(r.n) + 9_000,
      vencedor: r.vencedor,
      motivo: r.motivo ?? null,
    })),
    eventos: eventos.sort((a, b) => a.tick - b.tick),
    tiros: {},
  };
}

function morte(round: number, segundos: number, autor: string, ladoAutor: Lado, vitima: string, ladoVitima: Lado): Evento {
  return {
    t: "morte",
    tick: s(round, segundos),
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

const dano = (round: number, segundos: number, autor: string, vitima: string, arma = "ak47"): Evento => ({
  t: "dano",
  tick: s(round, segundos),
  round,
  vitima,
  autor,
  arma,
  vida: 20,
  colete: 0,
  parte: "chest",
  restou: 80,
});

const cego = (round: number, segundos: number, autor: string, vitima: string): Evento => ({
  t: "cego",
  tick: s(round, segundos),
  round,
  vitima,
  autor,
  segundos: 2,
});

const plantada = (round: number, segundos: number, autor: string): Evento => ({
  t: "bomba",
  tick: s(round, segundos),
  round,
  acao: "plantada",
  autor,
  site: "A",
});

const plantando = (round: number, segundos: number, autor: string): Evento => ({
  t: "bomba",
  tick: s(round, segundos),
  round,
  acao: "plantando",
  autor,
  site: "A",
});

/** O round em que o TIME1 está de CT. */
const comoCT = (n: number, vencedor: Lado, eventos: Evento[] = [], extra: Partial<RoundSpec> = {}): RoundSpec => ({ n, ct: TIME1, t: TIME2, vencedor, eventos, ...extra });
/** O mesmo depois da troca: TIME1 de T. */
const comoT = (n: number, vencedor: Lado, eventos: Evento[] = []): RoundSpec => ({ n, ct: TIME2, t: TIME1, vencedor, eventos });

const time1 = (p: DemoPayload) => ritmoDaDemo(p).find((r) => r.ladoInicial === "CT")!;
const time2 = (p: DemoPayload) => ritmoDaDemo(p).find((r) => r.ladoInicial === "T")!;

describe("ritmo — o round", () => {
  it("o zero é o fim do freeze, e o contato é o primeiro dano entre lados opostos", () => {
    const p = partida([comoCT(1, "CT", [dano(1, 12, "a1", "b1"), morte(1, 20, "a1", "CT", "b1", "T")])]);
    expect(ritmoDosRounds(p)).toEqual([{ n: 1, contato: 12, plant: null }]);
  });

  it("morte sem dano registrado antes também é contato", () => {
    const p = partida([comoCT(1, "CT", [morte(1, 9, "a1", "CT", "b1", "T")])]);
    expect(ritmoDosRounds(p)[0].contato).toBe(9);
  });

  it("dano em aliado, em si mesmo e flash não são contato", () => {
    const p = partida([
      comoCT(1, "CT", [
        cego(1, 5, "a1", "b1"),
        dano(1, 6, "a1", "a2"),
        dano(1, 7, "b1", "b1", "world"),
        dano(1, 30, "a1", "b1"),
      ]),
    ]);
    expect(ritmoDosRounds(p)[0].contato).toBe(30);
  });

  it("o que queima antes do fim do freeze é do round passado, não o contato deste", () => {
    // Molotov do round anterior ainda ardendo depois do round_start: o
    // tick cai neste round, mas ninguém andou ainda.
    const p = partida([comoCT(1, "CT", [dano(1, -1, "a1", "b1", "inferno"), dano(1, 25, "a1", "b1")])]);
    expect(ritmoDosRounds(p)[0].contato).toBe(25);
  });

  it("round sem ninguém se tocando fica sem contato, e isso não é zero", () => {
    expect(ritmoDosRounds(partida([comoCT(1, "CT", [])]))[0].contato).toBeNull();
  });

  it("a plantada é medida quando a bomba fica plantada, não quando começa a plantar", () => {
    const p = partida([comoCT(1, "T", [plantando(1, 40, "b1"), plantada(1, 43, "b1")])]);
    expect(ritmoDosRounds(p)[0].plant).toBe(43);
  });

  it("round sem fim de freeze não tem segundo nenhum: sem zero não há medida", () => {
    const p = partida([comoCT(1, "CT", [morte(1, 10, "a1", "CT", "b1", "T")], { semFreeze: true }), comoCT(2, "CT", [morte(2, 20, "a1", "CT", "b1", "T")])]);
    expect(ritmoDosRounds(p)).toEqual([{ n: 2, contato: 20, plant: null }]);
  });

  it("round de rendição não é round jogado, aqui como na conversão", () => {
    const p = partida([comoCT(1, "CT", [morte(1, 10, "a1", "CT", "b1", "T")], { motivo: "t_surrender" })]);
    expect(ritmoDosRounds(p)).toEqual([]);
  });
});

describe("ritmo — o time", () => {
  it("o contato do round vale para os dois times, separado pelo lado de cada um", () => {
    const p = partida([comoCT(1, "CT", [morte(1, 10, "a1", "CT", "b1", "T")]), comoT(2, "T", [morte(2, 30, "a1", "T", "b1", "CT")])]);
    // O TIME1 jogou de CT no round 1 (contato aos 10 s) e de T no 2 (aos 30 s); para o TIME2 é o espelho.
    expect(time1(p)).toMatchObject({ segundoContatoCT: 10, contatosCT: 1, segundoContatoT: 30, contatosT: 1 });
    expect(time2(p)).toMatchObject({ segundoContatoCT: 30, contatosCT: 1, segundoContatoT: 10, contatosT: 1 });
  });

  it("a mediana ignora o round em que ninguém se tocou, e a base diz quantos entraram", () => {
    const p = partida([
      comoCT(1, "CT", [morte(1, 10, "a1", "CT", "b1", "T")]),
      comoCT(2, "CT", []),
      comoCT(3, "CT", [morte(3, 20, "a1", "CT", "b1", "T")]),
      comoCT(4, "CT", [morte(4, 90, "a1", "CT", "b1", "T")]),
    ]);
    expect(time1(p)).toMatchObject({ segundoContatoCT: 20, contatosCT: 3 });
  });

  it("a mediana de um número par de rounds é a média dos dois do meio", () => {
    const p = partida([
      comoCT(1, "CT", [morte(1, 10, "a1", "CT", "b1", "T")]),
      comoCT(2, "CT", [morte(2, 20, "a1", "CT", "b1", "T")]),
      comoCT(3, "CT", [morte(3, 30, "a1", "CT", "b1", "T")]),
      comoCT(4, "CT", [morte(4, 50, "a1", "CT", "b1", "T")]),
    ]);
    expect(time1(p).segundoContatoCT).toBe(25);
  });

  it("um round lento não move o ritmo: é mediana, não média", () => {
    const rounds = [1, 2, 3].map((n) => comoCT(n, "CT", [morte(n, 15, "a1", "CT", "b1", "T")]));
    const normal = partida(rounds);
    const comSave = partida([...rounds, comoCT(4, "CT", [morte(4, 100, "a1", "CT", "b1", "T")])]);
    expect(time1(normal).segundoContatoCT).toBe(15);
    expect(time1(comSave).segundoContatoCT).toBe(15);
  });

  it("a plantada é do time que estava de T naquele round", () => {
    const p = partida([comoCT(1, "T", [plantada(1, 40, "b1")]), comoT(2, "T", [plantada(2, 60, "a1")])]);
    expect(time2(p).segundoPlant).toBe(40);
    expect(time1(p).segundoPlant).toBe(60);
  });

  it("time que nunca plantou nem se tocou fica com tudo nulo, não com zeros", () => {
    const p = partida([comoCT(1, "CT", [])]);
    expect(time1(p)).toEqual({ ladoInicial: "CT", segundoContatoCT: null, contatosCT: 0, segundoContatoT: null, contatosT: 0, segundoPlant: null });
  });

  it("lista vazia não tem mediana", () => {
    expect(mediana([])).toBeNull();
    expect(mediana([0])).toBe(0);
  });
});

describe("ritmo — partida real", () => {
  const r = ritmoDosRounds(ancient);
  const iniciouCT = ritmoDaDemo(ancient).find((x) => x.ladoInicial === "CT")!;
  const iniciouT = ritmoDaDemo(ancient).find((x) => x.ladoInicial === "T")!;

  it("os sete rounds jogados têm contato, e o round 5 é o lento da partida", () => {
    // Conferido fora daqui, direto no fixture: 13,1 · 9,3 · 8,3 · 12,9 · 54,6 · 8,6 · 8,3.
    expect(r.map((x) => x.contato)).toEqual([13.1, 9.3, 8.3, 12.9, 54.6, 8.6, 8.3]);
    expect(r.filter((x) => x.plant != null).map((x) => [x.n, x.plant])).toEqual([
      [1, 23.9],
      [7, 109.5],
    ]);
  });

  it("ninguém trocou de lado em 8 rounds: cada time tem um lado só, e os dois medem o mesmo contato", () => {
    expect(iniciouCT).toMatchObject({ segundoContatoCT: 9.3, contatosCT: 7, segundoContatoT: null, contatosT: 0 });
    expect(iniciouT).toMatchObject({ segundoContatoT: 9.3, contatosT: 7, segundoContatoCT: null, contatosCT: 0 });
    // Mediana e não média: o round de 54,6 s não empurra o ritmo dos outros seis.
    expect(r.reduce((soma, x) => soma + (x.contato ?? 0), 0) / 7).toBeGreaterThan(15);
  });

  it("as duas plantadas são do time que começou de T", () => {
    expect(iniciouT.segundoPlant).toBe(66.7);
    expect(iniciouCT.segundoPlant).toBeNull();
  });
});
