import { describe, expect, it } from "vitest";
import { atribuirModo, type Evidencia } from "@/lib/sessao/atribuir";

const obs = (id: string, modo: string | null, mapa: string | null = "de_mirage", placar: string | null = null): Evidencia => ({ fonte: "observacao", id, modo, mapa, placar });
const match = (id: string, modo: string | null, mapa: string | null = "de_mirage"): Evidencia => ({ fonte: "match", id, modo, mapa, placar: "13-9" });
const semMarca = { matchMode: null, matchMap: null, matchScore: null };

describe("atribuirModo — a tabela da §3.2", () => {
  it("uma partida e uma observação: EXATA, com mapa e placar da observação", () => {
    const r = atribuirModo({ deltaPartidas: 1, evidencias: [obs("o1", "premier", "de_mirage", "13:9")], snapshot: semMarca });
    expect(r).toMatchObject({ modo: "premier", confianca: "EXATA", mapa: "de_mirage", placar: "13:9", observacaoIds: ["o1"], matchIds: [] });
  });

  it("uma partida oficial do GC dentro do intervalo: EXATA pelo bitmask", () => {
    const r = atribuirModo({ deltaPartidas: 1, evidencias: [match("m1", "competitive", "de_inferno")], snapshot: semMarca });
    expect(r).toMatchObject({ modo: "competitive", confianca: "EXATA", mapa: "de_inferno", matchIds: ["m1"] });
  });

  it("três partidas, três observações do mesmo modo: INFERIDA", () => {
    const r = atribuirModo({ deltaPartidas: 3, evidencias: [obs("a", "premier"), obs("b", "premier", "de_nuke"), obs("c", "premier", "de_anubis")], snapshot: semMarca });
    expect(r).toMatchObject({ modo: "premier", confianca: "INFERIDA", mapa: null });
  });

  it("três partidas e só uma observação: MISTA — não dá para vouch pelas outras duas", () => {
    const r = atribuirModo({ deltaPartidas: 3, evidencias: [obs("a", "premier")], snapshot: semMarca });
    expect(r).toMatchObject({ modo: null, confianca: "MISTA" });
  });

  it("modos diferentes no intervalo: MISTA, mesmo com cobertura total", () => {
    const r = atribuirModo({ deltaPartidas: 2, evidencias: [obs("a", "premier"), obs("b", "casual")], snapshot: semMarca });
    expect(r).toMatchObject({ modo: null, confianca: "MISTA", observacaoIds: ["a", "b"] });
  });

  it("cron puro, sem evidência nem marca: MISTA", () => {
    expect(atribuirModo({ deltaPartidas: 4, evidencias: [], snapshot: semMarca })).toMatchObject({ modo: null, confianca: "MISTA" });
  });

  it("legado: coleta marcada pelo bot antigo, uma partida: INFERIDA; várias: MISTA", () => {
    const marcado = { matchMode: "competitive", matchMap: "de_mirage", matchScore: "13:7" };
    expect(atribuirModo({ deltaPartidas: 1, evidencias: [], snapshot: marcado })).toMatchObject({ modo: "competitive", confianca: "INFERIDA", mapa: "de_mirage", placar: "13:7" });
    expect(atribuirModo({ deltaPartidas: 3, evidencias: [], snapshot: marcado })).toMatchObject({ modo: null, confianca: "MISTA" });
  });

  it("GC e bot viram a mesma partida: cobertura não soma, e o GC não pesa duas vezes", () => {
    const r = atribuirModo({ deltaPartidas: 2, evidencias: [match("m1", "competitive"), obs("o1", "competitive")], snapshot: semMarca });
    // 2 partidas esperadas, cobertura máx(1, 1) = 1 → não vouch.
    expect(r).toMatchObject({ modo: null, confianca: "MISTA", matchIds: ["m1"], observacaoIds: ["o1"] });
  });

  it("sem contador de partidas (Δ null) uma evidência única vale como EXATA", () => {
    expect(atribuirModo({ deltaPartidas: null, evidencias: [obs("o1", "casual", "cs_office")], snapshot: semMarca })).toMatchObject({ modo: "casual", confianca: "EXATA", mapa: "cs_office" });
  });
});
