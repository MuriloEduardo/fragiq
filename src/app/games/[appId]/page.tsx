import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { gameHeaderUrl } from "@/lib/steam/api";
import { formatPlaytime, parseStatSchema } from "@/lib/stats";
import { metricCatalog, type SnapshotRow } from "@/lib/series";
import { SiteHeader } from "@/components/site-header";
import { Explorer, type Preset } from "@/components/explorer";

export const dynamic = "force-dynamic";

// Teto de pontos carregados para o cliente. O explorador recalcula tudo no
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
        select: { capturedAt: true, playtimeForeverMin: true, metrics: true },
      },
    },
  });
  if (!userGame) notFound();

  const schema = parseStatSchema(userGame.game.statSchema);

  const rows: SnapshotRow[] = userGame.snapshots.map((s) => ({
    capturedAt: s.capturedAt,
    playtimeForeverMin: s.playtimeForeverMin,
    metrics: coerce(s.metrics),
  }));

  const catalog = metricCatalog(rows, schema);

  return (
    <>
      <SiteHeader {...user} />

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs text-ink-faint transition hover:text-ink-muted"
        >
          <ArrowLeft className="size-3" />
          Biblioteca
        </Link>

        <header className="mt-4 flex flex-wrap items-end gap-5 border-b border-line pb-6">
          <Image
            src={gameHeaderUrl(appId)}
            alt=""
            width={184}
            height={86}
            className="rounded-lg border border-line"
            unoptimized
          />

          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">
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

        <section className="mt-8">
          <h2 className="text-sm font-semibold tracking-wide text-ink-muted uppercase">
            Explorador
          </h2>
          <p className="mt-1 mb-5 max-w-2xl text-sm text-ink-muted">
            Monte suas próprias séries. Qualquer contador que o jogo exponha pode virar
            gráfico — como total acumulado, por período, normalizado por hora jogada, ou
            como razão entre duas métricas.
          </p>

          <Explorer
            appId={appId}
            snapshots={rows.map((r) => ({
              capturedAt: r.capturedAt.toISOString(),
              playtimeForeverMin: r.playtimeForeverMin,
              metrics: r.metrics,
            }))}
            catalog={catalog}
            presets={presetsFor(appId, catalog.map((c) => c.key))}
          />
        </section>
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

/**
 * Atalhos para as combinações que valem a pena em CS2 — a mesma coisa que o
 * usuário montaria à mão no explorador, em um clique.
 */
function presetsFor(appId: number, available: string[]): Preset[] {
  if (appId !== 730) return [];

  const has = (...keys: string[]) => keys.every((k) => available.includes(k));
  const presets: Preset[] = [];

  if (has("total_kills", "total_deaths")) {
    presets.push({
      label: "K/D por período",
      specs: [{ metric: "total_kills", denominator: "total_deaths", mode: "ratio" }],
    });
  }

  if (has("total_kills", "total_deaths")) {
    presets.push({
      label: "Kills vs mortes",
      specs: [
        { metric: "total_kills", mode: "delta" },
        { metric: "total_deaths", mode: "delta" },
      ],
    });
  }

  if (has("total_kills_headshot", "total_kills")) {
    presets.push({
      label: "Headshot %",
      specs: [
        {
          metric: "total_kills_headshot",
          denominator: "total_kills",
          mode: "ratio",
          scale: 100,
        },
      ],
    });
  }

  if (has("total_shots_hit", "total_shots_fired")) {
    presets.push({
      label: "Precisão",
      specs: [
        {
          metric: "total_shots_hit",
          denominator: "total_shots_fired",
          mode: "ratio",
          scale: 100,
        },
      ],
    });
  }

  if (has("total_damage_done", "total_rounds_played")) {
    presets.push({
      label: "Dano por round",
      specs: [
        { metric: "total_damage_done", denominator: "total_rounds_played", mode: "ratio" },
      ],
    });
  }

  if (has("total_matches_won", "total_matches_played")) {
    presets.push({
      label: "Taxa de vitória",
      specs: [
        {
          metric: "total_matches_won",
          denominator: "total_matches_played",
          mode: "ratio",
          scale: 100,
        },
      ],
    });
  }

  if (has("total_kills")) {
    presets.push({
      label: "Kills por hora",
      specs: [{ metric: "total_kills", mode: "perHour" }],
    });
  }

  return presets;
}
