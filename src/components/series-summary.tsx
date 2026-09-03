"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type SummaryItem = {
  id: string;
  label: string;
  color: string;
  /** Valor do período mais recente. */
  value: number | null;
  /** O mesmo cálculo sobre os totais vitalícios, quando faz sentido. */
  lifetime: number | null;
  points: number;
  format: (v: number) => string;
};

/**
 * Um gráfico com um ponto só é indistinguível de qualquer outro gráfico com
 * um ponto só: o eixo auto-escala em torno do valor e o ponto cai sempre no
 * meio. Antes desta faixa, trocar de métrica não mudava nada na tela.
 *
 * O número resolve isso — e a comparação com o vitalício é justamente o
 * argumento do produto, disponível já na segunda coleta.
 */
export function SeriesSummary({ items }: { items: SummaryItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Card key={item.id} item={item} />
      ))}
    </div>
  );
}

function Card({ item }: { item: SummaryItem }) {
  const { value, lifetime, format } = item;

  const variacao =
    value !== null && lifetime !== null && lifetime !== 0
      ? (value - lifetime) / Math.abs(lifetime)
      : null;

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="mt-1.5 size-2 shrink-0 rounded-full"
          style={{ background: item.color }}
        />
        <span className="text-xs leading-snug text-ink-muted">{item.label}</span>
      </div>

      <p className="tnum mt-2 text-2xl font-semibold">
        {value === null ? (
          <span className="text-base font-normal text-ink-faint">sem dado</span>
        ) : (
          format(value)
        )}
      </p>

      {lifetime !== null && (
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-xs text-ink-faint">
            vitalício <span className="tnum">{format(lifetime)}</span>
          </span>

          {variacao !== null && Math.abs(variacao) >= 0.005 && (
            <Variacao valor={variacao} />
          )}
        </div>
      )}

      {item.points > 0 && (
        <p className="mt-2 tnum text-[11px] text-ink-faint">
          {item.points} {item.points === 1 ? "período" : "períodos"}
        </p>
      )}
    </div>
  );
}

function Variacao({ valor }: { valor: number }) {
  const positivo = valor > 0;
  const Icone = positivo ? TrendingUp : TrendingDown;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium",
        // Sem juízo de valor: mais mortes por período é "para cima" e não é
        // bom. Quem sabe o que é bom é o jogador, não o componente.
        positivo ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-muted",
      )}
    >
      <Icone className="size-3" />
      <span className="tnum">
        {positivo ? "+" : ""}
        {(valor * 100).toFixed(0)}%
      </span>
    </span>
  );
}
