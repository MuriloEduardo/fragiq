/**
 * Linha mínima para dentro de um stat tile.
 *
 * SVG à mão em vez de Recharts: um tile não precisa de eixo, grade nem
 * tooltip, e vinte tiles carregando um gráfico completo cada custa caro à
 * toa. O número é o conteúdo; a linha é contexto.
 */

type Props = {
  values: number[];
  color?: string;
  className?: string;
};

const W = 120;
const H = 32;
const PAD = 3;

export function Sparkline({ values, color = "var(--accent)", className }: Props) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  // Série constante: uma linha reta no meio, sem divisão por zero.
  const span = max - min || 1;

  const pontos = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - (v - min) / span) * (H - PAD * 2);
    return [x, y] as const;
  });

  const d = pontos.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [ux, uy] = pontos[pontos.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={d} fill="none" stroke={color} strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            vectorEffect="non-scaling-stroke" />
      {/* O último ponto ancora a leitura no valor atual. */}
      <circle cx={ux} cy={uy} r="2.5" fill={color} />
    </svg>
  );
}
