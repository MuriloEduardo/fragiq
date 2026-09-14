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
import { prisma } from "@/lib/prisma";
import { filtroDoModo, rotuloDoModo, TUDO } from "@/lib/modo";
import { abasDoUsuario, modoDaRequisicao, type SearchParams } from "@/lib/modo-servidor";

export const dynamic = "force-dynamic";

/**
 * Resumo: "como foi?" em uma tela.
 *
 * A última sessão em três números, a análise que chegou sozinha, as quatro
 * leituras que mais pesam e os seis tiles principais. Tudo o mais tem aba
 * própria — e cada tile leva ao seu gráfico.
 *
 * Tudo aqui respeita o modo do submenu: a última sessão é a última DAQUELE
 * modo, e o "normal" contra o qual ela é medida é o acumulado do modo, não
 * o vitalício que mistura tudo.
 */
export default async function ResumoPage({ params, searchParams }: { params: Promise<{ appId: string }>; searchParams: SearchParams }) {
  const session = await requireSession();
  const appId = Number((await params).appId);

  const fonte = await carregarFonte(session.userId, appId);
  if (!fonte) {
    if (appId !== 730) notFound();
    return <SemDados botAmigo={await botEhAmigo(session.steamId)} />;
  }
  const { rows } = fonte;
  const modo = await modoDaRequisicao(searchParams, await abasDoUsuario(session.userId, appId));
  const filtro = filtroDoModo(modo);

  const sessao = ultimaSessao(rows, filtro);
  const amigoDoBot = appId === 730 ? await botEhAmigo(session.steamId) : true;
  const partidasAtivas =
    appId === 730
      ? Boolean((await prisma.user.findUnique({ where: { id: session.userId }, select: { partidasAtivadasEm: true } }))?.partidasAtivadasEm)
      : true;
  const onboarding = appId === 730 && (rows.length < 2 || amigoDoBot !== true || !partidasAtivas);
  const leituras = lerSerie(rows, filtro).filter((l) => l.id !== "modo" && l.id !== "mapas");
  const analista =
    cogniflow() && rows.length >= 2
      ? await Promise.all([listarAnalises(session.userId, appId, { modo, rows }), sessaoSemAnalise(session.userId, appId)])
      : null;

  return (
    <>
      {onboarding && (
        <div className="mb-8">
          <PrimeirosPassos statsVisiveis botAmigo={amigoDoBot} coletas={rows.length} partidasAtivas={partidasAtivas} />
        </div>
      )}

      {sessao ? (
        <SessaoHero sessao={sessao} vitalicio={vitaliciosDoHero(rows, filtro)} referencia={modo === TUDO ? "vitalício" : `no ${rotuloDoModo(modo)}`} />
      ) : (
        modo !== TUDO && (
          <p className="rounded-2xl border border-dashed border-line px-6 py-8 text-center text-sm text-ink-faint">
            Nenhuma sessão de {rotuloDoModo(modo)} ainda.
          </p>
        )
      )}

      {analista && (
        <Secao titulo="Análise" href={`/games/${appId}/analista`} acao="histórico">
          <Analista appId={appId} iniciais={analista[0]} sessaoSemAnalise={analista[1] && modo === TUDO} apresentacao="resumo" modo={modo} />
        </Secao>
      )}

      {leituras.length > 0 && (
        <Secao titulo="Leituras">
          <Leituras leituras={leituras} limite={4} />
        </Secao>
      )}

      {appId === 730 && (
        <Secao titulo="Estatísticas" href={`/games/${appId}/estatisticas`} acao="todas">
          <StatPanel stats={CS2_PANEL} snapshots={rows} filter={filtro} appId={appId} limite={6} />
        </Secao>
      )}
    </>
  );
}
