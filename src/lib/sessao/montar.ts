import { armasNasMetricas } from "../cs2-labels";
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

/** O que uma arma rendeu no intervalo. Só existe quando algo se moveu. */
export type ArmaNaSessao = { kills: number; tiros: number; acertos: number };

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
  armas: Record<string, ArmaNaSessao>;
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

/**
 * Os deltas por arma do intervalo: kills, tiros e acertos de cada arma que
 * se moveu.
 *
 * Guardar isto na sessão é o que torna o número por arma atribuível a um
 * modo: o contador por arma da Steam soma todos os modos para sempre
 * (README), mas o que se moveu entre duas coletas pertence ao que foi
 * jogado nesse intervalo — e a sessão já sabe, com prova, qual foi o modo.
 * Arma parada não entra: zerar 90 armas em toda sessão é ruído no banco e
 * na conta de quem lê.
 */
function armasDoIntervalo(prev: PontoDaSessao, curr: PontoDaSessao): Record<string, ArmaNaSessao> {
  const armas: Record<string, ArmaNaSessao> = {};
  for (const arma of armasNasMetricas(curr.metrics)) {
    const kills = delta(prev, curr, `total_kills_${arma}`) ?? 0;
    const tiros = delta(prev, curr, `total_shots_${arma}`) ?? 0;
    const acertos = delta(prev, curr, `total_hits_${arma}`) ?? 0;
    if (kills > 0 || tiros > 0 || acertos > 0) armas[arma] = { kills, tiros, acertos };
  }
  return armas;
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
    armas: armasDoIntervalo(prev, curr),
    modo: atribuicao.modo,
    modoConfianca: atribuicao.confianca,
    mapa: atribuicao.mapa,
    placar: atribuicao.placar,
    matchIds: atribuicao.matchIds,
    observacaoIds: atribuicao.observacaoIds,
  };
}

