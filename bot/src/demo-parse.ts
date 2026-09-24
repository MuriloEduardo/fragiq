import { parseEvents, parseHeader, parsePlayerInfo, parseTicks } from "@laihoe/demoparser2";

/**
 * Uma demo inteira reduzida ao que o site precisa para calcular métricas.
 *
 * Roda como processo filho (`tsx src/demo-parse.ts arquivo.dem`) e escreve
 * o JSON em stdout: o parser carrega a demo em memória (~200 MB para uma
 * partida curta, mais para uma longa) e, se a instância não aguentar, é
 * este processo que morre — não a conexão com a Steam.
 *
 * O que sai daqui é fato, não métrica: quem morreu, onde, com o quê, quem
 * cegou quem, onde cada granada caiu, por onde cada jogador andou. ADR,
 * KAST, trocas e clutches são regras do site (`src/lib/demo/metricas.ts`),
 * calculadas do que está aqui e recalculáveis quando a regra mudar. As
 * medições que sustentam o formato estão em docs/demos.md.
 */

/** 2: `round.economia` (dinheiro e equipamento de cada um no fim do freeze). */
export const VERSAO_PAYLOAD = 2;

/** A cada quantos ticks olhamos a posição de cada jogador (64 = 1 s). */
const PASSO_POSICAO = 64;

type Lado = "CT" | "T";

export type Jogador = { steamId: string; nome: string };

/** Com quanto um jogador entrou no round: o que sobrou no bolso e o que carrega, no fim do freeze. */
export type Economia = { steamId: string; lado: Lado; saldo: number; equipamento: number };

export type Round = {
  n: number;
  inicio: number;
  /** Fim do freeze (o round de verdade começa aqui); null se a demo não marcou. */
  jogo: number | null;
  fim: number;
  vencedor: Lado | null;
  motivo: string | null;
  /** Amostra do fim do freeze; vazia no round sem `jogo`. */
  economia: Economia[];
};

export type Evento =
  | {
      t: "morte";
      tick: number;
      round: number;
      vitima: string;
      ladoVitima: Lado;
      zonaVitima: string | null;
      autor: string | null;
      ladoAutor: Lado | null;
      zonaAutor: string | null;
      assistente: string | null;
      flashAssist: boolean;
      arma: string;
      hs: boolean;
      atravesSmoke: boolean;
      cego: boolean;
      noscope: boolean;
      penetrou: boolean;
      distancia: number;
      /** Posição de quem morreu e de quem matou, em unidades do mapa. */
      pos: [number, number, number] | null;
      posAutor: [number, number, number] | null;
    }
  | {
      t: "dano";
      tick: number;
      round: number;
      vitima: string;
      autor: string | null;
      arma: string;
      vida: number;
      colete: number;
      parte: string;
      /** Vida da vítima depois do dano. */
      restou: number;
    }
  | { t: "cego"; tick: number; round: number; vitima: string; autor: string | null; segundos: number }
  | {
      t: "granada";
      tick: number;
      round: number;
      tipo: "smoke" | "flash" | "he" | "molotov" | "decoy";
      autor: string | null;
      pos: [number, number, number];
    }
  | { t: "bomba"; tick: number; round: number; acao: "plantando" | "plantada" | "desarmada" | "explodiu"; autor: string | null; site: string | null }
  | { t: "zona"; tick: number; round: number; jogador: string; lado: Lado; zona: string | null }
  | { t: "saiu"; tick: number; round: number; jogador: string; motivo: number }
  | {
      t: "rank";
      tick: number;
      jogador: string;
      tipo: number;
      antes: number;
      depois: number;
      mudanca: number;
      vitorias: number;
    };

export type Tiros = Record<string, Record<string, number>>;

export type DemoPayload = {
  versao: number;
  parser: string;
  mapa: string | null;
  servidor: string | null;
  ticks: number;
  jogadores: Jogador[];
  rounds: Round[];
  eventos: Evento[];
  /** Tiros por jogador e por arma, na partida inteira. O evento cru é o maior da demo e não vale o peso. */
  tiros: Tiros;
};

type Linha = Record<string, unknown>;

const s = (v: unknown) => (typeof v === "string" && v ? v : null);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const b = (v: unknown) => v === true;
const lado = (v: unknown): Lado | null => (v === "CT" ? "CT" : v === "TERRORIST" ? "T" : null);
const pos = (x: unknown, y: unknown, z: unknown): [number, number, number] | null =>
  typeof x === "number" && typeof y === "number" && typeof z === "number" ? [Math.round(x), Math.round(y), Math.round(z)] : null;

