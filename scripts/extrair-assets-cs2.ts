/**
 * Tira do próprio CS2 as imagens que a plataforma mostra.
 *
 *   npm run assets:cs2 -- "/mnt/c/Program Files (x86)/Steam/steamapps/common/Counter-Strike Global Offensive"
 *
 * O jogo guarda tudo em `game/csgo/pak01_dir.vpk`, em formatos do Source 2
 * (`.vtex_c`, `.vsvg_c`). Quem abre é o Source2Viewer CLI
 * (ValveResourceFormat), baixado sozinho para `node_modules/.cache/vrf` na
 * primeira vez — ou apontado por `VRF_CLI`. Depois o sharp converte para o
 * que a web carrega leve, e o resultado vai para `public/`:
 *
 * - `mapas/<mapa>.jpg` — a screenshot do mapa, que `MapaVisual` já usa sozinho;
 * - `cs2/radar/<mapa>.webp` e `cs2/radar/calibracao.json` — o radar e a
 *   conta que leva uma coordenada do jogo para um pixel dele;
 * - `cs2/armas/<arma>.svg` — o ícone de cada arma, o mesmo do killfeed;
 * - `cs2/patentes/<skillgroup|wingman><n>.webp` — as patentes do competitivo;
 * - `cs2/agentes/<agente>.webp` — os retratos dos agentes padrão.
 *
 * Roda de novo quando a Valve mexe num mapa: sobrescreve e mantém os nomes.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const VRF_VERSAO = "20.0";
const RAIZ = path.resolve(__dirname, "..");
const PUBLICO = path.join(RAIZ, "public");

/** Mapas que valem imagem: os de partida de verdade, sem variante noturna nem de teste. */
const MAPA_JOGAVEL = /^(de|cs)_[a-z0-9]+$/;
const MAPA_FORA = new Set(["de_ancient_v1", "de_ancient_v2", "de_inferno_s2", "de_overpass_2v2", "de_dust"]);

/** Ícones da pasta de equipamento que não são equipamento de ninguém. */
const ARMA_FORA = new Set([
  "clothing_hands", "customplayer", "disconnect", "dronegun", "flair0", "movelinear", "pet",
  "prop_exploding_barrel", "spray0", "stomp_damage", "trigger_hurt", "world", "worldent",
]);

/** Um agente de cada unidade padrão — o retrato que representa o lado. */
const AGENTES = [
  "ctm_fbi", "ctm_gign", "ctm_gsg9", "ctm_heavy", "ctm_idf", "ctm_sas", "ctm_st6", "ctm_swat",
  "tm_anarchist", "tm_phoenix", "tm_phoenix_heavy", "tm_pirate", "tm_professional", "tm_separatist",
];

function vrfCli(): string {
  if (process.env.VRF_CLI) return process.env.VRF_CLI;
  const pasta = path.join(RAIZ, "node_modules/.cache/vrf", VRF_VERSAO);
  const bin = path.join(pasta, "Source2Viewer-CLI");
  if (existsSync(bin)) return bin;

  mkdirSync(pasta, { recursive: true });
  const zip = path.join(pasta, "cli.zip");
  const url = `https://github.com/ValveResourceFormat/ValveResourceFormat/releases/download/${VRF_VERSAO}/cli-linux-x64.zip`;
  console.log(`baixando Source2Viewer CLI ${VRF_VERSAO}…`);
  execFileSync("curl", ["-sSLfo", zip, url]);
  execFileSync("unzip", ["-oq", zip, "-d", pasta]);
  execFileSync("chmod", ["+x", bin]);
  return bin;
}

