import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoPayload, type DemoPayload, type Evento } from "@/lib/demo/payload";
import { JANELA_TROCA_TICKS, metricasDaDemo, REGRAS_VERSAO } from "@/lib/demo/metricas";

/**
 * A fixture é uma partida real de Premier em Ancient (demo pública do
 * conjunto de testes do awpy), reduzida por `bot/src/demo-parse.ts`:
 * 8 rounds, um jogador saiu no 3º, rendição no 8º. Nomes trocados.
 */
const ancient = demoPayload.parse(JSON.parse(readFileSync(new URL("../fixtures/demo-ancient.json", import.meta.url), "utf8")));

const A = "1", B = "2", C = "3", X = "8", Y = "9", Z = "10";

/** Um round de 3×3 com todos presentes desde o tick 100 (freeze acaba em 200) e o que mais se pedir. */
function round(eventos: Evento[], vencedor: "CT" | "T" = "CT", motivo = "t_killed"): DemoPayload {
  const presenca: Evento[] = [
    ...[A, B, C].map((j) => ({ t: "zona" as const, tick: 100, round: 1, jogador: j, lado: "CT" as const, zona: "CTSpawn" })),
    ...[X, Y, Z].map((j) => ({ t: "zona" as const, tick: 100, round: 1, jogador: j, lado: "T" as const, zona: "TSpawn" })),
  ];
  return {
    versao: 1,
    parser: "teste",
    mapa: "de_teste",
    servidor: null,
    ticks: 10_000,
    jogadores: [A, B, C, X, Y, Z].map((steamId) => ({ steamId, nome: steamId })),
    rounds: [{ n: 1, inicio: 0, jogo: 200, fim: 10_000, vencedor, motivo }],
    eventos: [...presenca, ...eventos].sort((a, b) => a.tick - b.tick),
    tiros: {},
  };
}

function morte(tick: number, autor: string | null, ladoAutor: "CT" | "T" | null, vitima: string, ladoVitima: "CT" | "T", extra: Partial<Extract<Evento, { t: "morte" }>> = {}): Evento {
  return {
    t: "morte",
    tick,
    round: 1,
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
    ...extra,
  };
}

const dano = (tick: number, autor: string, vitima: string, vida: number, restou: number, arma = "ak47"): Evento => ({
  t: "dano",
  tick,
  round: 1,
  vitima,
  autor,
  arma,
  vida,
  colete: 0,
  parte: "chest",
  restou,
});

const de = (m: ReturnType<typeof metricasDaDemo>, id: string) => m.find((x) => x.steamId === id)!;

describe("métricas da demo — partida real", () => {
  const m = metricasDaDemo(ancient);

  it("dez jogadores; quem saiu no 3º round conta três rounds, os outros sete (o 8º foi rendição)", () => {
    expect(m).toHaveLength(10);
    expect(de(m, "76561199311359933").rounds).toBe(3);
    expect(m.filter((x) => x.rounds === 7)).toHaveLength(9);
  });

  it("toda kill é a morte de um inimigo: as somas fecham", () => {
    const kills = m.reduce((s, x) => s + x.kills, 0);
    const mortesPorInimigo = ancient.eventos.filter((e) => e.t === "morte" && e.round >= 1 && e.autor && e.ladoAutor && e.ladoAutor !== e.ladoVitima).length;
    expect(kills).toBe(mortesPorInimigo);
    expect(m.reduce((s, x) => s + x.dano, 0)).toBe(m.reduce((s, x) => s + x.danoSofrido, 0));
    expect(m.reduce((s, x) => s + x.aberturas, 0)).toBe(7);
    expect(m.reduce((s, x) => s + x.aberturasPerdidas, 0)).toBe(7);
  });

  it("o CS Rating do Premier vem do rank_update: tipo 11, antes e depois", () => {
    expect(de(m, "76561198826243397").rating).toEqual({ tipo: 11, antes: 17628, depois: 17990, mudanca: 362, vitorias: 48 });
    // Quem abandonou levou −1000.
    expect(de(m, "76561199311359933").rating?.mudanca).toBe(-1000);
  });

  it("ADR e KAST ficam dentro do que uma partida permite", () => {
    for (const x of m) {
      expect(x.adr).toBeGreaterThanOrEqual(0);
      expect(x.adr).toBeLessThanOrEqual(500);
      expect(x.kast).toBeGreaterThanOrEqual(0);
      expect(x.kast).toBeLessThanOrEqual(1);
      expect(x.sobreviveu + x.deaths).toBeGreaterThanOrEqual(x.rounds);
    }
  });

  it("zonas somam segundos por lado e só nos lados jogados", () => {
    const z = de(m, "76561198826243397").zonas;
    expect(Object.keys(z.T)).toHaveLength(0);
    expect(z.CT.BombsiteA).toBeGreaterThan(100);
  });
});

