import { prisma } from "./prisma";
import { getPlayerSummary, getUserStatsForGame, resolveVanityUrl, type SteamPlayer } from "./steam/api";
import { armasNasMetricas, rotularArma, rotularMapa } from "./cs2-labels";

/**
 * A página pública de um jogador: o que a Steam já mostra a qualquer um.
 *
 * Números vitalícios, por arma e por mapa, lidos ao vivo da Web API — os
 * mesmos que csstats e Leetify exibem para quem tem o SteamID. Nada de
 * curva, leitura ou analista: isso é do dono, atrás do login. A privacidade
 * é a da Steam ("Detalhes do jogo" público) mais o botão de esconder do
 * próprio FragIQ.
 *
 * As leituras da Steam ficam em cache por dez minutos por SteamID, para uma
 * página compartilhada num grupo não virar rajada contra a chave.
 */

const CS2 = 730;
const CACHE_MS = 10 * 60_000;

export type PerfilPublico =
  | { estado: "oculto" }
  | { estado: "inexistente" }
  | { estado: "privado"; jogador: SteamPlayer }
  | { estado: "sem-cs2"; jogador: SteamPlayer }
  | {
      estado: "ok";
      jogador: SteamPlayer;
      usuarioDoFragiq: { desde: Date; coletas: number } | null;
      horas: number;
      resumo: { rotulo: string; valor: string }[];
      /** `id` é o nome da Valve (`ak47`, `de_nuke`), que acha o ícone; o outro campo é o rótulo. */
      armas: { id: string; arma: string; kills: number; tiros: number; acertos: number; precisao: number | null }[];
      mapas: { id: string; mapa: string; rounds: number; vitorias: number; taxa: number | null }[];
    };

const cache = new Map<string, { em: number; valor: PerfilPublico }>();

export function pareceSteamId(v: string) {
  return /^7656119\d{10}$/.test(v);
}

/**
 * O que a pessoa colou: SteamID64, link /profiles/<id>, link /id/<apelido>
 * ou só o apelido. Devolve o SteamID64 ou null.
 */
export async function resolverEntrada(entrada: string): Promise<string | null> {
  const v = entrada.trim();
  if (!v) return null;
  if (pareceSteamId(v)) return v;
  const m = v.match(/steamcommunity\.com\/(profiles|id)\/([^/?#\s]+)/i);
  if (m?.[1] === "profiles") return pareceSteamId(m[2]) ? m[2] : null;
  const vanity = m ? m[2] : v;
  if (!/^[A-Za-z0-9_-]{2,32}$/.test(vanity)) return null;
  return resolveVanityUrl(vanity);
}

export async function carregarPerfilPublico(steamId: string): Promise<PerfilPublico> {
  const hit = cache.get(steamId);
  if (hit && Date.now() - hit.em < CACHE_MS) return hit.valor;

  const valor = await montar(steamId);
  cache.set(steamId, { em: Date.now(), valor });
  return valor;
}

async function montar(steamId: string): Promise<PerfilPublico> {
  const usuario = await prisma.user.findUnique({
    where: { steamId },
    select: {
      perfilPublico: true,
      createdAt: true,
      games: { where: { gameAppId: CS2 }, select: { _count: { select: { snapshots: true } } } },
    },
  });
  if (usuario && !usuario.perfilPublico) return { estado: "oculto" };

  const jogador = await getPlayerSummary(steamId);
  if (!jogador) return { estado: "inexistente" };
  if (jogador.communityvisibilitystate !== 3) return { estado: "privado", jogador };

  const stats = await getUserStatsForGame(steamId, CS2);
  if (!stats) return { estado: "sem-cs2", jogador };
  const m = stats.metrics;
  const razao = (a: string, b: string, escala = 1) => (m[b] ? ((m[a] ?? 0) / m[b]) * escala : null);
  const fmt = (v: number | null, casas: number, sufixo = "") =>
    v === null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + sufixo;

  const armas = armasNasMetricas(m)
    .map((arma) => {
      const tiros = m[`total_shots_${arma}`] ?? 0;
      const acertos = m[`total_hits_${arma}`] ?? 0;
      return {
        id: arma,
        arma: rotularArma(arma),
        kills: m[`total_kills_${arma}`] ?? 0,
        tiros,
        acertos,
        precisao: tiros ? (acertos / tiros) * 100 : null,
      };
    })
    .filter((a) => a.tiros > 0)
    .sort((a, b) => b.kills - a.kills);

  const mapas = Object.keys(m)
    .filter((k) => k.startsWith("total_rounds_map_"))
    .map((k) => {
      const mapa = k.replace("total_rounds_map_", "");
      const rounds = m[k] ?? 0;
      const vitorias = m[`total_wins_map_${mapa}`] ?? 0;
      return { id: mapa, mapa: rotularMapa(mapa), rounds, vitorias, taxa: rounds ? (vitorias / rounds) * 100 : null };
    })
    .filter((x) => x.rounds > 0)
    .sort((a, b) => b.rounds - a.rounds);

  return {
    estado: "ok",
    jogador,
    usuarioDoFragiq: usuario
      ? { desde: usuario.createdAt, coletas: usuario.games[0]?._count.snapshots ?? 0 }
      : null,
    horas: Math.round((m.total_time_played ?? 0) / 3600),
    resumo: [
      { rotulo: "K/D", valor: fmt(razao("total_kills", "total_deaths"), 2) },
      { rotulo: "Headshot", valor: fmt(razao("total_kills_headshot", "total_kills", 100), 1, "%") },
      { rotulo: "Vitórias", valor: fmt(razao("total_matches_won", "total_matches_played", 100), 1, "%") },
      { rotulo: "Dano / round", valor: fmt(razao("total_damage_done", "total_rounds_played"), 0) },
      { rotulo: "MVP / partida", valor: fmt(razao("total_mvps", "total_matches_played"), 2) },
      { rotulo: "Kills", valor: fmt(m.total_kills ?? null, 0) },
      { rotulo: "Rounds", valor: fmt(m.total_rounds_played ?? null, 0) },
      { rotulo: "Partidas", valor: fmt(m.total_matches_played ?? null, 0) },
    ],
    armas,
    mapas,
  };
}