function extrair(jogo: string): string {
  const vpk = path.join(jogo, "game/csgo/pak01_dir.vpk");
  if (!existsSync(vpk)) throw new Error(`não achei ${vpk} — o argumento é a pasta do CS2`);

  const saida = path.join(tmpdir(), "fragiq-assets-cs2");
  rmSync(saida, { recursive: true, force: true });
  const filtros = [
    "panorama/images/overheadmaps/",
    "panorama/images/map_icons/screenshots/720p/",
    "panorama/images/icons/equipment/",
    "panorama/images/icons/skillgroups/",
    "panorama/images/econ/characters/",
    "resource/overviews/",
  ].join(",");
  console.log("extraindo do pak01_dir.vpk…");
  execFileSync(vrfCli(), ["-i", vpk, "-o", saida, "-d", "--threads", "8", "-f", filtros], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  return saida;
}

function limpar(pasta: string) {
  rmSync(pasta, { recursive: true, force: true });
  mkdirSync(pasta, { recursive: true });
}

async function screenshots(bruto: string) {
  const origem = path.join(bruto, "panorama/images/map_icons/screenshots/720p");
  const destino = path.join(PUBLICO, "mapas");
  mkdirSync(destino, { recursive: true });
  let n = 0;
  for (const arq of readdirSync(origem)) {
    const mapa = arq.replace(/_png\.png$/, "");
    if (!MAPA_JOGAVEL.test(mapa) || MAPA_FORA.has(mapa)) continue;
    await sharp(path.join(origem, arq))
      .resize(640, 360)
      .jpeg({ quality: 74, mozjpeg: true })
      .toFile(path.join(destino, `${mapa}.jpg`));
    n++;
  }
  console.log(`mapas: ${n} screenshots`);
}

type Calibracao = {
  /** Canto superior esquerdo do radar em unidades do jogo. */
  x: number;
  y: number;
  /** Unidades do jogo por pixel, num radar de 1024. */
  escala: number;
  /** Andar de baixo, quando o mapa tem (Nuke, Vertigo, Train): abaixo desta altura o radar é o `_lower`. */
  inferiorAbaixoDeZ?: number;
  /** Pontos do carregamento, de 0 a 1 sobre o radar. */
  pontos: Partial<Record<"ct" | "t" | "a" | "b", [number, number]>>;
};

/** O `.txt` de overview é KeyValues; basta pegar os pares de primeiro nível e as seções verticais. */
function lerOverview(texto: string): Calibracao | null {
  const par = (chave: string) => {
    const m = texto.match(new RegExp(`"${chave}"\\s+"(-?[\\d.]+)"`, "i"));
    return m ? Number(m[1]) : undefined;
  };
  const x = par("pos_x");
  const y = par("pos_y");
  const escala = par("scale");
  if (x === undefined || y === undefined || escala === undefined) return null;

  const ponto = (px: string, py: string): [number, number] | undefined => {
    const a = par(px);
    const b = par(py);
    return a === undefined || b === undefined ? undefined : [a, b];
  };
  const pontos: Calibracao["pontos"] = {};
  const ct = ponto("CTSpawn_x", "CTSpawn_y");
  const t = ponto("TSpawn_x", "TSpawn_y");
  const a = ponto("bombA_x", "bombA_y");
  const b = ponto("bombB_x", "bombB_y");
  if (ct) pontos.ct = ct;
  if (t) pontos.t = t;
  if (a) pontos.a = a;
  if (b) pontos.b = b;

  const cal: Calibracao = { x, y, escala, pontos };
  const lower = texto.match(/"lower"[^{]*\{[^}]*"AltitudeMax"\s+"(-?[\d.]+)"/i);
  if (lower) cal.inferiorAbaixoDeZ = Number(lower[1]);
  return cal;
}

async function radares(bruto: string) {
  const origem = path.join(bruto, "panorama/images/overheadmaps");
  const overviews = path.join(bruto, "resource/overviews");
  const destino = path.join(PUBLICO, "cs2/radar");
  limpar(destino);

  const calibracao: Record<string, Calibracao> = {};
  for (const arq of readdirSync(overviews)) {
    const mapa = arq.replace(/\.txt$/, "");
    if (!MAPA_JOGAVEL.test(mapa) || MAPA_FORA.has(mapa)) continue;
    const cal = lerOverview(readFileSync(path.join(overviews, arq), "utf8"));
    const radar = path.join(origem, `${mapa}_radar_psd.png`);
    if (!cal || !existsSync(radar)) continue;

    await sharp(radar).webp({ quality: 80 }).toFile(path.join(destino, `${mapa}.webp`));
    const inferior = path.join(origem, `${mapa}_lower_radar_psd.png`);
    if (existsSync(inferior)) {
      await sharp(inferior).webp({ quality: 80 }).toFile(path.join(destino, `${mapa}_lower.webp`));
    } else {
      delete cal.inferiorAbaixoDeZ;
    }
    calibracao[mapa] = cal;
  }
  writeFileSync(path.join(destino, "calibracao.json"), JSON.stringify(calibracao, null, 2) + "\n");
  console.log(`radar: ${Object.keys(calibracao).length} mapas`);
}

/** O SVG sai do Illustrator com comentário, doctype e espaço de sobra — nada disso desenha. */
function enxugarSvg(svg: string): string {
  return svg
    .replace(/<\?xml[^>]*\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function armas(bruto: string) {
  const origem = path.join(bruto, "panorama/images/icons/equipment");
  const destino = path.join(PUBLICO, "cs2/armas");
  limpar(destino);
  let n = 0;
  for (const arq of readdirSync(origem)) {
    const nome = arq.replace(/\.svg$/, "");
    if (!arq.endsWith(".svg") || ARMA_FORA.has(nome)) continue;
    writeFileSync(path.join(destino, arq), enxugarSvg(readFileSync(path.join(origem, arq), "utf8")));
    n++;
  }
  console.log(`armas: ${n} ícones`);
}

/** As patentes vêm como SVG com a arte rasterizada dentro — meio mega cada. Viram WebP pequeno. */
async function patentes(bruto: string) {
  const origem = path.join(bruto, "panorama/images/icons/skillgroups");
  const destino = path.join(PUBLICO, "cs2/patentes");
  limpar(destino);
  let n = 0;
  for (const arq of readdirSync(origem)) {
    const nome = arq.replace(/\.svg$/, "");
    if (!/^(skillgroup|wingman)\d+$/.test(nome)) continue;
    await sharp(path.join(origem, arq), { density: 300 })
      .resize({ width: 192 })
      .webp({ quality: 82 })
      .toFile(path.join(destino, `${nome}.webp`));
    n++;
  }
  console.log(`patentes: ${n}`);
}

async function agentes(bruto: string) {
  const origem = path.join(bruto, "panorama/images/econ/characters");
  const destino = path.join(PUBLICO, "cs2/agentes");
  limpar(destino);
  for (const agente of AGENTES) {
    const arq = path.join(origem, `customplayer_${agente}_square_png.png`);
    if (!existsSync(arq)) {
      console.warn(`  agente ${agente} sumiu do jogo`);
      continue;
    }
    await sharp(arq).resize(192, 192).webp({ quality: 80 }).toFile(path.join(destino, `${agente}.webp`));
  }
  console.log(`agentes: ${AGENTES.length}`);
}

async function main() {
  const jogo = process.argv[2] ?? process.env.CS2_DIR;
  if (!jogo) {
    console.error('Uso: npm run assets:cs2 -- "<pasta do Counter-Strike Global Offensive>"');
    process.exit(1);
  }
  const bruto = extrair(jogo);
  await screenshots(bruto);
  await radares(bruto);
  armas(bruto);
  await patentes(bruto);
  await agentes(bruto);
  rmSync(bruto, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
