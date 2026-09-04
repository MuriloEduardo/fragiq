import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * Game State Integration: o próprio CS2 relatando a partida.
 *
 * Todo o resto do FragIQ deriva desempenho de deltas entre coletas dos
 * contadores vitalícios da Steam. Isso custa caro: a Web API não diz o mapa
 * nem o modo, não conhece Mirage, Ancient, Anubis nem Overpass, e às vezes
 * responde de um nó atrasado com um número menor que o da coleta anterior.
 * Aqui nada disso existe — a partida chega pronta, do cliente do jogador.
 *
 * Dois detalhes do protocolo que decidem a implementação:
 *
 * 1. O segredo vem NO CORPO, no bloco "auth", não em cabeçalho. É a única
 *    coisa que diz de quem é a partida, então ele é a chave de busca.
 *
 * 2. Responder 2XX não é cortesia. A documentação avisa que, sem 2XX, o jogo
 *    considera a entrega falha e volta a mandar estado cheio para sempre, sem
 *    calcular delta. Por isso este handler responde 200 até para payload que
 *    ele ignora, e só devolve erro quando o token não confere.
 *
 * O jogo também não envia um POST enquanto o anterior está em voo, o que dá
 * serialização por jogador de graça: não há corrida entre a leitura da
 * partida aberta e a escrita.
 */

const CS2_APPID = 730;

const schema = z.object({
  auth: z.object({ token: z.string().min(1) }),
  provider: z
    .object({
      appid: z.number().optional(),
      steamid: z.string().optional(),
    })
    .optional(),
  map: z
    .object({
      name: z.string().optional(),
      mode: z.string().optional(),
      phase: z.string().optional(),
      team_ct: z.object({ score: z.number() }).partial().optional(),
      team_t: z.object({ score: z.number() }).partial().optional(),
    })
    .optional(),
  player: z
    .object({
      steamid: z.string().optional(),
      team: z.string().optional(),
      match_stats: z
        .object({
          kills: z.number(),
          assists: z.number(),
          deaths: z.number(),
          mvps: z.number(),
          score: z.number(),
        })
        .partial()
        .optional(),
    })
    .optional(),
});

/** 200 com motivo: o jogo precisa do 2XX, nós precisamos saber por que ignoramos. */
function ignorado(motivo: string) {
  return NextResponse.json({ ok: true, ignored: motivo });
}

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return ignorado("payload fora do formato");

  const { auth, provider, map, player } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { gsiToken: auth.token },
    select: { id: true, steamId: true },
  });
  // Único caso de erro: token desconhecido é configuração errada, e esconder
  // isso atrás de 200 deixaria a pessoa esperando dados que nunca vêm.
  if (!user) return NextResponse.json({ error: "Token desconhecido." }, { status: 401 });

  if (provider?.appid && provider.appid !== CS2_APPID) return ignorado("outro jogo");

  // Assistindo a outra pessoa: o bloco player descreve quem está sendo
  // observado, não o dono da chave. Gravar isso atribuiria a partida alheia.
  if (player?.steamid && provider?.steamid && player.steamid !== provider.steamid) {
    return ignorado("espectando outro jogador");
  }
  if (player?.steamid && player.steamid !== user.steamId) return ignorado("outro steamid");

  const stats = player?.match_stats;
  if (!map?.name || !map.mode || !stats) return ignorado("sem partida no payload");

  const kills = stats.kills ?? 0;
  const deaths = stats.deaths ?? 0;
  const assists = stats.assists ?? 0;
  const mvps = stats.mvps ?? 0;
  const score = stats.score ?? 0;

  const meuTime = player?.team === "CT" ? map.team_ct?.score : map.team_t?.score;
  const outroTime = player?.team === "CT" ? map.team_t?.score : map.team_ct?.score;

  const terminou = map.phase === "gameover";

  const aberta = await prisma.match.findFirst({
    where: { userId: user.id, finishedAt: null },
    orderBy: { startedAt: "desc" },
  });

  /**
   * A mesma partida de antes, ou já é outra?
   *
   * O GSI não numera partidas. Mapa e modo iguais não bastam: duas
   * competitivas seguidas em Mirage seriam a mesma linha. O que separa é o
   * placar pessoal, que zera a cada partida — se os abates andaram para trás,
   * começou outra.
   */
  const mesma =
    aberta !== null &&
    aberta.map === map.name &&
    aberta.mode === map.mode &&
    kills >= aberta.kills &&
    deaths >= aberta.deaths;

  const dados = {
    map: map.name,
    mode: map.mode,
    kills,
    deaths,
    assists,
    mvps,
    score,
    roundsWon: meuTime ?? null,
    roundsLost: outroTime ?? null,
    finishedAt: terminou ? new Date() : null,
  };

  if (mesma) {
    await prisma.match.update({ where: { id: aberta.id }, data: dados });
    return NextResponse.json({ ok: true, match: aberta.id, finished: terminou });
  }

  // Partida anterior que nunca viu "gameover" — o jogador saiu no meio, ou o
  // jogo fechou. Fecha com o que se sabe em vez de deixá-la aberta para
  // sempre roubando os updates da próxima.
  if (aberta) {
    await prisma.match.update({
      where: { id: aberta.id },
      data: { finishedAt: aberta.updatedAt },
    });
  }

  const nova = await prisma.match.create({ data: { userId: user.id, ...dados } });
  return NextResponse.json({ ok: true, match: nova.id, finished: terminou });
}
