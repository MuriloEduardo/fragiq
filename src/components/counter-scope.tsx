import { Info, TriangleAlert } from "lucide-react";

/**
 * A Valve não documenta o escopo dos contadores, e o escopo não é uniforme.
 * Sem esta nota o produto mente por omissão: alguém olha "K/D" achando que
 * é competitivo e está vendo casual misturado. Quatro linhas, colapsadas;
 * o detalhe medido está em docs/dados-profundos.md.
 */
export function CounterScope({ appId, gaugesStale }: { appId: number; gaugesStale: boolean }) {
  if (appId !== 730) return null;

  return (
    <details className="group rounded-2xl bg-surface ring-1 ring-line">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm text-ink-muted transition hover:text-ink">
        <Info className="size-4 shrink-0 text-ink-faint" />
        Sobre estes contadores
        <span className="ml-auto text-xs text-ink-faint group-open:hidden">mostrar</span>
        <span className="ml-auto hidden text-xs text-ink-faint group-open:inline">ocultar</span>
      </summary>
      <ul className="space-y-1.5 border-t border-line px-4 py-3 text-sm text-ink-muted">
        <li>· Somam todos os modos; o modo por sessão vem do bot, não da Steam.</li>
        <li>· Por mapa, só o pool antigo — Mirage, Ancient, Anubis e Overpass não são contados.</li>
        <li>
          · Os contadores de última partida estão congelados desde o CS:GO
          {gaugesStale && (
            <span className="ml-1 inline-flex items-center gap-1 text-warn">
              <TriangleAlert className="size-3.5" /> confirmado nos seus dados
            </span>
          )}
          .
        </li>
        <li>· Dano por round não é ADR: compare você com você, não com o HLTV.</li>
      </ul>
    </details>
  );
}