describe("métricas da demo — regras", () => {
  it("abertura é a primeira morte do round; kill de aliado não conta nem abre", () => {
    const m = metricasDaDemo(round([morte(300, A, "CT", B, "CT"), morte(400, X, "T", A, "CT"), morte(500, B, "CT", Y, "T")]));
    expect(de(m, A).kills).toBe(0);
    expect(de(m, X).aberturas).toBe(1);
    expect(de(m, A).aberturasPerdidas).toBe(1);
    expect(de(m, B).deaths).toBe(1);
  });

  it("troca: matar em até 5 s quem acabou de matar um aliado; a morte do aliado fica trocada", () => {
    const dentro = round([morte(1000, X, "T", A, "CT"), morte(1000 + JANELA_TROCA_TICKS, B, "CT", X, "T")]);
    let m = metricasDaDemo(dentro);
    expect(de(m, B).trocas).toBe(1);
    expect(de(m, A).mortesTrocadas).toBe(1);

    const fora = round([morte(1000, X, "T", A, "CT"), morte(1001 + JANELA_TROCA_TICKS, B, "CT", X, "T")]);
    m = metricasDaDemo(fora);
    expect(de(m, B).trocas).toBe(0);
    expect(de(m, A).mortesTrocadas).toBe(0);
  });

  it("KAST: kill, assist, sobreviver ou ser trocado; quem morreu sem nada fica de fora", () => {
    const m = metricasDaDemo(
      round([
        morte(1000, X, "T", A, "CT"),
        morte(1100, B, "CT", X, "T"),
        morte(1200, Y, "T", C, "CT"),
        // Z mata B 6 s depois de B matar X: fora da janela, X não é trocado.
        morte(1100 + JANELA_TROCA_TICKS + 64, Z, "T", B, "CT", { assistente: X }),
      ], "T"),
    );
    expect(de(m, A).kast).toBe(1); // trocado por B
    expect(de(m, B).kast).toBe(1); // kill
    expect(de(m, C).kast).toBe(0); // morreu sem kill, assist ou troca
    expect(de(m, X).kast).toBe(1); // kill (e assist)
    expect(de(m, Y).kast).toBe(1); // sobreviveu
    expect(de(m, X).assists).toBe(1);

    // Só a assistência salva o round.
    const so = metricasDaDemo(round([morte(1000, B, "CT", Y, "T", { assistente: C }), morte(2000, X, "T", C, "CT")], "T"));
    expect(de(so, C).kast).toBe(1);
  });

  it("flash assist é contada à parte da assistência", () => {
    const m = metricasDaDemo(round([morte(1000, B, "CT", X, "T", { assistente: C, flashAssist: true })]));
    expect(de(m, C).flashAssists).toBe(1);
    expect(de(m, C).assists).toBe(0);
  });

  it("clutch: o último vivo com inimigo na frente entra em situação; vence se o round for dele", () => {
    const eventos = [morte(1000, X, "T", A, "CT"), morte(1100, X, "T", B, "CT"), morte(1200, C, "CT", X, "T")];
    expect(de(metricasDaDemo(round(eventos, "CT")), C)).toMatchObject({ clutches: 1, clutchesGanhos: 1 });
    expect(de(metricasDaDemo(round(eventos, "T")), C)).toMatchObject({ clutches: 1, clutchesGanhos: 0 });
    // Uma situação por round, mesmo que os inimigos caiam um a um.
    expect(de(metricasDaDemo(round([...eventos, morte(1300, C, "CT", Y, "T")], "CT")), C).clutches).toBe(1);
  });

  it("dano é limitado à vida que a vítima tinha; utilitário separa HE e molotov; aliado não conta", () => {
    const m = metricasDaDemo(
      round([dano(500, A, X, 70, 30), dano(600, A, X, 108, 0, "hegrenade"), dano(700, B, C, 50, 50), dano(800, Y, A, 20, 80, "inferno")]),
    );
    expect(de(m, A).dano).toBe(100);
    expect(de(m, A).danoUtil).toBe(30);
    expect(de(m, X).danoSofrido).toBe(100);
    expect(de(m, B).dano).toBe(0);
    expect(de(m, Y).danoUtil).toBe(20);
    expect(de(m, A).adr).toBe(100);
  });

  it("multi-kills por round e HS", () => {
    const m = metricasDaDemo(round([morte(500, A, "CT", X, "T", { hs: true }), morte(600, A, "CT", Y, "T"), morte(700, A, "CT", Z, "T")]));
    expect(de(m, A)).toMatchObject({ kills: 3, hs: 1, multi3: 1, multi2: 0 });
  });

  it("cegueira: inimigos e aliados à parte, com os segundos dos inimigos", () => {
    const m = metricasDaDemo(
      round([
        { t: "cego", tick: 500, round: 1, vitima: X, autor: A, segundos: 2.5 },
        { t: "cego", tick: 500, round: 1, vitima: B, autor: A, segundos: 1 },
        { t: "cego", tick: 500, round: 1, vitima: A, autor: A, segundos: 1 },
        { t: "granada", tick: 480, round: 1, tipo: "flash", autor: A, pos: [0, 0, 0] },
      ]),
    );
    expect(de(m, A)).toMatchObject({ inimigosCegados: 1, aliadosCegados: 1, segundosCegando: 2.5, granadas: 1 });
  });

  it("tempo de vida conta do fim do freeze até a morte; zona dura até a morte", () => {
    const m = metricasDaDemo(
      round([{ t: "zona", tick: 300, round: 1, jogador: A, lado: "CT", zona: "BombsiteA" }, morte(200 + 64 * 30, X, "T", A, "CT")]),
    );
    expect(de(m, A).vidaMediaS).toBe(30);
    // 100 → 300 em CTSpawn (200 ticks = 3,1 s), 300 → morte em BombsiteA (1820 ticks = 28,4 s).
    expect(de(m, A).zonas.CT).toEqual({ CTSpawn: 3.1, BombsiteA: 28.4 });
    expect(de(m, B).vidaMediaS).toBeNull();
  });

  it("round rendido não é jogado", () => {
    const p = round([]);
    p.rounds.push({ n: 2, inicio: 10_001, jogo: null, fim: 10_100, vencedor: "CT", motivo: "t_surrender" });
    expect(de(metricasDaDemo(p), A).rounds).toBe(1);
  });

  it("a versão das regras existe para o recompute", () => {
    expect(REGRAS_VERSAO).toBe(3);
  });
});
