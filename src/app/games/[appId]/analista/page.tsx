import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { cogniflow } from "@/lib/env";
import { carregarFonte } from "@/lib/fonte";
import { listarAnalises, sessaoSemAnalise } from "@/lib/analises";
import { rotuloDoModo, TUDO } from "@/lib/modo";
import { abasDoUsuario, modoDaRequisicao, type SearchParams } from "@/lib/modo-servidor";
import { Analista } from "@/components/analista";

export const dynamic = "force-dynamic";

/**
 * Todas as análises de sessão, da mais recente à mais antiga, no modo do
 * submenu. Nada a digitar: cada cartão é uma sessão que o analista leu
 * sozinho.
 */
export default async function AnalistaPage({ params, searchParams }: { params: Promise<{ appId: string }>; searchParams: SearchParams }) {
  const session = await requireSession();
  const appId = Number((await params).appId);

  const fonte = await carregarFonte(session.userId, appId);
  if (!fonte) notFound();
  const modo = await modoDaRequisicao(searchParams, await abasDoUsuario(session.userId, appId));

  if (!cogniflow() || fonte.rows.length < 2) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-ink-faint">
        O analista entra a partir da segunda coleta com partidas.
      </p>
    );
  }

  const [iniciais, semAnalise] = await Promise.all([
    listarAnalises(session.userId, appId, { modo, rows: fonte.rows }),
    sessaoSemAnalise(session.userId, appId),
  ]);

  if (iniciais.length === 0 && modo !== TUDO) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-ink-faint">
        Nenhuma análise de sessão de {rotuloDoModo(modo)} ainda. A próxima sessão nesse modo ganha a sua.
      </p>
    );
  }

  return <Analista appId={appId} iniciais={iniciais} sessaoSemAnalise={semAnalise && modo === TUDO} modo={modo} />;
}
