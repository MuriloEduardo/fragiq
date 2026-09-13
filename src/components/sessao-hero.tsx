import type { Sessao } from "@/lib/sessoes";
import { formatarQuando } from "@/lib/sessoes";
import { cn } from "@/lib/utils";

/**
 * A última sessão em três números, grandes.
 *
 * É a primeira coisa que a página mostra porque é a primeira pergunta de
 * quem acabou de jogar: "como foi?". Cada número vem com o seu vitalício e
 * a distância dele — o produto é "você contra o seu normal", e o hero é
 * onde isso fica dito sem uma frase.
 */
export function SessaoHero({
  sessao,
  vitalicio,
}: {
  sessao: Sessao;
  vitalicio: { kd: number | null; danoPorRound: number | null; hs: number | null };
}) {
  const numeros = [
    { rotulo: "K/D", valor: sessao.kd, ref: vitalicio.kd, fmt: (v: number) => v.toFixed(2).replace(".", ",") },
    { rotulo: "Dano / round", valor: sessao.danoPorRound, ref: vitalicio.danoPorRound, fmt: (v: number) => v.toFixed(0) },
    { rotulo: "Headshot", valor: sessao.hs, ref: vitalicio.hs, fmt: (v: number) => `${v.toFixed(1).replace(".", ",")}%` },
  ];

  return (
    <section className="glow relative overflow-hidden rounded-2xl bg-surface">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="relative p-5 sm:p-7">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="hud">Última sessão</span>
          <span className="tnum text-sm text-ink-muted" suppressHydrationWarning>
            {formatarQuando(sessao.de)} → {formatarQuando(sessao.ate)}
          </span>
          <span className="tnum text-sm text-ink-faint">
            · {sessao.rounds} rounds
            {sessao.partidas ? ` · ${sessao.partidas} partida${sessao.partidas === 1 ? "" : "s"}` : ""}
            {sessao.mapa ? ` · ${sessao.mapa}` : ""}
            {sessao.modo ? ` · ${sessao.modo}` : ""}
          </span>
        </div>

        <div className="mt-5 grid gap-6 sm:grid-cols-3">
          {numeros.map((n) => {
            const delta = n.valor !== null && n.ref ? (n.valor - n.ref) / Math.abs(n.ref) : null;
            const sobe = delta !== null && delta > 0.005;
            const cai = delta !== null && delta < -0.005;
            return (
              <div key={n.rotulo}>
                <p className="hud">{n.rotulo}</p>
                <div className="mt-1 flex items-baseline gap-3">
                  <p className="num text-4xl font-semibold sm:text-5xl">
                    {n.valor === null ? "—" : n.fmt(n.valor)}
                  </p>
                  {delta !== null && (
                    <span
                      className={cn(
                        "num rounded-md px-1.5 py-0.5 text-sm font-medium",
                        sobe && "bg-accent-soft text-accent",
                        cai && "bg-surface-2 text-ink-muted",
                        !sobe && !cai && "text-ink-faint",
                      )}
                    >
                      {delta > 0 ? "+" : ""}
                      {(delta * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                <p className="num mt-1 text-xs text-ink-faint">
                  {n.ref === null ? "sem vitalício" : `vitalício ${n.fmt(n.ref)}`}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
