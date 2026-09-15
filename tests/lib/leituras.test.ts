import { describe, expect, it } from "vitest";
import { lerSerie, todasAsMetricas } from "@/lib/leituras";
import { NORMAL_MIN_SESSOES } from "@/lib/series";
import { normal, serie } from "./fixtures";

const de = (leituras: ReturnType<typeof lerSerie>, id: string) => leituras.find((l) => l.id === id);

describe("a referência das leituras é a da tela", () => {
  it("na primeira sessão de um modo, não chama a sessão de 'normal' dela mesma", () => {
    // 20 sessões sem modo (K/D 1,0) e a primeira sessão de Premier com K/D 2,0.
    const rows = serie([
      ...Array.from({ length: 20 }, () => normal()),
      normal({ kills: 60, deaths: 30, modo: "premier" }),
    ]);
    const kd = de(lerSerie(rows, { mode: "premier" }), "kd")!;

    expect(kd.referencia).toBe("vitalicio-fraco");
    expect(kd.texto).not.toContain("Praticamente o seu normal");
    expect(kd.texto).toContain("ainda não tem base");
    expect(kd.texto).toContain(`0 de ${NORMAL_MIN_SESSOES} sessões`);
    expect(kd.tom).toBe("bom");
  });

  it("com base no modo, o normal exclui a sessão lida", () => {
    // 6 sessões de Premier a K/D 1,0 (180 rounds) e a sétima a K/D 2,0.
    const rows = serie([
      ...Array.from({ length: 6 }, () => normal({ modo: "premier" })),
      normal({ kills: 60, deaths: 30, modo: "premier" }),
    ]);
    const kd = de(lerSerie(rows, { mode: "premier" }), "kd")!;

    expect(kd.referencia).toBe("modo");
    expect(kd.texto).toContain("do seu Premier (6 sessões)");
    // Referência 1,00 — não 1,14, que seria o acumulado com a sessão dentro.
    expect(kd.texto).toContain("contra 1 do seu Premier");
    expect(kd.texto).toContain("+100 %");
  });

  it("sem lente, a referência é o vitalício", () => {
    const rows = serie([...Array.from({ length: 6 }, () => normal()), normal({ kills: 45, deaths: 30 })]);
    const kd = de(lerSerie(rows), "kd")!;
    expect(kd.referencia).toBe("vitalicio");
    expect(kd.texto).toContain("de vitalício");
  });
});

describe("o mesmo limiar do chip", () => {
  it("abaixo de 3 % é 'praticamente o seu normal', e não há leitura de headshot abaixo de 1 pp", () => {
    // K/D 1,017 contra 1,002: +1,5 %, dentro do ruído.
    const rows = serie([...Array.from({ length: 20 }, () => normal()), normal({ rounds: 60, kills: 61, deaths: 60, hs: 24 })]);
    const leituras = lerSerie(rows);
    expect(de(leituras, "kd")!.texto).toContain("≈");
    expect(de(leituras, "kd")!.tom).toBe("neutro");
    expect(de(leituras, "hs")).toBeUndefined();
  });

  it("headshot compara em pontos percentuais e não inventa causa", () => {
    const rows = serie([...Array.from({ length: 10 }, () => normal()), normal({ hs: 6 })]);
    const hs = de(lerSerie(rows), "hs")!;
    expect(hs.texto).toContain("pp");
    expect(hs.tom).toBe("ruim");
    expect(hs.texto).not.toMatch(/spray|trocas de perto/);
  });
});

describe("modo", () => {
  it("quando o modo foi observado, a leitura diz o modo em vez de adivinhar pelo comprimento", () => {
    const rows = serie([normal(), normal({ modo: "casual", mapa: "de_dust2", rounds: 16 })]);
    const modo = de(lerSerie(rows), "modo")!;
    expect(modo.numero).toBe("Casual");
    expect(modo.texto).toContain("Dust2");
    expect(modo.texto).not.toContain("rounds/partida");
  });

  it("sem modo observado, a pista pelo comprimento diz que é só uma pista", () => {
    const rows = serie([normal(), normal({ rounds: 24, partidas: 1 })]);
    const modo = de(lerSerie(rows), "modo")!;
    expect(modo.numero).toContain("rounds/partida");
    expect(modo.texto).toContain("Modo não observado");
  });
});

describe("todasAsMetricas", () => {
  it("usa a mesma referência e a nomeia", () => {
    const rows = serie([
      ...Array.from({ length: 6 }, () => normal({ modo: "premier" })),
      normal({ kills: 60, deaths: 30, modo: "premier" }),
    ]);
    const kills = todasAsMetricas(rows, ["total_kills", "total_rounds_played"], { mode: "premier" }).find(
      (l) => l.key === "total_kills",
    )!;
    expect(kills.referencia).toBe("modo");
    expect(kills.periodo).toBeCloseTo(2, 5);
    expect(kills.vitalicio).toBeCloseTo(1, 5);
  });

  it("o próprio denominador não tem referência", () => {
    const rows = serie([normal(), normal()]);
    const rounds = todasAsMetricas(rows, ["total_rounds_played"]).find((l) => l.key === "total_rounds_played")!;
    expect(rounds.porRound).toBe(false);
    expect(rounds.referencia).toBeNull();
  });
});
