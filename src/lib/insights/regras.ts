import { createHash } from "node:crypto";
import { calcularDelta, type Delta } from "../delta";
import { rotularMapa, rotularModo } from "../cs2-labels";
import { formatarNumero, formatarPp } from "../formato";
import { NORMAL_MIN_ROUNDS, NORMAL_MIN_SESSOES, type Normal } from "../series";

/**
 * O catálogo de insights: funções puras de fatos para uma linha + um visual.
 *
 * Cada regra tem um id estável e uma versão. Mudou a conta, sobe a versão
 * e `recompute:insights` refaz tudo; a versão antiga fica no banco até
 * ser substituída, e o painel de dados sabe dizer quantos ainda estão
 * atrás. A referência é o **normal na hora**: o acumulado das sessões
 * provadas do mesmo modo anteriores à sessão lida (≥ 5 sessões e ≥ 150
 * rounds, como `normalDe`), senão o vitalício da coleta que fechou a
 * sessão — nunca uma sessão futura. A regra de ruído e valência é a de
 * `delta.ts`, a mesma dos chips.
 *
 * Nenhuma regra escreve prosa: `linha` é a única string, cabe numa linha,
 * e o número vem antes da palavra (docs/dados-confiaveis.md §4).
 */

export type Confianca = "EXATA" | "INFERIDA" | "MISTA";

/** Uma sessão como a tabela `Session` a guarda, mais o vitalício da coleta que a fechou. */
export type SessaoFato = {
  id: string;
  ate: Date;
  rounds: number;
  partidas: number | null;
  kills: number | null;
  deaths: number | null;
  headshots: number | null;
  dano: number | null;
  modo: string | null;
  confianca: Confianca;
  mapa: string | null;
  /** Totais da Steam no fechamento: a base do vitalício "na hora". */
  vitalicio: { kills: number; deaths: number; headshots: number; dano: number; rounds: number } | null;
};

export type Metrica = "kd" | "adr" | "hs";

const METRICAS: Record<Metrica, { rotulo: string; unit?: "%"; melhorQuando: "sobe" | "desce" | "nenhuma"; decimals: number; minRounds: number }> = {
  kd: { rotulo: "K/D", melhorQuando: "sobe", decimals: 2, minRounds: 10 },
  adr: { rotulo: "Dano/round", melhorQuando: "sobe", decimals: 0, minRounds: 10 },
  hs: { rotulo: "HS", unit: "%", melhorQuando: "sobe", decimals: 0, minRounds: 10 },
};

export type Tom = "BOM" | "RUIM" | "NEUTRO" | "AVISO";
export type Visual = "CHIP" | "SELO" | "BARRA" | "SPARKLINE" | "RANK" | "ANEL";

export type InsightCalculado = {
  regra: string;
  regraVersao: number;
  valor: number | null;
  referencia: number | null;
  referenciaTipo: Normal["tipo"] | null;
  delta: number | null;
  deltaUnidade: "%" | "pp" | null;
  tom: Tom;
  confianca: Confianca | null;
  base: { rounds: number; sessoes: number; partidas?: number | null };
  visual: Visual;
  dados: Record<string, unknown>;
  linha: string;
};

export function hashEntradas(entradas: unknown): string {
  return createHash("sha256").update(JSON.stringify(entradas, (_k, v) => (v instanceof Date ? v.toISOString() : v))).digest("hex");
}

/* --------------------------------- contas --------------------------------- */

function razao(s: { kills: number | null; deaths: number | null; headshots: number | null; dano: number | null; rounds: number }, m: Metrica): number | null {
  if (m === "kd") return s.kills !== null && s.deaths ? s.kills / s.deaths : null;
  if (m === "adr") return s.dano !== null && s.rounds ? s.dano / s.rounds : null;
  return s.headshots !== null && s.kills ? (s.headshots / s.kills) * 100 : null;
}

/** O acumulado (soma dos numeradores / soma dos denominadores) de várias sessões. */
function acumulado(sessoes: SessaoFato[], m: Metrica): number | null {
  const n = sessoes.reduce((a, s) => a + ((m === "kd" ? s.kills : m === "adr" ? s.dano : s.headshots) ?? 0), 0);
  const d = sessoes.reduce((a, s) => a + ((m === "kd" ? s.deaths : m === "adr" ? s.rounds : s.kills) ?? 0), 0);
  if (!d) return null;
  return m === "hs" ? (n / d) * 100 : n / d;
}

