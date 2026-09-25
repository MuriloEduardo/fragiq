import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoPayload, type DemoPayload, type Economia, type Evento, type Lado } from "@/lib/demo/payload";
import { classe, economiaDaDemo, economiaDosRounds, LIMITE_CHEIA, LIMITE_ECO, porCompraDaDemo } from "@/lib/demo/economia";
import { metricasDaDemo } from "@/lib/demo/metricas";

/** A mesma partida real de Premier em Ancient dos outros testes de demo — lida em payload v1, sem economia. */
const ancient = demoPayload.parse(JSON.parse(readFileSync(new URL("../fixtures/demo-ancient.json", import.meta.url), "utf8")));

const TIME1 = ["a1", "a2", "a3", "a4", "a5"];
const TIME2 = ["b1", "b2", "b3", "b4", "b5"];

const base = (n: number) => n * 10_000;

/** Quanto cada um do lado carrega; um número vale para os cinco. */
type RoundSpec = { n: number; ct: string[]; t: string[]; vencedor: Lado; motivo?: string; equipCT?: number | number[]; equipT?: number | number[] };

const amostra = (lado: Lado, jogadores: string[], equip: number | number[] | undefined): Economia[] =>
  equip == null ? [] : jogadores.map((steamId, i) => ({ steamId, lado, saldo: 100, equipamento: Array.isArray(equip) ? equip[i] : equip }));

function partida(rounds: RoundSpec[], versao = 2): DemoPayload {
  const eventos: Evento[] = [];
  for (const r of rounds) {
    for (const [lado, jogadores] of [["CT", r.ct], ["T", r.t]] as const) {
      for (const jogador of jogadores) eventos.push({ t: "zona", tick: base(r.n) + 100, round: r.n, jogador, lado, zona: "Spawn" });
    }
  }
  return {
    versao,
    parser: "teste",
    mapa: "de_teste",
    servidor: null,
    ticks: base(rounds.length + 1),
    jogadores: [...TIME1, ...TIME2].map((steamId) => ({ steamId, nome: steamId })),
    rounds: rounds.map((r) => ({
      n: r.n,
      inicio: base(r.n),
      jogo: base(r.n) + 200,
      fim: base(r.n) + 9_000,
      vencedor: r.vencedor,
      motivo: r.motivo ?? null,
      ...(versao >= 2 ? { economia: [...amostra("CT", r.ct, r.equipCT), ...amostra("T", r.t, r.equipT)] } : {}),
    })),
    eventos,
    tiros: {},
  };
}

/** TIME1 de CT; depois da troca, `comoT`. */
const comoCT = (n: number, vencedor: Lado, equipCT: number | number[], equipT: number | number[], extra: Partial<RoundSpec> = {}): RoundSpec => ({
  n,
  ct: TIME1,
  t: TIME2,
  vencedor,
  equipCT,
  equipT,
  ...extra,
});
const comoT = (n: number, vencedor: Lado, equipCT: number, equipT: number): RoundSpec => ({ n, ct: TIME2, t: TIME1, vencedor, equipCT, equipT });

const time1 = (p: DemoPayload) => economiaDaDemo(p).find((e) => e.ladoInicial === "CT")!;
const time2 = (p: DemoPayload) => economiaDaDemo(p).find((e) => e.ladoInicial === "T")!;
const classes = (p: DemoPayload, time: 0 | 1) => economiaDosRounds(p).filter((l) => l.time === time).map((l) => [l.n, l.classe]);

describe("economia — o contrato", () => {
  it("demo lida em payload v1 continua válida e não ganha classe inventada", () => {
    expect(ancient.rounds.every((r) => r.economia === undefined)).toBe(true);
    expect(economiaDosRounds(ancient)).toEqual([]);
    expect(economiaDaDemo(ancient)).toEqual([]);
    const v1 = partida([comoCT(1, "CT", 800, 800)], 1);
    expect(demoPayload.safeParse(v1).success).toBe(true);
    expect(economiaDaDemo(v1)).toEqual([]);
  });

  it("o payload v2 valida com a amostra, e recusa dinheiro negativo", () => {
    const v2 = partida([comoCT(1, "CT", 800, 800)]);
    expect(demoPayload.parse(v2).rounds[0].economia).toHaveLength(10);
    const ruim = structuredClone(v2);
    ruim.rounds[0].economia![0].saldo = -1;
    expect(demoPayload.safeParse(ruim).success).toBe(false);
  });
});

