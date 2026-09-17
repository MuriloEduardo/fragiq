import { describe, expect, it } from "vitest";
import { montarSessao, type PontoDaSessao } from "@/lib/sessao/montar";

const ponto = (id: string, minutosDepois: number, m: Record<string, number>, marca: Partial<PontoDaSessao> = {}): PontoDaSessao => ({
  id,
  capturedAt: new Date(Date.UTC(2026, 8, 16, 20, minutosDepois)),
  playtimeForeverMin: 1000 + minutosDepois,
  metrics: m,
  matchMode: null,
  matchMap: null,
  matchScore: null,
  traceId: null,
  ...marca,
});
const base = { total_rounds_played: 1000, total_matches_played: 100, total_matches_won: 50, total_kills: 5000, total_deaths: 4500, total_kills_headshot: 2000, total_damage_done: 400000, total_mvps: 300, total_time_played: 360000 };
const mais = (d: Partial<typeof base>) => Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v + ((d as Record<string, number>)[k] ?? 0)]));

describe("montarSessao — deltas do par e modo com prova", () => {
  it("uma partida com observação: deltas certos, minutos em partida, EXATA", () => {
    const prev = ponto("a", 0, base);
    const curr = ponto("b", 45, mais({ total_rounds_played: 22, total_matches_played: 1, total_matches_won: 1, total_kills: 20, total_deaths: 15, total_kills_headshot: 9, total_damage_done: 1900, total_mvps: 3, total_time_played: 2400 }));
    const s = montarSessao(prev, curr, [{ fonte: "observacao", id: "o1", modo: "premier", mapa: "de_mirage", placar: "13:9" }]);
    expect(s).toMatchObject({ rounds: 22, partidas: 1, vitorias: 1, kills: 20, deaths: 15, headshots: 9, dano: 1900, mvps: 3, minutos: 40, modo: "premier", modoConfianca: "EXATA", mapa: "de_mirage", placar: "13:9", observacaoIds: ["o1"] });
    expect(s!.de).toEqual(prev.capturedAt);
    expect(s!.ate).toEqual(curr.capturedAt);
  });

  it("sem rounds não há sessão; contador que regrediu também não", () => {
    expect(montarSessao(ponto("a", 0, base), ponto("b", 60, base), [])).toBeNull();
    expect(montarSessao(ponto("a", 0, base), ponto("b", 60, mais({ total_rounds_played: -50 })), [])).toBeNull();
  });

  it("cron: várias partidas, nenhuma prova — MISTA, sem mapa nem placar", () => {
    const s = montarSessao(ponto("a", 0, base), ponto("b", 600, mais({ total_rounds_played: 70, total_matches_played: 3 })), []);
    expect(s).toMatchObject({ rounds: 70, partidas: 3, modo: null, modoConfianca: "MISTA", mapa: null, placar: null });
  });

  it("guarda os deltas das armas que se moveram, e só delas", () => {
    const comArmas = { ...base, total_shots_ak47: 4000, total_hits_ak47: 900, total_kills_ak47: 300, total_shots_awp: 500, total_hits_awp: 200, total_kills_awp: 150, total_shots_fired: 9000, total_shots_hit: 600 };
    const prev = ponto("a", 0, comArmas);
    const curr = ponto("b", 45, { ...comArmas, total_rounds_played: 1022, total_kills: 5020, total_shots_ak47: 4180, total_hits_ak47: 940, total_kills_ak47: 314 });
    const s = montarSessao(prev, curr, []);
    // A AWP não saiu da mochila; `total_shots_fired`/`_hit` são globais.
    expect(s!.armas).toEqual({ ak47: { kills: 14, tiros: 180, acertos: 40 } });
  });

  it("arma sem contador no par não vira zero nem quebra a sessão", () => {
    const prev = ponto("a", 0, { ...base, total_shots_ak47: 4000 });
    const curr = ponto("b", 45, { ...base, total_rounds_played: 1022, total_shots_ak47: 4180, total_kills_ak47: 10 });
    const s = montarSessao(prev, curr, []);
    // `total_kills_ak47` só existe na segunda coleta: sem par não há delta.
    expect(s!.armas).toEqual({ ak47: { kills: 0, tiros: 180, acertos: 0 } });
  });

  it("sem total_time_played os minutos vêm do playtime", () => {
    const { total_time_played: _t, ...semTempo } = base;
    void _t;
    const s = montarSessao(ponto("a", 0, semTempo), ponto("b", 33, { ...semTempo, total_rounds_played: 1010 }), []);
    expect(s?.minutos).toBe(33);
  });
});
