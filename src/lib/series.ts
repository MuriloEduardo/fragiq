/**
 * Motor de consulta das séries.
 *
 * O balde de dados é `StatSnapshot.metrics` — um JSONB com os contadores
 * crus do jogo no instante da coleta. Tudo que a análise oferece é
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

/**
 * Nem todo contador do jogo se comporta igual, e tratar todos como
 * cumulativos produz gráficos silenciosamente errados.
 *
 * - `counter`: só sobe (total_kills). Delta entre coletas = o período.
 * - `gauge`: reseta a cada partida (last_match_kills). O valor JÁ é o do
 *   período — tirar delta dele não significa nada.
 * - `hidden`: ruído (GI.lesson.* são flags de tutorial concluído).
 */
export type MetricKind = "counter" | "gauge" | "hidden";

export function classifyMetric(key: string): MetricKind {
  if (key.startsWith("GI.lesson.")) return "hidden";
  if (key.startsWith("last_match_")) return "gauge";
  return "counter";
}

/** Modos que fazem sentido para cada natureza de contador. */
export function modesFor(kind: MetricKind): Mode[] {
  return kind === "gauge"
    ? ["cumulative", "ratio"]
    : ["delta", "cumulative", "perHour", "ratio"];
}

export type SeriesSpec = {
  id: string;
  metric: string;
  /** Resolvido a partir do catálogo; decide como a série é calculada. */
  kind?: MetricKind;
  /** Recorte por mapa/modo, quando o bot registrou o contexto. */
  filter?: ContextFilter;
  /** Só usado quando mode === "ratio". */
  denominator?: string;
  mode: Mode;
  /** Multiplica o resultado — 100 transforma razão em porcentagem. */
  scale?: number;
};

/**
 * Recorte por contexto de partida.
 *
 * Aplicado sobre os DELTAS, não sobre os snapshots. O `matchMode` descreve a
 * partida que produziu o delta *até* aquele snapshot, então filtrar os
 * snapshots e depois derivar somaria as partidas descartadas no meio: um
 * delta entre dois competitivos separados por um casual incluiria o casual.
 */
export type ContextFilter = {
  mode?: string | null;
  map?: string | null;
};

