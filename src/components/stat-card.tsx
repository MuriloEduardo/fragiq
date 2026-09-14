import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { PanelStat } from "@/lib/cs2-panel";
import type { Normal, PontoSerie } from "@/lib/series";
import { calcularDelta } from "@/lib/delta";
import { formatarDia, formatarStat } from "@/lib/formato";
import { rotularModo } from "@/lib/cs2-labels";
import { Sparkline } from "./sparkline";
import { DeltaChip } from "./delta-chip";
import { cn } from "@/lib/utils";

/**
 * O cartão de uma estatística — o mesmo no Resumo, em Estatísticas e no
 * topo da página da estatística. Seis zonas, sempre na mesma ordem: rótulo
 * (e o chip da lente, quando há), número e chip de delta, uma linha de
 * referência, o gráfico, o rodapé com a cobertura. Nada aqui é calculado:
 * o cartão recebe a série, o normal e a lente e só mostra.
 */
export type StatCardProps = {
  stat: PanelStat;
  pontos: PontoSerie[];
  normal: Normal;
  lente: string | null;
  appId: number;
  /** O ponto lido: a última sessão da lente, ou a última de qualquer modo. */
  atual: PontoSerie | null;
};

export function StatCard({ stat, pontos, normal, lente, appId, atual }: StatCardProps) {
  const fmt = (v: number) => formatarStat(stat, v);
  const valor = atual?.valor ?? (normal.tipo === "nenhum" ? null : normal.valor);
  const soVitalicio = atual === null && normal.tipo !== "nenhum";
  const delta = atual ? calcularDelta(stat, atual.valor, normal, atual.fraco) : null;
  const sessoes = pontos.length;
  const desde = pontos[0] ? formatarDia(new Date(pontos[0].t)) : null;

  const referencia = soVitalicio
    ? "vitalício"
    : normal.tipo === "nenhum"
      ? "sem base"
      : normal.tipo === "vitalicio-fraco"
        ? `vs vitalício ${fmt(normal.valor)} · ${normal.progresso.sessoes} de ${normal.progresso.minimo} sessões`
        : `${normal.tipo === "modo" ? "normal" : "vitalício"} ${fmt(normal.valor)}${normal.tipo === "modo" ? ` · ${normal.sessoes} sessões` : ""}`;

  return (
    <Link
      href={`/games/${appId}/painel/${stat.key}${lente ? `?modo=${lente}` : ""}`}
      className="group relative flex flex-col rounded-2xl bg-surface p-4 ring-1 ring-line transition hover:ring-accent/50 sm:p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="hud">{stat.label}</p>
        {lente && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent ring-1 ring-accent/40">● {rotularModo(lente)}</span>}
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="num text-3xl font-semibold leading-none">{valor === null ? <span className="text-ink-faint">—</span> : fmt(valor)}</p>
        {delta && <DeltaChip delta={delta} />}
      </div>
      <p className="num mt-1.5 truncate text-xs text-ink-faint" title={referencia}>
        {referencia}
      </p>

      <div className="mt-3">
        <Sparkline pontos={pontos} normal={normal.tipo === "nenhum" ? null : normal.valor} lente={lente} emPct={stat.unit === "%"} casas={stat.decimals} className="h-10 w-full" />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-faint">
        <span className={cn("num", soVitalicio && "italic")}>
          {soVitalicio
            ? "só vitalício · jogue uma partida"
            : sessoes === 0
              ? "sem uso no período"
              : `${sessoes} ${sessoes === 1 ? "sessão" : "sessões"}${desde ? ` · desde ${desde}` : ""}${stat.movel ? ` · média móvel · ${stat.movel}` : ""}`}
        </span>
        <ArrowUpRight className="size-3.5 opacity-0 transition group-hover:opacity-100" aria-hidden />
      </div>
    </Link>
  );
}
