/**
 * O `game_type` que o Game Coordinator devolve na reserva de uma partida.
 *
 * Não é um enum: é um bitmask com duas partes. O byte baixo diz o modo —
 * 8 competitivo, 7 casual, 10 Wingman, 12 skirmish (Arms Race, Demolição,
 * Retakes…), 13 Danger Zone — e os bits altos dizem o mapa da fila
 * (32768 Mirage, 4096 Inferno, 512 Dust II…). O Premier é o competitivo
 * com o bit 25 ligado e nenhum bit de mapa, porque o mapa sai do veto.
 *
 * Por isso 32776 (= 32768 + 8) é "competitivo em Mirage" e 4104
 * (= 4096 + 8) é "competitivo em Inferno" — os dois valores que o banco
 * acumulou com `modo` nulo enquanto a tabela só conhecia 8 e 264. A tabela
 * de bits vem de partidas observadas e da calibração pública de um GC
 * alternativo da comunidade (CSGO-GCServer, `game_type_calibration.go`);
 * a Valve não documenta nada disso. As seis partidas de produção
 * confirmam a parte do mapa: o cabeçalho da demo leu Mirage e Inferno
 * exatamente onde os bits dizem.
 *
 * O vocabulário devolvido é o do rich presence (`competitive`, `premier`,
 * `casual`, `scrimcomp2v2`…), o mesmo das sessões, para que o submenu de
 * modos junte as duas fontes. Um modo desconhecido continua `null`: um
 * modo errado numa aba é pior que uma partida em "tudo".
 */

const PREMIER = 1 << 25;

const MODO_POR_BYTE_BAIXO: Record<number, string> = {
  7: "casual",
  8: "competitive",
  10: "scrimcomp2v2",
  13: "survival",
};

/** Skirmish (byte baixo 12) usa os bits de "mapa" para dizer qual jogo é. */
const SKIRMISH_POR_BIT: Record<number, string> = {
  [1 << 10]: "flyingscoutsman",
  [1 << 17]: "gungameprogressive",
  [1 << 18]: "gungametrbomb",
  [1 << 19]: "retakes",
};

const MAPA_POR_BIT: Record<number, string> = {
  [1 << 9]: "de_dust2",
  [1 << 10]: "de_train",
  [1 << 11]: "de_ancient",
  [1 << 12]: "de_inferno",
  [1 << 13]: "de_nuke",
  [1 << 14]: "de_vertigo",
  [1 << 15]: "de_mirage",
  [1 << 16]: "cs_office",
  [1 << 20]: "de_cache",
  [1 << 23]: "de_anubis",
  [1 << 24]: "de_tuscan",
  [1 << 27]: "cs_agency",
  [1 << 28]: "de_overpass",
};

export type GameTypeDecodificado = { modo: string | null; mapa: string | null; premier: boolean };

export function decodificarGameType(gameType: number | null | undefined): GameTypeDecodificado {
  if (gameType === null || gameType === undefined || !Number.isInteger(gameType) || gameType < 0) {
    return { modo: null, mapa: null, premier: false };
  }
  const baixo = gameType & 0xff;
  const alto = gameType - baixo;
  const premier = baixo === 8 && (gameType & PREMIER) !== 0;

  let modo: string | null = null;
  if (premier) modo = "premier";
  else if (baixo === 12) modo = SKIRMISH_POR_BIT[alto] ?? null;
  else modo = MODO_POR_BYTE_BAIXO[baixo] ?? null;

  // O mapa só é um bit quando a fila foi de um mapa só: casual e skirmish
  // somam vários bits (o grupo de mapas), e aí o cabeçalho da demo decide.
  const mapa = baixo === 8 && !premier ? (MAPA_POR_BIT[alto] ?? null) : null;

  return { modo, mapa, premier };
}

/** O modo no vocabulário do rich presence, ou `null` se o valor é desconhecido. */
export function modoDoGameType(gameType: number | null | undefined): string | null {
  return decodificarGameType(gameType).modo;
}

/** O mapa da fila, quando o `game_type` o carrega (competitivo de um mapa só). */
export function mapaDoGameType(gameType: number | null | undefined): string | null {
  return decodificarGameType(gameType).mapa;
}