export type SnapshotRow = {
  capturedAt: Date;
  playtimeForeverMin: number;
  metrics: Record<string, number>;
  /** Observado pelo bot de presença; ausente nas coletas sem bot. */
  matchMap?: string | null;
  matchMode?: string | null;
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

function matchesFilter(row: SnapshotRow, filter?: ContextFilter): boolean {
  if (!filter) return true;
  if (filter.mode && row.matchMode !== filter.mode) return false;
  if (filter.map && row.matchMap !== filter.map) return false;
  return true;
}

/** Modo e mapa que aparecem nas coletas — para montar o seletor. */
export function contextOptions(snapshots: SnapshotRow[]) {
  const modes = new Map<string, number>();
  const maps = new Map<string, number>();

  for (const s of snapshots) {
    if (s.matchMode) modes.set(s.matchMode, (modes.get(s.matchMode) ?? 0) + 1);
    if (s.matchMap) maps.set(s.matchMap, (maps.get(s.matchMap) ?? 0) + 1);
  }

  const ordenar = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return { modes: ordenar(modes), maps: ordenar(maps) };
}

function num(snap: SnapshotRow, key: string): number | null {
  const value = snap.metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Pares (base, leitura) de onde sai todo modo derivado.
 *
 * Vive separado porque o cabeçalho do período e os gráficos precisam
 * concordar: se cada um caminhasse pela série à sua maneira, a tela diria
 * "5 partidas" enquanto a linha ao lado plotaria outra coisa, e nenhum dos
 * dois estaria obviamente errado.
 *
 * Base é a última leitura confiável, não a anterior. A Web API da Steam às
 * vezes responde de um nó atrasado e devolve um contador vitalício MENOR que
 * o da coleta passada. Descartar só o delta negativo não basta: a leitura
 * baixa viraria base do par seguinte, e esse delta mediria a recuperação do
 * atraso em vez da partida. Medido na conta real: 20159 → 20153 → 20165 vira
 * uma "partida" de 12 abates em 2 minutos, quando de fato foram 6 desde o
 * pico anterior.
 */
function* paresDerivados(
  rows: SnapshotRow[],
  metric: string,
  filter?: ContextFilter,
): Generator<{ prev: SnapshotRow; curr: SnapshotRow; before: number; after: number }> {
  if (rows.length === 0) return;

  let base = rows[0];
  let abaixoDaBase = 0;

  for (let i = 1; i < rows.length; i++) {
    const curr = rows[i];

    const before = num(base, metric);
    const after = num(curr, metric);

    if (before !== null && after !== null && after < before) {
      // Uma leitura sozinha abaixo da base é atraso da Steam. Duas seguidas
      // não: aí o jogo zerou os contadores de verdade e o novo chão é este.
      //
      // Custo assumido: a base vira a SEGUNDA leitura baixa, então o que foi
      // jogado entre a primeira e a segunda não vira ponto. Perde-se um
      // intervalo por reset — e reset de stats do CS2 é ação deliberada do
      // jogador, não rotina. Rastrear a leitura candidata para recuperar esse
      // intervalo custa mais complexidade do que o caso raro paga.
      if (++abaixoDaBase >= 2) {
        base = curr;
        abaixoDaBase = 0;
      }
      continue;
    }
    abaixoDaBase = 0;

    // A base avança mesmo quando o ponto é descartado pelo filtro, senão um
    // delta passaria por cima da partida excluída e somaria o que ela rendeu.
    const prev = base;
    base = curr;

    // O delta pertence à partida descrita pelo snapshot final do par.
    if (!matchesFilter(curr, filter)) continue;
    if (before === null || after === null) continue;

    yield { prev, curr, before, after };
  }
}

/**
 * O par mais recente de uma métrica, para descrever o período que o painel
 * está mostrando: de quando até quando, e o que aconteceu no meio.
 */
export function ultimoPar(
  snapshots: SnapshotRow[],
  metric: string,
  filter?: ContextFilter,
  bucket: Bucket = "raw",
): { prev: SnapshotRow; curr: SnapshotRow } | null {
  let ultimo: { prev: SnapshotRow; curr: SnapshotRow } | null = null;
  for (const { prev, curr } of paresDerivados(collapse(snapshots, bucket), metric, filter)) {
    ultimo = { prev, curr };
  }
  return ultimo;
}

/** Delta de uma métrica dentro de um par já escolhido. */
export function deltaEntre(
  par: { prev: SnapshotRow; curr: SnapshotRow },
  metric: string,
): number | null {
  const before = num(par.prev, metric);
  const after = num(par.curr, metric);
  if (before === null || after === null) return null;
  const d = after - before;
  return d < 0 ? null : d;
}

export function buildSeries(
  snapshots: SnapshotRow[],
  spec: SeriesSpec,
  bucket: Bucket,
): SeriesPoint[] {
  const rows = collapse(snapshots, bucket);
  const scale = spec.scale ?? 1;
  const points: SeriesPoint[] = [];
  const kind = spec.kind ?? classifyMetric(spec.metric);

  // Gauge já é o valor do período: plotamos direto, e a razão é ponto a
  // ponto. Aplicar delta aqui compararia duas partidas diferentes.
  if (kind === "gauge") {
    for (const row of rows) {
      const value = num(row, spec.metric);
      if (value === null) continue;

      if (spec.mode === "ratio") {
        if (!spec.denominator) continue;
        const den = num(row, spec.denominator);
        if (den === null || den === 0) continue;
        points.push({ t: row.capturedAt.getTime(), value: (value / den) * scale });
        continue;
      }

      points.push({ t: row.capturedAt.getTime(), value: value * scale });
    }
    return points;
  }

  if (spec.mode === "cumulative") {
    for (const row of rows) {
      const value = num(row, spec.metric);
      if (value !== null) points.push({ t: row.capturedAt.getTime(), value: value * scale });
    }
    return points;
  }

  // Os demais modos são derivados: precisam de um par de pontos.
  for (const { prev, curr, before, after } of paresDerivados(rows, spec.metric, spec.filter)) {
    const delta = after - before;
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
  kind: MetricKind;
  /** Agrupamento para o seletor — com ~200 métricas, uma lista plana é inútil. */
  group: string;
  /** Quanto o contador cresceu no histórico — proxy de "esta métrica é útil". */
  growth: number;
};

/**
 * O que a análise oferece como recorte. Sai dos próprios dados, não de uma
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
      kind: classifyMetric(key),
      label: schema?.[key] ?? humanizeKey(key),
      group: groupOf(key),
      growth: (last[key] ?? 0) - (first[key] ?? 0),
    }))
    .filter((m) => m.kind !== "hidden")
    .sort(
      (a, b) =>
        GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) ||
        b.growth - a.growth ||
        a.label.localeCompare(b.label),
    );
}

/**
 * CS2 devolve ~200 contadores com nomes crus. Sem agrupar e sem rotular, o
 * lista plana de métricas é inutilizável.
 */
export const GROUP_ORDER: string[] = [
  "Geral",
  "Por arma",
  "Por mapa",
  "Última partida",
  "Outros",
];

export function groupOf(key: string): string {
  if (key.startsWith("last_match_")) return "Última partida";
  if (/_map_/.test(key)) return "Por mapa";
  if (/^total_(kills|shots|hits)_[a-z0-9]+$/.test(key) && key !== "total_kills_headshot")
    return "Por arma";
  if (key.startsWith("total_")) return "Geral";
  return "Outros";
}

const PREFIX_LABELS: [RegExp, string][] = [
  [/^total_kills_(?!headshot)/, "Kills"],
  [/^total_hits_/, "Acertos"],
  [/^total_shots_/, "Tiros"],
  [/^total_wins_map_/, "Vitórias"],
  [/^total_rounds_map_/, "Rounds"],
  [/^last_match_/, "Última partida"],
];

export function humanizeKey(key: string) {
  for (const [pattern, prefix] of PREFIX_LABELS) {
    if (pattern.test(key)) {
      const rest = key.replace(pattern, "");
      // Nome de mapa (de_dust2) fica melhor cru do que "humanizado".
      const suffix = /_map_/.test(key) || /^[a-z]{2}_/.test(rest)
        ? rest
        : rest.replace(/_/g, " ");
      return `${prefix} · ${suffix}`;
    }
  }

  return key
    .replace(/^total_/, "")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

export const MODE_LABELS: Record<Mode, string> = {
  cumulative: "Valor da coleta",
  delta: "Por período",
  perHour: "Por hora jogada",
  ratio: "Razão entre duas métricas",
};

/**
 * O mesmo cálculo da série, mas sobre os totais vitalícios do último
 * snapshot — ou seja, o número que a Steam mostraria.
 *
 * É a comparação que dá sentido ao produto: "0,94 neste período contra 0,70
 * na vida inteira" diz algo; "0,94" sozinho não diz nada. E funciona já na
 * segunda coleta, quando o gráfico ainda é um ponto só.
 *
 * Devolve null onde a comparação não faria sentido: a contagem crua de um
 * período não se compara com o total acumulado, e gauge não tem vitalício.
 */
/**
 * Detecta se os contadores de última partida estão congelados para este
 * jogador.
 *
 * Observamos `last_match_*` parado enquanto `total_matches_played` subia —
 * provável legado do CS:GO que a Valve deixou de escrever no CS2. Como não
 * há confirmação oficial e o comportamento pode variar por modo, detectamos
 * por evidência em vez de assumir.
 *
 * Só responde com duas ou mais coletas: com uma não há como saber.
 */
export function gaugesLookStale(snapshots: SnapshotRow[]): boolean {
  if (snapshots.length < 2) return false;

  const primeiro = snapshots[0].metrics;
  const ultimo = snapshots[snapshots.length - 1].metrics;

  // Sem partida nova no intervalo, parado é o esperado — não é sinal de nada.
  const jogou = (ultimo.total_matches_played ?? 0) > (primeiro.total_matches_played ?? 0);
  if (!jogou) return false;

  const gauges = Object.keys(ultimo).filter((k) => classifyMetric(k) === "gauge");
  if (gauges.length === 0) return false;

  return gauges.every((k) => ultimo[k] === primeiro[k]);
}

export function lifetimeValue(
  spec: SeriesSpec,
  snapshots: SnapshotRow[],
): number | null {
  const last = snapshots[snapshots.length - 1];
  if (!last) return null;
  if ((spec.kind ?? classifyMetric(spec.metric)) === "gauge") return null;

  const value = num(last, spec.metric);
  if (value === null) return null;

  const scale = spec.scale ?? 1;

  if (spec.mode === "ratio") {
    if (!spec.denominator) return null;
    const den = num(last, spec.denominator);
    if (den === null || den === 0) return null;
    return (value / den) * scale;
  }

  if (spec.mode === "perHour") {
    const hours = last.playtimeForeverMin / 60;
    return hours > 0 ? value / hours : null;
  }

  return null;
}

export function seriesLabel(spec: SeriesSpec, catalog: Map<string, string>): string {
  const metric = catalog.get(spec.metric) ?? humanizeKey(spec.metric);
  const kind = spec.kind ?? classifyMetric(spec.metric);

  switch (spec.mode) {
    case "cumulative":
      // Para um gauge o valor não é um acumulado; chamá-lo de "total" mentiria.
      return kind === "gauge" ? metric : `${metric} (total)`;
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
