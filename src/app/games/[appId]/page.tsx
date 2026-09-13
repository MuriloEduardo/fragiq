import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { carregarFonte } from "@/lib/fonte";
import { cogniflow } from "@/lib/env";
import { listarAnalises, sessaoSemAnalise } from "@/lib/analises";
import { lerSerie } from "@/lib/leituras";
import { ultimaSessao, vitaliciosDoHero } from "@/lib/sessoes";
import { CS2_PANEL } from "@/lib/cs2-panel";
import { SessaoHero } from "@/components/sessao-hero";
import { Analista } from "@/components/analista";
import { Leituras } from "@/components/leituras";
import { StatPanel } from "@/components/stat-panel";
import { PrimeirosPassos } from "@/components/primeiros-passos";
import { Secao } from "@/components/secao";
import { SemDados } from "@/components/sem-dados";
import { botEhAmigo } from "@/lib/bot";

export const dynamic = "force-dynamic";

/**
 * Resumo: "como foi?" em uma tela.
 *
 * A última sessão em três números, a análise que chegou sozinha, as quatro
 * leituras que mais pesam e os seis tiles principais. Tudo o mais tem aba
 * própria — e cada tile leva ao seu gráfico.
 */
export default async function ResumoPage({ params }: { params: Promise<{ appId: string }> }) {
  const session = await requireSession();
  const appId = Number((await params).appId);

  const fonte = await carregarFonte(session.userId, appId);
  if (!fonte) {
    if (appId !== 730) notFound();
    return <SemDados botAmigo={await botEhAmigo(session.steamId)} />;
  }
  const { rows } = fonte;

  const sessao = ultimaSessao(rows);
  const amigoDoBot = appId === 730 ? await botEhAmigo(session.steamId) : true;
  const onboarding = appId === 730 && (rows.length < 2 || amigoDoBot !== true);
  const leituras = lerSerie(rows).filter((l) => l.id !== "modo" && l.id !== "mapas");
  const analista =
    cogniflow() && rows.length >= 2
      ? await Promise.all([listarAnalises(session.userId, appId), sessaoSemAnalise(session.userId, appId)])
      : null;

  return (
    <>
      {onboarding && (
        <div className="mb-8">
          <PrimeirosPassos statsVisiveis botAmigo={amigoDoBot} coletas={rows.length} />
        </div>
      )}

      {sessao && <SessaoHero sessao={sessao} vitalicio={vitaliciosDoHero(rows)} />}

      {analista && (
        <Secao titulo="Análise" href={`/games/${appId}/analista`} acao="conversar">
          <Analista appId={appId} iniciais={analista[0]} sessaoSemAnalise={analista[1]} modo="resumo" />
        </Secao>
      )}

      {leituras.length > 0 && (
        <Secao titulo="Leituras">
          <Leituras leituras={leituras} limite={4} />
        </Secao>
      )}

      {appId === 730 && (
        <Secao titulo="Estatísticas" href={`/games/${appId}/estatisticas`} acao="todas">
          <StatPanel stats={CS2_PANEL} snapshots={rows} appId={appId} limite={6} />
        </Secao>
      )}
    </>
  );
}
