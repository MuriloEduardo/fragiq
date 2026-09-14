import type { Leitura, Tom } from "@/lib/leituras";
import { cn } from "@/lib/utils";

/**
 * Destaques: as leituras que não são o hero em prosa — hoje, as armas.
 * Uma linha por leitura: número, frase curta, base. O tom vira a cor da
 * barra, não um ícone que precisa ser interpretado.
 */
const BARRA: Record<Tom, string> = {
  neutro: "bg-line",
  bom: "bg-good",
  ruim: "bg-bad",
  aviso: "bg-warn",
};

export function Destaques({ leituras }: { leituras: Leitura[] }) {
  if (leituras.length === 0) return null;
  return (
    <ol className="divide-y divide-line-soft rounded-2xl bg-surface ring-1 ring-line">
      {leituras.map((l) => (
        <li key={l.id} className="flex items-center gap-4 px-5 py-3">
          <span className={cn("h-8 w-0.5 shrink-0 rounded-full", BARRA[l.tom])} aria-hidden />
          <p className="num w-20 shrink-0 text-lg font-semibold leading-tight">{l.numero}</p>
          <p className="min-w-0 flex-1 truncate text-sm text-ink-muted" title={l.texto}>
            {l.texto}
          </p>
          {l.base && <p className="num hidden shrink-0 text-xs text-ink-faint sm:block">{l.base}</p>}
        </li>
      ))}
    </ol>
  );
}
