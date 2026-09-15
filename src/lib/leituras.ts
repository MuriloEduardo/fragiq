import {
  buildSeries,
  classifyMetric,
  deltaEntre,
  groupOf,
  humanizeKey,
  ultimoPar,
  type ContextFilter,
  type Normal,
  type SeriesSpec,
  type SnapshotRow,
} from "./series";
import { rotularModo, rotularArma, rotularMapa } from "./cs2-labels";
import { calcularDelta, type Delta } from "./delta";
import { lenteDe, nomeDaReferencia, referenciaDe, sessaoLida, valorDe } from "./referencia";

/**
 * Transformar contador em frase.
 *
 * O explorador entregava 178 contadores e um seletor: quem tinha que
 * interpretar era o leitor. Aqui o trabalho é feito antes — cada leitura é
 * uma conclusão com o número dentro e a base amostral do lado, porque número
 * sem base é opinião com aparência de fato.
 *
 * Uma leitura diz o quê: o número, a referência, a direção e a base. Ela não
 * diz por quê. "Spray e trocas de perto derrubam essa taxa" era prosa fixa
 * disparada por qualquer queda de headshot — e como as leituras entram na
 * view `resumo`, o analista recebia a frase como achado e a repetia. A causa
 * só entra quando outra métrica a sustenta, e isso é trabalho do analista
 * com as views, não de um texto pronto.
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
  /** De que tipo é o normal usado, quando a leitura compara com um. */
  referencia?: Normal["tipo"];
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

function num(v: number, casas = 2) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

/** `▲ 12 %`, `▼ 3 pp`, `≈` — o mesmo chip da tela, em texto. */
function chip(delta: Delta): string {
  if (delta.estado !== "ok") return "";
  if (delta.direcao === "igual") return "≈";
  const seta = delta.direcao === "sobe" ? "+" : "−";
  return `${seta}${num(Math.abs(delta.valor), delta.unidade === "pp" ? 1 : 0)} ${delta.unidade}`;
}

function tomDe(delta: Delta): Tom {
  if (delta.estado !== "ok") return "neutro";
  return delta.valencia === "good" ? "bom" : delta.valencia === "bad" ? "ruim" : "neutro";
}

function julgamento(delta: Delta, fraco: boolean): string {
  if (delta.estado !== "ok" || delta.direcao === "igual") return "Praticamente o seu normal.";
  const lado = delta.direcao === "sobe" ? "Acima" : "Abaixo";
  return `${lado} do seu normal${fraco ? ", em amostra pequena o suficiente para ser uma noite só" : ""}.`;
}