const provada = (s: SessaoFato) => s.confianca !== "MISTA" && s.modo !== null;

/** O normal na hora: sessões provadas do modo, anteriores, com amostra; senão o vitalício da coleta. */
export function normalNaHora(sessao: SessaoFato, anteriores: SessaoFato[], m: Metrica): Normal {
  const vitalicio = sessao.vitalicio ? razao({ ...sessao.vitalicio, rounds: sessao.vitalicio.rounds }, m) : null;
  if (!provada(sessao)) {
    return vitalicio === null ? { tipo: "nenhum", motivo: "sem-vitalicio" } : { tipo: "vitalicio", valor: vitalicio, rotulo: "vitalício" };
  }
  const base = anteriores.filter((s) => provada(s) && s.modo === sessao.modo && s.rounds >= METRICAS[m].minRounds && s.ate < sessao.ate);
  const rounds = base.reduce((a, s) => a + s.rounds, 0);
  const rotulo = rotularModo(sessao.modo!);
  if (base.length >= NORMAL_MIN_SESSOES && rounds >= NORMAL_MIN_ROUNDS) {
    const valor = acumulado(base, m);
    if (valor !== null) return { tipo: "modo", valor, rotulo: `normal · ${rotulo} · ${base.length} sessões`, sessoes: base.length };
  }
  if (vitalicio === null) return { tipo: "nenhum", motivo: "sem-vitalicio" };
  return { tipo: "vitalicio-fraco", valor: vitalicio, rotulo: `vs vitalício · ${rotulo} sem base (${base.length} de ${NORMAL_MIN_SESSOES})`, progresso: { sessoes: base.length, minimo: NORMAL_MIN_SESSOES } };
}

// Amostra fraca não muda o tom, muda a confiança: o chip fica pontilhado
// (`dados.fraco`), como o DeltaChip sempre fez.
function tomDe(delta: Delta): Tom {
  if (delta.estado !== "ok") return "AVISO";
  return delta.valencia === "good" ? "BOM" : delta.valencia === "bad" ? "RUIM" : "NEUTRO";
}

function fmt(m: Metrica, v: number): string {
  const c = METRICAS[m];
  return `${formatarNumero(v, c.decimals)}${c.unit ?? ""}`;
}

function fmtDelta(d: Delta): string {
  if (d.estado !== "ok") return "";
  if (d.direcao === "igual") return "≈ normal";
  // O sinal vai no texto porque a linha é a única coisa que a tela mostra.
  const sinal = d.valor > 0 ? "+" : "−";
  const n = d.unidade === "pp" ? `${sinal}${formatarPp(d.valor)}` : `${sinal}${formatarNumero(Math.abs(d.valor), 0)}%`;
  return `${n} vs ${d.fraco ? "vitalício" : "normal"}`;
}

/* ----------------------------- regras: sessão ----------------------------- */

const VERSAO_SESSAO = 1;

/** `kd.vs.normal`, `adr.vs.normal`, `hs.vs.normal` — um chip por métrica. */
export function metricaVsNormal(m: Metrica, sessao: SessaoFato, anteriores: SessaoFato[]): InsightCalculado {
  const c = METRICAS[m];
  const valor = razao(sessao, m);
  const normal = normalNaHora(sessao, anteriores, m);
  const fraco = sessao.rounds < c.minRounds;
  const delta = calcularDelta({ unit: c.unit, melhorQuando: c.melhorQuando }, valor, normal, fraco);
  const referencia = normal.tipo === "nenhum" ? null : normal.valor;
  const linha =
    valor === null
      ? `${c.rotulo} — sem dado nesta sessão`
      : delta.estado !== "ok"
        ? `${c.rotulo} ${fmt(m, valor)} · sem referência ainda`
        : `${c.rotulo} ${fmt(m, valor)} · ${fmtDelta(delta)}${normal.tipo === "modo" ? ` do ${rotularModo(sessao.modo!)} (${normal.sessoes} sessões)` : ""}`;
  return {
    regra: `${m}.vs.normal`,
    regraVersao: VERSAO_SESSAO,
    valor,
    referencia,
    referenciaTipo: normal.tipo,
    delta: delta.estado === "ok" ? delta.valor : null,
    deltaUnidade: delta.estado === "ok" ? delta.unidade : null,
    tom: tomDe(delta),
    confianca: sessao.confianca,
    base: { rounds: sessao.rounds, sessoes: normal.tipo === "modo" ? normal.sessoes : 0, partidas: sessao.partidas },
    visual: "CHIP",
    dados: { delta: delta.estado === "ok" ? delta : null, rotulo: c.rotulo, fraco },
    linha,
  };
}

