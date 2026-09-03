import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ChevronRight, Gamepad2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { gameIconUrl } from "@/lib/steam/api";
import { formatPlaytime } from "@/lib/stats";
import { SiteHeader } from "@/components/site-header";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await getSession();
  if (!session) redirect("/");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { personaName: true, avatarUrl: true, lastSyncedAt: true },
  });
  if (!user) redirect("/");

  const games = await prisma.userGame.findMany({
    where: { userId: session.userId },
    orderBy: [{ playtimeTwoWeeksMin: "desc" }, { playtimeForeverMin: "desc" }],
    select: {
      gameAppId: true,
      playtimeForeverMin: true,
      playtimeTwoWeeksMin: true,
      lastPlayedAt: true,
      game: { select: { name: true, iconHash: true } },
      _count: { select: { snapshots: true } },
    },
  });

  const tracked = games.filter((g) => g._count.snapshots > 0);
  const totalHours = games.reduce((sum, g) => sum + g.playtimeForeverMin, 0);

  return (
    <>
      <SiteHeader {...user} />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          Olá, {user.personaName}
        </h1>

        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Jogos jogados" value={String(games.length)} />
          <Stat label="Com estatísticas" value={String(tracked.length)} />
          <Stat label="Tempo total" value={formatPlaytime(totalHours)} />
          <Stat
            label="Últimas 2 semanas"
            value={formatPlaytime(
              games.reduce((sum, g) => sum + g.playtimeTwoWeeksMin, 0),
            )}
          />
        </dl>

        {games.length === 0 ? (
          <EmptyState />
        ) : (
          <section className="mt-10">
            <h2 className="text-sm font-semibold tracking-wide text-ink-muted uppercase">
              Sua biblioteca
            </h2>

            <ul className="mt-4 divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface">
              {games.map((entry) => {
                const icon = gameIconUrl(entry.gameAppId, entry.game.iconHash);
                const trackable = entry._count.snapshots > 0;

                const row = (
                  <div className="flex items-center gap-4 px-4 py-3 transition group-hover:bg-surface-2">
                    {icon ? (
                      <Image
                        src={icon}
                        alt=""
                        width={32}
                        height={32}
                        className="size-8 rounded"
                        unoptimized
                      />
                    ) : (
                      <span className="flex size-8 items-center justify-center rounded bg-surface-2 text-ink-faint">
                        <Gamepad2 className="size-4" />
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{entry.game.name}</p>
                      <p className="tnum text-xs text-ink-faint">
                        {formatPlaytime(entry.playtimeForeverMin)}
                        {entry.playtimeTwoWeeksMin > 0 && (
                          <span className="text-accent">
                            {" · "}
                            {formatPlaytime(entry.playtimeTwoWeeksMin)} nas 2 semanas
                          </span>
                        )}
                      </p>
                    </div>

                    {trackable ? (
                      <span className="tnum flex items-center gap-2 text-xs text-ink-muted">
                        {entry._count.snapshots} coleta
                        {entry._count.snapshots > 1 ? "s" : ""}
                        <ChevronRight className="size-4 text-ink-faint" />
                      </span>
                    ) : (
                      <span
                        className="text-xs text-ink-faint"
                        title="Este jogo não expõe estatísticas pela Steam Web API."
                      >
                        sem stats
                      </span>
                    )}
                  </div>
                );

                return (
                  <li key={entry.gameAppId} className="group">
                    {trackable ? (
                      <Link href={`/games/${entry.gameAppId}`}>{row}</Link>
                    ) : (
                      <div className="opacity-55">{row}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="tnum mt-1 text-xl font-semibold">{value}</dd>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-10 rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <h2 className="text-sm font-medium">Nenhum jogo encontrado</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
        A Steam só entrega biblioteca e estatísticas de perfis públicos. Em{" "}
        <span className="text-ink">Perfil → Editar perfil → Privacidade</span>, deixe
        “Detalhes do jogo” como <span className="text-ink">Público</span> e sincronize
        de novo.
      </p>
    </div>
  );
}
