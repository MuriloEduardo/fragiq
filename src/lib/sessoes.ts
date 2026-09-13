import { deltaEntre, paresDeMovimento, type ContextFilter, type SnapshotRow } from "./series";
import { rotularMapa, rotularModo } from "./cs2-labels";

/**
 * Uma sessão é o intervalo entre duas coletas em que os rounds subiram.
 *
 * Com o bot de presença é uma partida, com mapa, modo e placar; sem ele é
 * "o que foi jogado entre uma coleta e outra". Os números são deltas do
 * par — a mesma conta que alimenta o painel, para que a lista e o hero
 * nunca discordem.
 */
export type Sessao = {
  /** A coleta que fechou a sessão; é nela que mapa e modo vivem. */
  snapshotId: string | null;
  de: Date;
  ate: Date;
  minutos: number;
  rounds: number;
  partidas: number | null;
  vitorias: number | null;
  kills: number | null;
  deaths: number | null;
  headshots: number | null;
  dano: number | null;
  mvps: number | null;
  kd: number | null;
  danoPorRound: number | null;
  hs: number | null;
  mapa: string | null;
  modo: string | null;
  placar: string | null;
};

export function listarSessoes(rows: SnapshotRow[], filter?: ContextFilter): Sessao[] {
  return paresDeMovimento(rows, "total_rounds_played", filter).map((par) => {
    const d = (k: string) => deltaEntre(par, k);
    const rounds = d("total_rounds_played") ?? 0;
    const kills = d("total_kills");
    const deaths = d("total_deaths");
    const headshots = d("total_kills_headshot");
    const dano = d("total_damage_done");
    // total_time_played conta segundos EM PARTIDA e sobe junto com os rounds;
    // o playtime_forever da Steam só avança quando o jogo fecha e mede
    // sessão (menu, warmup) — dava "67 min" para três partidas.
    const emPartida = d("total_time_played");
    return {
      snapshotId: par.curr.id ?? null,
      de: par.prev.capturedAt,
      ate: par.curr.capturedAt,
      minutos:
        emPartida !== null && emPartida > 0
          ? Math.round(emPartida / 60)
          : par.curr.playtimeForeverMin - par.prev.playtimeForeverMin,
      rounds,
      partidas: d("total_matches_played"),
      vitorias: d("total_matches_won"),
      kills,
      deaths,
      headshots,
      dano,
      mvps: d("total_mvps"),
      kd: kills !== null && deaths ? kills / deaths : null,
      danoPorRound: dano !== null && rounds ? dano / rounds : null,
      hs: headshots !== null && kills ? (headshots / kills) * 100 : null,
      mapa: par.curr.matchMap ? rotularMapa(par.curr.matchMap) : null,
      modo: par.curr.matchMode ? rotularModo(par.curr.matchMode) : null,
      placar: par.curr.matchScore ?? null,
    };
  });
}

export function ultimaSessao(rows: SnapshotRow[], filter?: ContextFilter): Sessao | null {
  const todas = listarSessoes(rows, filter);
  return todas[todas.length - 1] ?? null;
}

/** Vitalícios dos três números do hero, para o delta. */
export function vitaliciosDoHero(rows: SnapshotRow[]) {
  const last = rows[rows.length - 1]?.metrics;
  if (!last) return { kd: null, danoPorRound: null, hs: null };
  const razao = (a: string, b: string, escala = 1) =>
    last[b] ? ((last[a] ?? 0) / last[b]) * escala : null;
  return {
    kd: razao("total_kills", "total_deaths"),
    danoPorRound: razao("total_damage_done", "total_rounds_played"),
    hs: razao("total_kills_headshot", "total_kills", 100),
  };
}

export const FUSO_BR = "America/Sao_Paulo";

export function formatarQuando(d: Date) {
  return d
    .toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: FUSO_BR })
    .replace(".", "")
    .replace(",", "");
}
