import { describe, expect, it } from "vitest";
import { lerPartidasOficiais, lerSequencia } from "@/lib/leituras-sessoes";
import { normal, serie } from "./fixtures";

describe("lerSequencia", () => {
  it("três sessões seguidas abaixo do normal viram uma fase, não uma noite", () => {
    const rows = serie([
      ...Array.from({ length: 8 }, () => normal({ modo: "premier" })),
      ...Array.from({ length: 3 }, () => normal({ kills: 20, deaths: 30, modo: "premier" })),
    ]);
    const l = lerSequencia(rows, { mode: "premier" })!;
    expect(l).not.toBeNull();
    expect(l.numero).toBe("3 seguidas");
    expect(l.tom).toBe("ruim");
    expect(l.texto).toContain("abaixo do seu normal no Premier");
  });

  it("duas seguidas é acaso: sem leitura", () => {
    const rows = serie([
      ...Array.from({ length: 8 }, () => normal()),
      ...Array.from({ length: 2 }, () => normal({ kills: 20, deaths: 30 })),
    ]);
    expect(lerSequencia(rows)).toBeNull();
  });

  it("sem base no modo, não há sequência contra o vitalício", () => {
    const rows = serie([
      ...Array.from({ length: 8 }, () => normal()),
      ...Array.from({ length: 3 }, () => normal({ kills: 20, deaths: 30, modo: "premier" })),
    ]);
    expect(lerSequencia(rows, { mode: "premier" })).toBeNull();
  });
});

describe("lerPartidasOficiais", () => {
  it("resume o saldo e o que se repete", () => {
    const l = lerPartidasOficiais([
      { resultado: "derrota", placar: "11-13", mapa: "Nuke", kd: 1.2 },
      { resultado: "derrota", placar: "12-13", mapa: "Nuke", kd: 1.05 },
      { resultado: "vitória", placar: "13-11", mapa: "Nuke", kd: 0.9 },
    ])!;
    expect(l.numero).toBe("1–2");
    expect(l.tom).toBe("ruim");
    expect(l.texto).toContain("todas decididas por dois rounds ou menos");
    expect(l.texto).toContain("K/D acima de 1 em todas as derrotas");
    expect(l.texto).toContain("todas em Nuke");
  });

  it("sem partidas, sem leitura", () => {
    expect(lerPartidasOficiais([])).toBeNull();
  });
});
