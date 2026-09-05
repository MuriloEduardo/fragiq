import {
  buildSeries,
  classifyMetric,
  deltaEntre,
  groupOf,
  humanizeKey,
  lifetimeValue,
  ultimoPar,
  type ContextFilter,
  type SeriesSpec,
  type SnapshotRow,
} from "./series";
import { rotularArma, rotularMapa } from "./cs2-labels";

/**
 * Transformar contador em frase.
 *
 * O explorador entregava 178 contadores e um seletor: quem tinha que
 * interpretar era o leitor. Aqui o trabalho é feito antes — cada leitura é
 * uma conclusão com o número dentro e a base amostral do lado, porque número
 * sem base é opinião com aparência de fato.
 */

export type Tom = "neutro" | "bom" | "ruim" | "aviso";

export type Leitura = {
  id: string;
  /** O destaque. Curto: cabe em uma linha grande. */
  numero: string;
  /** A conclusão, em português. É o que a pessoa lê de verdade. */
  texto: string;
  /** Sobre quantos dados isso se apoia. */
  base?: string;
  tom: Tom;
};

const RATIO = (metric: string, denominator: string, scale = 1): SeriesSpec => ({
  id: metric,
  metric,
  denominator,
  mode: "ratio",
  scale,
});

function ultimoValor(rows: SnapshotRow[], spec: SeriesSpec, filter?: ContextFilter) {
  const pts = buildSeries(rows, { ...spec, filter }, "raw");
  return pts.length > 0 ? pts[pts.length - 1].value : null;
}

function pct(v: number) {
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;
}

function num(v: number, casas = 2) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

/** Variação relativa entre o período e o vitalício. */
function variacao(periodo: number | null, vitalicio: number | null) {
  if (periodo === null || vitalicio === null || vitalicio === 0) return null;
  return (periodo - vitalicio) / Math.abs(vitalicio);
}

