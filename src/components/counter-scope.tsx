import { Info } from "lucide-react";

/**
 * A Valve não documenta o escopo dos contadores, e o escopo não é uniforme.
 * Medimos jogando uma partida casual e diffando os 197 contadores.
 *
 * Sem este aviso o produto mente por omissão: alguém olha "K/D por período"
 * achando que é competitivo e está vendo casual misturado.
 */
export function CounterScope({ appId }: { appId: number }) {
  if (appId !== 730) return null;

  return (
    <details className="group rounded-xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm text-ink-muted transition hover:text-ink">
        <Info className="size-4 shrink-0 text-ink-faint" />
        O que estes contadores incluem
        <span className="ml-auto text-xs text-ink-faint group-open:hidden">mostrar</span>
        <span className="ml-auto hidden text-xs text-ink-faint group-open:inline">ocultar</span>
      </summary>

      <div className="space-y-3 border-t border-line px-4 py-3 text-sm leading-relaxed text-ink-muted">
        <p className="text-xs text-ink-faint">
          A Valve não documenta isto. Medimos jogando uma partida casual e
          comparando os 197 contadores antes e depois.
        </p>

        <Item titulo="Somam todos os modos">
          Kills, mortes, dano, rounds, partidas e os contadores por arma contam
          casual junto com competitivo e premier. Um K/D por período que inclua
          dias de casual vem inflado — casual é mais solto.
        </Item>

        <Item titulo="Só competitivo e premier">
          Os contadores de <code className="font-mono text-xs">última partida</code>{" "}
          não se moveram com a casual. São o sinal mais limpo que a Web API
          oferece por partida oficial.
        </Item>

        <Item titulo="Mapas legados apenas">
          A Valve parou de adicionar mapas a estes contadores. Dust2, Inferno,
          Nuke, Train e Vertigo existem;{" "}
          <strong className="font-medium text-ink">
            Mirage, Ancient, Anubis e Overpass não são rastreados
          </strong>
          .
        </Item>
      </div>
    </details>
  );
}

function Item({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[11px] tracking-wide text-ink-faint uppercase">
        {titulo}
      </p>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}
