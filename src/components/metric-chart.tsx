"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ChartPoint = {
  t: number; // epoch ms — o eixo é temporal, não categórico.
  value: number;
  label: string;
};

type Props = {
  points: ChartPoint[];
  color?: string;
  formatValue: (v: number) => string;
};

export function MetricChart({ points, color = "#4ade80", formatValue }: Props) {
  if (points.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-line text-xs text-ink-faint">
        Precisa de ao menos duas coletas para desenhar a evolução.
      </div>
    );
  }

  const id = `grad-${color.replace("#", "")}`;

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="#1d212a" vertical={false} />

          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v: number) =>
              new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
            }
            stroke="#6b7280"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
          />

          <YAxis
            stroke="#6b7280"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={formatValue}
            // Escala apertada nos dados: com domínio começando em zero uma
            // variação de K/D 1.02 → 1.09 vira uma linha reta.
            domain={["auto", "auto"]}
          />

          <Tooltip
            cursor={{ stroke: "#3a4050" }}
            contentStyle={{
              background: "#12141a",
              border: "1px solid #262a35",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#949cab" }}
            labelFormatter={(v) => new Date(Number(v)).toLocaleString("pt-BR")}
            formatter={(v) => [formatValue(Number(v)), ""] as [string, string]}
          />

          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${id})`}
            dot={{ r: 2, fill: color }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