const EVENTOS = [
  "player_death",
  "player_hurt",
  "player_blind",
  "smokegrenade_detonate",
  "flashbang_detonate",
  "hegrenade_detonate",
  "inferno_startburn",
  "decoy_started",
  "bomb_beginplant",
  "bomb_planted",
  "bomb_defused",
  "bomb_exploded",
  "round_start",
  "round_end",
  "round_freeze_end",
  "rank_update",
  "player_disconnect",
  "weapon_fire",
];
const EXTRAS_JOGADOR = ["X", "Y", "Z", "last_place_name", "team_name"];
const EXTRAS = ["total_rounds_played", "is_warmup_period"];

export function extrairDemo(arquivo: string): DemoPayload {
  const cabecalho = parseHeader(arquivo) as Linha;
  const jogadores: Jogador[] = (parsePlayerInfo(arquivo) as Linha[])
    .filter((p) => s(p.steamid))
    .map((p) => ({ steamId: String(p.steamid), nome: s(p.name) ?? "" }));

  const cru = (parseEvents(arquivo, EVENTOS, EXTRAS_JOGADOR, EXTRAS) as Linha[]).sort((a, c) => n(a.tick) - n(c.tick));

  // Rounds pelo par start/end que o parser reconstrói do estado do jogo;
  // o freeze_end (quando dá para andar) casa pelo tick entre os dois.
  const inicios = cru.filter((e) => e.event_name === "round_start");
  const fins = cru.filter((e) => e.event_name === "round_end");
  const freezes = cru.filter((e) => e.event_name === "round_freeze_end").map((e) => n(e.tick));
  const rounds: Round[] = fins.map((fim, i) => {
    const inicio = n(inicios[i]?.tick ?? (i === 0 ? 0 : fins[i - 1]?.tick));
    const jogo = freezes.find((t) => t >= inicio && t <= n(fim.tick)) ?? null;
    return {
      n: n(fim.round) || i + 1,
      inicio,
      jogo,
      fim: n(fim.tick),
      vencedor: fim.winner === "CT" ? "CT" : fim.winner === "T" ? "T" : null,
      motivo: s(fim.reason),
      economia: [],
    };
  });

  // Economia: uma amostra por round, no fim do freeze — o mesmo zero do
  // ritmo. É ali que o round começa, e o equipamento que cada um carrega é
  // a compra que ele fez (as armas guardadas do round anterior incluídas).
  const freezesDosRounds = rounds.flatMap((r) => (r.jogo == null ? [] : [r.jogo]));
  if (freezesDosRounds.length > 0) {
    const porTick = new Map(rounds.filter((r) => r.jogo != null).map((r) => [r.jogo!, r]));
    for (const a of parseTicks(arquivo, ["balance", "current_equip_value", "team_name"], freezesDosRounds) as Linha[]) {
      const quem = s(a.steamid);
      const ladoDele = lado(a.team_name);
      const round = porTick.get(n(a.tick));
      if (!quem || !ladoDele || !round) continue;
      round.economia.push({ steamId: quem, lado: ladoDele, saldo: n(a.balance), equipamento: n(a.current_equip_value) });
    }
  }
  const roundDoTick = (tick: number) => rounds.find((r) => tick >= r.inicio && tick <= r.fim)?.n ?? 0;

  const eventos: Evento[] = [];
  const tiros: Tiros = {};
  for (const e of cru) {
    if (b(e.is_warmup_period)) continue;
    const tick = n(e.tick);
    const round = roundDoTick(tick);
    switch (e.event_name) {
      case "player_death":
        eventos.push({
          t: "morte",
          tick,
          round,
          vitima: String(e.user_steamid ?? ""),
          ladoVitima: lado(e.user_team_name) ?? "T",
          zonaVitima: s(e.user_last_place_name),
          autor: s(e.attacker_steamid),
          ladoAutor: lado(e.attacker_team_name),
          zonaAutor: s(e.attacker_last_place_name),
          assistente: s(e.assister_steamid),
          flashAssist: b(e.assistedflash),
          arma: s(e.weapon) ?? "",
          hs: b(e.headshot),
          atravesSmoke: b(e.thrusmoke),
          cego: b(e.attackerblind),
          noscope: b(e.noscope),
          penetrou: n(e.penetrated) > 0,
          distancia: Math.round(n(e.distance) * 10) / 10,
          pos: pos(e.user_X, e.user_Y, e.user_Z),
          posAutor: pos(e.attacker_X, e.attacker_Y, e.attacker_Z),
        });
        break;
      case "player_hurt":
        eventos.push({
          t: "dano",
          tick,
          round,
          vitima: String(e.user_steamid ?? ""),
          autor: s(e.attacker_steamid),
          arma: s(e.weapon) ?? "",
          vida: n(e.dmg_health),
          colete: n(e.dmg_armor),
          parte: s(e.hitgroup) ?? "",
          restou: n(e.health),
        });
        break;
      case "player_blind":
        eventos.push({
          t: "cego",
          tick,
          round,
          vitima: String(e.user_steamid ?? ""),
          autor: s(e.attacker_steamid),
          segundos: Math.round(n(e.blind_duration) * 100) / 100,
        });
        break;
      case "smokegrenade_detonate":
      case "flashbang_detonate":
      case "hegrenade_detonate":
      case "inferno_startburn":
      case "decoy_started": {
        const tipo =
          e.event_name === "smokegrenade_detonate"
            ? "smoke"
            : e.event_name === "flashbang_detonate"
              ? "flash"
              : e.event_name === "hegrenade_detonate"
                ? "he"
                : e.event_name === "inferno_startburn"
                  ? "molotov"
                  : "decoy";
        const p = pos(e.x, e.y, e.z);
        if (p) eventos.push({ t: "granada", tick, round, tipo, autor: s(e.user_steamid), pos: p });
        break;
      }
      case "bomb_beginplant":
      case "bomb_planted":
      case "bomb_defused":
      case "bomb_exploded": {
        const acao =
          e.event_name === "bomb_beginplant"
            ? "plantando"
            : e.event_name === "bomb_planted"
              ? "plantada"
              : e.event_name === "bomb_defused"
                ? "desarmada"
                : "explodiu";
        eventos.push({ t: "bomba", tick, round, acao, autor: s(e.user_steamid), site: e.site == null ? null : String(e.site) });
        break;
      }
      case "player_disconnect":
        if (s(e.user_steamid)) eventos.push({ t: "saiu", tick, round, jogador: String(e.user_steamid), motivo: n(e.reason) });
        break;
      case "rank_update":
        eventos.push({
          t: "rank",
          tick,
          jogador: String(e.user_steamid ?? ""),
          tipo: n(e.rank_type_id),
          antes: n(e.rank_old),
          depois: n(e.rank_new),
          mudanca: n(e.rank_change),
          vitorias: n(e.num_wins),
        });
        break;
      case "weapon_fire": {
        const quem = s(e.user_steamid);
        const arma = s(e.weapon);
        if (!quem || !arma || arma.includes("knife")) break;
        // O evento de tiro chama a arma de `weapon_ak47`; o de morte, de `ak47`. Um nome só.
        const nome = arma.replace(/^weapon_/, "");
        const porArma = (tiros[quem] ??= {});
        porArma[nome] = (porArma[nome] ?? 0) + 1;
        break;
      }
    }
  }

  // Posição amostrada a cada segundo, guardada só quando muda de zona: é o
  // que "controle de mapa" precisa, a uma fração do tamanho dos ticks.
  const ultimoTick = rounds.at(-1)?.fim ?? n(cabecalho.ticks);
  const ticksQueridos: number[] = [];
  for (let t = 0; t <= ultimoTick; t += PASSO_POSICAO) ticksQueridos.push(t);
  const amostras = parseTicks(arquivo, ["last_place_name", "team_name", "is_alive"], ticksQueridos) as Linha[];
  // Todo jogador ganha um registro na primeira amostra de cada round — é
  // assim que o site sabe quem estava no round e de que lado, mesmo quem
  // não saiu do lugar.
  const ultimaZona = new Map<string, string>();
  let roundAtual = -1;
  for (const a of amostras) {
    const quem = s(a.steamid);
    const ladoDele = lado(a.team_name);
    if (!quem || !ladoDele || a.is_alive === false) continue;
    const tick = n(a.tick);
    const round = roundDoTick(tick);
    if (round !== roundAtual) {
      roundAtual = round;
      ultimaZona.clear();
    }
    const zona = s(a.last_place_name);
    const chave = `${quem}:${ladoDele}:${zona ?? ""}`;
    if (ultimaZona.get(quem) === chave) continue;
    ultimaZona.set(quem, chave);
    eventos.push({ t: "zona", tick, round, jogador: quem, lado: ladoDele, zona });
  }
  eventos.sort((a, c) => a.tick - c.tick);

  return {
    versao: VERSAO_PAYLOAD,
    parser: "demoparser2@0.42.0",
    mapa: s(cabecalho.map_name),
    servidor: s(cabecalho.server_name),
    ticks: ultimoTick,
    jogadores,
    rounds,
    eventos,
    tiros,
  };
}

const arquivo = process.argv[2];
if (arquivo && import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(JSON.stringify(extrairDemo(arquivo)));
}
