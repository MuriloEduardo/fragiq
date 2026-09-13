import {
  buildSeries,
  classifyMetric,
  contextOptions,
  deltaEntre,
  groupOf,
  humanizeKey,
  lifetimeValue,
  paresDeMovimento,
  ultimoPar,
  type Bucket,
  type ContextFilter,
  type MetricInfo,
  type Mode,
  type SeriesSpec,
  type SnapshotRow,
} from "./series";
import { lerSerie, todasAsMetricas } from "./leituras";
import { CS2_PANEL } from "./cs2-panel";
import { rotularArma, rotularMapa, rotularModo } from "./cs2-labels";
import { formatPlaytime } from "./stats";

/**
 * As consultas que o analista pode fazer sobre a série.
 *
 * O agente do cogniflow não vê o banco: ele pede uma `view` com `params` e
 * recebe JSON. Cada view aqui é um recorte que já existe na tela — o painel,
 * as leituras, a tabela de métricas, a série de um gráfico — devolvido como
 * dado em vez de como componente. Nada é calculado de um jeito novo: se a
 * tela e o analista discordassem sobre um número, nenhum dos dois estaria
 * obviamente errado.
 *
 * O contrato (nomes de view e de params) está no prompt do agente, em
 * docs/cogniflow-tenant.md. Mudar um aqui sem mudar lá quebra o analista
 * em silêncio.
 */

export class ViewInvalida extends Error {}

export type Fonte = {
  appId: number;
  gameName: string;
  playtimeForeverMin: number;
  rows: SnapshotRow[];
  catalog: MetricInfo[];
  /** Partidas oficiais com scoreboard (via share code + GC), mais recente primeiro. Vazio para quem não ligou. */
  partidasOficiais: PartidaOficial[];
};

export type PartidaOficial = {
  jogadaEm: string;
  mapa: string | null;
  placar: string;
  resultado: "vitória" | "derrota" | "empate";
  duracaoMin: number;
  kills: number;
  assists: number;
  deaths: number;
  kd: number;
  hsPct: number;
  mvps: number;
  score: number;
};

type Params = Record<string, unknown>;

export const VIEWS = ["resumo", "metricas", "serie", "partidas", "mapas", "armas"] as const;
export type View = (typeof VIEWS)[number];

export function consultar(fonte: Fonte, view: string, params: Params): unknown {
  switch (view as View) {
    case "resumo":
      return resumo(fonte, params);
    case "metricas":
      return metricas(fonte, params);
    case "serie":
      return serie(fonte, params);
    case "partidas":
      return partidas(fonte, params);
    case "mapas":
      return mapas(fonte, params);
    case "armas":
      return armas(fonte, params);
    default:
      throw new ViewInvalida(
        `view desconhecida: "${view}". As disponíveis são ${VIEWS.join(", ")}.`,
      );
  }
}

/* -------------------------------- params --------------------------------- */

function texto(params: Params, chave: string): string | undefined {
  const v = params[chave];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new ViewInvalida(`"${chave}" precisa ser texto.`);
  return v;
}

function inteiro(params: Params, chave: string, padrao: number, max: number): number {
  const v = params[chave];
  if (v === undefined || v === null) return padrao;
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1) {
    throw new ViewInvalida(`"${chave}" precisa ser um inteiro positivo.`);
  }
  return Math.min(n, max);
}

/** `modo` e `mapa` recortam por contexto de partida, em toda view. */
function filtro(params: Params): ContextFilter | undefined {
  const mode = texto(params, "modo");
  const map = texto(params, "mapa");
  if (!mode && !map) return undefined;
  return { mode: mode ?? null, map: map ?? null };
}

function arredondar(v: number | null, casas = 3): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  return Number(v.toFixed(casas));
}

function iso(d: Date) {
  return d.toISOString();
}

/* -------------------------------- views ---------------------------------- */

/**
 * Tudo que a tela do jogo mostra acima da tabela, de uma vez: o período,
 * o painel comparado ao vitalício, as leituras e os contextos observados.
 * É o ponto de partida de qualquer pergunta — uma chamada, não seis.
 */
