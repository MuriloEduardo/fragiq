import type { DemoPayload, Lado, Morte, Round } from "./payload";

/**
 * As métricas de cada jogador numa partida, calculadas dos fatos da demo.
 *
 * Função pura e versionada (`REGRAS_VERSAO`): mudou uma definição, sobe a
 * versão e o recompute refaz tudo do `MatchDemo.dados`, que guarda os
 * eventos inteiros. As definições seguem o que o mercado chama pelo mesmo
 * nome (ADR, KAST, abertura, troca, clutch), com o critério explícito
 * aqui e em docs/demos.md — sem "rating" composto, porque um número que
 * mistura tudo esconde o que a série temporal existe para mostrar.
 *
 * Isto é a camada de **conversão** da linguagem tática: o que aconteceu e
 * a quem se atribui. As camadas de espaço (zonas) e recurso (utilitário)
 * entram aqui como contagem; a leitura tática — o que a ocupação forçou, o
 * que a granada comprou — é trabalho de cima, ainda por escrever.
 */

/**
 * Versão 2 desde 2026-09-21: a linha de time ganhou o ritmo (`ritmo.ts`).
 * Versão 3 desde 2026-09-25: a linha de jogador ganhou o ADR e as kills
 * por compra (`economia.ts`). Nenhuma definição antiga mudou, mas a versão
 * é da rodada de recompute, não de cada coluna: linha com `versaoRegras`
 * menor é linha gravada antes da coluna existir.
 */
export const REGRAS_VERSAO = 3;

/** Demos de matchmaking são gravadas a 64 ticks por segundo. */
export const TICKS_POR_S = 64;
/** Uma morte é "trocada" se um aliado mata o autor em até 5 s — o prazo que o HLTV usa. */
export const JANELA_TROCA_TICKS = 5 * TICKS_POR_S;
/** Armas cujo dano conta como utilitário. */
const UTILITARIO = new Set(["hegrenade", "inferno", "molotov", "incgrenade"]);

export type Metricas = {
  steamId: string;
  rounds: number;
  kills: number;
  deaths: number;
  assists: number;
  hs: number;
  dano: number;
  danoSofrido: number;
  adr: number;
  kast: number;
  aberturas: number;
  aberturasPerdidas: number;
  trocas: number;
  mortesTrocadas: number;
  multi2: number;
  multi3: number;
  multi4: number;
  multi5: number;
  clutches: number;
  clutchesGanhos: number;
  inimigosCegados: number;
  aliadosCegados: number;
  segundosCegando: number;
  flashAssists: number;
  danoUtil: number;
  granadas: number;
  sobreviveu: number;
  vidaMediaS: number | null;
  zonas: Record<Lado, Record<string, number>>;
  rating: { tipo: number; antes: number; depois: number; mudanca: number; vitorias: number } | null;
};

type Acumulador = Omit<Metricas, "adr" | "kast" | "vidaMediaS" | "rating"> & {
  roundsKast: number;
  vidaTicks: number;
  mortesComTempo: number;
  rating: Metricas["rating"];
};

function vazio(steamId: string): Acumulador {
  return {
    steamId,
    rounds: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    hs: 0,
    dano: 0,
    danoSofrido: 0,
    aberturas: 0,
    aberturasPerdidas: 0,
    trocas: 0,
    mortesTrocadas: 0,
    multi2: 0,
    multi3: 0,
    multi4: 0,
    multi5: 0,
    clutches: 0,
    clutchesGanhos: 0,
    inimigosCegados: 0,
    aliadosCegados: 0,
    segundosCegando: 0,
    flashAssists: 0,
    danoUtil: 0,
    granadas: 0,
    sobreviveu: 0,
    zonas: { CT: {}, T: {} },
    roundsKast: 0,
    vidaTicks: 0,
    mortesComTempo: 0,
    rating: null,
  };
}

/**
 * Os rounds que foram jogados: os que têm vencedor e não terminaram em
 * rendição. É o denominador de tudo que se calcula da demo — aqui e em
 * `conversao.ts` —, por isso mora num lugar só.
 */
export function roundsJogados(p: DemoPayload): Round[] {
  return p.rounds.filter((r) => r.n >= 1 && r.vencedor && !r.motivo?.endsWith("surrender"));
}

/**
 * De que lado cada jogador esteve em cada round. A demo não tem "escalação"
 * por round; o lado vem do primeiro evento do jogador no round (zona,
 * morte, dano). Quem não aparece num round não jogou nele — é assim que
 * quem saiu no meio deixa de contar.
 */
