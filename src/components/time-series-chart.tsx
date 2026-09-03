"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesResult } from "@/lib/series";

// Paleta categórica: matizes bem separados, todos legíveis sobre o fundo
// escuro. A ordem é fixa para a cor de uma query não mudar ao adicionar outra.
// Referenciam as variáveis do tema em vez de literais: a mesma série troca
// de tom entre claro e escuro sem o componente saber qual está ativo.
export const SERIES_COLORS = [
  "var(--s1)",
  "var(--s2)",
  "var(--s3)",
  "var(--s4)",
  "var(--s5)",
  "var(--s6)",
];

type Props = {
  series: SeriesResult[];
  height?: number;
};

export function TimeSeriesChart({ series, height = 340 }: Props) {
  const withData = series.filter((s) => s.points.length > 0);

  if (withData.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-xl border border-dashed border-line px-6 text-center text-sm text-ink-faint"
      >
        Nenhum ponto para esta consulta. Modos derivados precisam de ao menos
        duas coletas dentro do período.
      </div>
    );
  }

  // Recharts precisa de um array de objetos com chave comum. Cada série tem
  // seus próprios instantes, então unimos por timestamp e deixamos buracos
  // como undefined — a linha simplesmente pula o ponto ausente.
  const byTime = new Map<number, Record<string, number | null>>();
  for (const s of withData) {
    for (const point of s.points) {
      const row = byTime.get(point.t) ?? { t: point.t };
      row[s.id] = point.value;
      byTime.set(point.t, row);
    }
  }

  const data = [...byTime.values()].sort((a, b) => (a.t ?? 0)! - (b.t ?? 0)!);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="var(--line-soft)" vertical={false} />

          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v: number) =>
              new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
            }
            stroke="var(--ink-faint)"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
          />

          <YAxis
            stroke="var(--ink-faint)"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={compact}
            domain={["auto", "auto"]}
          />

          <Tooltip
            cursor={{ stroke: "var(--ink-faint)" }}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--ink-muted)", marginBottom: 4 }}
            labelFormatter={(v) => new Date(Number(v)).toLocaleString("pt-BR")}
            formatter={(value, id) => {
              const match = withData.find((s) => s.id === id);
              return [precise(Number(value)), match?.label ?? String(id)];
            }}
          />

          <Legend
            verticalAlign="bottom"
            height={28}
            iconType="plainline"
            wrapperStyle={{ fontSize: 12, color: "var(--ink-muted)" }}
            formatter={(id) => withData.find((s) => s.id === id)?.label ?? String(id)}
          />

          {withData.map((s, i) => (
            <Line
              key={s.id}
              dataKey={s.id}
              name={s.id}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
              // Sem isso, uma coleta faltando parte a linha em dois pedaços.
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function compact(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  if (Math.abs(v) < 10 && !Number.isInteger(v)) return v.toFixed(2);
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function precise(v: number) {
  if (Math.abs(v) >= 1000) return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