describe("economia — a classe", () => {
  it("eco abaixo de 1 500 por jogador, compra cheia a partir de 3 500, meia entre os dois", () => {
    expect([LIMITE_ECO, LIMITE_CHEIA]).toEqual([1500, 3500]);
    expect(classe(1499, false)).toBe("eco");
    expect(classe(1500, false)).toBe("meia");
    expect(classe(3499, false)).toBe("meia");
    expect(classe(3500, false)).toBe("cheia");
  });

  it("o primeiro round de cada metade com dinheiro de eco é pistol; o segundo, com o mesmo dinheiro, é eco", () => {
    const p = partida([comoCT(1, "CT", 900, 1000), comoCT(2, "CT", 4500, 1000), comoT(3, "T", 850, 1000), comoT(4, "CT", 4700, 1200)]);
    expect(classes(p, 0)).toEqual([
      [1, "pistol"],
      [2, "cheia"],
      [3, "pistol"],
      [4, "eco"],
    ]);
    expect(classes(p, 1)).toEqual([
      [1, "pistol"],
      [2, "eco"],
      [3, "pistol"],
      [4, "cheia"],
    ]);
  });

  it("a prorrogação começa depois de uma troca, mas com dinheiro de compra cheia: não é pistol", () => {
    const p = partida([comoCT(1, "CT", 900, 900), comoT(2, "T", 4400, 4100)]);
    expect(classes(p, 0)).toEqual([
      [1, "pistol"],
      [2, "cheia"],
    ]);
  });

  it("a classe sai da média de quem estava no lado: quatro de fuzil contra cinco não viram eco", () => {
    const quatro = ["a1", "a2", "a3", "a4"];
    const p = partida([comoCT(1, "CT", 900, 900), comoCT(2, "T", 4000, [2000, 2000, 1000, 1000, 1000], { ct: quatro })]);
    const round2 = economiaDosRounds(p).filter((l) => l.n === 2);
    // Pela soma, os quatro (16 000) ficariam abaixo dos cinco de uma compra cheia (17 500).
    expect(round2).toEqual([
      { n: 2, time: 0, lado: "CT", classe: "cheia", equipamento: 4000, venceu: false },
      { n: 2, time: 1, lado: "T", classe: "eco", equipamento: 1400, venceu: true },
    ]);
  });

  it("round rendido não é jogado, e lado sem amostra fica sem linha", () => {
    const p = partida([comoCT(1, "CT", 900, 900), comoCT(2, "T", 4000, 4000, { motivo: "ct_surrender" }), { ...comoCT(3, "CT", 4000, 4000), equipT: undefined }]);
    expect(economiaDosRounds(p).map((l) => [l.n, l.lado])).toEqual([
      [1, "CT"],
      [1, "T"],
      [3, "CT"],
    ]);
  });
});

describe("economia — o time", () => {
  it("conta rounds e vitórias por classe, e segue o time depois da troca de lado", () => {
    const p = partida([
      comoCT(1, "T", 900, 900),
      comoCT(2, "CT", 1200, 3000),
      comoCT(3, "CT", 4500, 1100),
      comoT(4, "CT", 900, 950),
      comoT(5, "T", 4200, 2800),
    ]);
    expect(time1(p)).toEqual({ ladoInicial: "CT", pistol: 2, pistolGanhos: 0, eco: 1, ecoGanhos: 1, meia: 1, meiaGanhas: 1, cheia: 1, cheiaGanhas: 1 });
    expect(time2(p)).toEqual({ ladoInicial: "T", pistol: 2, pistolGanhos: 2, eco: 1, ecoGanhos: 0, meia: 1, meiaGanhas: 0, cheia: 1, cheiaGanhas: 0 });
  });
});

describe("economia — ADR e kills por compra", () => {
  const dano = (round: number, autor: string, vitima: string, vida: number, restou: number, tick = 500): Evento => ({
    t: "dano",
    tick: base(round) + tick,
    round,
    vitima,
    autor,
    arma: "ak47",
    vida,
    colete: 0,
    parte: "chest",
    restou,
  });
  const morte = (round: number, autor: string, ladoAutor: Lado, vitima: string, ladoVitima: Lado, tick = 600): Evento => ({
    t: "morte",
    tick: base(round) + tick,
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
  });

  it("separa pela compra do time do jogador, com as definições das métricas", () => {
    const p = partida([comoCT(1, "CT", 900, 900), comoCT(2, "T", 1000, 4000), comoT(3, "CT", 4000, 4000)]);
    p.eventos.push(
      dano(1, "a1", "b1", 100, 0),
      morte(1, "a1", "CT", "b1", "T"),
      // 108 num jogador que tinha 30 conta 30.
      dano(2, "a1", "b2", 70, 30, 400),
      dano(2, "a1", "b2", 108, 0, 500),
      dano(2, "b3", "a1", 100, 0),
      morte(2, "b3", "T", "a1", "CT"),
      dano(3, "a1", "b1", 50, 50),
    );
    const a1 = porCompraDaDemo(p).get("a1")!;
    expect(a1).toEqual({
      pistol: { rounds: 1, kills: 1, dano: 100 },
      eco: { rounds: 1, kills: 0, dano: 100 },
      cheia: { rounds: 1, kills: 0, dano: 50 },
    });
    expect(porCompraDaDemo(p).get("b3")).toEqual({ pistol: { rounds: 1, kills: 0, dano: 0 }, cheia: { rounds: 2, kills: 1, dano: 100 } });
    // A soma das classes é o total da partida, quando todo round tem amostra.
    const total = metricasDaDemo(p).find((m) => m.steamId === "a1")!;
    const soma = Object.values(a1).reduce((s, c) => ({ rounds: s.rounds + c.rounds, kills: s.kills + c.kills, dano: s.dano + c.dano }), { rounds: 0, kills: 0, dano: 0 });
    expect(soma).toEqual({ rounds: total.rounds, kills: total.kills, dano: total.dano });
  });

  it("demo sem amostra não ganha recorte, e round sem amostra fica fora", () => {
    expect(porCompraDaDemo(ancient).size).toBe(0);
    const p = partida([comoCT(1, "CT", 900, 900), { ...comoCT(2, "CT", 4000, 4000), equipCT: undefined }]);
    expect(porCompraDaDemo(p).get("a1")).toEqual({ pistol: { rounds: 1, kills: 0, dano: 0 } });
    expect(porCompraDaDemo(p).get("b1")).toEqual({ pistol: { rounds: 1, kills: 0, dano: 0 }, cheia: { rounds: 1, kills: 0, dano: 0 } });
  });
});
