import Link from "next/link";
import { Plug } from "lucide-react";
import { rotularMapa, rotularModo } from "@/lib/cs2-labels";
import { cn } from "@/lib/utils";

/**
 * Partidas relatadas pelo próprio jogo, via Game State Integration.
 *
 * É a única parte do FragIQ que não depende de delta entre coletas: cada
 * linha aqui é uma partida que o CS2 contou, com o mapa que ele nomeou. Por
 * isso Anubis, Mirage, Ancient e Overpass aparecem — os contadores da Web API
 * não têm campo para eles.
 */

export type MatchRow = {
  id: string;
  map: string;
  mode: string;
  kills: number;
  deaths: number;
  assists: number;
  mvps: number;
  roundsWon: number | null;
  roundsLost: number | null;
  startedAt: Date;
  finishedAt: Date | null;
};

export function MatchList({ matches }: { matches: MatchRow[] }) {
  if (matches.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line px-4 py-6">
        <Plug className="size-4 shrink-0 text-ink-faint" />
        <p className="min-w-0 flex-1 text-sm text-ink-muted">
          Nenhuma partida ainda. Ligando o CS2 ao FragIQ, o próprio jogo passa
          a relatar mapa, modo e placar de cada partida — o que os contadores
          da Steam não sabem dizer.
        </p>
        <Link
          href="/conexao"
          className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface-2 px-3 text-sm font-medium transition hover:border-accent/50 hover:text-accent sm:min-h-9"
        >
          Como ligar
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      {matches.map((m) => (
        <Linha key={m.id} m={m} />
      ))}
    </div>
  );
}

function Linha({ m }: { m: MatchRow }) {
  const emAndamento = m.finishedAt === null;
  const kd = m.deaths > 0 ? m.kills / m.deaths : m.kills;

  const temPlacar = m.roundsWon !== null && m.roundsLost !== null;

  // Partida em andamento não tem resultado, tem placar parcial. Chamar de
  // "vitória" quem está 2–0 no quinto round é inventar um desfecho.
  const resultado =
    !temPlacar || emAndamento
      ? null
      : m.roundsWon! > m.roundsLost!
        ? "vitória"
        : m.roundsWon! < m.roundsLost!
          ? "derrota"
          : "empate";

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{rotularMapa(m.map)}</p>
        <p className="mt-0.5 text-xs text-ink-faint">
          {rotularModo(m.mode)}
          {resultado && (
            <>
              {" · "}
              <span
                className={cn(
                  resultado === "derrota" ? "text-danger" : "text-ink-muted",
                )}
              >
                {resultado} {m.roundsWon}–{m.roundsLost}
              </span>
            </>
          )}
          {emAndamento && (
            <>
              {" · "}
              {temPlacar && (
                <span className="tnum">
                  {m.roundsWon}–{m.roundsLost}{" "}
                </span>
              )}
              em andamento
            </>
          )}
        </p>
      </div>

      <dl className="tnum flex items-center gap-4 text-sm">
        <Numero rotulo="K" valor={m.kills} />
        <Numero rotulo="M" valor={m.deaths} />
        <Numero rotulo="A" valor={m.assists} />
        <Numero rotulo="MVP" valor={m.mvps} />
        <div className="min-w-14 text-right">
          <dt className="text-[10px] tracking-wide text-ink-faint uppercase">K/D</dt>
          <dd className="font-medium">
            {kd.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
          </dd>
        </div>
      </dl>

      {/* suppressHydrationWarning: servidor formata em UTC, browser no fuso
          de quem lê. O certo é o do leitor. */}
      <p
        className="w-full text-xs text-ink-faint sm:w-auto"
        suppressHydrationWarning
      >
        {m.startedAt.toLocaleString("pt-BR", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </div>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="min-w-8 text-right">
      <dt className="text-[10px] tracking-wide text-ink-faint uppercase">{rotulo}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  );
}
