import { rotularMapa } from "./cs2-labels";

/**
 * A identidade visual de cada mapa.
 *
 * Uma partida sem mapa à vista é uma linha de tabela como outra qualquer —
 * e mapa é a primeira coisa que quem joga usa para lembrar de uma partida
 * ("aquela de Nuke"). O nome escrito não faz isso; cor faz, e na hora.
 *
 * As cores são as do próprio mapa, tiradas do que domina a tela quando se
 * joga: a areia de Dust2, o terracota de Inferno, o concreto de Nuke, o
 * jade de Ancient. Não é decoração — duas partidas no mesmo mapa ficam
 * iguais na lista, que é justamente o que se quer ao procurar uma delas.
 *
 * **Screenshot no lugar da cor**: um arquivo em `public/mapas/<mapa>.jpg`
 * (por exemplo `public/mapas/de_dust2.jpg`) é usado automaticamente por
 * `MapaVisual`, sem mudar código. As imagens oficiais da Valve não têm CDN
 * público estável, então o padrão é o que não depende de terceiro nenhum.
 */
export type IdentidadeMapa = {
  /** Fundo: duas paradas de gradiente. */
  de: string;
  para: string;
  /** Texto sobre o fundo. */
  tinta: string;
  /** Duas ou três letras para o espaço apertado. */
  sigla: string;
};

const MAPAS: Record<string, IdentidadeMapa> = {
  de_dust2: { de: "#c9a227", para: "#8a6b16", tinta: "#1b1405", sigla: "D2" },
  de_mirage: { de: "#d9a441", para: "#94682a", tinta: "#1c1305", sigla: "MRG" },
  de_inferno: { de: "#c0563a", para: "#7d3220", tinta: "#fdeee9", sigla: "INF" },
  de_nuke: { de: "#8e9aa6", para: "#4c5760", tinta: "#0d1114", sigla: "NUK" },
  de_overpass: { de: "#7f9a6f", para: "#48603c", tinta: "#0b1108", sigla: "OVP" },
  de_ancient: { de: "#3f8f70", para: "#1e5343", tinta: "#e7f7f1", sigla: "ANC" },
  de_anubis: { de: "#3f7fa8", para: "#1f4a66", tinta: "#eaf4fa", sigla: "ANU" },
  de_vertigo: { de: "#6d7f92", para: "#3a4653", tinta: "#eef2f6", sigla: "VTG" },
  de_train: { de: "#9a6b4a", para: "#5c3c28", tinta: "#faefe7", sigla: "TRN" },
  de_cache: { de: "#8d8f74", para: "#535541", tinta: "#f4f5ee", sigla: "CCH" },
  de_cbble: { de: "#8a7f5c", para: "#514a32", tinta: "#f6f3e8", sigla: "CBL" },
  cs_office: { de: "#b7c3cd", para: "#6f7c88", tinta: "#0f1417", sigla: "OFF" },
  cs_italy: { de: "#c99a5a", para: "#7d5c2d", tinta: "#1a1206", sigla: "ITA" },
  de_shortdust: { de: "#c9a227", para: "#8a6b16", tinta: "#1b1405", sigla: "SD2" },
};

/**
 * A identidade de um mapa. Desconhecido (workshop, mapa novo) ganha uma
 * cor derivada do nome — estável, então o mesmo mapa é sempre o mesmo
 * tom, e distinta, então dois mapas novos não se confundem.
 */
export function identidadeDoMapa(mapa: string | null | undefined): IdentidadeMapa {
  if (!mapa) return { de: "#3a4049", para: "#22262c", tinta: "#c9ced6", sigla: "—" };
  const conhecido = MAPAS[mapa.toLowerCase()];
  if (conhecido) return conhecido;

  let h = 0;
  for (const c of mapa) h = (h * 31 + c.charCodeAt(0)) % 360;
  const nome = rotularMapa(mapa);
  return {
    de: `hsl(${h} 32% 48%)`,
    para: `hsl(${h} 34% 28%)`,
    tinta: `hsl(${h} 30% 96%)`,
    sigla: nome.slice(0, 3).toUpperCase(),
  };
}

/** O arquivo que substitui a cor, quando existir. `MapaVisual` tenta e cai fora sozinho. */
export function imagemDoMapa(mapa: string): string {
  return `/mapas/${mapa.toLowerCase()}.jpg`;
}
