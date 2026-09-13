import type { SeriesPoint } from "@/lib/series";

/**
 * Gráfico de uma métrica só, em SVG à mão.
 *
 * Sem biblioteca de propósito: uma linha com eixos não justifica 50 kB de
 * JavaScript no cliente, e assim ele sai renderizado do servidor — aparece
 * junto com o HTML, sem esperar hidratação.
 *
 * Sem tooltip, também de propósito. Tooltip esconde o valor atrás de uma
 * interação que não existe no celular; com poucas coletas os pontos são
 * rotulados direto, e quando são muitos rotulamos os que importam — o
 * primeiro, o último, o máximo e o mínimo.
 */

const W = 720;
const H = 280;
const M = { top: 18, right: 16, bottom: 28, left: 52 };

type Props = {
  points: SeriesPoint[];
  /** Referência do vitalício, quando existe. */
  baseline?: number | null;
  formatar: (v: number) => string;
  cor?: string;
};

export function SerieChart({ points, baseline, formatar, cor = "var(--accent)" }: Props) {
  if (points.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-6 py-12 text-center text-sm text-ink-faint">
        Sem pontos para desenhar. Modos derivados precisam de ao menos duas
        coletas com partidas entre elas.
      </p>
    );
  }

  const valores = points.map((p) => p.value);
  const comRef =
    baseline !== null && baseline !== undefined && Number.isFinite(baseline)
      ? [...valores, baseline]
      : valores;

  let min = Math.min(...comRef);
  let max = Math.max(...comRef);
  if (min === max) {
    // Série constante: uma faixa artificial evita divisão por zero e deixa a
    // linha no meio, que é a leitura honesta de "não mudou".
    min -= Math.abs(min) * 0.1 || 1;
    max += Math.abs(max) * 0.1 || 1;
  }

  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const spanT = t1 - t0 || 1;

  const x = (t: number) => M.left + ((t - t0) / spanT) * (W - M.left - M.right);
  const y = (v: number) => M.top + (1 - (v - min) / (max - min)) * (H - M.top - M.bottom);

  const d = points
    .map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(" ");

  const ticksY = escalaY(min, max);

  const iMax = valores.indexOf(Math.max(...valores));
  const iMin = valores.indexOf(Math.min(...valores));
  const rotulados = new Set(
    points.length <= 8
      ? points.map((_, i) => i)
      : [0, points.length - 1, iMax, iMin],
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
      {ticksY.map((v) => (
        <g key={v}>
          <line
            x1={M.left}
            x2={W - M.right}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--line-soft)"
            strokeWidth="1"
          />
          <text
            x={M.left - 8}
            y={y(v)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize="11"
            fill="var(--ink-faint)"
          >
            {formatar(v)}
          </text>
        </g>
      ))}

      {baseline !== null && baseline !== undefined && Number.isFinite(baseline) && (
        <>
          <line
            x1={M.left}
            x2={W - M.right}
            y1={y(baseline)}
            y2={y(baseline)}
            stroke="var(--ink-faint)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          <text
            x={M.left + 4}
            y={y(baseline) - 6}
            textAnchor="start"
            fontSize="11"
            fill="var(--ink-faint)"
          >
            vitalício {formatar(baseline)}
          </text>
        </>
      )}

      <path
        d={d}
        fill="none"
        stroke={cor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="tracar"
      />

      {points.map((p, i) => (
        <g key={p.t}>
          <circle cx={x(p.t)} cy={y(p.value)} r="3.5" fill={cor} />
          {rotulados.has(i) && (
            <text
              x={x(p.t)}
              y={y(p.value) - 10}
              textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
              fontSize="11"
              fill="var(--ink)"
              className="tnum"
            >
              {formatar(p.value)}
            </text>
          )}
        </g>
      ))}

      {[points[0], points[points.length - 1]].map((p, i) => (
        <text
          key={`t${i}`}
          x={i === 0 ? M.left : W - M.right}
          y={H - 8}
          textAnchor={i === 0 ? "start" : "end"}
          fontSize="11"
          fill="var(--ink-faint)"
        >
          {rotularInstante(p.t, spanT)}
        </text>
      ))}
    </svg>
  );
}

/** Quatro marcas em números redondos, não em frações do domínio. */
function escalaY(min: number, max: number): number[] {
  const passoBruto = (max - min) / 4;
  const mag = 10 ** Math.floor(Math.log10(passoBruto || 1));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= passoBruto) ?? mag * 10;

  const inicio = Math.ceil(min / passo) * passo;
  const ticks: number[] = [];
  for (let v = inicio; v <= max + passo * 0.001; v += passo) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

const DIA = 86_400_000;

function rotularInstante(t: number, span: number) {
  const d = new Date(t);
  if (span < DIA) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (span < 7 * DIA)
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
}