export function lerSerie(rows: SnapshotRow[], filter?: ContextFilter): Leitura[] {
  const leituras: Leitura[] = [];
  const par = ultimoPar(rows, "total_rounds_played", filter);
  if (!par) return leituras;

  const rounds = deltaEntre(par, "total_rounds_played");
  const partidas = deltaEntre(par, "total_matches_played");
  const base =
    rounds !== null
      ? `${rounds} round${rounds === 1 ? "" : "s"}${partidas ? ` em ${partidas} partida${partidas === 1 ? "" : "s"}` : ""}`
      : undefined;

  /* ------------------------------- amostra -------------------------------- */

  if (rounds !== null && rounds > 0 && rounds < 50) {
    leituras.push({
      id: "amostra",
      numero: `${rounds} round${rounds === 1 ? "" : "s"}`,
      texto:
        `Amostra curta. Cada round pesa ${num(100 / rounds, 1)}% de tudo que ` +
        `está aqui embaixo, então uma partida atípica desloca qualquer um destes ` +
        `números. Trate como indício, não como tendência.`,
      tom: "aviso",
    });
  }

  /* --------------------------- modo provável ------------------------------ */

  if (rounds !== null && partidas && partidas > 0) {
    const porPartida = rounds / partidas;
    const competitivo = porPartida >= 13;
    leituras.push({
      id: "modo",
      numero: `${num(porPartida, 1)} rounds/partida`,
      texto: competitivo
        ? `Compatível com competitivo, que só termina a partir de 13 rounds ganhos. ` +
          `As médias por round abaixo podem ser lidas de frente.`
        : `Curto para competitivo, que precisa de 13 rounds para acabar. Isto é ` +
          `casual, wingman, deathmatch ou partida abandonada — e nesses modos ` +
          `abates por round vêm inflados, porque se morre e se mata muito mais.`,
      base,
      tom: competitivo ? "neutro" : "aviso",
    });
  }

  /* ----------------------- cobertura de mapa ------------------------------ */

  if (rounds !== null && rounds > 0) {
    const porMapa = Object.keys(par.curr.metrics)
      .filter((k) => k.startsWith("total_rounds_map_"))
      .map((k) => ({ mapa: k.replace("total_rounds_map_", ""), d: deltaEntre(par, k) ?? 0 }))
      .filter((m) => m.d > 0)
      .sort((a, b) => b.d - a.d);

    const cobertos = porMapa.reduce((s, m) => s + m.d, 0);
    const fora = rounds - cobertos;

    if (fora > 0) {
      leituras.push({
        id: "mapas",
        numero: `${fora} de ${rounds}`,
        texto:
          `Rounds em mapas que a Steam não conta. O schema do CS2 só tem ` +
          `contador para o pool antigo — Mirage, Ancient, Anubis e Overpass não ` +
          `existem lá. ` +
          (porMapa.length > 0
            ? `Do resto, ${porMapa
                .slice(0, 3)
                .map((m) => `${m.d} em ${rotularMapa(m.mapa)}`)
                .join(", ")}.`
            : `Nenhum round do período caiu em mapa rastreável.`),
        base,
        tom: "neutro",
      });
    }
  }

  /* ------------------------------- K/D ------------------------------------ */

  const kd = ultimoValor(rows, RATIO("total_kills", "total_deaths"), filter);
  const kdVida = lifetimeValue(RATIO("total_kills", "total_deaths"), rows);
  const kdVar = variacao(kd, kdVida);

  if (kd !== null && kdVida !== null && kdVar !== null) {
    const melhor = kdVar > 0;
    leituras.push({
      id: "kd",
      numero: num(kd),
      texto:
        `K/D no período contra ${num(kdVida)} de vitalício — ${pct(kdVar)}. ` +
        (Math.abs(kdVar) < 0.1
          ? `Praticamente o seu normal.`
          : melhor
            ? `Acima do seu normal${rounds !== null && rounds < 50 ? ", mas em amostra pequena o suficiente para ser sorte" : ""}.`
            : `Abaixo do seu normal.`),
      base,
      tom: Math.abs(kdVar) < 0.1 ? "neutro" : melhor ? "bom" : "ruim",
    });
  }

  /* ---------------------------- headshot ---------------------------------- */

  const hs = ultimoValor(rows, RATIO("total_kills_headshot", "total_kills", 100), filter);
  const hsVida = lifetimeValue(RATIO("total_kills_headshot", "total_kills", 100), rows);
  const hsVar = variacao(hs, hsVida);

  if (hs !== null && hsVida !== null && hsVar !== null && Math.abs(hsVar) >= 0.05) {
    leituras.push({
      id: "hs",
      numero: `${num(hs, 1)}%`,
      texto:
        `Dos seus abates no período foram na cabeça, contra ${num(hsVida, 1)}% ` +
        `de vitalício. ${
          hsVar > 0
            ? `Mira mais alta que o seu costume.`
            : `Abaixo do seu costume — spray e trocas de perto derrubam essa taxa.`
        }`,
      base,
      tom: hsVar > 0 ? "bom" : "ruim",
    });
  }

  /* ------------------------------ armas ----------------------------------- */

  const armas = Object.keys(par.curr.metrics)
    .filter((k) => k.startsWith("total_shots_") && k !== "total_shots_fired" && k !== "total_shots_hit")
    .map((k) => {
      const arma = k.replace("total_shots_", "");
      const tiros = deltaEntre(par, k) ?? 0;
      const spec = RATIO(`total_hits_${arma}`, k, 100);
      return {
        arma,
        tiros,
        periodo: ultimoValor(rows, spec, filter),
        vida: lifetimeValue(spec, rows),
      };
    })
    .filter((a) => a.tiros >= 25 && a.periodo !== null && a.vida !== null)
    .map((a) => ({ ...a, var: variacao(a.periodo, a.vida)! }))
    .sort((a, b) => b.var - a.var);

  if (armas.length > 0) {
    const top = armas[0];
    leituras.push({
      id: "arma-melhor",
      numero: `${num(top.periodo!, 1)}%`,
      texto:
        `Precisão com ${rotularArma(top.arma)} no período, contra ${num(top.vida!, 1)}% ` +
        `de vitalício (${pct(top.var)}). ` +
        // Quando toda arma caiu, chamar a melhor de "acima do normal" é
        // mentira — ela está acima das outras, não do seu vitalício.
        (top.var > 0
          ? `É a sua arma mais acima do normal no recorte.`
          : `Nenhuma arma ficou acima do seu vitalício neste período; esta foi a que menos caiu.`),
      base: `${top.tiros} tiros`,
      tom: top.var > 0 ? "bom" : "neutro",
    });
  }

  if (armas.length > 1) {
    const pior = armas[armas.length - 1];
    if (pior.var < 0) {
      leituras.push({
        id: "arma-pior",
        numero: `${num(pior.periodo!, 1)}%`,
        texto:
          `Precisão com ${rotularArma(pior.arma)}, contra ${num(pior.vida!, 1)}% de ` +
          `vitalício (${pct(pior.var)}). É onde você mais caiu em relação a si mesmo.`,
        base: `${pior.tiros} tiros`,
        tom: "ruim",
      });
    }
  }

  return leituras;
}

/* -------------------------------------------------------------------------- */

/**
 * Toda métrica que tem valor no período, já comparada com o vitalício.
 *
 * Cobertura total continua sendo o ponto — o que muda é não pedir que a
 * pessoa monte a consulta. Contador vira taxa por round, que é a única forma
 * honesta de comparar um período com uma vida inteira: "abates no período"
 * não se compara com "abates na vida", "abates por round" se compara.
 */
