/**
 * Motor de consulta das séries.
 *
 * O balde de dados é `StatSnapshot.metrics` — um JSONB com os contadores
 * crus do jogo no instante da coleta. Tudo que o explorador oferece é
 * derivado daqui em tempo de consulta; nada é pré-agregado, então adicionar
 * uma métrica nova não exige migração nem recoleta.
 */

export type Bucket = "raw" | "day" | "week" | "month";

export type Mode =
  /** Valor cru do contador vitalício. Sobe para sempre. */
  | "cumulative"
  /** Diferença entre buckets consecutivos: "kills naquele dia". */
  | "delta"
  /** Delta normalizado pelas horas jogadas na janela. Compara dias desiguais. */
  | "perHour"
  /** Razão entre dois contadores no período: K/D, HS%, precisão. */
  | "ratio";

export type SeriesSpec = {
  id: string;
  metric: string;
  /** Só usado quando mode === "ratio". */
  denominator?: string;
  mode: Mode;
  /** Multiplica o resultado — 100 transforma razão em porcentagem. */
  scale?: number;
};

export type SnapshotRow = {
  capturedAt: Date;
  playtimeForeverMin: number;
  metrics: Record<string, number>;
};

export type SeriesPoint = { t: number; value: number };

export type SeriesResult = {
  id: string;
  label: string;
  points: SeriesPoint[];
};

/* -------------------------------- bucketing ------------------------------- */

function bucketKey(date: Date, bucket: Bucket): number {
  const d = new Date(date);

  switch (bucket) {
    case "raw":
      return d.getTime();
    case "day":
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    case "week": {
      d.setHours(0, 0, 0, 0);
      // Segunda-feira como início da semana.
      const weekday = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - weekday);
      return d.getTime();
    }
    case "month":
      return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }
}

/**
 * Um bucket guarda o ÚLTIMO snapshot do período. Como os contadores são
 * cumulativos, o último valor do dia já contém tudo que aconteceu nele —
 * somar ou tirar média dos snapshots do dia contaria duplicado.
 */
function collapse(snapshots: SnapshotRow[], bucket: Bucket): SnapshotRow[] {
  if (bucket === "raw") return snapshots;

  const byBucket = new Map<number, SnapshotRow>();
  for (const snap of snapshots) {
    const key = bucketKey(snap.capturedAt, bucket);
    const existing = byBucket.get(key);
    if (!existing || snap.capturedAt > existing.capturedAt) {
      byBucket.set(key, { ...snap, capturedAt: new Date(key) });
    }
  }

  return [...byBucket.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, snap]) => snap);
}

/* --------------------------------- cálculo -------------------------------- */

function num(snap: SnapshotRow, key: string): number | null {
  const value = snap.metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildSeries(
  snapshots: SnapshotRow[],
  spec: SeriesSpec,
  bucket: Bucket,
): SeriesPoint[] {
  const rows = collapse(snapshots, bucket);
  const scale = spec.scale ?? 1;
  const points: SeriesPoint[] = [];

  if (spec.mode === "cumulative") {
    for (const row of rows) {
      const value = num(row, spec.metric);
      if (value !== null) points.push({ t: row.capturedAt.getTime(), value: value * scale });
    }
    return points;
  }

  // Os demais modos são derivados: precisam de um par de pontos.
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const curr = rows[i];

    const before = num(prev, spec.metric);
    const after = num(curr, spec.metric);
    if (before === null || after === null) continue;

    // Contadores só sobem; um negativo é reset de stats pelo jogo, não queda
    // de desempenho. Descartamos em vez de plotar um pico impossível.
    const delta = after - before;
    if (delta < 0) continue;

    const t = curr.capturedAt.getTime();

    if (spec.mode === "delta") {
      points.push({ t, value: delta * scale });
      continue;
    }

    if (spec.mode === "perHour") {
      const hours = (curr.playtimeForeverMin - prev.playtimeForeverMin) / 60;
      if (hours <= 0) continue;
      points.push({ t, value: (delta / hours) * scale });
      continue;
    }

    // ratio
    if (!spec.denominator) continue;
    const denBefore = num(prev, spec.denominator);
    const denAfter = num(curr, spec.denominator);
    if (denBefore === null || denAfter === null) continue;

    const denDelta = denAfter - denBefore;
    if (denDelta <= 0) continue; // divisão por zero e resets.

    points.push({ t, value: (delta / denDelta) * scale });
  }

  return points;
}

/* --------------------------- catálogo de métricas -------------------------- */

export type MetricInfo = {
  key: string;
  label: string;
  /** Quanto o contador cresceu no histórico — proxy de "esta métrica é útil". */
  growth: number;
};

/**
 * O que o explorador oferece como opção. Sai dos próprios dados, não de uma
 * lista fixa: qualquer jogo Steam funciona sem alteração de código.
 */
export function metricCatalog(
  snapshots: SnapshotRow[],
  schema: Record<string, string> | null,
): MetricInfo[] {
  if (snapshots.length === 0) return [];

  const first = snapshots[0].metrics;
  const last = snapshots[snapshots.length - 1].metrics;

  const keys = new Set<string>();
  for (const snap of snapshots) for (const key of Object.keys(snap.metrics)) keys.add(key);

  return [...keys]
    .map((key) => ({
      key,
      label: schema?.[key] ?? humanizeKey(key),
      growth: (last[key] ?? 0) - (first[key] ?? 0),
    }))
    .sort((a, b) => b.growth - a.growth || a.label.localeCompare(b.label));
}

export function humanizeKey(key: string) {
  return key
    .replace(/^total_/, "")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

export const MODE_LABELS: Record<Mode, string> = {
  cumulative: "Total acumulado",
  delta: "Por período",
  perHour: "Por hora jogada",
  ratio: "Razão entre duas métricas",
};

export function seriesLabel(spec: SeriesSpec, catalog: Map<string, string>): string {
  const metric = catalog.get(spec.metric) ?? humanizeKey(spec.metric);

  switch (spec.mode) {
    case "cumulative":
      return `${metric} (total)`;
    case "delta":
      return metric;
    case "perHour":
      return `${metric} / hora`;
    case "ratio": {
      const den = spec.denominator
        ? (catalog.get(spec.denominator) ?? humanizeKey(spec.denominator))
        : "?";
      return `${metric} / ${den}`;
    }
  }
}
