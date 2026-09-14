import type { PontoSerie } from "./series";

/**
 * O eixo vertical de um gráfico, sem deixar um ponto mandar nele.
 *
 * Um K/D de 6,30 numa sessão de 7 rounds achatava a série inteira numa
 * linha reta no rodapé. O domínio passa a sair da mediana e do desvio
 * absoluto mediano dos pontos fortes: o que estiver a mais de 3 MAD é
 * grampeado na borda e desenhado com marcador — mostrado, nunca omitido.
 * O normal entra no domínio sempre, porque a altura de um ponto significa
 * "acima ou abaixo do seu normal", e essa leitura exige a baseline dentro
 * do quadro.
 */
export type Dominio = { min: number; max: number };

export function dominioRobusto(pontos: PontoSerie[], normal: number | null, emPct: boolean, casas: number): Dominio {
  const fortes = pontos.filter((p) => !p.fraco).map((p) => p.valor);
  const base = fortes.length > 0 ? fortes : pontos.map((p) => p.valor);
  let dentro: number[];
  if (base.length >= 3) {
    const m = mediana(base);
    let mad = mediana(base.map((v) => Math.abs(v - m)));
    if (mad === 0) mad = Math.max(0.1 * Math.abs(m), 10 ** -casas);
    dentro = base.filter((v) => Math.abs(v - m) <= 3 * mad);
  } else {
    dentro = base;
  }
  if (normal !== null && Number.isFinite(normal)) dentro = [...dentro, normal];
  if (dentro.length === 0) return { min: 0, max: 1 };

  let min = Math.min(...dentro);
  let max = Math.max(...dentro);
  const folga = (max - min || Math.abs(max) * 0.2 || 1) * 0.1;
  min -= folga;
  max += folga;
  if (emPct) {
    min = Math.max(0, min);
    max = Math.min(100, max);
    if (max <= min) max = min + 1;
  }
  return { min, max };
}

export function grampear(v: number, d: Dominio): { y: number; fora: "acima" | "abaixo" | null } {
  if (v > d.max) return { y: d.max, fora: "acima" };
  if (v < d.min) return { y: d.min, fora: "abaixo" };
  return { y: v, fora: null };
}

function mediana(vs: number[]): number {
  const s = [...vs].sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2;
}
