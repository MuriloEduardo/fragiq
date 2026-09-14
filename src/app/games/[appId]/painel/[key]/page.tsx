import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { carregarFonte } from "@/lib/fonte";
import { CS2_PANEL } from "@/lib/cs2-panel";
import { normalDe, serieDeSessoes } from "@/lib/series";
import { calcularDelta } from "@/lib/delta";
import { formatarQuando, formatarStat } from "@/lib/formato";
import { rotularModo } from "@/lib/cs2-labels";
import { filtroDoModo } from "@/lib/modo";
import { abasDoUsuario, modoDaRequisicao, type SearchParams } from "@/lib/modo-servidor";
import { SerieChart } from "@/components/serie-chart";
import { StatCard } from "@/components/stat-card";
import { DeltaChip } from "@/components/delta-chip";
import { Estado } from "@/components/estado";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Um cartão do painel, em página inteira.
 *
 * O mesmo cartão no topo (para a leitura não mudar entre a grade e aqui),
 * o gráfico grande com a lente e o normal, e cada sessão como uma linha
 * com o seu delta. Sessão por sessão, sem agrupar por dia ou semana: a
 * sessão é a unidade do produto, e agrupar escondia a que importava.
 */
export default async function PainelStatPage({ params, searchParams }: { params: Promise<{ appId: string; key: string }>; searchParams: SearchParams }) {
  const session = await requireSession();
  const { appId: appIdRaw, key } = await params;
  const appId = Number(appIdRaw);
  const stat = CS2_PANEL.find((s) => s.key === key);
  if (!Number.isInteger(appId) || !stat) notFound();

  const fonte = await carregarFonte(session.userId, appId);
  if (!fonte) notFound();
  const modo = await modoDaRequisicao(searchParams, await abasDoUsuario(session.userId, appId));
  const lente = filtroDoModo(modo)?.mode ?? null;

  const pontos = serieDeSessoes(fonte.rows, stat);
  const doModo = lente ? pontos.filter((p) => p.modo === lente) : pontos;
  const atual = doModo[doModo.length - 1] ?? null;
  const normal = normalDe(fonte.rows, stat, { modo: lente }, atual?.sessaoId ?? null, rotularModo);
  const fmt = (v: number) => formatarStat(stat, v);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 lg:grid-cols-3">
        <StatCard stat={stat} pontos={pontos} atual={atual} normal={normal} lente={lente} appId={appId} />
        <div className="rounded-2xl bg-surface p-5 ring-1 ring-line lg:col-span-2">
          <p className="hud">Como ler</p>
          <ul className="mt-2 space-y-1 text-sm text-ink-muted">
            <li>Cada ponto é uma sessão; a linha tracejada é o seu normal.</li>
            <li>Ponto vazado: amostra pequena ({stat.amostra.minimo}+ {stat.amostra.de} contam).</li>
            <li>Triângulo na borda: valor fora da escala, mostrado com o valor real.</li>
            {lente && <li>Em laranja, as sessões de {rotularModo(lente)}; as outras em cinza.</li>}
            {stat.movel && <li>Média móvel das últimas {stat.movel} sessões, porque uma sessão só não sabe dizer taxa por partida.</li>}
          </ul>
        </div>
      </div>

      <div className="rounded-2xl bg-surface p-3 ring-1 ring-line sm:p-5">
        {pontos.length === 0 ? (
          <Estado titulo="Sem sessões" texto="A primeira partida depois de duas coletas vira o primeiro ponto." compacto />
        ) : (
          <SerieChart
            pontos={pontos}
            normal={normal.tipo === "nenhum" ? null : { valor: normal.valor, rotulo: normal.tipo === "modo" ? "normal" : "vitalício" }}
            lente={lente}
            formatar={fmt}
            emPct={stat.unit === "%"}
            casas={stat.decimals}
            amostraDe={stat.amostra.de}
          />
        )}
      </div>

      {pontos.length > 0 && (
        <div className="overflow-x-auto rounded-2xl bg-surface ring-1 ring-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                {["Sessão", "Modo", stat.amostra.de === "rounds" ? "Rounds" : "Partidas", stat.label, "vs normal"].map((c, i) => (
                  <th key={c} className={cn("hud px-4 py-3 font-normal whitespace-nowrap", i >= 2 && "text-right")}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...pontos].reverse().map((p) => {
                const foraDaLente = lente !== null && p.modo !== lente;
                const delta = calcularDelta(stat, p.valor, normal, p.fraco);
                return (
                  <tr key={p.t} className={cn("border-t border-line-soft", foraDaLente && "text-ink-faint")}>
                    <td className="tnum px-4 py-2.5 whitespace-nowrap text-ink-muted" suppressHydrationWarning>
                      {formatarQuando(new Date(p.t))}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{p.modo ? rotularModo(p.modo) : <span className="text-ink-faint">—</span>}</td>
                    <td className="num px-4 py-2.5 text-right">{stat.amostra.de === "rounds" ? p.rounds : p.partidas}</td>
                    <td className={cn("num px-4 py-2.5 text-right font-medium", p.fraco && "text-ink-faint")}>{fmt(p.valor)}</td>
                    <td className="px-4 py-2.5 text-right">{p.sessaoId === atual?.sessaoId || !foraDaLente ? <DeltaChip delta={delta} /> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
