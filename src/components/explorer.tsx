"use client";

import { useMemo, useState } from "react";
import { Plus, Sparkles, X } from "lucide-react";
import {
  GROUP_ORDER,
  MODE_LABELS,
  buildSeries,
  lifetimeValue,
  modesFor,
  seriesLabel,
  type Bucket,
  type MetricInfo,
  type MetricKind,
  type Mode,
  type SeriesSpec,
  type SnapshotRow,
} from "@/lib/series";
import { SERIES_COLORS, TimeSeriesChart } from "./time-series-chart";
import { SeriesSummary, type SummaryItem } from "./series-summary";
import { formatCount } from "@/lib/stats";
import { cn } from "@/lib/utils";

type RawSnapshot = {
  capturedAt: string;
  playtimeForeverMin: number;
  metrics: Record<string, number>;
};

type Props = {
  snapshots: RawSnapshot[];
  catalog: MetricInfo[];
  presets: Preset[];
  /** Controlado pelo pai: um clique no painel carrega a métrica aqui. */
  specs: SeriesSpec[];
  onSpecsChange: (specs: SeriesSpec[]) => void;
  onPresetApplied?: () => void;
};

export type Preset = {
  label: string;
  specs: Omit<SeriesSpec, "id">[];
};

const RANGES = [
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
  { label: "1 ano", days: 365 },
  { label: "Tudo", days: null },
] as const;

