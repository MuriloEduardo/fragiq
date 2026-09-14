import Link from "next/link";
import { CS2_PANEL } from "@/lib/cs2-panel";
import { NORMAL_MIN_SESSOES, acumuladoDasSessoes, serieDeSessoes, type SnapshotRow } from "@/lib/series";
import { listarSessoes } from "@/lib/sessoes";
import { formatarDia, formatarStat } from "@/lib/formato";
import { rotularModo } from "@/lib/cs2-labels";
import { comModo, TUDO } from "@/lib/modo";
import { cn } from "@/lib/utils";
import { Secao } from "./secao";

/**
 * Os modos lado a lado, sem filtrar nada.
 *
 * É onde "não misturar Premier com casual" acontece sem esvaziar a tela:
 * uma linha por modo com sessões, K/D, dano por round, headshot e a última
 * data, mais a linha das sessões sem modo e a do vitalício para ancorar.
 * Linha com menos sessões que o mínimo do normal fica apagada e mostra o
 * progresso (`2/5`). Clique = ativar a lente. Só aparece com dois modos ou
 * mais: com um, é uma tabela de uma linha dizendo o que o hero já disse.
 */
const COLUNAS = [
  { key: "kd", rotulo: "K/D" },
  { key: "adr", rotulo: "Dano/round" },
  { key: "hs", rotulo: "HS" },
] as const;

type Linha = { modo: string | null; rotulo: string; sessoes: number; valores: Record<string, number | null>; ultima: Date | null };

export function PorModo({ rows, lente, base }: { rows: SnapshotRow[]; lente: string | null; base: string }) {
  const stats = COLUNAS.map((c) => CS2_PANEL.find((s) => s.key === c.key)!);
  const series = new Map(stats.map((s) => [s.key, serieDeSessoes(rows, s)]));
  const sessoes = listarSessoes(rows);
  const modos = [...new Set(sessoes.map((s) => s.modoId).filter((m): m is string => Boolean(m)))];
  if (modos.length < 2) return null;

  const linhaDe = (modo: string | null, rotulo: string): Linha => {
    const doModo = sessoes.filter((s) => s.modoId === modo);
    const valores: Record<string, number | null> = {};
    for (const stat of stats) {
      const pontos = series.get(stat.key)!.filter((p) => p.modo === modo && !p.fraco);
      valores[stat.key] = pontos.length ? acumuladoDasSessoes(rows, stat, new Set(pontos.map((p) => p.sessaoId))) : null;
    }
    return { modo, rotulo, sessoes: doModo.length, valores, ultima: doModo[doModo.length - 1]?.ate ?? null };
  };
  const linhas = [...modos.map((m) => linhaDe(m, rotularModo(m))), linhaDe(null, "sem modo")].filter((l) => l.sessoes > 0);
  const ultimo = rows[rows.length - 1]?.metrics ?? {};
  const vitalicio: Record<string, number | null> = {};
  for (const stat of stats) {
    const d = ultimo[stat.spec.denominator!];
    vitalicio[stat.key] = d ? ((ultimo[stat.spec.metric] ?? 0) / d) * (stat.spec.scale ?? 1) : null;
  }

  return (
    <Secao titulo="Por modo">
    <div className="overflow-x-auto rounded-2xl bg-surface ring-1 ring-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="hud px-4 py-3 font-normal">modo</th>
            <th className="hud px-4 py-3 text-right font-normal">sessões</th>
            {COLUNAS.map((c) => (
              <th key={c.key} className="hud px-4 py-3 text-right font-normal">
                {c.rotulo}
              </th>
            ))}
            <th className="hud px-4 py-3 text-right font-normal">última</th>
          </tr>
        </thead>
        <tbody className="num">
          {linhas.map((l) => {
            const fraca = l.modo !== null && l.sessoes < NORMAL_MIN_SESSOES;
            const ativa = l.modo !== null && l.modo === lente;
            return (
              <tr key={l.rotulo} className={cn("border-t border-line-soft", fraca && "text-ink-faint", ativa && "bg-accent-soft/40")}>
                <td className="px-4 py-2.5 font-sans">
                  {l.modo ? (
                    <Link href={comModo(base, ativa ? TUDO : l.modo)} className={cn("hover:text-accent", ativa && "text-accent")}>
                      ● {l.rotulo}
                    </Link>
                  ) : (
                    <span className="text-ink-faint">○ {l.rotulo}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {l.sessoes}
                  {fraca && <span className="ml-1 text-ink-faint">· {l.sessoes}/{NORMAL_MIN_SESSOES}</span>}
                </td>
                {stats.map((stat) => (
                  <td key={stat.key} className="px-4 py-2.5 text-right">
                    {l.valores[stat.key] === null ? "—" : formatarStat(stat, l.valores[stat.key]!)}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right text-ink-muted" suppressHydrationWarning>
                  {l.ultima ? formatarDia(l.ultima) : "—"}
                </td>
              </tr>
            );
          })}
          <tr className="border-t border-line-soft text-ink-muted">
            <td className="px-4 py-2.5 font-sans">vitalício</td>
            <td className="px-4 py-2.5 text-right">—</td>
            {stats.map((stat) => (
              <td key={stat.key} className="px-4 py-2.5 text-right">
                {vitalicio[stat.key] === null ? "—" : formatarStat(stat, vitalicio[stat.key]!)}
              </td>
            ))}
            <td className="px-4 py-2.5" />
          </tr>
        </tbody>
      </table>
    </div>
    </Secao>
  );
}
