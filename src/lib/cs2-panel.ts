import type { SeriesSpec } from "./series";

/**
 * As estatísticas fixas do painel de CS2.
 *
 * Todas são razões entre dois contadores, de propósito: razão é o único modo
 * que se compara com o vitalício de forma honesta. "Kills no período" não se
 * compara com "kills na vida inteira"; "kills por round no período" se
 * compara com "kills por round na vida inteira".
 *
 * Cada uma declara também o que a interface precisa saber para julgá-la:
 * `melhorQuando` (se subir é bom), `amostra` (o que conta como amostra de
 * um ponto — rounds ou partidas — e o mínimo abaixo do qual o ponto é
 * fraco) e `movel` (stats por partida oscilam 0/100 numa sessão de duas
 * partidas; a série delas é a razão móvel das últimas 5 sessões).
 *
 * `total_shots_hit` fica de fora mesmo sendo o caminho óbvio para precisão:
 * o contador global da Valve está quebrado há anos (devolve fração do real).
 * Os pares por arma são confiáveis.
 */
export type PanelStat = {
  key: string;
  label: string;
  /** Unidade sufixada ao número. Vazio para razões puras como K/D. */
  unit?: string;
  spec: Omit<SeriesSpec, "id">;
  decimals: number;
  melhorQuando: "sobe" | "desce" | "nenhuma";
  amostra: { de: "rounds" | "partidas"; minimo: number };
  /** Janela da razão móvel, em sessões; ausente = valor da própria sessão. */
  movel?: number;
};

const ROUNDS = { de: "rounds", minimo: 10 } as const;
const PARTIDAS = { de: "partidas", minimo: 3 } as const;

export const CS2_PANEL: PanelStat[] = [
  {
    key: "kd",
    label: "K/D",
    decimals: 2,
    melhorQuando: "sobe",
    amostra: ROUNDS,
    spec: { metric: "total_kills", denominator: "total_deaths", mode: "ratio" },
  },
  {
    // Deliberadamente NÃO chamado de ADR: o contador soma modos onde se
    // causa muito dano por round, então o número sai inflado e não se
    // compara com o ADR do HLTV ou do csstats.
    key: "adr",
    label: "Dano por round",
    decimals: 0,
    melhorQuando: "sobe",
    amostra: ROUNDS,
    spec: { metric: "total_damage_done", denominator: "total_rounds_played", mode: "ratio" },
  },
  {
    key: "kpr",
    label: "Kills por round",
    decimals: 2,
    melhorQuando: "sobe",
    amostra: ROUNDS,
    spec: { metric: "total_kills", denominator: "total_rounds_played", mode: "ratio" },
  },
  {
    key: "hs",
    label: "Headshot",
    unit: "%",
    decimals: 1,
    melhorQuando: "sobe",
    amostra: ROUNDS,
    spec: { metric: "total_kills_headshot", denominator: "total_kills", mode: "ratio", scale: 100 },
  },
  {
    key: "winrate",
    label: "Vitórias",
    unit: "%",
    decimals: 1,
    melhorQuando: "sobe",
    amostra: PARTIDAS,
    movel: 5,
    spec: { metric: "total_matches_won", denominator: "total_matches_played", mode: "ratio", scale: 100 },
  },
  {
    key: "mvp",
    label: "MVP por partida",
    decimals: 2,
    melhorQuando: "sobe",
    amostra: PARTIDAS,
    movel: 5,
    spec: { metric: "total_mvps", denominator: "total_matches_played", mode: "ratio" },
  },
  {
    key: "rounds",
    label: "Rounds por partida",
    decimals: 1,
    melhorQuando: "nenhuma",
    amostra: PARTIDAS,
    movel: 5,
    spec: { metric: "total_rounds_played", denominator: "total_matches_played", mode: "ratio" },
  },
  {
    key: "acc_ak",
    label: "Precisão AK-47",
    unit: "%",
    decimals: 1,
    melhorQuando: "sobe",
    amostra: ROUNDS,
    spec: { metric: "total_hits_ak47", denominator: "total_shots_ak47", mode: "ratio", scale: 100 },
  },
  {
    key: "acc_m4",
    label: "Precisão M4A1",
    unit: "%",
    decimals: 1,
    melhorQuando: "sobe",
    amostra: ROUNDS,
    spec: { metric: "total_hits_m4a1", denominator: "total_shots_m4a1", mode: "ratio", scale: 100 },
  },
  {
    key: "acc_awp",
    label: "Precisão AWP",
    unit: "%",
    decimals: 1,
    melhorQuando: "sobe",
    amostra: ROUNDS,
    spec: { metric: "total_hits_awp", denominator: "total_shots_awp", mode: "ratio", scale: 100 },
  },
  {
    key: "kills_ak",
    label: "Kills por round · AK-47",
    decimals: 3,
    melhorQuando: "sobe",
    amostra: ROUNDS,
    spec: { metric: "total_kills_ak47", denominator: "total_rounds_played", mode: "ratio" },
  },
  {
    key: "utility",
    label: "Kills com granada por partida",
    decimals: 3,
    melhorQuando: "sobe",
    amostra: PARTIDAS,
    movel: 5,
    spec: { metric: "total_kills_hegrenade", denominator: "total_matches_played", mode: "ratio" },
  },
];