const BUCKETS: { value: Bucket; label: string }[] = [
  { value: "raw", label: "Cada coleta" },
  { value: "day", label: "Dia" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
];

let nextId = 0;
const makeId = () => `q${nextId++}`;

export function Explorer({
  snapshots,
  catalog,
  presets,
  specs,
  onSpecsChange,
  onPresetApplied,
}: Props) {
  // Agrupar por dia com poucos dias de histórico esconde tudo: três coletas
  // do mesmo dia viram um ponto só. Começamos na granularidade mais fina e
  // deixamos o agrupamento para quando houver dias suficientes.
  const [bucket, setBucket] = useState<Bucket>(() => {
    if (snapshots.length < 2) return "raw";
    const dias =
      (new Date(snapshots[snapshots.length - 1].capturedAt).getTime() -
        new Date(snapshots[0].capturedAt).getTime()) /
      86_400_000;
    return dias >= 3 ? "day" : "raw";
  });
  const [rangeDays, setRangeDays] = useState<number | null>(90);

  // As séries vivem no pai para que um clique no painel possa carregá-las
  // aqui. Bucket e período continuam locais: são preferências de leitura,
  // não conteúdo.
  const setSpecs = (
    next: SeriesSpec[] | ((current: SeriesSpec[]) => SeriesSpec[]),
  ) => onSpecsChange(typeof next === "function" ? next(specs) : next);

  const labels = useMemo(
    () => new Map(catalog.map((m) => [m.key, m.label])),
    [catalog],
  );

  const kinds = useMemo(
    () => new Map(catalog.map((m) => [m.key, m.kind])),
    [catalog],
  );

  // Opções do seletor agrupadas — com ~200 contadores uma lista plana não
  // é navegável.
  const grouped = useMemo(() => {
    const map = new Map<string, { value: string; label: string }[]>();
    for (const m of catalog) {
      const bucketList = map.get(m.group) ?? [];
      bucketList.push({ value: m.key, label: m.label });
      map.set(m.group, bucketList);
    }
    return [...map.entries()].sort(
      (a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]),
    );
  }, [catalog]);

  // Datas chegam serializadas do Server Component; reidratamos uma vez só.
  const parsed = useMemo<SnapshotRow[]>(
    () =>
      snapshots.map((s) => ({
        capturedAt: new Date(s.capturedAt),
        playtimeForeverMin: s.playtimeForeverMin,
        metrics: s.metrics,
      })),
    [snapshots],
  );

  const inRange = useMemo(() => {
    if (rangeDays === null) return parsed;
    const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    return parsed.filter((s) => s.capturedAt.getTime() >= cutoff);
  }, [parsed, rangeDays]);

  const results = useMemo(
    () =>
      specs.map((spec) => {
        const resolved = { ...spec, kind: kinds.get(spec.metric) };
        return {
          id: spec.id,
          label: seriesLabel(resolved, labels),
          points: buildSeries(inRange, resolved, bucket),
          // Vitalício vem de todos os snapshots, não da janela: o total
          // acumulado não muda por causa do filtro de período.
          lifetime: lifetimeValue(resolved, parsed),
        };
      }),
    [specs, inRange, bucket, labels, kinds, parsed],
  );

  function update(id: string, patch: Partial<SeriesSpec>) {
    setSpecs((current) =>
      current.map((s) => {
        if (s.id !== id) return s;

        const next = { ...s, ...patch };
        // Trocar para um gauge com o modo em "por período" deixaria a série
        // vazia sem explicação — reconciliamos para um modo válido.
        const allowed = modesFor(kinds.get(next.metric) ?? "counter");
        if (!allowed.includes(next.mode)) next.mode = allowed[0];
        return next;
      }),
    );
  }

  function addQuery() {
    const fallback = catalog[0]?.key;
    if (!fallback) return;
    setSpecs((current) => [
      ...current,
      { id: makeId(), metric: fallback, mode: "delta" },
    ]);
  }

  function applyPreset(preset: Preset) {
    setSpecs(preset.specs.map((s) => ({ ...s, id: makeId() })));
    onPresetApplied?.();
  }

  const summary: SummaryItem[] = results.map((r, i) => {
    const ultimo = r.points[r.points.length - 1];
    return {
      id: r.id,
      label: r.label,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
      value: ultimo?.value ?? null,
      lifetime: r.lifetime,
      points: r.points.length,
      format: formatCount,
    };
  });

  // Com um ponto por série o gráfico não comunica nada: o eixo auto-escala
  // em torno do valor único e todo gráfico sai igual.
  const maxPontos = Math.max(0, ...results.map((r) => r.points.length));

  if (catalog.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-ink-faint">
        Ainda não há métricas coletadas para este jogo.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* ---------------------------- controles globais --------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          options={BUCKETS.map((b) => ({ value: b.value, label: b.label }))}
          value={bucket}
          onChange={(v) => setBucket(v as Bucket)}
        />

        <SegmentedControl
          options={RANGES.map((r) => ({ value: String(r.days), label: r.label }))}
          value={String(rangeDays)}
          onChange={(v) => setRangeDays(v === "null" ? null : Number(v))}
        />

        <span className="tnum ml-auto text-xs text-ink-faint">
          {inRange.length} coleta{inRange.length === 1 ? "" : "s"} no período
        </span>
      </div>

      {/* --------------------------------- números -------------------------------- */}
      <SeriesSummary items={summary} />

      {/* --------------------------------- gráfico -------------------------------- */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <TimeSeriesChart series={results} />

        {maxPontos === 1 && (
          <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-ink-faint">
            Um ponto por série ainda não desenha tendência — o gráfico ganha
            forma a partir da terceira coleta. Por enquanto, os números acima
            dizem mais.
          </p>
        )}
      </div>

      {/* -------------------------------- queries --------------------------------- */}
      <div className="space-y-2">
        {specs.map((spec, index) => (
          <QueryRow
            key={spec.id}
            spec={spec}
            color={SERIES_COLORS[index % SERIES_COLORS.length]}
            grouped={grouped}
            kind={kinds.get(spec.metric) ?? "counter"}
            pointCount={results[index]?.points.length ?? 0}
            onChange={(patch) => update(spec.id, patch)}
            onRemove={
              specs.length > 1
                ? () => setSpecs((c) => c.filter((s) => s.id !== spec.id))
                : undefined
            }
          />
        ))}

        <button
          onClick={addQuery}
          className="inline-flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-sm text-ink-muted transition hover:border-accent/50 hover:text-accent"
        >
          <Plus className="size-4" />
          Adicionar série
        </button>
      </div>

      {/* -------------------------------- presets --------------------------------- */}
      {presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <span className="flex items-center gap-1.5 text-xs text-ink-faint">
            <Sparkles className="size-3" />
            Painéis prontos:
          </span>
          {presets.map((preset) => (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset)}
              className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs text-ink-muted transition hover:border-accent/40 hover:text-accent"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- linha ---------------------------------- */

type GroupedOptions = [string, { value: string; label: string }[]][];

function QueryRow({
  spec,
  color,
  grouped,
  kind,
  pointCount,
  onChange,
  onRemove,
}: {
  spec: SeriesSpec;
  color: string;
  grouped: GroupedOptions;
  kind: MetricKind;
  pointCount: number;
  onChange: (patch: Partial<SeriesSpec>) => void;
  onRemove?: () => void;
}) {
  const firstKey = grouped[0]?.[1][0]?.value;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />

      <Select
        value={spec.metric}
        onChange={(v) => onChange({ metric: v })}
        grouped={grouped}
        className="min-w-44 flex-1"
      />

      <Select
        value={spec.mode}
        onChange={(v) => {
          const mode = v as Mode;
          onChange({
            mode,
            // Razão precisa de denominador e costuma ser exibida em %.
            denominator: mode === "ratio" ? (spec.denominator ?? firstKey) : undefined,
            scale: mode === "ratio" ? spec.scale : undefined,
          });
        }}
        // Um gauge não aceita delta nem "por hora": o valor já é do período.
        options={modesFor(kind).map((m) => ({ value: m, label: MODE_LABELS[m] }))}
        className="min-w-40"
      />

      {spec.mode === "ratio" && (
        <>
          <span className="text-xs text-ink-faint">dividido por</span>
          <Select
            value={spec.denominator ?? ""}
            onChange={(v) => onChange({ denominator: v })}
            grouped={grouped}
            className="min-w-40 flex-1"
          />
          <label className="flex items-center gap-1.5 text-xs text-ink-faint">
            <input
              type="checkbox"
              checked={spec.scale === 100}
              onChange={(e) => onChange({ scale: e.target.checked ? 100 : undefined })}
              className="accent-accent"
            />
            %
          </label>
        </>
      )}

      <span className="tnum ml-auto text-xs text-ink-faint">{pointCount} pts</span>

      {onRemove && (
        <button
          onClick={onRemove}
          aria-label="Remover série"
          className="rounded p-1 text-ink-faint transition hover:bg-surface-2 hover:text-danger"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/* -------------------------------- primitivos ------------------------------- */

function Select({
  value,
  onChange,
  options,
  grouped,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options?: { value: string; label: string }[];
  grouped?: GroupedOptions;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "rounded-md border border-line bg-surface-2 px-2 py-1.5 text-sm text-ink outline-none transition focus:border-accent/50",
        className,
      )}
    >
      {grouped?.map(([group, items]) => (
        <optgroup key={group} label={group}>
          {items.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ))}
      {options?.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex rounded-lg border border-line bg-surface p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-2.5 py-1.5 transition",
            value === o.value
              ? "bg-surface-2 text-ink"
              : "text-ink-faint hover:text-ink-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
