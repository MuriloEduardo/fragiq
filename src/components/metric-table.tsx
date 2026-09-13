"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import type { LinhaMetrica } from "@/lib/leituras";
import { Sparkline } from "./sparkline";
import { cn } from "@/lib/utils";

/**
 * Todas as métricas, já comparadas.
 *
 * Cobertura total sem consulta para montar: cada contador aparece como taxa
 * por round no período contra a taxa de vitalício, que é a única comparação
 * honesta entre um recorte e uma vida inteira. A ordem é por distância do
 * normal, então o topo já é a resposta para "o que mudou".
 */

function fmt(v: number | null, casas = 2) {
  if (v === null) return "—";
  // Taxas por round de contador raro ficam na terceira casa. Arredondar para
  // duas mostra "0" ao lado de uma variação de +400%, o que parece defeito.
  const precisao = v !== 0 && Math.abs(v) < 0.1 ? 4 : casas;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: precisao });
}

export function MetricTable({ linhas, appId }: { linhas: LinhaMetrica[]; appId: number }) {
  const [busca, setBusca] = useState("");

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return linhas;
    return linhas.filter(
      (l) => l.label.toLowerCase().includes(q) || l.key.toLowerCase().includes(q),
    );
  }, [busca, linhas]);

  return (
    <div>
      <label className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 size-4 text-ink-faint" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={`Buscar entre ${linhas.length} métricas`}
          className="min-h-11 w-full rounded-xl bg-surface pr-3 pl-9 text-sm text-ink ring-1 ring-line placeholder:text-ink-faint focus:ring-accent/50 focus:outline-none"
        />
      </label>

      <div className="mt-3 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
        {filtradas.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-faint">
            Nenhuma métrica com esse nome.
          </p>
        ) : (
          filtradas.map((l) => <Linha key={l.key} l={l} appId={appId} />)
        )}
      </div>
    </div>
  );
}

function Linha({ l, appId }: { l: LinhaMetrica; appId: number }) {
  const sobe = l.variacao !== null && l.variacao > 0;

  return (
    <Link
      href={`/games/${appId}/metricas/${encodeURIComponent(l.key)}`}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-soft px-4 py-2.5 transition last:border-b-0 hover:bg-surface-2"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{l.label}</p>
        <p className="text-[11px] text-ink-faint">
          {l.grupo}
          {l.total !== null && (
            <>
              {" · "}
              <span className="tnum">{fmt(l.total, 0)}</span> no período
            </>
          )}
        </p>
      </div>

      <div className="tnum flex items-center gap-4 text-sm">
        <div className="min-w-16 text-right">
          <p className="font-medium">{fmt(l.periodo)}</p>
          <p className="text-[10px] text-ink-faint">
            {l.porRound ? "por round" : "no período"}
          </p>
        </div>

        <div className="min-w-16 text-right">
          <p className="text-ink-muted">{fmt(l.vitalicio)}</p>
          <p className="text-[10px] text-ink-faint">vitalício</p>
        </div>

        <div className="min-w-14 text-right">
          {l.variacao === null ? (
            <p className="text-ink-faint">—</p>
          ) : (
            <p
              className={cn(
                "font-medium",
                !l.relevante ? "text-ink-faint" : sobe ? "text-accent" : "text-ink-muted",
              )}
              title={
                l.relevante
                  ? undefined
                  : "Pouco material no período: a variação é ruído de divisão por número pequeno."
              }
            >
              {sobe ? "+" : ""}
              {(l.variacao * 100).toFixed(0)}%
            </p>
          )}
        </div>
      </div>

      <div className="hidden h-7 w-24 sm:block">
        {l.valores.length >= 2 && (
          <Sparkline values={l.valores} baseline={l.vitalicio} className="h-7 w-full" />
        )}
      </div>

      <ChevronRight className="size-4 shrink-0 text-ink-faint" aria-hidden />
    </Link>
  );
}