export function ladosPorRound(p: DemoPayload): Map<number, Map<string, Lado>> {
  const lados = new Map<number, Map<string, Lado>>();
  const marcar = (round: number, quem: string | null, lado: Lado | null) => {
    if (!quem || !lado || round < 1) return;
    let doRound = lados.get(round);
    if (!doRound) lados.set(round, (doRound = new Map()));
    if (!doRound.has(quem)) doRound.set(quem, lado);
  };
  for (const e of p.eventos) {
    if (e.t === "zona") marcar(e.round, e.jogador, e.lado);
    else if (e.t === "morte") {
      marcar(e.round, e.vitima, e.ladoVitima);
      marcar(e.round, e.autor, e.ladoAutor);
    }
  }
  return lados;
}

export function metricasDaDemo(p: DemoPayload): Metricas[] {
  const acc = new Map<string, Acumulador>();
  const de = (steamId: string) => {
    let a = acc.get(steamId);
    if (!a) acc.set(steamId, (a = vazio(steamId)));
    return a;
  };
  for (const j of p.jogadores) de(j.steamId);

  // Um round rendido não foi jogado: ninguém "sobreviveu" nele.
  const rounds = roundsJogados(p);
  const lados = ladosPorRound(p);
  const porRound = new Map<number, DemoPayload["eventos"]>();
  for (const e of p.eventos) {
    if (e.t === "rank") {
      de(e.jogador).rating = { tipo: e.tipo, antes: e.antes, depois: e.depois, mudanca: e.mudanca, vitorias: e.vitorias };
      continue;
    }
    if (!porRound.has(e.round)) porRound.set(e.round, []);
    porRound.get(e.round)!.push(e);
  }

  for (const round of rounds) {
    const lado = lados.get(round.n) ?? new Map<string, Lado>();
    const eventos = porRound.get(round.n) ?? [];
    const presentes = [...lado.keys()];
    for (const quem of presentes) de(quem).rounds++;

    const mortes = eventos.filter((e): e is Morte => e.t === "morte");
    const kills = new Map<string, number>();
    const assistiu = new Set<string>();
    const morreu = new Set<string>();
    const trocado = new Set<string>();
    const vivos: Record<Lado, Set<string>> = { CT: new Set(), T: new Set() };
    for (const [quem, l] of lado) vivos[l].add(quem);
    const emClutch = new Set<string>();

    let abriu = false;
    for (const m of mortes) {
      const inimigo = m.autor && m.ladoAutor && m.ladoAutor !== m.ladoVitima;
      morreu.add(m.vitima);
      de(m.vitima).deaths++;
      if (round.jogo != null && m.tick >= round.jogo) {
        const a = de(m.vitima);
        a.vidaTicks += m.tick - round.jogo;
        a.mortesComTempo++;
      }
      if (inimigo && m.autor) {
        const a = de(m.autor);
        a.kills++;
        if (m.hs) a.hs++;
        kills.set(m.autor, (kills.get(m.autor) ?? 0) + 1);
        if (!abriu) {
          abriu = true;
          a.aberturas++;
          de(m.vitima).aberturasPerdidas++;
        }
        // Troca: este autor acabou de vingar um aliado que o morto matou há menos de 5 s.
        const vingada = mortes.find(
          (k) => k !== m && k.autor === m.vitima && k.ladoVitima === m.ladoAutor && k.tick <= m.tick && m.tick - k.tick <= JANELA_TROCA_TICKS && k.vitima !== m.autor,
        );
        if (vingada) {
          a.trocas++;
          if (!trocado.has(vingada.vitima)) {
            trocado.add(vingada.vitima);
            de(vingada.vitima).mortesTrocadas++;
          }
        }
      }
      if (m.assistente && m.assistente !== m.autor) {
        if (m.flashAssist) de(m.assistente).flashAssists++;
        else {
          de(m.assistente).assists++;
          assistiu.add(m.assistente);
        }
      }
      // Clutch: quem fica sozinho do seu lado com inimigo vivo entra em situação; ganha se o round for dele.
      vivos[m.ladoVitima].delete(m.vitima);
      for (const l of ["CT", "T"] as const) {
        const outro: Lado = l === "CT" ? "T" : "CT";
        if (vivos[l].size === 1 && vivos[outro].size >= 1) {
          const [ultimo] = vivos[l];
          if (!emClutch.has(ultimo)) {
            emClutch.add(ultimo);
            de(ultimo).clutches++;
            if (round.vencedor === l) de(ultimo).clutchesGanhos++;
          }
        }
      }
    }

    for (const d of danosEntreLados(eventos, lado)) {
      const a = de(d.autor);
      a.dano += d.efetivo;
      if (UTILITARIO.has(d.arma)) a.danoUtil += d.efetivo;
      de(d.vitima).danoSofrido += d.efetivo;
    }
    for (const e of eventos) {
      if (e.t === "cego") {
        if (!e.autor || e.autor === e.vitima) continue;
        const a = de(e.autor);
        if (lado.get(e.autor) !== lado.get(e.vitima)) {
          a.inimigosCegados++;
          a.segundosCegando += e.segundos;
        } else a.aliadosCegados++;
      } else if (e.t === "granada") {
        if (e.autor) de(e.autor).granadas++;
      }
    }

    for (const quem of presentes) {
      const a = de(quem);
      const k = kills.get(quem) ?? 0;
      if (k === 2) a.multi2++;
      else if (k === 3) a.multi3++;
      else if (k === 4) a.multi4++;
      else if (k >= 5) a.multi5++;
      const sobreviveu = !morreu.has(quem);
      if (sobreviveu) a.sobreviveu++;
      if (k > 0 || assistiu.has(quem) || sobreviveu || trocado.has(quem)) a.roundsKast++;
    }

    somarZonas(eventos, round, morreu, mortes, acc);
  }

  return [...acc.values()]
    .filter((a) => a.rounds > 0 || a.rating)
    .map((a) => {
      const { roundsKast, vidaTicks, mortesComTempo, ...resto } = a;
      return {
        ...resto,
        adr: a.rounds ? Math.round((a.dano / a.rounds) * 10) / 10 : 0,
        kast: a.rounds ? Math.round((roundsKast / a.rounds) * 1000) / 1000 : 0,
        segundosCegando: Math.round(a.segundosCegando * 10) / 10,
        vidaMediaS: mortesComTempo ? Math.round((vidaTicks / mortesComTempo / TICKS_POR_S) * 10) / 10 : null,
      };
    });
}

