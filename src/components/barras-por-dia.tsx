import type { PontoDia } from "@/lib/admin-dados";

/**
 * Contagem por dia, em barras, SVG à mão — mesma escolha do SerieChart: sem
 * biblioteca, renderizado no servidor, sem tooltip. Uma série por gráfico,
 * então não há legenda; o título diz o que é. Os dias vazios ficam no eixo
 * como barras de altura zero, porque um gráfico que pula os zeros mente
 * sobre o ritmo. Só os valores que importam são rotulados: o máximo e o
 * último dia.
 */

const W = 720;
const H = 160;
const M = { top: 22, right: 8, bottom: 22, left: 8 };
const GAP = 2;

export function BarrasPorDia({ pontos, titulo }: { pontos: PontoDia[]; titulo: string }) {
  const max = Math.max(1, ...pontos.map((p) => p.valor));
  const total = pontos.reduce((s, p) => s + p.valor, 0);
  const largura = (W - M.left - M.right) / pontos.length;
  const altura = (v: number) => ((H - M.top - M.bottom) * v) / max;
  const indiceMax = pontos.findIndex((p) => p.valor === max);
  const ultimo = pontos.length - 1;

  const rotulo = (i: number) => i === ultimo || (i === indiceMax && pontos[i].valor > 0);
  const dia = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

  return (
    <figure className="rounded-xl border border-line bg-surface p-4">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{titulo}</span>
        <span className="tnum text-xs text-ink-faint">{total} em 30 dias</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-auto w-full" role="img" aria-label={`${titulo}: ${total} em 30 dias`}>
        <line
          x1={M.left}
          x2={W - M.right}
          y1={H - M.bottom}
          y2={H - M.bottom}
          stroke="var(--line)"
          strokeWidth="1"
        />
        {pontos.map((p, i) => {
          const x = M.left + i * largura + GAP / 2;
          const h = altura(p.valor);
          const y = H - M.bottom - h;
          return (
            <g key={p.dia}>
              {p.valor > 0 && (
                <rect
                  x={x}
                  y={y}
                  width={Math.max(1, largura - GAP)}
                  height={h}
                  rx="3"
                  fill="var(--accent)"
                  opacity={i === ultimo ? 1 : 0.7}
                />
              )}
              {rotulo(i) && (
                <text
                  x={x + (largura - GAP) / 2}
                  y={p.valor > 0 ? y - 6 : H - M.bottom - 6}
                  textAnchor="middle"
                  fontSize="11"
                  className="tnum"
                  fill="var(--ink-muted)"
                >
                  {p.valor}
                </text>
              )}
              {(ultimo - i) % 7 === 0 && (
                <text
                  x={x + (largura - GAP) / 2}
                  y={H - 6}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--ink-faint)"
                >
                  {dia(p.dia)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
