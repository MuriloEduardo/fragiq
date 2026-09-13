import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { cogniflow } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { listarAnalises, sessaoSemAnalise } from "@/lib/analises";
import { Analista } from "@/components/analista";

export const dynamic = "force-dynamic";

/** A conversa inteira com o analista: a sessão e o que foi perguntado. */
export default async function AnalistaPage({ params }: { params: Promise<{ appId: string }> }) {
  const session = await requireSession();
  const appId = Number((await params).appId);

  const userGame = await prisma.userGame.findUnique({
    where: { userId_gameAppId: { userId: session.userId, gameAppId: appId } },
    select: { _count: { select: { snapshots: true } } },
  });
  if (!userGame) notFound();

  if (!cogniflow() || userGame._count.snapshots < 2) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-ink-faint">
        O analista entra a partir da segunda coleta com partidas.
      </p>
    );
  }

  const [iniciais, semAnalise] = await Promise.all([
    listarAnalises(session.userId, appId),
    sessaoSemAnalise(session.userId, appId),
  ]);

  return <Analista appId={appId} iniciais={iniciais} sessaoSemAnalise={semAnalise} />;
}
