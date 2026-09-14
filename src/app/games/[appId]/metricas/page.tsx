import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { carregarFonte } from "@/lib/fonte";
import { todasAsMetricas } from "@/lib/leituras";
import { MetricTable } from "@/components/metric-table";
import { filtroDoModo } from "@/lib/modo";
import { abasDoUsuario, modoDaRequisicao, type SearchParams } from "@/lib/modo-servidor";

export const dynamic = "force-dynamic";

/** As 178, cada uma comparada com o vitalício (ou com o acumulado do modo), com busca. */
export default async function MetricasPage({ params, searchParams }: { params: Promise<{ appId: string }>; searchParams: SearchParams }) {
  const session = await requireSession();
  const appId = Number((await params).appId);
  const fonte = await carregarFonte(session.userId, appId);
  if (!fonte) notFound();
  const modo = await modoDaRequisicao(searchParams, await abasDoUsuario(session.userId, appId));

  const linhas = todasAsMetricas(fonte.rows, fonte.catalog.map((c) => c.key), filtroDoModo(modo));
  return <MetricTable linhas={linhas} appId={appId} />;
}
