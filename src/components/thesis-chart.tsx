/**
 * A tese do produto em uma imagem.
 *
 * Duas séries sobre os mesmos dados: a média vitalícia (o que a Steam e os
 * concorrentes mostram) e o desempenho por período (o que o FragIQ deriva).
 * A primeira é quase reta — depois de mil horas, um mês excelente não move
 * o número. A segunda mostra a queda de forma que a primeira esconde.
 *
 * SVG estático, sem biblioteca: é conteúdo de landing, não gráfico vivo, e
 * não vale 100 kB de JS para o primeiro paint.
 */

// Desempenho real de cada período (K/D entre coletas consecutivas).
const PER_PERIOD = [
  1.02, 1.18, 0.94, 1.31, 1.09, 1.44, 1.21, 0.88, 1.35, 1.12, 1.51, 1.28, 0.97,
  1.16, 0.79, 0.91, 0.68, 0.83, 0.72, 0.61, 0.77, 0.66, 0.58, 0.71, 0.63,
];

const W = 720;
const H = 200;
const PAD = 8;

function cumulativeAverage(values: number[]) {
  // Começa de um histórico grande: é o que torna a linha inerte.
  const HISTORY_WEIGHT = 40;
  const start = 1.06;

  let sum = start * HISTORY_WEIGHT;
  let n = HISTORY_WEIGHT;

  return values.map((v) => {
    sum += v;
    n += 1;
    return sum / n;
  });
}

function path(values: number[], min: number, max: number) {
  const stepX = (W - PAD * 2) / (values.length - 1);
  return values
    .map((v, i) => {
      const x = PAD + i * stepX;
      const y = PAD + (1 - (v - min) / (max - min)) * (H - PAD * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function ThesisChart() {
  const lifetime = cumulativeAverage(PER_PERIOD);

  const all = [...PER_PERIOD, ...lifetime];
  const min = Math.min(...all) - 0.08;
  const max = Math.max(...all) + 0.08;

  return (
    <figure className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-5 py-3">
        <Legend color="var(--ink-faint)" dashed label="Média vitalícia" />
        <Legend color="var(--accent)" label="Desempenho por período" />
        <span className="ml-auto font-mono text-[11px] tracking-wide text-ink-faint uppercase">
          K/D · mesmos dados
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-44 w-full sm:h-56"
        role="img"
        aria-label="Duas linhas sobre os mesmos dados: a média vitalícia permanece quase reta enquanto o desempenho por período cai visivelmente."
      >
        <defs>
          <linearGradient id="thesis-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={PAD}
            x2={W - PAD}
            y1={PAD + t * (H - PAD * 2)}
            y2={PAD + t * (H - PAD * 2)}
            stroke="var(--line-soft)"
            strokeWidth="1"
          />
        ))}

        <path
          d={`${path(PER_PERIOD, min, max)} L${W - PAD},${H - PAD} L${PAD},${H - PAD} Z`}
          fill="url(#thesis-fill)"
        />

        <path
          d={path(lifetime, min, max)}
          fill="none"
          stroke="var(--ink-faint)"
          strokeWidth="2"
          strokeDasharray="5 4"
        />

        <path
          d={path(PER_PERIOD, min, max)}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>

      <figcaption className="border-t border-line px-5 py-3 text-sm leading-relaxed text-ink-muted">
        A linha tracejada é o que a Steam te mostra: caiu{" "}
        <strong className="tnum font-medium text-ink">0,08</strong> em três meses.
        A linha cheia é o que realmente aconteceu:{" "}
        <strong className="tnum font-medium text-ink">1,51 → 0,63</strong>.
      </figcaption>
    </figure>
  );
}

function Legend({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-2 text-xs text-ink-muted">
      <svg width="18" height="2" aria-hidden className="shrink-0">
        <line
          x1="0"
          y1="1"
          x2="18"
          y2="1"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dashed ? "4 3" : undefined}
        />
      </svg>
      {label}
    </span>
  );
}
