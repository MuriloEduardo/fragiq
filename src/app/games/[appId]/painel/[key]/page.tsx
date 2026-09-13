import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { carregarFonte } from "@/lib/fonte";
import { CS2_PANEL } from "@/lib/cs2-panel";
import { buildSeries, lifetimeValue, type Bucket, type SeriesSpec } from "@/lib/series";
import { formatarQuando } from "@/lib/sessoes";
import { SerieChart } from "@/components/serie-chart";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const BUCKETS: { id: Bucket; rotulo: string }[] = [
  { id: "raw", rotulo: "cada coleta" },
  { id: "day", rotulo: "dia" },
  { id: "week", rotulo: "semana" },
  { id: "month", rotulo: "mês" },
];

/**
 * Um tile do painel, em página inteira.
 *
 * O gráfico grande com o vitalício de referência, a granularidade que a
 * pessoa escolher e cada ponto com a sua data. É onde se olha de perto o
 * que o tile só insinua.
 */
export default async function PainelStatPage({
  params,
  searchParams,
}: {
  params: Promise<{ appId: string; key: string }>;
  searchParams: Promise<{ bucket?: string }>;
}) {
  const session = await requireSession();
  const { appId: appIdRaw, key } = await params;
  const appId = Number(appIdRaw);
  const stat = CS2_PANEL.find((s) => s.key === key);
  if (!Number.isInteger(appId) || !stat) notFound();

  const fonte = await carregarFonte(session.userId, appId);
  if (!fonte) notFound();

  const bucketRaw = (await searchParams).bucket;
  const bucket: Bucket = BUCKETS.some((b) => b.id === bucketRaw) ? (bucketRaw as Bucket) : "raw";

  const spec: SeriesSpec = { ...stat.spec, id: stat.key };
  const pontos = buildSeries(fonte.rows, spec, bucket);
  const vitalicio = lifetimeValue(spec, fonte.rows);
  const atual = pontos[pontos.length - 1]?.value ?? null;
  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", {
      minimumFractionDigits: stat.decimals,
      maximumFractionDigits: stat.decimals,
    }) + (stat.unit ?? "");
  const variacao =
    atual !== null && vitalicio ? (atual - vitalicio) / Math.abs(vitalicio) : null;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="hud">Estatística</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{stat.label}</h2>
        </div>
        <div className="flex gap-1 rounded-lg bg-surface p-1 ring-1 ring-line">
          {BUCKETS.map((b) => (
            <Link
              key={b.id}
              href={`?bucket=${b.id}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs transition",
                b.id === bucket ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              {b.rotulo}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Numero rotulo="agora" valor={atual === null ? "—" : fmt(atual)} destaque />
        <Numero rotulo="vitalício" valor={vitalicio === null ? "—" : fmt(vitalicio)} />
        <Numero
          rotulo="contra o seu normal"
          valor={variacao === null ? "—" : `${variacao > 0 ? "+" : ""}${(variacao * 100).toFixed(0)}%`}
        />
      </div>

      <div className="mt-6 rounded-2xl bg-surface p-4 ring-1 ring-line sm:p-6">
        <SerieChart points={pontos} baseline={vitalicio} formatar={fmt} />
      </div>

      {pontos.length > 0 && (
        <ol className="mt-6 divide-y divide-line-soft rounded-2xl bg-surface ring-1 ring-line">
          {[...pontos].reverse().map((p) => (
            <li key={p.t} className="flex items-center justify-between px-5 py-3 text-sm">
              <span className="tnum text-ink-muted" suppressHydrationWarning>
                {formatarQuando(new Date(p.t))}
              </span>
              <span className="num font-medium">{fmt(p.value)}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function Numero({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className={cn("rounded-2xl bg-surface p-5 ring-1 ring-line", destaque && "glow")}>
      <p className="hud">{rotulo}</p>
      <p className="num mt-2 text-3xl font-semibold">{valor}</p>
    </div>
  );
}
