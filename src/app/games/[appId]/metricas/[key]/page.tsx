import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
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
  type SnapshotRow, pontosDeSerie } from "@/lib/series";
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
  const session = await requireSession();

  const { appId: appIdRaw, key: keyRaw } = await params;
  const appId = Number(appIdRaw);
  const key = decodeURIComponent(keyRaw);
  if (!Number.isInteger(appId)) notFound();

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
      <div className="max-w-4xl">
        <Link
          href={`/games/${appId}/metricas`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition hover:text-accent"
        >
          <ArrowLeft className="size-4" />
          Métricas
        </Link>

        <header className="mt-4">
          <p className="hud">{groupOf(key)} · {key}</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{label}</h2>
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
          <h3 className="hud">{porRound ? "Taxa por round" : "Por período"}</h3>
          <div className="mt-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
            <SerieChart pontos={pontosDeSerie(taxa)} normal={vitalicio === null ? null : { valor: vitalicio, rotulo: "vitalício" }} formatar={(v) => fmt(v)} />
          </div>
        </section>

        <section className="mt-8">
          <h3 className="hud">Acumulado</h3>
          <div className="mt-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
            <SerieChart pontos={pontosDeSerie(acumulado)} normal={null} formatar={(v) => fmt(v, 0)} />
          </div>
        </section>

        <section className="mt-8">
          <h3 className="hud">Coleta a coleta</h3>
          <div className="mt-3 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
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
      </div>
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