/** `sessao.classificacao` — o selo: acima / dentro do ruído / abaixo, pelo saldo dos três chips. */
export function classificacaoDaSessao(chips: InsightCalculado[], sessao: SessaoFato): InsightCalculado {
  const ok = chips.filter((c) => c.delta !== null);
  const saldo = ok.reduce((a, c) => a + (c.tom === "BOM" ? 1 : c.tom === "RUIM" ? -1 : 0), 0);
  const fraco = sessao.rounds < METRICAS.kd.minRounds;
  const classe = ok.length === 0 ? "sem-base" : fraco ? "amostra-curta" : saldo > 0 ? "acima" : saldo < 0 ? "abaixo" : "no-ruido";
  const linhas: Record<string, string> = {
    "sem-base": "Primeira sessão com este normal — a comparação começa na próxima",
    "amostra-curta": `Amostra curta (${sessao.rounds} rounds) — números sem peso`,
    acima: "Acima do seu normal",
    abaixo: "Abaixo do seu normal",
    "no-ruido": "Dentro do ruído do seu normal",
  };
  return {
    regra: "sessao.classificacao",
    regraVersao: VERSAO_SESSAO,
    valor: saldo,
    referencia: null,
    referenciaTipo: null,
    delta: null,
    deltaUnidade: null,
    tom: classe === "acima" ? "BOM" : classe === "abaixo" ? "RUIM" : classe === "no-ruido" ? "NEUTRO" : "AVISO",
    confianca: sessao.confianca,
    base: { rounds: sessao.rounds, sessoes: ok.length, partidas: sessao.partidas },
    visual: "SELO",
    dados: { classe, saldo },
    linha: linhas[classe],
  };
}

export function insightsDaSessao(sessao: SessaoFato, anteriores: SessaoFato[]): InsightCalculado[] {
  const chips = (["kd", "adr", "hs"] as Metrica[]).map((m) => metricaVsNormal(m, sessao, anteriores));
  return [...chips, classificacaoDaSessao(chips, sessao)];
}

/* ------------------------------ regras: modo ------------------------------ */

const VERSAO_MODO = 1;
const JANELA = 5;

/** As sessões que uma lente enxerga: provadas do modo, ou todas para "tudo". */
export function sessoesDaLente(sessoes: SessaoFato[], modo: string | null): SessaoFato[] {
  return modo ? sessoes.filter((s) => provada(s) && s.modo === modo) : sessoes;
}

/** `tendencia.kd.5` — a razão móvel das últimas 5 sessões, como sparkline. */
export function tendenciaKd(sessoes: SessaoFato[], modo: string | null): InsightCalculado {
  const fortes = sessoesDaLente(sessoes, modo).filter((s) => s.rounds >= METRICAS.kd.minRounds).sort((a, b) => a.ate.getTime() - b.ate.getTime());
  const pontos = fortes.map((s) => ({ t: s.ate.getTime(), valor: razao(s, "kd") })).filter((p): p is { t: number; valor: number } => p.valor !== null);
  const ultimas = pontos.slice(-JANELA);
  const antes = pontos.slice(-JANELA * 2, -JANELA);
  const media = (xs: { valor: number }[]) => (xs.length ? xs.reduce((a, p) => a + p.valor, 0) / xs.length : null);
  const atual = media(ultimas);
  const anterior = media(antes);
  const delta = atual !== null && anterior ? ((atual - anterior) / anterior) * 100 : null;
  const dir = delta === null ? null : Math.abs(delta) < 3 ? "estável" : delta > 0 ? "subindo" : "caindo";
  const rounds = fortes.slice(-JANELA).reduce((a, s) => a + s.rounds, 0);
  const linha =
    ultimas.length < 2
      ? `K/D — faltam ${Math.max(0, 2 - ultimas.length)} sessões para ver tendência`
      : dir === null
        ? `K/D ${formatarNumero(atual!, 2)} nas últimas ${ultimas.length} · ainda sem base anterior`
        : `K/D ${formatarNumero(atual!, 2)} nas últimas ${ultimas.length} · ${dir} (${delta! > 0 ? "+" : "−"}${formatarNumero(Math.abs(delta!), 0)}%)`;
  return {
    regra: "tendencia.kd.5",
    regraVersao: VERSAO_MODO,
    valor: atual,
    referencia: anterior,
    referenciaTipo: anterior === null ? null : "modo",
    delta,
    deltaUnidade: delta === null ? null : "%",
    tom: dir === "subindo" ? "BOM" : dir === "caindo" ? "RUIM" : "NEUTRO",
    confianca: modo ? "INFERIDA" : null,
    base: { rounds, sessoes: ultimas.length },
    visual: "SPARKLINE",
    dados: { pontos: pontos.slice(-12), normal: anterior, janela: JANELA },
    linha,
  };
}

