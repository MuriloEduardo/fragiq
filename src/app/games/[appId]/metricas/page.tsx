import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { carregarFonte } from "@/lib/fonte";
import { todasAsMetricas } from "@/lib/leituras";
import { MetricTable } from "@/components/metric-table";

export const dynamic = "force-dynamic";

/** As 178, cada uma comparada com o vitalício, com busca. */
export default async function MetricasPage({ params }: { params: Promise<{ appId: string }> }) {
  const session = await requireSession();
  const appId = Number((await params).appId);
  const fonte = await carregarFonte(session.userId, appId);
  if (!fonte) notFound();

  const linhas = todasAsMetricas(fonte.rows, fonte.catalog.map((c) => c.key));
  return <MetricTable linhas={linhas} appId={appId} />;
}
