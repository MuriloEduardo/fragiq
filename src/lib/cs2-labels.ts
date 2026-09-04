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