function resumo(fonte: Fonte, params: Params) {
  const f = filtro(params);
  const { rows } = fonte;
  const par = ultimoPar(rows, "total_rounds_played", f);
  const ultimo = rows[rows.length - 1];
  const opcoes = contextOptions(rows);

  const periodo = par
    ? {
        de: iso(par.prev.capturedAt),
        ate: iso(par.curr.capturedAt),
        rounds: deltaEntre(par, "total_rounds_played"),
        partidas: deltaEntre(par, "total_matches_played"),
        mapa: par.curr.matchMap ? rotularMapa(par.curr.matchMap) : null,
        modo: par.curr.matchMode ? rotularModo(par.curr.matchMode) : null,
      }
    : null;

  const painel =
    fonte.appId === 730
      ? CS2_PANEL.map((stat) => {
          const spec: SeriesSpec = { ...stat.spec, id: stat.key, filter: f };
          const pts = buildSeries(rows, spec, "raw");
          return {
            estatistica: stat.label,
            unidade: stat.unit ?? null,
            periodo: arredondar(pts.length ? pts[pts.length - 1].value : null),
            vitalicio: arredondar(lifetimeValue(spec, rows)),
          };
        }).filter((s) => s.periodo !== null || s.vitalicio !== null)
      : [];

  return {
    jogo: fonte.gameName,
    tempoDeJogoTotal: formatPlaytime(fonte.playtimeForeverMin),
    coletas: rows.length,
    primeiraColeta: rows[0] ? iso(rows[0].capturedAt) : null,
    ultimaColeta: ultimo ? iso(ultimo.capturedAt) : null,
    filtro: f ?? null,
    periodo,
    // As partidas oficiais que caem dentro do período: são o detalhe por
    // partida do que o período soma. Fora do período, a view `partidas`.
    partidasOficiaisNoPeriodo: periodo
      ? fonte.partidasOficiais.filter((p) => p.jogadaEm >= periodo.de && p.jogadaEm <= periodo.ate)
      : [],
    painel,
    leituras: lerSerie(rows, f).map((l) => ({
      numero: l.numero,
      texto: l.texto,
      base: l.base ?? null,
      tom: l.tom,
    })),
    contextosObservados: {
      modos: opcoes.modes.map(([modo, n]) => ({ modo, rotulo: rotularModo(modo), coletas: n })),
      mapas: opcoes.maps.map(([mapa, n]) => ({ mapa, rotulo: rotularMapa(mapa), coletas: n })),
      coletasSemContexto: rows.filter((r) => !r.matchMode && !r.matchMap).length,
    },
    grupos: [...new Set(fonte.catalog.map((c) => c.group))],
  };
}

/**
 * A tabela "todas as métricas", já ordenada por impacto. `grupo` restringe
 * a um bloco (Geral, Por arma, Por mapa, Última partida); o padrão devolve
 * só o que se moveu no período, porque é isso que responde "o que mudou".
 */
function metricas(fonte: Fonte, params: Params) {
  const f = filtro(params);
  const grupo = texto(params, "grupo");
  const limite = inteiro(params, "limite", 40, 200);
  const incluirParadas = params.incluirParadas === true;

  const linhas = todasAsMetricas(fonte.rows, fonte.catalog.map((c) => c.key), f)
    .filter((l) => !grupo || l.grupo.toLowerCase() === grupo.toLowerCase())
    .filter((l) => incluirParadas || l.aconteceu)
    .slice(0, limite);

  return {
    filtro: f ?? null,
    total: linhas.length,
    metricas: linhas.map((l) => ({
      chave: l.key,
      nome: l.label,
      grupo: l.grupo,
      porRound: l.porRound,
      periodo: arredondar(l.periodo),
      vitalicio: arredondar(l.vitalicio),
      variacao: arredondar(l.variacao),
      totalNoPeriodo: l.total,
      relevante: l.relevante,
    })),
  };
}

const CALCULOS: Mode[] = ["delta", "perHour", "ratio", "cumulative"];
const BUCKETS: Bucket[] = ["raw", "day", "week", "month"];

/**
 * Uma série temporal, como o gráfico de uma métrica desenha. `calculo`
 * segue os modos do explorador: delta (quanto no intervalo), perHour,
 * ratio (precisa de `denominador`) e cumulative (o contador cru).
 */
