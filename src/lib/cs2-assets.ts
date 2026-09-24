import calibracoes from "../../public/cs2/radar/calibracao.json";

/**
 * As imagens do próprio CS2 que a plataforma serve de `public/`.
 *
 * Saem do jogo por `npm run assets:cs2` (scripts/extrair-assets-cs2.ts) e
 * são as mesmas que o jogador vê no killfeed, no radar e no menu — é por
 * isso que reconhece de relance, sem ler. Cada função devolve `null` quando
 * o jogo não tem a imagem (mapa de workshop, arma nova), e quem chama
 * mostra o texto de antes.
 */

type Calibracao = {
  x: number;
  y: number;
  escala: number;
  inferiorAbaixoDeZ?: number;
  pontos: Partial<Record<"ct" | "t" | "a" | "b", number[]>>;
};

const CALIBRACAO = calibracoes as Record<string, Calibracao>;

/** O radar de 1024 px que o jogo usa; a escala da calibração é por pixel dele. */
const LADO_RADAR = 1024;

/**
 * As armas com ícone. A Steam chama a USP-S e a P2000 de `hkp2000` nos
 * contadores — o ícone da USP é o que quem joga associa ao nome.
 */
const ARMAS_COM_ICONE = new Set([
  "ak47", "aug", "awp", "bizon", "c4", "cz75a", "deagle", "decoy", "elite", "famas", "fiveseven",
  "flashbang", "g3sg1", "galilar", "glock", "hegrenade", "hkp2000", "incgrenade", "knife", "m249",
  "m4a1", "m4a1_silencer", "mac10", "mag7", "molotov", "mp5sd", "mp7", "mp9", "negev", "nova", "p2000",
  "p250", "p90", "revolver", "sawedoff", "scar20", "sg556", "smokegrenade", "ssg08", "taser", "tec9",
  "ump45", "usp_silencer", "xm1014",
]);

const APELIDO_ARMA: Record<string, string> = { hkp2000: "usp_silencer", weapon_knife_t: "knife_t" };

/** O ícone de killfeed da arma, pelo nome da Valve (`ak47`, `weapon_ak47`). */
export function iconeDaArma(arma: string): string | null {
  const nome = arma.toLowerCase().replace(/^weapon_/, "");
  if (!ARMAS_COM_ICONE.has(nome)) return null;
  return `/cs2/armas/${APELIDO_ARMA[nome] ?? nome}.svg`;
}

/** O radar do mapa; `inferior` pede o andar de baixo (Nuke, Vertigo, Train). */
export function radarDoMapa(mapa: string, inferior = false): string | null {
  const m = mapa.toLowerCase();
  const cal = CALIBRACAO[m];
  if (!cal) return null;
  if (inferior && cal.inferiorAbaixoDeZ === undefined) return null;
  return `/cs2/radar/${m}${inferior ? "_lower" : ""}.webp`;
}

/**
 * Leva uma posição do jogo para o radar, de 0 a 1 em cada eixo, com a
 * origem no canto de cima à esquerda — pronto para `left`/`top` em %.
 * O y do jogo cresce para o norte e o da imagem para baixo, daí a inversão.
 * `inferior` diz em qual dos dois radares o ponto cai, quando há dois.
 */
export function noRadar(
  mapa: string,
  x: number,
  y: number,
  z?: number,
): { x: number; y: number; inferior: boolean } | null {
  const cal = CALIBRACAO[mapa.toLowerCase()];
  if (!cal) return null;
  const inferior = cal.inferiorAbaixoDeZ !== undefined && z !== undefined && z < cal.inferiorAbaixoDeZ;
  return {
    x: (x - cal.x) / cal.escala / LADO_RADAR,
    y: (cal.y - y) / cal.escala / LADO_RADAR,
    inferior,
  };
}

/** Onde ficam os bombs e os spawns no radar, de 0 a 1 — o que o carregamento do jogo marca. */
export function pontosDoRadar(mapa: string): Calibracao["pontos"] {
  return CALIBRACAO[mapa.toLowerCase()]?.pontos ?? {};
}

/** A patente do competitivo por mapa, de 1 (Prata I) a 18 (Global Elite). */
export function iconeDaPatente(nivel: number, modo: "competitivo" | "wingman" = "competitivo"): string | null {
  if (!Number.isInteger(nivel) || nivel < 1 || nivel > 18) return null;
  return `/cs2/patentes/${modo === "wingman" ? "wingman" : "skillgroup"}${nivel}.webp`;
}

const AGENTES = {
  CT: ["ctm_sas", "ctm_fbi", "ctm_gign", "ctm_gsg9", "ctm_idf", "ctm_st6", "ctm_swat", "ctm_heavy"],
  T: ["tm_phoenix", "tm_anarchist", "tm_pirate", "tm_professional", "tm_separatist", "tm_phoenix_heavy"],
} as const;

/**
 * Um retrato de agente do lado. A `semente` (um SteamID, por exemplo)
 * escolhe qual — o mesmo jogador tem sempre o mesmo, e dois lado a lado
 * dificilmente repetem.
 */
export function agenteDoLado(lado: "CT" | "T", semente = ""): string {
  const lista = AGENTES[lado];
  let h = 0;
  for (const c of semente) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `/cs2/agentes/${lista[h % lista.length]}.webp`;
}
