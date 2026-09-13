import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { carregarFonte } from "@/lib/fonte";
import { Estatisticas } from "@/components/estatisticas";
import { CounterScope } from "@/components/counter-scope";
import { gaugesLookStale } from "@/lib/series";

export const dynamic = "force-dynamic";

export default async function EstatisticasPage({ params }: { params: Promise<{ appId: string }> }) {
  const session = await requireSession();
  const appId = Number((await params).appId);
  const fonte = await carregarFonte(session.userId, appId);
  if (!fonte) notFound();

  return (
    <>
      <Estatisticas appId={appId} rows={fonte.rows} />
      <div className="mt-8">
        <CounterScope appId={appId} gaugesStale={gaugesLookStale(fonte.rows)} />
      </div>
    </>
  );
}
