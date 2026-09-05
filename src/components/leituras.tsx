import { CircleAlert, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { Leitura, Tom } from "@/lib/leituras";
import { cn } from "@/lib/utils";

/**
 * As conclusões, antes dos números.
 *
 * Cada cartão é uma frase que afirma alguma coisa. O número existe para
 * sustentar a frase, não o contrário — foi essa inversão que faltava quando
 * a tela oferecia 178 contadores e nenhuma leitura.
 */

const ICONE: Record<Tom, typeof Minus> = {
  neutro: Minus,
  bom: TrendingUp,
  ruim: TrendingDown,
  aviso: CircleAlert,
};

const COR: Record<Tom, string> = {
  neutro: "text-ink-faint",
  bom: "text-accent",
  ruim: "text-danger",
  aviso: "text-warn",
};

export function Leituras({ leituras }: { leituras: Leitura[] }) {
  if (leituras.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-6 py-8 text-center text-sm text-ink-faint">
        Ainda não dá para concluir nada: é preciso ao menos duas coletas com
        partidas entre elas.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {leituras.map((l) => {
        const Icone = ICONE[l.tom];
        return (
          <div key={l.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-baseline gap-2">
              <Icone className={cn("size-4 shrink-0 self-center", COR[l.tom])} />
              <p className="tnum text-xl font-semibold">{l.numero}</p>
              {l.base && (
                <p className="ml-auto text-[11px] text-ink-faint">{l.base}</p>
              )}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{l.texto}</p>
          </div>
        );
      })}
    </div>
  );
}