export type LinhaMetrica = {
  key: string;
  label: string;
  grupo: string;
  /** Taxa por round no período (ou valor bruto, para métricas de última partida). */
  periodo: number | null;
  vitalicio: number | null;
  variacao: number | null;
  /** Quanto o contador subiu no período, em unidades. */
  total: number | null;
  valores: number[];
  porRound: boolean;
  /**
   * Se essa variação merece ser levada a sério.
   *
   * Sem isso o topo da lista era ocupado por armas quase nunca usadas: um
   * vitalício perto de zero transforma três abates de MAG-7 em "+5796%", que
   * é aritmética correta e informação nenhuma.
   */
  relevante: boolean;
  /** Houve qualquer movimento deste contador no período. */
  aconteceu: boolean;
  /**
   * Quantos eventos a mais (ou a menos) do que o seu normal previa, no
   * período: |período − vitalício| × rounds.
   *
   * É por aqui que a lista se ordena, e não por porcentagem. Percentual sobre
   * base minúscula é instável: cinco abates de MP9 numa vida que quase não
   * usa MP9 viram +4540% e ocupam o topo, enquanto 125 abates a mais que o
   * normal ficam soterrados. O impacto responde "o que de fato pesou".
   */
  impacto: number;
};

const DENOMINADOR = "total_rounds_played";

/** Abaixo disto, a variação é ruído de divisão por número pequeno. */
const MINIMO_NO_PERIODO = 5;

export function todasAsMetricas(
  rows: SnapshotRow[],
  chaves: string[],
  filter?: ContextFilter,
): LinhaMetrica[] {
  const par = ultimoPar(rows, DENOMINADOR, filter);
  const roundsDoPeriodo = par ? (deltaEntre(par, DENOMINADOR) ?? 0) : 0;

  const linhas = chaves.flatMap((key): LinhaMetrica[] => {
    const kind = classifyMetric(key);
    if (kind === "hidden") return [];

    const label = humanizeKey(key);
    const grupo = groupOf(key);

    // Métricas de "última partida" são estado, não acumulado: não têm
    // vitalício com que comparar nem taxa por round que faça sentido.
    if (kind === "gauge") {
      const pts = buildSeries(rows, { id: key, metric: key, mode: "cumulative", filter }, "raw");
      return [{
        key, label, grupo,
        periodo: pts.length ? pts[pts.length - 1].value : null,
        vitalicio: null,
        variacao: null,
        total: null,
        valores: pts.map((p) => p.value),
        porRound: false,
        relevante: false,
        aconteceu: pts.length > 0,
        impacto: 0,
      }];
    }

    // O próprio denominador não vira taxa de si mesmo.
    const porRound = key !== DENOMINADOR;
    const spec: SeriesSpec = porRound
      ? RATIO(key, DENOMINADOR)
      : { id: key, metric: key, mode: "delta" };

    const pts = buildSeries(rows, { ...spec, filter }, "raw");
    const periodo = pts.length ? pts[pts.length - 1].value : null;
    const vitalicio = porRound ? lifetimeValue(spec, rows) : null;

    const total = par ? deltaEntre(par, key) : null;

    return [{
      key, label, grupo,
      periodo,
      vitalicio,
      variacao: variacao(periodo, vitalicio),
      total,
      valores: pts.map((p) => p.value),
      porRound,
      relevante: (total ?? 0) >= MINIMO_NO_PERIODO && (vitalicio ?? 0) > 0,
      aconteceu: (total ?? 0) > 0,
      impacto:
        periodo !== null && vitalicio !== null
          ? Math.abs(periodo - vitalicio) * roundsDoPeriodo
          : 0,
    }];
  });

  // Ordem é informação, em três camadas.
  //
  // Primeiro o que aconteceu e pesou. Depois o que aconteceu pouco. Por
  // último, e só por último, o que não aconteceu: contador parado no período
  // é a maior parte da lista — quem nunca usou Negev tem dezenas deles — e
  // deixar isso disputando as primeiras posições era esconder o que importa
  // atrás de zeros.
  const camada = (l: LinhaMetrica) => (l.aconteceu ? (l.relevante ? 0 : 1) : 2);

  return linhas
    .filter((l) => l.periodo !== null)
    .sort((a, b) => {
      const ca = camada(a);
      const cb = camada(b);
      if (ca !== cb) return ca - cb;
      if (ca === 0) return b.impacto - a.impacto;
      return a.grupo.localeCompare(b.grupo) || a.label.localeCompare(b.label);
    });
}
