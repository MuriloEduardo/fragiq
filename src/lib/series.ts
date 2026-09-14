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
  /** Presente quando a linha veio do banco; ausente em séries derivadas. */
  id?: string;
  capturedAt: Date;
  playtimeForeverMin: number;
  metrics: Record<string, number>;
  /** Observado pelo bot de presença; ausente nas coletas sem bot. */
  matchMap?: string | null;
  matchMode?: string | null;
  matchScore?: string | null;
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
 * O par mais recente em que a métrica de fato se moveu.
 *
 * O "de fato" não é detalhe. O cron roda todo dia, jogando ou não, então o
 * último par de coletas costuma ser um intervalo em que nada aconteceu. Usar
 * esse par para descrever o período fazia o painel anunciar "0 partidas, 0
 * rounds" acima de números que vinham de outro intervalo — os modos por round
 * descartam denominador zero e caem no par anterior sozinhos. Cabeçalho
 * falando de uma janela e números de outra.
 */
export function ultimoPar(
  snapshots: SnapshotRow[],
  metric: string,
  filter?: ContextFilter,
  bucket: Bucket = "raw",
): { prev: SnapshotRow; curr: SnapshotRow } | null {
  let ultimo: { prev: SnapshotRow; curr: SnapshotRow } | null = null;
  for (const { prev, curr, before, after } of paresDerivados(
    collapse(snapshots, bucket),
    metric,
    filter,
  )) {
    if (after > before) ultimo = { prev, curr };
  }
  return ultimo;
}

/**
 * Todos os pares em que a métrica subiu, na ordem em que aconteceram.
 *
 * É a lista de "intervalos com jogo" — o que o analista lê como partidas
 * quando o bot registrou mapa e modo, e como sessões quando não registrou.
 * Mesma caminhada de `ultimoPar`, para que a lista e o cabeçalho concordem.
 */