/**
 * O dano de um round que conta para ADR: entre lados opostos e limitado à
 * vida que a vítima tinha — o evento pode dizer 108 num jogador com 30. Os
 * eventos são os do round, em ordem; `lado` é o de `ladosPorRound`.
 */
export function danosEntreLados(eventos: DemoPayload["eventos"], lado: Map<string, Lado>): { autor: string; vitima: string; arma: string; efetivo: number }[] {
  const vida = new Map<string, number>();
  const danos: { autor: string; vitima: string; arma: string; efetivo: number }[] = [];
  for (const e of eventos) {
    if (e.t !== "dano") continue;
    const antes = vida.get(e.vitima) ?? 100;
    const efetivo = Math.max(0, Math.min(e.vida, antes));
    vida.set(e.vitima, e.restou);
    const ladoAutor = e.autor ? lado.get(e.autor) : undefined;
    const ladoVitima = lado.get(e.vitima);
    if (e.autor && e.autor !== e.vitima && ladoAutor && ladoVitima && ladoAutor !== ladoVitima) {
      danos.push({ autor: e.autor, vitima: e.vitima, arma: e.arma, efetivo });
    }
  }
  return danos;
}

/**
 * Segundos em cada zona, por lado. O bot só grava a zona quando ela muda,
 * então cada registro vale até o próximo do mesmo jogador, até a morte
 * dele ou até o fim do round — o que vier primeiro.
 */
function somarZonas(eventos: DemoPayload["eventos"], round: Round, morreu: Set<string>, mortes: Morte[], acc: Map<string, Acumulador>) {
  const porJogador = new Map<string, { tick: number; lado: Lado; zona: string | null }[]>();
  for (const e of eventos) {
    if (e.t !== "zona") continue;
    if (!porJogador.has(e.jogador)) porJogador.set(e.jogador, []);
    porJogador.get(e.jogador)!.push(e);
  }
  for (const [quem, zonas] of porJogador) {
    const a = acc.get(quem);
    if (!a) continue;
    const morte = morreu.has(quem) ? (mortes.find((m) => m.vitima === quem)?.tick ?? round.fim) : round.fim;
    for (let i = 0; i < zonas.length; i++) {
      const z = zonas[i];
      if (!z.zona) continue;
      const fim = Math.min(zonas[i + 1]?.tick ?? round.fim, morte, round.fim);
      const segundos = (fim - z.tick) / TICKS_POR_S;
      if (segundos <= 0) continue;
      a.zonas[z.lado][z.zona] = Math.round(((a.zonas[z.lado][z.zona] ?? 0) + segundos) * 10) / 10;
    }
  }
}
