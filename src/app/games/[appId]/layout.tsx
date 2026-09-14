import { Suspense } from "react";
import Image from "next/image";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { gameHeaderUrl } from "@/lib/steam/api";
import { formatPlaytime } from "@/lib/stats";
import { isAdmin, seloDe } from "@/lib/admin";
import { SiteHeader } from "@/components/site-header";
import { NavJogo } from "@/components/nav-jogo";
import { ModoNav } from "@/components/modo-nav";
import { PendenciasBanner } from "@/components/pendencias-banner";
import { COOKIE_MODO } from "@/lib/modo";
import { abasDoUsuario } from "@/lib/modo-servidor";
import { pendenciasDe } from "@/lib/pendencias";

/**
 * Cabeçalho do jogo e as abas, uma vez só, para todas as áreas.
 *
 * O que muda entre Resumo, Estatísticas, Sessões, Métricas e Analista é o
 * conteúdo; o nome do jogo, as horas e o menu são a mesma coisa em todas —
 * e ficam aqui para que trocar de aba não redesenhe a página inteira.
 *
 * Sob as abas vem o submenu de modos, e acima do conteúdo o aviso do que
 * falta compartilhar na Steam — os dois valem para todas as abas.
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

  const [user, userGame, selo, abas, pendencias, jar] = await Promise.all([
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
    seloDe(session.userId),
    abasDoUsuario(session.userId, appId),
    appId === 730 ? pendenciasDe(session.userId) : Promise.resolve([]),
    cookies(),
  ]);
  if (!user) redirect("/");

  return (
    <>
      <SiteHeader {...user} admin={isAdmin(session.steamId)} selo={selo} />

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
                <Suspense>
                  <NavJogo appId={appId} />
                </Suspense>
              </div>
            </div>
          </div>
          {abas.length > 0 && (
            <div className="border-b border-line-soft bg-surface/60">
              <div className="mx-auto max-w-6xl px-4 sm:px-6">
                <Suspense>
                  <ModoNav abas={abas} doCookie={jar.get(COOKIE_MODO)?.value} />
                </Suspense>
              </div>
            </div>
          )}
          <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
            {pendencias.length > 0 && <PendenciasBanner pendencias={pendencias} base={`/games/${appId}`} />}
            {children}
          </main>
        </>
      ) : (
        children
      )}
    </>
  );
}
