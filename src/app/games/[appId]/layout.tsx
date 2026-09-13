import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { gameHeaderUrl } from "@/lib/steam/api";
import { formatPlaytime } from "@/lib/stats";
import { isAdmin } from "@/lib/admin";
import { SiteHeader } from "@/components/site-header";
import { NavJogo } from "@/components/nav-jogo";

/**
 * Cabeçalho do jogo e as abas, uma vez só, para todas as áreas.
 *
 * O que muda entre Resumo, Estatísticas, Sessões, Métricas e Analista é o
 * conteúdo; o nome do jogo, as horas e o menu são a mesma coisa em todas —
 * e ficam aqui para que trocar de aba não redesenhe a página inteira.
 */
export default async function GameLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ appId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const appId = Number((await params).appId);
  if (!Number.isInteger(appId)) notFound();

  const [user, userGame] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { personaName: true, avatarUrl: true, lastSyncedAt: true },
    }),
    prisma.userGame.findUnique({
      where: { userId_gameAppId: { userId: session.userId, gameAppId: appId } },
      select: {
        playtimeForeverMin: true,
        playtimeTwoWeeksMin: true,
        game: { select: { name: true } },
        _count: { select: { snapshots: true } },
      },
    }),
  ]);
  if (!user) redirect("/");

  return (
    <>
      <SiteHeader {...user} admin={isAdmin(session.steamId)} />

      {userGame ? (
        <>
          <div className="border-b border-line bg-surface">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <div className="flex items-center gap-4 pt-6">
                <Image
                  src={gameHeaderUrl(appId)}
                  alt=""
                  width={92}
                  height={43}
                  className="hidden rounded-md sm:block"
                  unoptimized
                />
                <div className="min-w-0">
                  <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
                    {userGame.game.name}
                  </h1>
                  <p className="tnum text-sm text-ink-muted">
                    {formatPlaytime(userGame.playtimeForeverMin)}
                    {userGame.playtimeTwoWeeksMin > 0 && (
                      <> · {formatPlaytime(userGame.playtimeTwoWeeksMin)} em 2 semanas</>
                    )}
                    {" · "}
                    {userGame._count.snapshots} coleta{userGame._count.snapshots === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <NavJogo appId={appId} />
              </div>
            </div>
          </div>
          <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
        </>
      ) : (
        children
      )}
    </>
  );
}