function serie(fonte: Fonte, params: Params) {
  const metrica = texto(params, "metrica");
  if (!metrica) throw new ViewInvalida('"metrica" é obrigatória (ex.: total_kills).');
  const conhecidas = new Set(fonte.catalog.map((c) => c.key));
  if (!conhecidas.has(metrica)) {
    throw new ViewInvalida(`métrica desconhecida: "${metrica}". Use a view "metricas" para listar as chaves.`);
  }

  const denominador = texto(params, "denominador");
  const calculo = (texto(params, "calculo") ?? (denominador ? "ratio" : "delta")) as Mode;
  if (!CALCULOS.includes(calculo)) {
    throw new ViewInvalida(`"calculo" precisa ser um de ${CALCULOS.join(", ")}.`);
  }
  if (calculo === "ratio" && !denominador) {
    throw new ViewInvalida('"ratio" precisa de "denominador".');
  }
  if (denominador && !conhecidas.has(denominador)) {
    throw new ViewInvalida(`denominador desconhecido: "${denominador}".`);
  }
  const bucket = (texto(params, "bucket") ?? "day") as Bucket;
  if (!BUCKETS.includes(bucket)) {
    throw new ViewInvalida(`"bucket" precisa ser um de ${BUCKETS.join(", ")}.`);
  }
  const pontos = inteiro(params, "pontos", 30, 120);

  const spec: SeriesSpec = {
    id: metrica,
    metric: metrica,
    denominator: denominador,
    mode: calculo,
    filter: filtro(params),
    kind: classifyMetric(metrica),
  };
  const todos = buildSeries(fonte.rows, spec, bucket);

  return {
    metrica,
    nome: humanizeKey(metrica),
    denominador: denominador ?? null,
    calculo,
    bucket,
    vitalicio: arredondar(lifetimeValue(spec, fonte.rows)),
    pontosDisponiveis: todos.length,
    pontos: todos.slice(-pontos).map((p) => ({
      t: new Date(p.t).toISOString(),
      valor: arredondar(p.value),
    })),
  };
}

const POR_PARTIDA = [
  "total_rounds_played",
  "total_matches_played",
  "total_matches_won",
  "total_kills",
  "total_deaths",
  "total_kills_headshot",
  "total_damage_done",
  "total_mvps",
] as const;

/**
 * Cada intervalo em que houve jogo, do mais recente ao mais antigo. Com o
 * bot de presença ativo cada linha é uma partida com mapa, modo e placar;
 * sem ele é uma sessão entre duas coletas.
 */
function partidas(fonte: Fonte, params: Params) {
  const limite = inteiro(params, "limite", 15, 60);
  const pares = paresDeMovimento(fonte.rows, "total_rounds_played", filtro(params));

  return {
    total: pares.length,
    // Cada item abaixo é o intervalo entre duas coletas (pode somar mais de
    // uma partida). `oficiais` são partidas de verdade, uma a uma, com o
    // scoreboard do Game Coordinator — quando a pessoa ligou a corrente.
    oficiais: fonte.partidasOficiais.slice(0, limite),
    partidas: pares
      .slice(-limite)
      .reverse()
      .map((par) => {
        const d = Object.fromEntries(POR_PARTIDA.map((k) => [k, deltaEntre(par, k)]));
        const kills = d.total_kills;
        const deaths = d.total_deaths;
        const rounds = d.total_rounds_played;
        return {
          de: iso(par.prev.capturedAt),
          ate: iso(par.curr.capturedAt),
          mapa: par.curr.matchMap ? rotularMapa(par.curr.matchMap) : null,
          modo: par.curr.matchMode ? rotularModo(par.curr.matchMode) : null,
          placar: par.curr.matchScore ?? null,
          minutosJogados: par.curr.playtimeForeverMin - par.prev.playtimeForeverMin,
          rounds,
          partidas: d.total_matches_played,
          vitorias: d.total_matches_won,
          kills,
          deaths,
          headshots: d.total_kills_headshot,
          dano: d.total_damage_done,
          mvps: d.total_mvps,
          kd: kills !== null && deaths ? arredondar(kills / deaths, 2) : null,
          danoPorRound:
            d.total_damage_done !== null && rounds ? arredondar(d.total_damage_done / rounds, 0) : null,
        };
      }),
  };
}

/**
 * Rounds e vitórias por mapa, no período e no vitalício. Só os mapas que a
 * Steam ainda conta — o pool moderno (Mirage, Ancient, Anubis, Overpass)
 * não tem contador, e isso é dito no retorno para o agente não inventar.
 */
