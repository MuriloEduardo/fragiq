import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { carregarFonte } from "@/lib/fonte";
import { Estatisticas } from "@/components/estatisticas";
import { CounterScope } from "@/components/counter-scope";
import { gaugesLookStale } from "@/lib/series";
import { lerSerie } from "@/lib/leituras";
import { Destaques } from "@/components/leituras";
import { Secao } from "@/components/secao";
import { filtroDoModo } from "@/lib/modo";
import { abasDoUsuario, modoDaRequisicao, type SearchParams } from "@/lib/modo-servidor";

export const dynamic = "force-dynamic";

export default async function EstatisticasPage({ params, searchParams }: { params: Promise<{ appId: string }>; searchParams: SearchParams }) {
  const session = await requireSession();
  const appId = Number((await params).appId);
  const fonte = await carregarFonte(session.userId, appId);
  if (!fonte) notFound();
  const modo = await modoDaRequisicao(searchParams, await abasDoUsuario(session.userId, appId));

  const destaques = lerSerie(fonte.rows, filtroDoModo(modo)).filter((l) => l.id.startsWith("arma-"));

  return (
    <>
      {destaques.length > 0 && (
        <Secao titulo="Destaques">
          <Destaques leituras={destaques} />
        </Secao>
      )}
      <Secao titulo="Estatísticas">
        <Estatisticas appId={appId} rows={fonte.rows} lente={filtroDoModo(modo)?.mode ?? null} />
      </Secao>
      <div className="mt-8">
        <CounterScope appId={appId} gaugesStale={gaugesLookStale(fonte.rows)} />
      </div>
    </>
  );
}