export function paresDeMovimento(
  snapshots: SnapshotRow[],
  metric: string,
  filter?: ContextFilter,
): { prev: SnapshotRow; curr: SnapshotRow }[] {
  const pares: { prev: SnapshotRow; curr: SnapshotRow }[] = [];
  for (const { prev, curr, before, after } of paresDerivados(snapshots, metric, filter)) {
    if (after > before) pares.push({ prev, curr });
  }
  return pares;
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

/**
 * O "normal" contra o qual um período é comparado.
 *
 * Sem recorte é o vitalício da Steam: o último contador, que soma todos os
 * modos desde sempre. Com recorte por modo ou mapa o vitalício não serve —
 * comparar uma noite de Premier com um total que mistura casual é o que
 * o submenu de modos existe para não fazer — então a referência vira o
 * acumulado das sessões daquele recorte: menor, mas do mesmo jogo.
 */
export function lifetimeValue(
  spec: SeriesSpec,
  snapshots: SnapshotRow[],
): number | null {
  if (spec.filter?.mode || spec.filter?.map) return accumulatedValue(spec, snapshots);

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

function accumulatedValue(spec: SeriesSpec, snapshots: SnapshotRow[]): number | null {
  if ((spec.kind ?? classifyMetric(spec.metric)) === "gauge") return null;
  const scale = spec.scale ?? 1;
  let valor = 0;
  let denominador = 0;
  let minutos = 0;
  let pares = 0;
  for (const par of paresDeMovimento(snapshots, spec.metric, spec.filter)) {
    valor += deltaEntre(par, spec.metric) ?? 0;
    if (spec.denominator) denominador += deltaEntre(par, spec.denominator) ?? 0;
    minutos += Math.max(0, par.curr.playtimeForeverMin - par.prev.playtimeForeverMin);
    pares++;
  }
  if (pares === 0) return null;

  if (spec.mode === "ratio") {
    if (!spec.denominator || denominador === 0) return null;
    return (valor / denominador) * scale;
  }
  if (spec.mode === "perHour") {
    return minutos > 0 ? valor / (minutos / 60) : null;
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

/* ------------------------- série por sessão e o normal ------------------------- */

/**
 * Um ponto da série de uma estatística, com o que a interface precisa para
 * julgá-lo: quanta amostra ele tem, de que modo é, e de qual coleta veio.
 *
 * Substitui o `number[]` que os gráficos recebiam. Sem amostra não dá para
 * marcar um ponto como fraco; sem modo não dá para a lente destacá-lo; sem
 * o id da coleta não dá para excluir a própria sessão do normal.
 */
export type PontoSerie = {
  t: number;
  valor: number;
  rounds: number;
  partidas: number;
  modo: string | null;
  sessaoId: string | null;
  /** Amostra abaixo do mínimo da estatística: desenhado vazado, fora do domínio e do normal. */
  fraco: boolean;
};

export type Lente = { modo: string | null };

/** O que uma estatística precisa dizer para virar série e normal. */
export type EspecificacaoSerie = {
  spec: Omit<SeriesSpec, "id" | "filter">;
  amostra: { de: "rounds" | "partidas"; minimo: number };
  movel?: number;
};

/**
 * A série inteira de uma razão, uma sessão por ponto, sem recorte.
 *
 * O modo nunca entra aqui como filtro: a lente é aplicada na apresentação
 * (pontos destacados) e no normal (`normalDe`), nunca removendo pontos.
 * Stats por partida (`movel`) usam a razão móvel das últimas N sessões,
 * porque a razão de uma sessão de duas partidas só sabe dizer 0, 50 ou 100.
 */
export function serieDeSessoes(rows: SnapshotRow[], stat: EspecificacaoSerie): PontoSerie[] {
  const { spec } = stat;
  if (spec.mode !== "ratio" || !spec.denominator) return [];
  const scale = spec.scale ?? 1;
  const janela: { n: number; d: number }[] = [];
  const pontos: PontoSerie[] = [];

  for (const par of paresDeMovimento(rows, "total_rounds_played")) {
    const n = deltaEntre(par, spec.metric);
    const d = deltaEntre(par, spec.denominator);
    if (n === null || d === null) continue;
    const rounds = deltaEntre(par, "total_rounds_played") ?? 0;
    const partidas = deltaEntre(par, "total_matches_played") ?? 0;

    let numerador = n;
    let denominador = d;
    if (stat.movel) {
      janela.push({ n, d });
      if (janela.length > stat.movel) janela.shift();
      numerador = janela.reduce((s, j) => s + j.n, 0);
      denominador = janela.reduce((s, j) => s + j.d, 0);
    }
    if (denominador <= 0) continue;

    const amostra = stat.amostra.de === "rounds" ? rounds : partidas;
    pontos.push({
      t: par.curr.capturedAt.getTime(),
      valor: (numerador / denominador) * scale,
      rounds,
      partidas,
      modo: par.curr.matchMode ?? null,
      sessaoId: par.curr.id ?? null,
      fraco: amostra < stat.amostra.minimo,
    });
  }
  return pontos;
}

/** Mínimos para um modo ter normal próprio. Calibrados a olho; medir com dados reais. */
export const NORMAL_MIN_SESSOES = 5;
export const NORMAL_MIN_ROUNDS = 150;

export type Normal =
  | { tipo: "vitalicio"; valor: number; rotulo: "vitalício" }
  | { tipo: "modo"; valor: number; rotulo: string; sessoes: number }
  | {
      /** A lente pediu um modo sem base: cai no vitalício e diz isso. */
      tipo: "vitalicio-fraco";
      valor: number;
      rotulo: string;
      progresso: { sessoes: number; minimo: number };
    }
  | { tipo: "nenhum"; motivo: "sem-vitalicio" | "sem-sessoes" };

/**
 * O normal contra o qual um valor é lido.
 *
 * Sem lente é o vitalício da Steam: existe desde a primeira coleta e uma
 * sessão pesa quase nada nele. Com lente é o acumulado das sessões fortes
 * daquele modo — nunca contando a sessão que está sendo lida, senão uma
 * sessão sozinha vira o seu próprio normal e o delta é zero por
 * construção — e só quando há sessões e rounds suficientes. Abaixo disso
 * volta ao vitalício, com rótulo dizendo que o modo ainda não tem base e
 * quantas sessões faltam: comparar é a promessa do produto, fingir que o
 * vitalício é o normal do Premier não é.
 */
export function normalDe(
  rows: SnapshotRow[],
  stat: EspecificacaoSerie,
  lente: Lente,
  sessaoId: string | null,
  rotuloDoModo: (modo: string) => string = (m) => m,
): Normal {
  const vitalicio = lifetimeValue({ ...stat.spec, id: stat.spec.metric }, rows);
  if (!lente.modo) {
    return vitalicio === null ? { tipo: "nenhum", motivo: "sem-vitalicio" } : { tipo: "vitalicio", valor: vitalicio, rotulo: "vitalício" };
  }

  const base = serieDeSessoes(rows, { ...stat, movel: undefined }).filter(
    (p) => p.modo === lente.modo && !p.fraco && p.sessaoId !== sessaoId,
  );
  const rounds = base.reduce((s, p) => s + p.rounds, 0);
  const rotulo = rotuloDoModo(lente.modo);
  if (base.length >= NORMAL_MIN_SESSOES && rounds >= NORMAL_MIN_ROUNDS) {
    const valor = acumuladoDe(rows, stat, base);
    if (valor !== null) return { tipo: "modo", valor, rotulo: `normal · ${rotulo} · ${base.length} sessões`, sessoes: base.length };
  }
  if (vitalicio === null) return { tipo: "nenhum", motivo: "sem-vitalicio" };
  return {
    tipo: "vitalicio-fraco",
    valor: vitalicio,
    rotulo: `vs vitalício · ${rotulo} sem base (${base.length} de ${NORMAL_MIN_SESSOES})`,
    progresso: { sessoes: base.length, minimo: NORMAL_MIN_SESSOES },
  };
}

/** A razão acumulada das sessões escolhidas (soma dos deltas, não média das razões). */
function acumuladoDe(rows: SnapshotRow[], stat: EspecificacaoSerie, escolhidas: PontoSerie[]): number | null {
  return acumuladoDasSessoes(rows, stat, new Set(escolhidas.map((p) => p.sessaoId)));
}

/** A mesma conta, para quem já tem os ids das coletas que fecharam as sessões. */
export function acumuladoDasSessoes(rows: SnapshotRow[], stat: EspecificacaoSerie, ids: Set<string | null>): number | null {
  const { spec } = stat;
  if (spec.mode !== "ratio" || !spec.denominator) return null;
  let n = 0;
  let d = 0;
  for (const par of paresDeMovimento(rows, "total_rounds_played")) {
    if (!ids.has(par.curr.id ?? null)) continue;
    n += deltaEntre(par, spec.metric) ?? 0;
    d += deltaEntre(par, spec.denominator) ?? 0;
  }
  return d > 0 ? (n / d) * (spec.scale ?? 1) : null;
}

/** Uma série sem sessão por trás (métricas cruas, demonstrações): só valores. */
export function pontosSimples(valores: number[]): PontoSerie[] {
  return valores.map((valor, i) => ({ t: i, valor, rounds: Infinity, partidas: Infinity, modo: null, sessaoId: null, fraco: false }));
}

/** Pontos de `buildSeries` no formato dos gráficos, sem amostra nem modo (métricas cruas). */
export function pontosDeSerie(pontos: SeriesPoint[]): PontoSerie[] {
  return pontos.map((p) => ({ t: p.t, valor: p.value, rounds: Infinity, partidas: Infinity, modo: null, sessaoId: null, fraco: false }));
}