/** `forma.vs.vitalicio` — a forma atual (últimas 5) contra o vitalício da Steam, K/D. */
export function formaVsVitalicio(sessoes: SessaoFato[], modo: string | null): InsightCalculado {
  const fortes = sessoesDaLente(sessoes, modo).filter((s) => s.rounds >= METRICAS.kd.minRounds).sort((a, b) => a.ate.getTime() - b.ate.getTime());
  const ultimas = fortes.slice(-JANELA);
  const forma = acumulado(ultimas, "kd");
  const ultima = fortes[fortes.length - 1];
  const vitalicio = ultima?.vitalicio ? razao({ ...ultima.vitalicio }, "kd") : null;
  const normal: Normal = vitalicio === null ? { tipo: "nenhum", motivo: "sem-vitalicio" } : { tipo: "vitalicio", valor: vitalicio, rotulo: "vitalício" };
  const delta = calcularDelta({ melhorQuando: "sobe" }, forma, normal, ultimas.length < 3);
  const rounds = ultimas.reduce((a, s) => a + s.rounds, 0);
  return {
    regra: "forma.vs.vitalicio",
    regraVersao: VERSAO_MODO,
    valor: forma,
    referencia: vitalicio,
    referenciaTipo: normal.tipo,
    delta: delta.estado === "ok" ? delta.valor : null,
    deltaUnidade: delta.estado === "ok" ? "%" : null,
    tom: tomDe(delta),
    confianca: modo ? "INFERIDA" : null,
    base: { rounds, sessoes: ultimas.length },
    visual: "BARRA",
    dados: { atual: forma, vitalicio, rotulos: ["forma atual", "vitalício"], delta: delta.estado === "ok" ? delta : null },
    linha:
      forma === null || vitalicio === null
        ? "Forma atual — sem sessões fortes ainda"
        : `Forma atual ${formatarNumero(forma, 2)} · vitalício ${formatarNumero(vitalicio, 2)} · ${fmtDelta(delta) || "≈"}`,
  };
}

/** `mapa.ranking` — onde o K/D mais se afasta da forma, por mapa (só sessões provadas, mín. 30 rounds). */
export function rankingDeMapas(sessoes: SessaoFato[], modo: string | null): InsightCalculado {
  const MIN_ROUNDS_MAPA = 30;
  const base = sessoesDaLente(sessoes, modo).filter((s) => provada(s) && s.mapa);
  const porMapa = new Map<string, SessaoFato[]>();
  for (const s of base) porMapa.set(s.mapa!, [...(porMapa.get(s.mapa!) ?? []), s]);
  const geral = acumulado(base, "kd");
  const linhas = [...porMapa.entries()]
    .map(([mapa, ss]) => ({ mapa, rotulo: rotularMapa(mapa), rounds: ss.reduce((a, s) => a + s.rounds, 0), sessoes: ss.length, kd: acumulado(ss, "kd") }))
    .filter((l) => l.rounds >= MIN_ROUNDS_MAPA && l.kd !== null && geral)
    .map((l) => ({ ...l, delta: ((l.kd! - geral!) / geral!) * 100 }))
    .sort((a, b) => b.delta - a.delta);
  const melhor = linhas[0];
  const pior = linhas[linhas.length - 1];
  const rounds = base.reduce((a, s) => a + s.rounds, 0);
  const linha =
    linhas.length === 0
      ? `Por mapa — faltam ${MIN_ROUNDS_MAPA} rounds provados num mapa`
      : linhas.length === 1
        ? `${melhor.rotulo} ${melhor.delta > 0 ? "+" : "−"}${formatarNumero(Math.abs(melhor.delta), 0)}% · único mapa com base`
        : `${melhor.rotulo} ${melhor.delta > 0 ? "+" : "−"}${formatarNumero(Math.abs(melhor.delta), 0)}% · ${pior.rotulo} ${pior.delta > 0 ? "+" : "−"}${formatarNumero(Math.abs(pior.delta), 0)}%`;
  return {
    regra: "mapa.ranking",
    regraVersao: VERSAO_MODO,
    valor: melhor?.delta ?? null,
    referencia: geral,
    referenciaTipo: geral === null ? null : "modo",
    delta: null,
    deltaUnidade: null,
    tom: linhas.length >= 2 ? "NEUTRO" : "AVISO",
    confianca: "INFERIDA",
    base: { rounds, sessoes: base.length },
    visual: "RANK",
    dados: { linhas: linhas.slice(0, 6), minRounds: MIN_ROUNDS_MAPA },
    linha,
  };
}

