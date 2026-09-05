import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { gameHeaderUrl } from "@/lib/steam/api";
import { formatPlaytime, parseStatSchema } from "@/lib/stats";
import { gaugesLookStale, metricCatalog, type SnapshotRow } from "@/lib/series";
import { SiteHeader } from "@/components/site-header";
import { GameAnalysis } from "@/components/game-analysis";
import { CollectionStatus } from "@/components/collection-status";
import { CounterScope } from "@/components/counter-scope";

export const dynamic = "force-dynamic";

// Teto de pontos carregados para o cliente. A análise recalcula tudo no
// browser; mandar 5 anos de coletas de uma vez inflaria o payload sem ganho.
const MAX_SNAPSHOTS = 500;

export default async function GamePage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const appId = Number((await params).appId);
  if (!Number.isInteger(appId)) notFound();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { personaName: true, avatarUrl: true, lastSyncedAt: true },
  });
  if (!user) redirect("/");

  const userGame = await prisma.userGame.findUnique({
    where: { userId_gameAppId: { userId: session.userId, gameAppId: appId } },
    select: {
      playtimeForeverMin: true,
      playtimeTwoWeeksMin: true,
      lastPlayedAt: true,
      game: { select: { name: true, statSchema: true } },
      snapshots: {
        orderBy: { capturedAt: "asc" },
        take: MAX_SNAPSHOTS,
        select: {
          capturedAt: true,
          playtimeForeverMin: true,
          metrics: true,
          matchMap: true,
          matchMode: true,
        },
      },
    },
  });
  // Um usuário novo cujo perfil está restrito, ou que ainda não jogou CS2,
  // cairia num 404 — o que parece defeito do site em vez de estado do dado.
  if (!userGame) {
    if (appId !== 730) notFound();
    return (
      <SemDados
        personaName={user.personaName}
        avatarUrl={user.avatarUrl}
        lastSyncedAt={user.lastSyncedAt}
      />
    );
  }

  const schema = parseStatSchema(userGame.game.statSchema);

  const rows: SnapshotRow[] = userGame.snapshots.map((s) => ({
    capturedAt: s.capturedAt,
    playtimeForeverMin: s.playtimeForeverMin,
    metrics: coerce(s.metrics),
    matchMap: s.matchMap,
    matchMode: s.matchMode,
  }));

  const catalog = metricCatalog(rows, schema);

  // Datas viram string na fronteira Server -> Client Component.

  return (
    <>
      <SiteHeader {...user} />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">

        <header className="mt-4 flex flex-wrap items-end gap-4 border-b border-line pb-6 sm:gap-5">
          <Image
            src={gameHeaderUrl(appId)}
            alt=""
            width={184}
            height={86}
            className="rounded-lg border border-line"
            unoptimized
          />

          {/* w-full no celular força a imagem para a linha de cima, em vez de
              espremer o título numa coluna de ~150px ao lado dela. */}
          <div className="w-full min-w-0 sm:w-auto sm:flex-1">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {userGame.game.name}
            </h1>
            <p className="tnum mt-1 text-sm text-ink-muted">
              {formatPlaytime(userGame.playtimeForeverMin)} no total
              {userGame.playtimeTwoWeeksMin > 0 && (
                <> · {formatPlaytime(userGame.playtimeTwoWeeksMin)} nas últimas 2 semanas</>
              )}
              {" · "}
              {rows.length} coleta{rows.length === 1 ? "" : "s"}
              {" · "}
              {catalog.length} métricas disponíveis
            </p>
          </div>
        </header>

        <div className="mt-6 space-y-3">
          <CollectionStatus snapshotCount={rows.length} />
          <CounterScope appId={appId} gaugesStale={gaugesLookStale(rows)} />
        </div>

        <div className="mt-10">
          <GameAnalysis
            appId={appId}
            parsed={rows}
            catalog={catalog}
          />
        </div>
      </main>
    </>
  );
}

function coerce(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
  }
  return out;
}

function SemDados({
  personaName,
  avatarUrl,
  lastSyncedAt,
}: {
  personaName: string;
  avatarUrl: string | null;
  lastSyncedAt: Date | null;
}) {
  return (
    <>
      <SiteHeader
        personaName={personaName}
        avatarUrl={avatarUrl}
        lastSyncedAt={lastSyncedAt}
      />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">
          Ainda não encontramos seu Counter-Strike 2
        </h1>
        <p className="mt-4 max-w-xl leading-relaxed text-ink-muted">
          Isso acontece quando o perfil da Steam está restrito. Em{" "}
          <strong className="font-medium text-ink">
            Perfil → Editar perfil → Privacidade
          </strong>
          , deixe <strong className="font-medium text-ink">Detalhes do jogo</strong>{" "}
          como público — é o que permite ler suas estatísticas. Depois clique em
          Sincronizar aqui em cima.
        </p>
        <p className="mt-4 max-w-xl text-sm text-ink-faint">
          Se o perfil já estiver público e a mensagem continuar, pode ser que a
          conta ainda não tenha partidas registradas de CS2.
        </p>
      </main>
    </>
  );
}
