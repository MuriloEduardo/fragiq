import { atribuirModo, type Evidencia } from "./atribuir";

/**
 * A sessão como função pura do par de coletas e das provas do intervalo:
 * os deltas dos contadores que o painel usa, os minutos em partida e o
 * modo com confiança (`atribuirModo`). Sem banco, para o teste bater nos
 * números e não na infraestrutura.
 */

export type PontoDaSessao = {
  id: string;
  capturedAt: Date;
  playtimeForeverMin: number;
  metrics: Record<string, number>;
  matchMode: string | null;
  matchMap: string | null;
  matchScore: string | null;
  traceId: string | null;
};

export type SessaoMontada = {
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
  modo: string | null;
  modoConfianca: "EXATA" | "INFERIDA" | "MISTA";
  mapa: string | null;
  placar: string | null;
  matchIds: string[];
  observacaoIds: string[];
};

function delta(prev: PontoDaSessao, curr: PontoDaSessao, key: string): number | null {
  const a = prev.metrics[key];
  const b = curr.metrics[key];
  if (a === undefined || b === undefined) return null;
  const d = b - a;
  return d < 0 ? null : d;
}

/** Pura: os deltas do par e o modo com prova. `null` quando não houve rounds. */
export function montarSessao(prev: PontoDaSessao, curr: PontoDaSessao, evidencias: Evidencia[]): SessaoMontada | null {
  const rounds = delta(prev, curr, "total_rounds_played");
  if (!rounds || rounds <= 0) return null;

  const emPartida = delta(prev, curr, "total_time_played");
  const partidas = delta(prev, curr, "total_matches_played");
  const atribuicao = atribuirModo({
    deltaPartidas: partidas,
    evidencias,
    snapshot: { matchMode: curr.matchMode, matchMap: curr.matchMap, matchScore: curr.matchScore },
  });

  return {
    de: prev.capturedAt,
    ate: curr.capturedAt,
    minutos: emPartida !== null && emPartida > 0 ? Math.round(emPartida / 60) : Math.max(0, curr.playtimeForeverMin - prev.playtimeForeverMin),
    rounds,
    partidas,
    vitorias: delta(prev, curr, "total_matches_won"),
    kills: delta(prev, curr, "total_kills"),
    deaths: delta(prev, curr, "total_deaths"),
    headshots: delta(prev, curr, "total_kills_headshot"),
    dano: delta(prev, curr, "total_damage_done"),
    mvps: delta(prev, curr, "total_mvps"),
    modo: atribuicao.modo,
    modoConfianca: atribuicao.confianca,
    mapa: atribuicao.mapa,
    placar: atribuicao.placar,
    matchIds: atribuicao.matchIds,
    observacaoIds: atribuicao.observacaoIds,
  };
}

