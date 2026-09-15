import type { SnapshotRow } from "@/lib/series";

/**
 * Uma série sintética, sessão a sessão.
 *
 * Cada entrada é o que a sessão rendeu (deltas); o helper acumula os
 * contadores como a Steam os entrega. O cron diário sem jogo é um ponto
 * repetido, e é assim que ele entra aqui também — a série real tem mais
 * pontos parados do que sessões.
 */
export type Sessao = {
  rounds: number;
  partidas?: number;
  kills: number;
  deaths: number;
  hs?: number;
  dano?: number;
  ak?: { tiros: number; acertos: number; kills?: number };
  modo?: string | null;
  mapa?: string | null;
  placar?: string | null;
  /** Um ponto de cron sem jogo antes desta sessão. */
  paradaAntes?: boolean;
};

const DIA = 24 * 60 * 60 * 1000;
const INICIO = Date.UTC(2026, 7, 1, 8, 0, 0);

export function serie(sessoes: Sessao[], base: Record<string, number> = {}): SnapshotRow[] {
  const contadores: Record<string, number> = {
    total_rounds_played: 0,
    total_matches_played: 0,
    total_kills: 0,
    total_deaths: 0,
    total_kills_headshot: 0,
    total_damage_done: 0,
    total_shots_ak47: 0,
    total_hits_ak47: 0,
    total_kills_ak47: 0,
    ...base,
  };
  const rows: SnapshotRow[] = [];
  let t = INICIO;
  let n = 0;
  const ponto = (extra: Partial<SnapshotRow> = {}) => {
    n += 1;
    rows.push({
      id: `s${n}`,
      capturedAt: new Date(t),
      playtimeForeverMin: 6000 + n * 60,
      metrics: { ...contadores },
      matchMode: null,
      matchMap: null,
      matchScore: null,
      ...extra,
    });
    t += DIA;
  };
  ponto();
  for (const s of sessoes) {
    if (s.paradaAntes) ponto();
    contadores.total_rounds_played += s.rounds;
    contadores.total_matches_played += s.partidas ?? 1;
    contadores.total_kills += s.kills;
    contadores.total_deaths += s.deaths;
    contadores.total_kills_headshot += s.hs ?? Math.round(s.kills * 0.4);
    contadores.total_damage_done += s.dano ?? s.rounds * 75;
    if (s.ak) {
      contadores.total_shots_ak47 += s.ak.tiros;
      contadores.total_hits_ak47 += s.ak.acertos;
      contadores.total_kills_ak47 += s.ak.kills ?? Math.round(s.ak.acertos / 4);
    }
    ponto({ matchMode: s.modo ?? null, matchMap: s.mapa ?? null, matchScore: s.placar ?? null });
  }
  return rows;
}

/** Sessão "normal": K/D 1,0, 40% de HS, AK a 30%. */
export function normal(overrides: Partial<Sessao> = {}): Sessao {
  return { rounds: 30, partidas: 1, kills: 30, deaths: 30, hs: 12, ak: { tiros: 100, acertos: 30 }, ...overrides };
}
