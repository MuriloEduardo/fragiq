import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { gameHeaderUrl } from "@/lib/steam/api";
import { formatPlaytime, parseStatSchema } from "@/lib/stats";
import { gaugesLookStale, metricCatalog, type SnapshotRow } from "@/lib/series";
import { SiteHeader } from "@/components/site-header";
import { Explorer, type Preset } from "@/components/explorer";
import { CollectionStatus } from "@/components/collection-status";
import { CounterScope } from "@/components/counter-scope";

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

        <div className="mt-6 space-y-3">
          <CollectionStatus snapshotCount={rows.length} />
          <CounterScope appId={appId} gaugesStale={gaugesLookStale(rows)} />
        </div>

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
 *
 * O primeiro preset é o que o explorador abre.
 *
 * Já priorizamos os de última partida quando havia uma coleta só, porque são
 * os únicos que desenham com um ponto. Voltamos atrás: medimos e esses
 * contadores estavam congelados enquanto partidas eram jogadas, então o
 * padrão exibia dado velho como se fosse atual — pior do que não exibir nada.
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

  // Precisão por arma: o contador global total_shots_hit da Valve está
  // quebrado há anos (devolve uma fração do real), mas os pares por arma
  // total_hits_X / total_shots_X são confiáveis.
  const armas = ["ak47", "m4a1", "awp", "deagle"].filter((a) =>
    has(`total_hits_${a}`, `total_shots_${a}`),
  );
  if (armas.length) {
    presets.push({
      label: "Precisão por arma",
      specs: armas.map((a) => ({
        metric: `total_hits_${a}`,
        denominator: `total_shots_${a}`,
        mode: "ratio" as const,
        scale: 100,
      })),
    });
  }

  const mapas = ["de_mirage", "de_dust2", "de_inferno", "de_nuke"].filter((m) =>
    has(`total_wins_map_${m}`, `total_rounds_map_${m}`),
  );
  if (mapas.length) {
    presets.push({
      label: "Vitória por mapa",
      specs: mapas.map((m) => ({
        metric: `total_wins_map_${m}`,
        denominator: `total_rounds_map_${m}`,
        mode: "ratio" as const,
        scale: 100,
      })),
    });
  }

  // last_match_* não é cumulativo: cada coleta traz o resultado da partida
  // mais recente, o que dá a granularidade mais próxima de "por partida"
  // sem parsing de demo.
  if (has("last_match_kills", "last_match_deaths")) {
    presets.push({
      label: "Última partida: K/D",
      specs: [
        { metric: "last_match_kills", denominator: "last_match_deaths", mode: "ratio" },
      ],
    });
  }

  if (has("last_match_damage", "last_match_rounds")) {
    presets.push({
      label: "Última partida: dano/round",
      specs: [
        { metric: "last_match_damage", denominator: "last_match_rounds", mode: "ratio" },
      ],
    });
  }

  return presets;
}
