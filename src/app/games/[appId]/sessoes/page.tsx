import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { carregarFonte } from "@/lib/fonte";
import { listarSessoes, formatarQuando } from "@/lib/sessoes";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Cada sessão como uma linha: quando, quanto, como.
 *
 * Com o bot de presença cada linha é uma partida com mapa, modo e placar;
 * sem ele é o que foi jogado entre duas coletas. Os números são os mesmos
 * do hero do Resumo, para a lista e o destaque nunca discordarem.
 */
export default async function SessoesPage({ params }: { params: Promise<{ appId: string }> }) {
  const session = await requireSession();
  const appId = Number((await params).appId);
  const fonte = await carregarFonte(session.userId, appId);
  if (!fonte) notFound();

  const sessoes = listarSessoes(fonte.rows).reverse();

  if (sessoes.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-ink-faint">
        Nenhuma sessão ainda: é preciso duas coletas com partidas entre elas.
      </p>
    );
  }

  const n = (v: number | null, casas = 0) =>
    v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas });

  return (
    <div className="overflow-x-auto rounded-2xl bg-surface ring-1 ring-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            {["Quando", "Contexto", "Rounds", "Partidas", "K/D", "Dano/round", "HS", "Kills", "Deaths", "MVP", "Tempo"].map((c, i) => (
              <th key={c} className={cn("hud px-4 py-3 font-normal whitespace-nowrap", i >= 2 && "text-right")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="num">
          {sessoes.map((s) => (
            <tr key={s.ate.getTime()} className="border-t border-line-soft">
              <td className="px-4 py-3 whitespace-nowrap text-ink-muted" suppressHydrationWarning>
                {formatarQuando(s.ate)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap font-sans text-ink-muted">
                {s.mapa || s.modo ? [s.modo, s.mapa, s.placar].filter(Boolean).join(" · ") : <span className="text-ink-faint">sem bot</span>}
              </td>
              <td className="px-4 py-3 text-right">{s.rounds}</td>
              <td className="px-4 py-3 text-right">{n(s.partidas)}{s.vitorias !== null && s.partidas ? <span className="text-ink-faint"> · {s.vitorias}V</span> : null}</td>
              <td className={cn("px-4 py-3 text-right font-medium", s.kd !== null && s.kd >= 1 && "text-accent")}>{n(s.kd, 2)}</td>
              <td className="px-4 py-3 text-right">{n(s.danoPorRound)}</td>
              <td className="px-4 py-3 text-right">{s.hs === null ? "—" : `${n(s.hs, 1)}%`}</td>
              <td className="px-4 py-3 text-right">{n(s.kills)}</td>
              <td className="px-4 py-3 text-right">{n(s.deaths)}</td>
              <td className="px-4 py-3 text-right">{n(s.mvps)}</td>
              <td className="px-4 py-3 text-right text-ink-muted">{s.minutos} min</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
