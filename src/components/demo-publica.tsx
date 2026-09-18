import type { DemoPublica } from "@/lib/perfil-cs";
import { cn } from "@/lib/utils";

/**
 * O que as demos dizem de um jogador, no perfil público: o CS Rating com a
 * trilha das últimas partidas e as métricas que a Web API não tem, em
 * tiles de uma linha cada. Público por natureza — é o que o CS2 mostra a
 * qualquer um dos dez de cada partida.
 */
export function DemoPublicaBloco({ demo }: { demo: DemoPublica }) {
  const n = (v: number, casas = 0) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const tiles: { rotulo: string; valor: string; nota?: string }[] = [
    { rotulo: "ADR", valor: n(demo.adr, 1) },
    { rotulo: "KAST", valor: `${n(demo.kast * 100)}%` },
    { rotulo: "Headshot", valor: demo.hs === null ? "—" : `${n(demo.hs, 1)}%` },
    { rotulo: "Aberturas", valor: `${n(demo.aberturas)}–${n(demo.aberturasPerdidas)}`, nota: "ganhas–perdidas" },
    { rotulo: "Trocas", valor: n(demo.trocas) },
    { rotulo: "Clutches", valor: demo.clutches ? `${n(demo.clutchesGanhos)}/${n(demo.clutches)}` : "—" },
  ];
  const trilha = demo.rating?.trilha.slice(-8) ?? [];
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="hud">Das demos</h2>
        <span className="num text-xs text-ink-faint">
          {demo.partidas} {demo.partidas === 1 ? "partida" : "partidas"} · {n(demo.rounds)} rounds
        </span>
      </div>
      {demo.rating && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-surface px-5 py-4 ring-1 ring-line">
          <div>
            <p className="hud">CS Rating</p>
            <p className="num mt-1 text-3xl font-semibold tracking-tight">{n(demo.rating.atual)}</p>
          </div>
          <ol className="num flex flex-wrap items-center gap-1.5 text-xs">
            {trilha.map((t, i) => (
              <li
                key={i}
                title={t.em.toLocaleDateString("pt-BR")}
                className={cn(
                  "rounded-full px-2 py-0.5 ring-1 ring-line",
                  t.mudanca > 0 ? "text-accent" : t.mudanca < 0 ? "text-danger" : "text-ink-faint",
                )}
              >
                {t.mudanca > 0 ? "+" : ""}
                {n(t.mudanca)}
              </li>
            ))}
          </ol>
          <span className="text-xs text-ink-faint">{n(demo.rating.vitorias)} vitórias no Premier</span>
        </div>
      )}
      <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.rotulo} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <p className="hud">{t.rotulo}</p>
            <p className="num mt-2 text-2xl font-semibold">{t.valor}</p>
            {t.nota && <p className="mt-0.5 text-[11px] text-ink-faint">{t.nota}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
