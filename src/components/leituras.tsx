import type { Leitura, Tom } from "@/lib/leituras";
import { cn } from "@/lib/utils";

/**
 * As conclusões, em lista.
 *
 * Eram cartões de duas colunas, cada um com ícone, número, base e três
 * linhas de texto — uma parede. Em lista, o número é a coluna da esquerda e
 * a frase corre ao lado; o tom vira uma barra de cor, não um ícone que
 * precisa ser interpretado.
 */

const BARRA: Record<Tom, string> = {
  neutro: "bg-line",
  bom: "bg-accent",
  ruim: "bg-danger",
  aviso: "bg-warn",
};

export function Leituras({ leituras, limite }: { leituras: Leitura[]; limite?: number }) {
  if (leituras.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-6 py-8 text-center text-sm text-ink-faint">
        Precisa de duas coletas com partidas entre elas.
      </p>
    );
  }

  return (
    <ol className="divide-y divide-line-soft rounded-2xl bg-surface ring-1 ring-line">
      {leituras.slice(0, limite ?? leituras.length).map((l) => (
        <li key={l.id} className="flex gap-4 px-5 py-4">
          <span className={cn("mt-1.5 h-10 w-0.5 shrink-0 rounded-full", BARRA[l.tom])} aria-hidden />
          <div className="w-28 shrink-0 sm:w-36">
            <p className="num text-xl font-semibold leading-tight">{l.numero}</p>
            {l.base && <p className="mt-0.5 text-[11px] text-ink-faint">{l.base}</p>}
          </div>
          <p className="text-sm leading-relaxed text-ink-muted">{l.texto}</p>
        </li>
      ))}
    </ol>
  );
}