export function lerSerie(rows: SnapshotRow[], filter?: ContextFilter): Leitura[] {
  const leituras: Leitura[] = [];
  const par = ultimoPar(rows, "total_rounds_played", filter);
  if (!par) return leituras;

  const lente = lenteDe(filter);
  const sessaoId = sessaoLida(rows, filter);
  const rounds = deltaEntre(par, "total_rounds_played");
  const partidas = deltaEntre(par, "total_matches_played");
  const fraco = rounds !== null && rounds > 0 && rounds < 50;
  const base =
    rounds !== null
      ? `${rounds} round${rounds === 1 ? "" : "s"}${partidas ? ` em ${partidas} partida${partidas === 1 ? "" : "s"}` : ""}`
      : undefined;

  /* ------------------------------- amostra -------------------------------- */

  if (fraco) {
    leituras.push({
      id: "amostra",
      numero: `${rounds} round${rounds === 1 ? "" : "s"}`,
      texto:
        `Amostra curta. Cada round pesa ${num(100 / rounds!, 1)}% de tudo que ` +
        `está aqui embaixo, então uma partida atípica desloca qualquer um destes ` +
        `números. Trate como indício, não como tendência.`,
      tom: "aviso",
    });
  }

  /* ------------------------------- modo ----------------------------------- */

  const modoObservado = filter?.mode ?? par.curr.matchMode ?? null;
  if (modoObservado) {
    leituras.push({
      id: "modo",
      numero: rotularModo(modoObservado),
      texto:
        `Modo observado da sessão${par.curr.matchMap ? `, em ${rotularMapa(par.curr.matchMap)}` : ""}` +
        `${par.curr.matchScore ? `, placar ${par.curr.matchScore}` : ""}. ` +
        `Os números abaixo são lidos contra o normal deste modo quando ele já tem base.`,
      base,
      tom: "neutro",
    });
  } else if (rounds !== null && partidas && partidas > 0) {
    // Sem bot nem marcação à mão, a única pista do modo é o comprimento
    // da partida — e ela é só uma pista: casual também pode passar de 13.
    const porPartida = rounds / partidas;
    const competitivo = porPartida >= 13;
    leituras.push({
      id: "modo",
      numero: `${num(porPartida, 1)} rounds/partida`,
      texto: competitivo
        ? `Modo não observado. O comprimento é compatível com competitivo ou Premier, ` +
          `que só terminam a partir de 13 rounds ganhos — mas é só uma pista; ` +
          `sem o bot como amigo o modo não fica registrado.`
        : `Modo não observado. Curto para competitivo, que precisa de 13 rounds para ` +
          `acabar: casual, wingman, deathmatch ou partida abandonada — e nesses modos ` +
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

  const kdSpec = RATIO("total_kills", "total_deaths");
  const kd = ultimoValor(rows, kdSpec, filter);
  const kdNormal = referenciaDe(rows, kdSpec, lente, sessaoId);
  const kdDelta = calcularDelta({ melhorQuando: "sobe" }, kd, kdNormal, fraco);

  if (kd !== null && kdDelta.estado === "ok") {
    leituras.push({
      id: "kd",
      numero: kd.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      texto:
        `K/D no período contra ${num(valorDe(kdNormal)!)} ${nomeDaReferencia(kdNormal, lente)} — ${chip(kdDelta)}. ` +
        julgamento(kdDelta, fraco),
      base,
      tom: tomDe(kdDelta),
      referencia: kdNormal.tipo,
    });
  }

  /* ---------------------------- headshot ---------------------------------- */

  const hsSpec = RATIO("total_kills_headshot", "total_kills", 100);
  const hs = ultimoValor(rows, hsSpec, filter);
  const hsNormal = referenciaDe(rows, hsSpec, lente, sessaoId);
  const hsDelta = calcularDelta({ unit: "%", melhorQuando: "sobe" }, hs, hsNormal, fraco);

  if (hs !== null && hsDelta.estado === "ok" && hsDelta.direcao !== "igual") {
    leituras.push({
      id: "hs",
      numero: `${num(hs, 1)}%`,
      texto:
        `Dos seus abates no período foram na cabeça, contra ${num(valorDe(hsNormal)!, 1)}% ` +
        `${nomeDaReferencia(hsNormal, lente)} — ${chip(hsDelta)}. ` +
        (hsDelta.direcao === "sobe" ? `Acima do seu costume.` : `Abaixo do seu costume.`),
      base,
      tom: tomDe(hsDelta),
      referencia: hsNormal.tipo,
    });
  }

  /* ------------------------------ armas ----------------------------------- */

  const armas = Object.keys(par.curr.metrics)
    .filter((k) => k.startsWith("total_shots_") && k !== "total_shots_fired" && k !== "total_shots_hit")
    .map((k) => {
      const arma = k.replace("total_shots_", "");
      const tiros = deltaEntre(par, k) ?? 0;
      const spec = RATIO(`total_hits_${arma}`, k, 100);
      const periodo = ultimoValor(rows, spec, filter);
      const normal = referenciaDe(rows, spec, lente, sessaoId);
      return { arma, tiros, periodo, normal, delta: calcularDelta({ unit: "%", melhorQuando: "sobe" }, periodo, normal, fraco) };
    })
    .filter((a) => a.tiros >= 25 && a.periodo !== null && a.delta.estado === "ok")
    .map((a) => ({ ...a, pp: (a.delta as Extract<Delta, { estado: "ok" }>).valor }))
    .sort((a, b) => b.pp - a.pp);

  if (armas.length > 0) {
    const top = armas[0];
    const subiu = top.delta.estado === "ok" && top.delta.direcao === "sobe";
    leituras.push({
      id: "arma-melhor",
      numero: `${num(top.periodo!, 1)}%`,
      texto:
        `Precisão com ${rotularArma(top.arma)} no período, contra ${num(valorDe(top.normal)!, 1)}% ` +
        `${nomeDaReferencia(top.normal, lente)} (${chip(top.delta)}). ` +
        // Quando toda arma caiu, chamar a melhor de "acima do normal" é
        // mentira — ela está acima das outras, não do seu vitalício.
        (subiu
          ? `É a sua arma mais acima do normal no recorte.`
          : `Nenhuma arma ficou acima do seu normal neste período; esta foi a que menos caiu.`),
      base: `${top.tiros} tiros`,
      tom: subiu ? "bom" : "neutro",
      referencia: top.normal.tipo,
    });
  }

  if (armas.length > 1) {
    const pior = armas[armas.length - 1];
    if (pior.delta.estado === "ok" && pior.delta.direcao === "desce") {
      leituras.push({
        id: "arma-pior",
        numero: `${num(pior.periodo!, 1)}%`,
        texto:
          `Precisão com ${rotularArma(pior.arma)}, contra ${num(valorDe(pior.normal)!, 1)}% ` +
          `${nomeDaReferencia(pior.normal, lente)} (${chip(pior.delta)}). É onde você mais caiu em relação a si mesmo.`,
        base: `${pior.tiros} tiros`,
        tom: "ruim",
        referencia: pior.normal.tipo,
      });
    }
  }

  return leituras;
}

/* -------------------------------------------------------------------------- */

/**
 * Toda métrica que tem valor no período, já comparada com o normal.
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
  /** De que tipo é o normal em `vitalicio` (modo com base, vitalício, vitalício por falta de base). */
  referencia: Normal["tipo"] | null;
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

/** Variação relativa entre o período e a referência. */
function variacao(periodo: number | null, vitalicio: number | null) {
  if (periodo === null || vitalicio === null || vitalicio === 0) return null;
  return (periodo - vitalicio) / Math.abs(vitalicio);
}

export function todasAsMetricas(
  rows: SnapshotRow[],
  chaves: string[],
  filter?: ContextFilter,
): LinhaMetrica[] {
  const par = ultimoPar(rows, DENOMINADOR, filter);
  const roundsDoPeriodo = par ? (deltaEntre(par, DENOMINADOR) ?? 0) : 0;
  const lente = lenteDe(filter);
  const sessaoId = sessaoLida(rows, filter);

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
        referencia: null,
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
    const normal = porRound ? referenciaDe(rows, spec, lente, sessaoId) : null;
    const vitalicio = normal ? valorDe(normal) : null;

    const total = par ? deltaEntre(par, key) : null;

    return [{
      key, label, grupo,
      periodo,
      vitalicio,
      referencia: normal?.tipo ?? null,
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
