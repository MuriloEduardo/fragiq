import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { carregarFonte } from "@/lib/fonte";
import { Estatisticas } from "@/components/estatisticas";
import { CounterScope } from "@/components/counter-scope";
import { gaugesLookStale } from "@/lib/series";
import { Insight } from "@/components/insight";
import { insightsDeArma } from "@/lib/insights/ler";
import { Secao } from "@/components/secao";
import { filtroDoModo } from "@/lib/modo";
import { abasDoUsuario, modoDaRequisicao, type SearchParams } from "@/lib/modo-servidor";

export const dynamic = "force-dynamic";

/**
 * Estatísticas: os destaques por arma, lidos do banco, e o explorador.
 *
 * Os destaques eram duas leituras montadas na request (`lerSerie`), cada
 * uma comparando a precisão do período com o vitalício — que soma todos os
 * modos para sempre — a partir de 25 tiros. Hoje são insights
 * materializados (`arma.precisao`, `arma.destaque`): a mesma regra que o
 * Resumo desenha, calculada uma vez ao fechar a sessão e guardada com base,
 * confiança e versão (docs/dados-confiaveis.md §3.3).
 */
export default async function EstatisticasPage({ params, searchParams }: { params: Promise<{ appId: string }>; searchParams: SearchParams }) {
  const session = await requireSession();
  const appId = Number((await params).appId);
  const fonte = await carregarFonte(session.userId, appId);
  if (!fonte) notFound();
  const modo = await modoDaRequisicao(searchParams, await abasDoUsuario(session.userId, appId));
  const lente = filtroDoModo(modo)?.mode ?? null;

  // Insight só existe para CS2: é de lá que vêm sessão, modo e contador de arma.
  const destaques = appId === 730 ? await insightsDeArma(session.userId, lente) : [];

  return (
    <>
      {destaques.length > 0 && (
        <Secao titulo="Destaques">
          <div className="grid gap-2 md:grid-cols-2">
            {destaques.map((i) => (
              <Insight key={i.id} insight={i} />
            ))}
          </div>
        </Secao>
      )}
      <Secao titulo="Estatísticas">
        <Estatisticas appId={appId} rows={fonte.rows} lente={lente} />
      </Secao>
      <div className="mt-8">
        <CounterScope appId={appId} gaugesStale={gaugesLookStale(fonte.rows)} />
      </div>
    </>
  );
}