function mapas(fonte: Fonte, params: Params) {
  const f = filtro(params);
  const { rows } = fonte;
  const par = ultimoPar(rows, "total_rounds_played", f);
  const ultimo = rows[rows.length - 1];
  if (!ultimo) return { mapas: [] };

  const chaves = Object.keys(ultimo.metrics).filter((k) => k.startsWith("total_rounds_map_"));
  const lista = chaves
    .map((k) => {
      const mapa = k.replace("total_rounds_map_", "");
      const wins = `total_wins_map_${mapa}`;
      const roundsVida = ultimo.metrics[k] ?? 0;
      const winsVida = ultimo.metrics[wins] ?? 0;
      const roundsPeriodo = par ? deltaEntre(par, k) : null;
      const winsPeriodo = par ? deltaEntre(par, wins) : null;
      return {
        mapa,
        nome: rotularMapa(mapa),
        periodo: {
          rounds: roundsPeriodo,
          roundsGanhos: winsPeriodo,
          taxaDeVitoria:
            roundsPeriodo && winsPeriodo !== null ? arredondar((winsPeriodo / roundsPeriodo) * 100, 1) : null,
        },
        vitalicio: {
          rounds: roundsVida,
          roundsGanhos: winsVida,
          taxaDeVitoria: roundsVida ? arredondar((winsVida / roundsVida) * 100, 1) : null,
        },
      };
    })
    .filter((m) => m.vitalicio.rounds > 0)
    .sort((a, b) => (b.periodo.rounds ?? 0) - (a.periodo.rounds ?? 0) || b.vitalicio.rounds - a.vitalicio.rounds);

  const roundsNoPeriodo = par ? deltaEntre(par, "total_rounds_played") : null;
  const cobertos = lista.reduce((s, m) => s + (m.periodo.rounds ?? 0), 0);

  return {
    filtro: f ?? null,
    aviso:
      "Os contadores por mapa da Steam só existem para o pool antigo; rounds em Mirage, Ancient, Anubis e Overpass não aparecem aqui.",
    roundsNoPeriodo,
    roundsForaDosMapasContados: roundsNoPeriodo !== null ? roundsNoPeriodo - cobertos : null,
    mapas: lista,
  };
}

/**
 * Por arma: kills, tiros, acertos e precisão, no período contra o vitalício.
 * `total_shots_hit` global está quebrado na Valve; os pares por arma são a
 * fonte confiável de precisão, e é por isso que esta view existe.
 */
function armas(fonte: Fonte, params: Params) {
  const f = filtro(params);
  const minimoTiros = inteiro(params, "minimoTiros", 1, 100000);
  const { rows } = fonte;
  const par = ultimoPar(rows, "total_rounds_played", f);
  const ultimo = rows[rows.length - 1];
  if (!ultimo) return { armas: [] };

  const lista = Object.keys(ultimo.metrics)
    .filter((k) => k.startsWith("total_shots_") && k !== "total_shots_fired" && k !== "total_shots_hit")
    .map((k) => {
      const arma = k.replace("total_shots_", "");
      const hits = `total_hits_${arma}`;
      const kills = `total_kills_${arma}`;
      const spec: SeriesSpec = { id: arma, metric: hits, denominator: k, mode: "ratio", scale: 100, filter: f };
      const pts = buildSeries(rows, spec, "raw");
      const tirosPeriodo = par ? deltaEntre(par, k) : null;
      return {
        arma,
        nome: rotularArma(arma),
        periodo: {
          kills: par ? deltaEntre(par, kills) : null,
          tiros: tirosPeriodo,
          acertos: par ? deltaEntre(par, hits) : null,
          precisao: arredondar(pts.length ? pts[pts.length - 1].value : null, 1),
        },
        vitalicio: {
          kills: ultimo.metrics[kills] ?? 0,
          tiros: ultimo.metrics[k] ?? 0,
          acertos: ultimo.metrics[hits] ?? 0,
          precisao: arredondar(lifetimeValue(spec, rows), 1),
        },
      };
    })
    .filter((a) => (a.periodo.tiros ?? 0) >= minimoTiros || (minimoTiros === 1 && a.vitalicio.tiros > 0))
    .sort((a, b) => (b.periodo.tiros ?? 0) - (a.periodo.tiros ?? 0) || b.vitalicio.tiros - a.vitalicio.tiros);

  return { filtro: f ?? null, armas: lista };
}

/* ------------------------------ catálogo --------------------------------- */

/** Só para o prompt: os grupos que `metricas` aceita. */
export const GRUPOS_DE_METRICA = ["Geral", "Por arma", "Por mapa", "Última partida"] as const;

export { groupOf };
