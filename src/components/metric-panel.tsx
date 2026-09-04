"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { MetricChart, type ChartPoint } from "./metric-chart";
import { cn } from "@/lib/utils";

export type MetricSeries = {
  key: string;
  label: string;
  /** Valor vitalício mais recente. */
  current: string;
  /** Variação entre o penúltimo e o último ponto da série derivada. */
  change: number | null;
  changeLabel: string | null;
  higherIsBetter: boolean;
  lifetime: ChartPoint[];
  perPeriod: ChartPoint[];
  formatKind: "count" | "percent" | "decimal";
};

const formatters: Record<MetricSeries["formatKind"], (v: number) => string> = {
  count: (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)),
  percent: (v) => `${v.toFixed(1)}%`,
  decimal: (v) => v.toFixed(2),
};

export function MetricPanel({ series }: { series: MetricSeries[] }) {
  // "Vitalício" é a média desde sempre; "por período" é só o que aconteceu
  // entre duas coletas. A segunda é a que revela evolução.
  const [mode, setMode] = useState<"lifetime" | "perPeriod">("perPeriod");

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold tracking-wide text-ink-muted uppercase">
          Evolução
        </h2>

        <div className="flex rounded-lg border border-line bg-surface p-0.5 text-xs">
          {(
            [
              ["perPeriod", "Por período"],
              ["lifetime", "Vitalício"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setMode(value)}
              className={cn(
                "rounded-md px-3 py-1.5 transition",
                mode === value
                  ? "bg-surface-2 text-ink"
                  : "text-ink-faint hover:text-ink-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-ink-faint">
        {mode === "perPeriod"
          ? "Desempenho entre coletas consecutivas — mostra a forma atual, sem a diluição do histórico."
          : "Média acumulada desde sempre. Estável, mas lenta para reagir."}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {series.map((metric) => (
          <article
            key={metric.key}
            className="rounded-xl border border-line bg-surface p-4"
          >
            <header className="mb-3 flex items-baseline justify-between gap-3">
              <div>
                <h3 className="text-sm text-ink-muted">{metric.label}</h3>
                <p className="tnum mt-0.5 text-2xl font-semibold">{metric.current}</p>
              </div>
              <Trend metric={metric} />
            </header>

            <MetricChart
              points={mode === "lifetime" ? metric.lifetime : metric.perPeriod}
              formatValue={formatters[metric.formatKind]}
            />
          </article>
        ))}
      </div>
    </section>
  );
}

function Trend({ metric }: { metric: MetricSeries }) {
  if (metric.change === null || metric.changeLabel === null) return null;

  const flat = Math.abs(metric.change) < 0.0001;
  const good = metric.higherIsBetter ? metric.change > 0 : metric.change < 0;

  const Icon = flat ? Minus : metric.change > 0 ? ArrowUp : ArrowDown;

  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
        flat && "bg-surface-2 text-ink-faint",
        !flat && good && "bg-good-soft text-good",
        !flat && !good && "bg-danger/10 text-danger",
      )}
      title="Variação em relação ao período anterior"
    >
      <Icon className="size-3" />
      {metric.changeLabel}
    </span>
  );
}
