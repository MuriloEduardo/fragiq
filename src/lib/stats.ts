/**
 * A Steam expõe apenas contadores vitalícios e cumulativos ("total_kills"
 * desde sempre). Uma média vitalícia não mostra evolução: depois de 2.000
 * horas, um mês excelente mal move o número.
 *
 * A solução é derivar: a performance entre dois snapshots é a diferença
 * entre eles. Um K/D calculado sobre o delta responde "como você jogou
 * neste período" em vez de "como você jogou na vida inteira".
 */

export type Snapshot = {
  capturedAt: Date;
  playtimeForeverMin: number;
  metrics: Record<string, number>;
};

export type Delta = {
  from: Date;
  to: Date;
  minutesPlayed: number;
  metrics: Record<string, number>;
};

export function toSnapshot(row: {
  capturedAt: Date;
  playtimeForeverMin: number;
  metrics: unknown;
}): Snapshot {
  const metrics: Record<string, number> = {};
  if (row.metrics && typeof row.metrics === "object") {
    for (const [k, v] of Object.entries(row.metrics as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) metrics[k] = v;
    }
  }
  return {
    capturedAt: row.capturedAt,
    playtimeForeverMin: row.playtimeForeverMin,
    metrics,
  };
}

/** Diferenças consecutivas. Snapshots devem vir em ordem cronológica. */
export function deltas(snapshots: Snapshot[]): Delta[] {
  const out: Delta[] = [];

  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    const metrics: Record<string, number> = {};

    for (const [key, value] of Object.entries(curr.metrics)) {
      const before = prev.metrics[key];
      if (typeof before !== "number") continue;

      const diff = value - before;
      // Contadores só sobem. Um valor negativo significa reset de stats
      // pelo jogo — descartamos em vez de plotar um pico impossível.
      if (diff < 0) continue;
      metrics[key] = diff;
    }

    out.push({
      from: prev.capturedAt,
      to: curr.capturedAt,
      minutesPlayed: Math.max(0, curr.playtimeForeverMin - prev.playtimeForeverMin),
      metrics,
    });
  }

  return out;
}

/* ------------------------- métricas derivadas do CS2 ------------------------ */

export type DerivedMetric = {
  key: string;
  label: string;
  /** Retorna null quando as stats-fonte não existem para aquele jogo. */
  compute: (m: Record<string, number>) => number | null;
  format: (v: number) => string;
  /** true quando um valor maior é melhor — usado para colorir a variação. */
  higherIsBetter: boolean;
};

const ratio = (num: number | undefined, den: number | undefined) =>
  typeof num === "number" && typeof den === "number" && den > 0 ? num / den : null;

/**
 * Definidas sobre os nomes crus das stats do CS:GO/CS2 (appid 730), que são
 * os mesmos que a Steam devolve há anos.
 */
export const CS2_METRICS: DerivedMetric[] = [
  {
    key: "kd",
    label: "K/D",
    compute: (m) => ratio(m.total_kills, m.total_deaths),
    format: (v) => v.toFixed(2),
    higherIsBetter: true,
  },
  {
    key: "hs",
    label: "Headshot %",
    compute: (m) => {
      const r = ratio(m.total_kills_headshot, m.total_kills);
      return r === null ? null : r * 100;
    },
    format: (v) => `${v.toFixed(1)}%`,
    higherIsBetter: true,
  },
  {
    key: "accuracy",
    label: "Precisão",
    compute: (m) => {
      const r = ratio(m.total_shots_hit, m.total_shots_fired);
      return r === null ? null : r * 100;
    },
    format: (v) => `${v.toFixed(1)}%`,
    higherIsBetter: true,
  },
  {
    key: "winRate",
    label: "Vitórias",
    compute: (m) => {
      const r = ratio(m.total_matches_won, m.total_matches_played);
      return r === null ? null : r * 100;
    },
    format: (v) => `${v.toFixed(1)}%`,
    higherIsBetter: true,
  },
  {
    key: "killsPerRound",
    label: "Kills / round",
    compute: (m) => ratio(m.total_kills, m.total_rounds_played),
    format: (v) => v.toFixed(2),
    higherIsBetter: true,
  },
  {
    key: "damagePerRound",
    label: "Dano / round",
    compute: (m) => ratio(m.total_damage_done, m.total_rounds_played),
    format: (v) => v.toFixed(0),
    higherIsBetter: true,
  },
];

/**
 * Fallback para jogos sem métricas derivadas conhecidas: escolhe os
 * contadores que mais se movimentaram, que costumam ser os interessantes.
 */
export function genericMetrics(
  snapshots: Snapshot[],
  schema: Record<string, string> | null,
  limit = 6,
): DerivedMetric[] {
  if (snapshots.length === 0) return [];

  const first = snapshots[0].metrics;
  const last = snapshots[snapshots.length - 1].metrics;

  const moved = Object.keys(last)
    .map((key) => ({ key, growth: (last[key] ?? 0) - (first[key] ?? 0) }))
    .filter((e) => e.growth > 0)
    .sort((a, b) => b.growth - a.growth)
    .slice(0, limit);

  const chosen = moved.length
    ? moved.map((e) => e.key)
    : Object.keys(last).slice(0, limit);

  return chosen.map((key) => ({
    key,
    label: schema?.[key] ?? humanize(key),
    compute: (m) => (typeof m[key] === "number" ? m[key] : null),
    format: (v) => formatCount(v),
    higherIsBetter: true,
  }));
}

export function metricsForGame(
  appId: number,
  snapshots: Snapshot[],
  schema: Record<string, string> | null,
): DerivedMetric[] {
  if (appId === 730) {
    // Só mostra as que o jogador realmente tem dados para calcular.
    const usable = CS2_METRICS.filter((metric) =>
      snapshots.some((s) => metric.compute(s.metrics) !== null),
    );
    if (usable.length) return usable;
  }
  return genericMetrics(snapshots, schema);
}

/* --------------------------------- helpers -------------------------------- */

export function humanize(key: string) {
  return key
    .replace(/^total_/, "")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function formatCount(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export function formatPlaytime(minutes: number) {
  const hours = minutes / 60;
  if (hours < 1) return `${Math.round(minutes)} min`;
  if (hours < 100) return `${hours.toFixed(1)} h`;
  return `${Math.round(hours).toLocaleString("pt-BR")} h`;
}

export function parseStatSchema(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object") return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}