/** `consistencia` — a variação do K/D entre as sessões fortes (coeficiente de variação). */
export function consistencia(sessoes: SessaoFato[], modo: string | null): InsightCalculado {
  const valores = sessoesDaLente(sessoes, modo)
    .filter((s) => s.rounds >= METRICAS.kd.minRounds)
    .map((s) => razao(s, "kd"))
    .filter((v): v is number => v !== null)
    .slice(-10);
  const media = valores.length ? valores.reduce((a, v) => a + v, 0) / valores.length : null;
  const cv = media && valores.length >= 3 ? Math.sqrt(valores.reduce((a, v) => a + (v - media) ** 2, 0) / valores.length) / media : null;
  const faixa = cv === null ? null : cv < 0.15 ? "baixa" : cv < 0.3 ? "média" : "alta";
  return {
    regra: "consistencia",
    regraVersao: VERSAO_MODO,
    valor: cv === null ? null : cv * 100,
    referencia: null,
    referenciaTipo: null,
    delta: null,
    deltaUnidade: null,
    tom: faixa === "baixa" ? "BOM" : faixa === "alta" ? "RUIM" : faixa === null ? "AVISO" : "NEUTRO",
    confianca: modo ? "INFERIDA" : null,
    base: { rounds: 0, sessoes: valores.length },
    visual: "BARRA",
    dados: { cv, faixa, faixas: [0.15, 0.3], n: valores.length },
    linha: faixa === null ? `Consistência — faltam ${Math.max(0, 3 - valores.length)} sessões fortes` : `Variação do K/D entre sessões: ${faixa} (±${formatarNumero(cv! * 100, 0)}%)`,
  };
}

/** `cobertura.modo` — quantos rounds do período têm modo provado; o anel. */
export function coberturaDeModo(sessoes: SessaoFato[]): InsightCalculado {
  const total = sessoes.reduce((a, s) => a + s.rounds, 0);
  const provados = sessoes.filter(provada).reduce((a, s) => a + s.rounds, 0);
  const pct = total ? (provados / total) * 100 : null;
  const mistas = sessoes.filter((s) => !provada(s)).length;
  return {
    regra: "cobertura.modo",
    regraVersao: VERSAO_MODO,
    valor: pct,
    referencia: null,
    referenciaTipo: null,
    delta: null,
    deltaUnidade: null,
    tom: pct === null ? "AVISO" : pct >= 80 ? "BOM" : pct >= 40 ? "NEUTRO" : "AVISO",
    confianca: null,
    base: { rounds: total, sessoes: sessoes.length },
    visual: "ANEL",
    dados: { pct, provados, total, mistas },
    linha: pct === null ? "Cobertura de modo — sem rounds ainda" : `${formatarNumero(pct, 0)}% dos rounds com modo provado · ${mistas} sess${mistas === 1 ? "ão mista" : "ões mistas"}`,
  };
}

export function insightsDoModo(sessoes: SessaoFato[], modo: string | null): InsightCalculado[] {
  const lista = [tendenciaKd(sessoes, modo), formaVsVitalicio(sessoes, modo), rankingDeMapas(sessoes, modo), consistencia(sessoes, modo)];
  if (modo === null) lista.push(coberturaDeModo(sessoes));
  return lista;
}
