import Link from "next/link";
import { Users } from "lucide-react";
import type { PartidaLinha } from "@/lib/partidas";
import { formatarQuando } from "@/lib/sessoes";
import { rotularMapa, rotularModo } from "@/lib/cs2-labels";
import { cn } from "@/lib/utils";

/**
 * O scoreboard de cada partida oficial, uma por linha, com o resultado do
 * lado de quem está olhando. Serve à página da pessoa e à pública: os
 * números são os que a Steam mostra a qualquer um no "Suas partidas".
 */
export function PartidasTabela({ partidas, publica = false }: { partidas: PartidaLinha[]; publica?: boolean }) {
  const n = (v: number) => v.toLocaleString("pt-BR");
  return (
    <div className="overflow-x-auto rounded-2xl bg-surface ring-1 ring-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            {["Quando", "Mapa", "Placar", "K", "A", "D", "K/D", "HS", "MVP", "Score", "Duração"].map((c, i) => (
              <th key={c} className={cn("hud px-4 py-3 font-normal whitespace-nowrap", i >= 3 && "text-right")}>
                {c}
              </th>
            ))}
            {!publica && <th className="hud px-4 py-3 font-normal" />}
          </tr>
        </thead>
        <tbody className="num">
          {partidas.map((p) => {
            const kd = p.eu.deaths ? p.eu.kills / p.eu.deaths : p.eu.kills;
            const hs = p.eu.kills ? (p.eu.hs / p.eu.kills) * 100 : 0;
            return (
              <tr key={p.id} className="border-t border-line-soft">
                <td className="px-4 py-3 whitespace-nowrap text-ink-muted" suppressHydrationWarning>
                  {formatarQuando(p.jogadaEm)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap font-sans">
                  <Link href={`/partida/${p.id}`} className="underline decoration-line-soft underline-offset-4 hover:text-accent">
                    {p.mapa ? rotularMapa(p.mapa) : "Partida"}
                  </Link>
                  {p.modo && <span className="ml-2 text-xs text-ink-faint">{rotularModo(p.modo)}</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-xs font-medium",
                      p.eu.venceu === true && "bg-accent/15 text-accent",
                      p.eu.venceu === false && "bg-danger/15 text-danger",
                      p.eu.venceu === null && "bg-surface-2 text-ink-muted",
                    )}
                  >
                    {p.placar[0]}–{p.placar[1]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{n(p.eu.kills)}</td>
                <td className="px-4 py-3 text-right text-ink-muted">{n(p.eu.assists)}</td>
                <td className="px-4 py-3 text-right">{n(p.eu.deaths)}</td>
                <td className={cn("px-4 py-3 text-right font-medium", kd >= 1 && "text-accent")}>{kd.toFixed(2)}</td>
                <td className="px-4 py-3 text-right">{hs.toFixed(0)}%</td>
                <td className="px-4 py-3 text-right">{n(p.eu.mvps)}</td>
                <td className="px-4 py-3 text-right">{n(p.eu.score)}</td>
                <td className="px-4 py-3 text-right text-ink-muted">{Math.round(p.duracaoS / 60)} min</td>
                {!publica && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link href={`/partida/${p.id}`} className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink" title="Os dez jogadores">
                      <Users className="size-3.5" />
                      {p.conhecidos.length > 0 ? `+${p.conhecidos.length} do FragIQ` : "os dez"}
                    </Link>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
