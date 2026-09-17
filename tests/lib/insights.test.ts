import { describe, expect, it } from "vitest";
import { classificacaoDaSessao, coberturaDeModo, formaVsVitalicio, insightsDaSessao, metricaVsNormal, normalNaHora, rankingDeMapas, tendenciaKd, type SessaoFato } from "@/lib/insights/regras";

const dia = (n: number) => new Date(Date.UTC(2026, 8, 1 + n, 20));
const sessao = (n: number, o: Partial<SessaoFato> = {}): SessaoFato => ({
  id: `s${n}`,
  ate: dia(n),
  rounds: 24,
  partidas: 1,
  kills: 20,
  deaths: 16,
  headshots: 8,
  dano: 1800,
  modo: "premier",
  confianca: "EXATA",
  mapa: "de_mirage",
  vitalicio: { kills: 5000, deaths: 5000, headshots: 2000, dano: 400000, rounds: 5000 },
  ...o,
});

describe("normal na hora", () => {
  it("sem 5 sessões anteriores do modo cai no vitalício da coleta, rotulado como fraco", () => {
    const n = normalNaHora(sessao(3), [sessao(1), sessao(2)], "kd");
    expect(n.tipo).toBe("vitalicio-fraco");
    expect(n.tipo === "vitalicio-fraco" && n.valor).toBe(1);
  });
  it("com base do modo usa o acumulado das anteriores — nunca a própria nem as futuras", () => {
    const anteriores = [1, 2, 3, 4, 5, 6].map((i) => sessao(i, { rounds: 30, kills: 30, deaths: 20 }));
    const futuras = [8, 9].map((i) => sessao(i, { kills: 100, deaths: 1 }));
    const n = normalNaHora(sessao(7, { kills: 1, deaths: 100 }), [...anteriores, ...futuras], "kd");
    expect(n.tipo).toBe("modo");
    expect(n.tipo === "modo" && n.valor).toBeCloseTo(1.5, 5);
  });
  it("sessão mista compara com o vitalício, sem fingir modo", () => {
    expect(normalNaHora(sessao(1, { modo: null, confianca: "MISTA" }), [], "adr").tipo).toBe("vitalicio");
  });
});

describe("chips de sessão", () => {
  it("K/D acima do normal do modo vira BOM, com o sinal na linha", () => {
    const anteriores = [1, 2, 3, 4, 5, 6].map((i) => sessao(i, { rounds: 30, kills: 20, deaths: 20 }));
    const c = metricaVsNormal("kd", sessao(7, { kills: 30, deaths: 20 }), anteriores);
    expect(c).toMatchObject({ regra: "kd.vs.normal", tom: "BOM", referenciaTipo: "modo", deltaUnidade: "%", visual: "CHIP" });
    expect(c.delta).toBeCloseTo(50, 5);
    expect(c.linha).toBe("K/D 1,50 · +50% vs normal do Premier (6 sessões)");
    expect(c.linha.includes("\n")).toBe(false);
  });
  it("HS compara em pontos percentuais e o ruído (< 1 pp) é NEUTRO", () => {
    const c = metricaVsNormal("hs", sessao(1, { headshots: 8, kills: 20, vitalicio: { kills: 100, deaths: 100, headshots: 40, dano: 1, rounds: 100 } }), []);
    expect(c).toMatchObject({ tom: "NEUTRO", deltaUnidade: "pp" });
    expect(c.linha).toContain("≈ normal");
  });
  it("amostra curta não muda o número nem o tom, marca como fraco", () => {
    const c = metricaVsNormal("kd", sessao(1, { rounds: 6, kills: 10, deaths: 2 }), []);
    expect(c.tom).toBe("BOM");
    expect(c.dados.fraco).toBe(true);
  });
  it("o selo resume o saldo dos três chips", () => {
    const chips = insightsDaSessao(sessao(1, { kills: 30, deaths: 10, dano: 2600, headshots: 20 }), []);
    const selo = chips.find((c) => c.regra === "sessao.classificacao")!;
    expect(selo).toMatchObject({ visual: "SELO", tom: "BOM", linha: "Acima do seu normal" });
    expect(classificacaoDaSessao(chips.slice(0, 3), sessao(2, { rounds: 5 })).linha).toMatch(/Amostra curta/);
  });
});

describe("insights de modo", () => {
  const dez = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => sessao(i, { kills: 10 + i * 2, deaths: 20, mapa: i % 2 ? "de_mirage" : "de_inferno" }));
  it("tendência compara as últimas 5 com as 5 anteriores", () => {
    const t = tendenciaKd(dez, "premier");
    expect(t).toMatchObject({ regra: "tendencia.kd.5", visual: "SPARKLINE", tom: "BOM", base: { sessoes: 5 } });
    expect(t.linha).toMatch(/subindo/);
  });
  it("forma atual contra o vitalício", () => {
    const f = formaVsVitalicio(dez, "premier");
    expect(f).toMatchObject({ regra: "forma.vs.vitalicio", visual: "BARRA", referenciaTipo: "vitalicio" });
    expect(f.linha).toMatch(/^Forma atual 1,\d\d · vitalício 1,00/);
  });
  it("ranking de mapas só com rounds provados suficientes", () => {
    const r = rankingDeMapas(dez, "premier");
    expect(r.visual).toBe("RANK");
    expect((r.dados.linhas as unknown[]).length).toBe(2);
    expect(r.linha).toMatch(/Mirage|Inferno/);
    expect(rankingDeMapas(dez.map((s) => ({ ...s, confianca: "MISTA" as const, modo: null })), null).linha).toMatch(/faltam 30 rounds/);
  });
  it("cobertura conta rounds provados sobre o total", () => {
    const c = coberturaDeModo([...dez.slice(0, 2), sessao(20, { modo: null, confianca: "MISTA", rounds: 48 })]);
    expect(c.valor).toBeCloseTo(50, 5);
    expect(c.linha).toBe("50% dos rounds com modo provado · 1 sessão mista");
  });
});
