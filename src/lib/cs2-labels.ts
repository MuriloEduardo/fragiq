/**
 * Rótulos de mapa e modo do CS2.
 *
 * Fora de qualquer componente porque as duas pontas precisam deles: a barra
 * de filtro e o seletor de sincronização são client components, a lista de
 * partidas é server component, e função exportada de um módulo "use client"
 * não pode ser chamada no servidor.
 */

const MODOS: Record<string, string> = {
  competitive: "Competitivo",
  casual: "Casual",
  deathmatch: "Deathmatch",
  premier: "Premier",
  scrimcomp2v2: "Wingman",
  retakes: "Retakes",
  survival: "Danger Zone",
  gungameprogressive: "Arms Race",
  gungametrbomb: "Demolição",
  training: "Treino",
  /** O GSI publica o competitivo com outro nome em algumas versões. */
  competitive2v2: "Wingman",
};

export function rotularModo(modo: string) {
  return MODOS[modo] ?? modo;
}

/**
 * de_anubis → Anubis, cs_office → Office.
 *
 * O prefixo é o tipo de mapa (de_ desarme, cs_ reféns, ar_ arms race) e não
 * diz nada a quem joga: ninguém chama Mirage de "de_mirage" em voz alta.
 * Mapas de workshop e nomes fora do padrão passam inteiros.
 */
export function rotularMapa(mapa: string) {
  const semPrefixo = mapa.replace(/^(de|cs|ar|dz|gd|coop)_/, "");
  return semPrefixo.charAt(0).toUpperCase() + semPrefixo.slice(1);
}

const ARMAS: Record<string, string> = {
  ak47: "AK-47",
  m4a1: "M4A1",
  awp: "AWP",
  deagle: "Desert Eagle",
  glock: "Glock",
  hkp2000: "USP-S / P2000",
  p250: "P250",
  fiveseven: "Five-SeveN",
  tec9: "Tec-9",
  elite: "Dual Berettas",
  galilar: "Galil AR",
  famas: "FAMAS",
  aug: "AUG",
  sg556: "SG 553",
  ssg08: "SSG 08",
  scar20: "SCAR-20",
  g3sg1: "G3SG1",
  mac10: "MAC-10",
  mp7: "MP7",
  mp9: "MP9",
  ump45: "UMP-45",
  p90: "P90",
  bizon: "PP-Bizon",
  nova: "Nova",
  xm1014: "XM1014",
  mag7: "MAG-7",
  sawedoff: "Sawed-Off",
  m249: "M249",
  negev: "Negev",
  taser: "Zeus",
};

export function rotularArma(arma: string) {
  return ARMAS[arma] ?? arma.toUpperCase();
}

/**
 * Quais armas aparecem num conjunto de contadores da Steam.
 *
 * Uma arma é o que tem `total_shots_<arma>` — `total_shots_fired` e
 * `total_shots_hit` são globais, e o segundo ainda está quebrado na Valve
 * (README, "Uma armadilha da Valve"). Faca e granada matam sem disparar,
 * então ficam de fora por construção: sem par tiros/acertos não há
 * precisão para comparar.
 */
export function armasNasMetricas(metrics: Record<string, number>): string[] {
  return Object.keys(metrics)
    .filter((k) => k.startsWith("total_shots_") && k !== "total_shots_fired" && k !== "total_shots_hit")
    .map((k) => k.replace("total_shots_", ""));
}
