import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { parseStatSchema } from "@/lib/stats";
import {
  buildSeries,
  classifyMetric,
  deltaEntre,
  groupOf,
  humanizeKey,
  lifetimeValue,
  ultimoPar,
  type SeriesSpec,
  type SnapshotRow,
} from "@/lib/series";
import { SiteHeader } from "@/components/site-header";
import { SerieChart } from "@/components/serie-chart";

export const dynamic = "force-dynamic";

const MAX_SNAPSHOTS = 500;
const DENOMINADOR = "total_rounds_played";

/**
 * Uma métrica sozinha, com espaço para ser explicada.
 *
 * A lista responde "o que mudou". Esta página responde "como", que precisa de
 * coisas que não cabem numa linha de tabela: a série inteira desenhada, o
 * acumulado que a Steam guarda de verdade, e cada coleta com o seu delta —
 * porque é do delta que sai todo o resto, e quem duvida do número deveria
 * poder conferir a conta.
 */
export default async function MetricaPage({
  params,
}: {
  params: Promise<{ appId: string; key: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const { appId: appIdRaw, key: keyRaw } = await params;
  const appId = Number(appIdRaw);
  const key = decodeURIComponent(keyRaw);
  if (!Number.isInteger(appId)) notFound();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { personaName: true, avatarUrl: true, lastSyncedAt: true },
  });
  if (!user) redirect("/");

  const userGame = await prisma.userGame.findUnique({
    where: { userId_gameAppId: { userId: session.userId, gameAppId: appId } },
    select: {
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
  if (!userGame) notFound();

  const schema = parseStatSchema(userGame.game.statSchema);
  const rows: SnapshotRow[] = userGame.snapshots.map((s) => ({
    capturedAt: s.capturedAt,
    playtimeForeverMin: s.playtimeForeverMin,
    metrics: coerce(s.metrics),
    matchMap: s.matchMap,
    matchMode: s.matchMode,
  }));

  const existe = rows.some((r) => key in r.metrics);
  if (!existe) notFound();

  const label = schema?.[key] ?? humanizeKey(key);
  const kind = classifyMetric(key);
  const porRound = kind === "counter" && key !== DENOMINADOR;

  const specTaxa: SeriesSpec = porRound
    ? { id: key, metric: key, denominator: DENOMINADOR, mode: "ratio" }
    : { id: key, metric: key, mode: kind === "gauge" ? "cumulative" : "delta" };

  const taxa = buildSeries(rows, specTaxa, "raw");
  const acumulado = buildSeries(rows, { id: key, metric: key, mode: "cumulative" }, "raw");
  const deltas = buildSeries(rows, { id: key, metric: key, mode: "delta" }, "raw");
  const vitalicio = porRound ? lifetimeValue(specTaxa, rows) : null;

  const par = ultimoPar(rows, DENOMINADOR);
  const roundsPeriodo = par ? deltaEntre(par, DENOMINADOR) : null;
  const noPeriodo = par ? deltaEntre(par, key) : null;

  const atual = taxa.length ? taxa[taxa.length - 1].value : null;
  const variacao =
    atual !== null && vitalicio !== null && vitalicio !== 0
      ? (atual - vitalicio) / Math.abs(vitalicio)
      : null;

  const porT = new Map(deltas.map((p) => [p.t, p.value]));
  const taxaPorT = new Map(taxa.map((p) => [p.t, p.value]));

  return (
    <>
      <SiteHeader {...user} />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Link
          href={`/games/${appId}`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition hover:text-accent"
        >
          <ArrowLeft className="size-4" />
          {userGame.game.name}
        </Link>

        <header className="mt-4 border-b border-line pb-5">
          <p className="text-xs tracking-wide text-ink-faint uppercase">{groupOf(key)}</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{label}</h1>
          <p className="mt-1 font-mono text-xs text-ink-faint">{key}</p>
        </header>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Numero
            rotulo={porRound ? "por round agora" : "no período"}
            valor={fmt(atual)}
          />
          <Numero rotulo="vitalício" valor={fmt(vitalicio)} />
          <Numero
            rotulo="variação"
            valor={variacao === null ? "—" : `${variacao > 0 ? "+" : ""}${(variacao * 100).toFixed(0)}%`}
          />
          <Numero
            rotulo="total no período"
            valor={fmt(noPeriodo, 0)}
            nota={roundsPeriodo !== null ? `em ${roundsPeriodo} rounds` : undefined}
          />
        </dl>

        <section className="mt-8">
          <h2 className="text-sm font-semibold tracking-wide text-ink-muted uppercase">
            {porRound ? "Taxa por round" : "Por período"}
          </h2>
          <p className="mt-1 text-sm text-ink-faint">
            {porRound
              ? "Cada ponto é o que aconteceu entre duas coletas, dividido pelos rounds do intervalo. É a forma de comparar um período com o seu vitalício."
              : "Cada ponto é o que aconteceu entre duas coletas."}
          </p>
          <div className="mt-3 rounded-xl border border-line bg-surface p-4">
            <SerieChart points={taxa} baseline={vitalicio} formatar={(v) => fmt(v)} />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold tracking-wide text-ink-muted uppercase">
            Acumulado
          </h2>
          <p className="mt-1 text-sm text-ink-faint">
            O número que a Steam realmente guarda: o total desde sempre. Tudo
            acima é derivado da diferença entre dois pontos desta linha.
          </p>
          <div className="mt-3 rounded-xl border border-line bg-surface p-4">
            <SerieChart
              points={acumulado}
              formatar={(v) => fmt(v, 0)}
              cor="var(--ct)"
            />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold tracking-wide text-ink-muted uppercase">
            Coleta a coleta
          </h2>
          <p className="mt-1 text-sm text-ink-faint">
            A conta aberta. Coletas sem linha de delta são as descartadas por
            leitura atrasada da Steam — contador vitalício que veio menor que o
            anterior.
          </p>
          <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface">
            {acumulado
              .slice()
              .reverse()
              .map((p) => (
                <div
                  key={p.t}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line px-4 py-2.5 text-sm last:border-b-0"
                >
                  <p className="min-w-40 flex-1 text-ink-muted" suppressHydrationWarning>
                    {new Date(p.t).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <p className="tnum min-w-24 text-right">{fmt(p.value, 0)}</p>
                  <p className="tnum min-w-20 text-right text-ink-muted">
                    {porT.has(p.t) ? `+${fmt(porT.get(p.t)!, 0)}` : "—"}
                  </p>
                  <p className="tnum min-w-24 text-right text-ink-faint">
                    {taxaPorT.has(p.t) ? fmt(taxaPorT.get(p.t)!) : "—"}
                  </p>
                </div>
              ))}
          </div>
          <p className="mt-2 flex flex-wrap gap-x-4 text-[11px] text-ink-faint">
            <span>acumulado</span>
            <span>· diferença para a coleta anterior</span>
            <span>· {porRound ? "por round" : "no período"}</span>
          </p>
        </section>
      </main>
    </>
  );
}

function Numero({
  rotulo,
  valor,
  nota,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <dt className="text-[11px] tracking-wide text-ink-faint uppercase">{rotulo}</dt>
      <dd className="tnum mt-1 text-lg font-semibold">{valor}</dd>
      {nota && <p className="text-[11px] text-ink-faint">{nota}</p>}
    </div>
  );
}

function fmt(v: number | null, casas = 2) {
  if (v === null || v === undefined) return "—";
  const precisao = v !== 0 && Math.abs(v) < 0.1 ? 4 : casas;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: precisao });
}

/** Json do Prisma vira Record<string, number>, descartando o que não for número. */
function coerce(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
  }
  return out;
}
