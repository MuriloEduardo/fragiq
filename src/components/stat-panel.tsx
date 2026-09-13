"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  buildSeries,
  lifetimeValue,
  type ContextFilter,
  type SeriesSpec,
  type SnapshotRow,
} from "@/lib/series";
import { Sparkline } from "./sparkline";
import { cn } from "@/lib/utils";

/**
 * Um tile por estatística, e cada tile é a porta para o gráfico inteiro.
 *
 * O número é o conteúdo; a linha é contexto; a página própria é onde se
 * olha de perto. Não há legenda nem explicação dentro do tile — o rótulo,
 * o valor, o vitalício e a distância dele dizem tudo que cabe num olhar.
 */

export type PanelStat = {
  key: string;
  label: string;
  /** Unidade sufixada ao número. Vazio para razões puras como K/D. */
  unit?: string;
  spec: Omit<SeriesSpec, "id">;
  decimals: number;
};

type Props = {
  stats: PanelStat[];
  snapshots: SnapshotRow[];
  filter?: ContextFilter;
  appId: number;
  /** Quantos tiles mostrar; o resto fica para a aba Estatísticas. */
  limite?: number;
};

export function StatPanel({ stats, snapshots, filter, appId, limite }: Props) {
  const tiles = stats.map((stat) => {
    const spec: SeriesSpec = { ...stat.spec, id: stat.key, filter };
    const points = buildSeries(snapshots, spec, "raw");
    return {
      stat,
      values: points.map((p) => p.value),
      current: points[points.length - 1]?.value ?? null,
      lifetime: lifetimeValue(spec, snapshots),
    };
  });

  const utilizaveis = tiles
    .filter((t) => t.current !== null || t.lifetime !== null)
    .slice(0, limite ?? tiles.length);

  if (utilizaveis.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-6 py-8 text-center text-sm text-ink-faint">
        Nenhuma destas estatísticas está disponível ainda.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {utilizaveis.map(({ stat, values, current, lifetime }) => (
        <Tile
          key={stat.key}
          appId={appId}
          stat={stat}
          values={values}
          current={current}
          lifetime={lifetime}
        />
      ))}
    </div>
  );
}

function Tile({
  appId,
  stat,
  values,
  current,
  lifetime,
}: {
  appId: number;
  stat: PanelStat;
  values: number[];
  current: number | null;
  lifetime: number | null;
}) {
  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", {
      minimumFractionDigits: stat.decimals,
      maximumFractionDigits: stat.decimals,
    }) + (stat.unit ?? "");

  const principal = current ?? lifetime;
  const ehVitalicio = current === null && lifetime !== null;
  const variacao =
    current !== null && lifetime !== null && lifetime !== 0
      ? (current - lifetime) / Math.abs(lifetime)
      : null;
  const sobe = variacao !== null && variacao > 0.005;

  return (
    <Link
      href={`/games/${appId}/painel/${stat.key}`}
      className="group relative rounded-2xl bg-surface p-5 ring-1 ring-line transition hover:ring-accent/50"
    >
      <ArrowUpRight
        className="absolute top-4 right-4 size-4 text-ink-faint opacity-0 transition group-hover:opacity-100"
        aria-hidden
      />
      <p className="hud">{stat.label}</p>

      <p className="num mt-2 text-3xl font-semibold">
        {principal === null ? <span className="text-ink-faint">—</span> : fmt(principal)}
      </p>

      <div className="num mt-1 flex min-h-4 items-baseline gap-2 text-xs">
        {ehVitalicio ? (
          <span className="text-ink-faint">vitalício</span>
        ) : lifetime !== null ? (
          <>
            <span className="text-ink-faint">{fmt(lifetime)}</span>
            {variacao !== null && Math.abs(variacao) >= 0.005 && (
              <span className={cn("font-medium", sobe ? "text-accent" : "text-ink-muted")}>
                {sobe ? "+" : ""}
                {(variacao * 100).toFixed(0)}%
              </span>
            )}
          </>
        ) : null}
      </div>

      <div className="mt-4 h-8">
        {values.length >= 2 ? (
          <Sparkline values={values} baseline={lifetime} className="h-8 w-full" />
        ) : (
          <div className="h-8 border-b border-dashed border-line" />
        )}
      </div>
    </Link>
  );
}
