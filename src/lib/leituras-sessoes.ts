import { serieDeSessoes, type ContextFilter, type PontoSerie, type SnapshotRow } from "./series";
import { CS2_PANEL } from "./cs2-panel";
import { calcularDelta } from "./delta";
import { lenteDe, referenciaDe, sessaoLida } from "./referencia";
import { rotularModo } from "./cs2-labels";
import type { Leitura } from "./leituras";

/**
 * Leituras que olham para mais de uma sessão.
 *
 * `lerSerie` compara uma sessão com um normal. Duas coisas que o banco já
 * tem ficavam sem frase: as partidas oficiais dentro da sessão (o
 * scoreboard do Game Coordinator, uma a uma) e a sequência das últimas
 * sessões contra o normal — "terceira seguida abaixo" diz mais que
 * qualquer número de uma noite só. Aqui as duas viram leitura, com a mesma
 * referência e o mesmo limiar do resto da tela.
 */

export type PartidaLida = {
  resultado: "vitória" | "derrota" | "empate";
  placar: string;
  mapa: string | null;
  kd: number;
};

function num(v: number, casas = 2) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

/**
 * O que as partidas oficiais do período dizem em conjunto: quantas, o
 * saldo, e o que se repete — todas apertadas, ou K/D acima de 1 nas
 * derrotas, que é o padrão de "jogou bem e perdeu".
 */
export function lerPartidasOficiais(partidas: PartidaLida[]): Leitura | null {
  if (partidas.length === 0) return null;
  const vitorias = partidas.filter((p) => p.resultado === "vitória").length;
  const derrotas = partidas.filter((p) => p.resultado === "derrota").length;
  const empates = partidas.length - vitorias - derrotas;

  const apertadas = partidas.filter((p) => {
    const [a, b] = p.placar.split("-").map(Number);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 2;
  }).length;
  const derrotasComKdBom = partidas.filter((p) => p.resultado === "derrota" && p.kd >= 1).length;

  const saldo =
    `${vitorias} vitória${vitorias === 1 ? "" : "s"}, ${derrotas} derrota${derrotas === 1 ? "" : "s"}` +
    (empates ? ` e ${empates} empate${empates === 1 ? "" : "s"}` : "");
  const padroes: string[] = [];
  if (apertadas === partidas.length && partidas.length >= 2) padroes.push("todas decididas por dois rounds ou menos");
  else if (apertadas >= 2) padroes.push(`${apertadas} decididas por dois rounds ou menos`);
  if (derrotasComKdBom >= 1 && derrotasComKdBom === derrotas) {
    padroes.push(`K/D acima de 1 em ${derrotas === 1 ? "a derrota" : "todas as derrotas"}`);
  }
  const mapas = [...new Set(partidas.map((p) => p.mapa).filter((m): m is string => !!m))];
  if (mapas.length === 1 && partidas.length >= 2) padroes.push(`todas em ${mapas[0]}`);

  return {
    id: "partidas-oficiais",
    numero: `${vitorias}–${derrotas}${empates ? `–${empates}` : ""}`,
    texto:
      `${partidas.length} partida${partidas.length === 1 ? "" : "s"} oficia${partidas.length === 1 ? "l" : "is"} no período: ${saldo}` +
      (padroes.length ? ` — ${padroes.join("; ")}.` : "."),
    base: `${partidas.length} scoreboard${partidas.length === 1 ? "" : "s"} do Game Coordinator`,
    tom: vitorias > derrotas ? "bom" : derrotas > vitorias ? "ruim" : "neutro",
  };
}

/** Quantas sessões seguidas, contando da mais recente, ficaram do mesmo lado do normal. */
const MAX_SEQUENCIA = 8;

/**
 * A sequência das últimas sessões contra o normal, para K/D. Só fala
 * quando há pelo menos três seguidas do mesmo lado: duas é acaso, três
 * é o que uma pessoa chama de fase.
 */
export function lerSequencia(rows: SnapshotRow[], filter?: ContextFilter): Leitura | null {
  const stat = CS2_PANEL.find((s) => s.key === "kd")!;
  const lente = lenteDe(filter);
  const sessaoId = sessaoLida(rows, filter);
  const normal = referenciaDe(rows, stat.spec, lente, sessaoId, stat.amostra);
  if (normal.tipo === "nenhum" || normal.tipo === "vitalicio-fraco") return null;

  const pontos = serieDeSessoes(rows, stat).filter(
    (p) => !p.fraco && (!lente.modo || p.modo === lente.modo),
  );
  if (pontos.length < 3) return null;

  const lado = (p: PontoSerie) => {
    const d = calcularDelta(stat, p.valor, normal);
    return d.estado === "ok" ? d.direcao : "igual";
  };
  const ultimo = lado(pontos[pontos.length - 1]);
  if (ultimo === "igual") return null;

  let seguidas = 0;
  for (let i = pontos.length - 1; i >= 0 && seguidas < MAX_SEQUENCIA; i--) {
    if (lado(pontos[i]) !== ultimo) break;
    seguidas += 1;
  }
  if (seguidas < 3) return null;

  const acima = ultimo === "sobe";
  const onde = lente.modo ? ` no ${rotularModo(lente.modo)}` : "";
  return {
    id: "sequencia",
    numero: `${seguidas}${seguidas === MAX_SEQUENCIA ? "+" : ""} seguidas`,
    texto:
      `Sessões seguidas com K/D ${acima ? "acima" : "abaixo"} do seu normal${onde} (${num(normal.valor)}). ` +
      (acima ? `Não é uma noite boa, é uma fase.` : `Não é uma noite ruim, é uma fase — e fase se olha por arma e por mapa.`),
    base: `${pontos.length} sessões com amostra`,
    tom: acima ? "bom" : "ruim",
    referencia: normal.tipo,
  };
}
