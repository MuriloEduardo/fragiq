"use client";

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
 * Um tile fixo por estatística, todos visíveis de uma vez.
 *
 * O explorador sozinho obrigava a escolher uma métrica por vez, e com poucas
 * coletas todo gráfico saía idêntico — o eixo auto-escala em torno de um
 * ponto único. Aqui a leitura é o número, e a linha é contexto: é o que a
 * forma pede quando o dado é "um valor atual mais tendência".
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
};

export function StatPanel({ stats, snapshots, filter }: Props) {
  const tiles = stats.map((stat) => {
    const spec: SeriesSpec = { ...stat.spec, id: stat.key, filter };
    // "raw": cada coleta é um ponto. Agrupar por dia colapsaria justamente a
    // granularidade por partida que a coleta frequente produz — e um tile
    // quer mostrar movimento, não uma média diária.
    const points = buildSeries(snapshots, spec, "raw");
    return {
      stat,
      values: points.map((p) => p.value),
      current: points[points.length - 1]?.value ?? null,
      lifetime: lifetimeValue(spec, snapshots),
    };
  });

  const utilizaveis = tiles.filter((t) => t.current !== null || t.lifetime !== null);

  if (utilizaveis.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-6 py-8 text-center text-sm text-ink-faint">
        Nenhuma destas estatísticas está disponível para este jogo ainda.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {utilizaveis.map(({ stat, values, current, lifetime }) => (
        <Tile
          key={stat.key}
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
  stat,
  values,
  current,
  lifetime,
}: {
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

  // Sem valor de período ainda, o vitalício é o que há de real para mostrar.
  const principal = current ?? lifetime;
  const ehVitalicio = current === null && lifetime !== null;

  const variacao =
    current !== null && lifetime !== null && lifetime !== 0
      ? (current - lifetime) / Math.abs(lifetime)
      : null;

  return (
    <div className="rounded-xl border border-line bg-surface p-4 text-left">
      <p className="text-xs leading-snug text-ink-muted">{stat.label}</p>

      <p className="tnum mt-1.5 text-2xl font-semibold">
        {principal === null ? (
          <span className="text-base font-normal text-ink-faint">—</span>
        ) : (
          fmt(principal)
        )}
      </p>

      <div className="mt-1 flex min-h-4 items-baseline gap-2">
        {ehVitalicio ? (
          <span className="text-[11px] text-ink-faint">vitalício</span>
        ) : lifetime !== null ? (
          <>
            <span className="tnum text-[11px] text-ink-faint">
              vitalício {fmt(lifetime)}
            </span>
            {variacao !== null && Math.abs(variacao) >= 0.005 && (
              <span
                className={cn(
                  "tnum text-[11px] font-medium",
                  variacao > 0 ? "text-accent" : "text-ink-muted",
                )}
              >
                {variacao > 0 ? "+" : ""}
                {(variacao * 100).toFixed(0)}%
              </span>
            )}
          </>
        ) : null}
      </div>

      <div className="mt-3 h-8">
        {values.length >= 2 ? (
          <Sparkline values={values} baseline={lifetime} className="h-8 w-full" />
        ) : (
          <div className="flex h-8 items-center text-[11px] text-ink-faint">
            {values.length === 1
              ? "1 período — a linha aparece na próxima coleta"
              : "aguardando a segunda coleta"}
          </div>
        )}
      </div>
    </div>
  );
}
