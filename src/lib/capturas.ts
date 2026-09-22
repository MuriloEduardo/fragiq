import { prisma } from "./prisma";
import { syncUser, type MatchContext } from "./steam/sync";
import { avisarPrivacidadeSePreciso } from "./mensagem-steam";
import { registrar, reportarErro } from "./eventos";
import { fecharSessao } from "./sessao/materializar";

/**
 * Coleta reativa com memória.
 *
 * O bot de presença vê o fim da partida e avisa; daqui em diante o estado
 * é do banco. Cada **partida observada** tem a sua captura pendente, com o
 * contexto (mapa, modo, placar), quantas vezes já tentamos e quando é a
 * próxima. O bot só serve de relógio: a cada tick processamos o que
 * venceu. Reiniciar o bot, trocar de host ou subir uma segunda instância
 * não perde nada — e o cron pode processar o mesmo balde.
 *
 * Era uma captura por *pessoa*, com upsert. Quem jogava duas partidas
 * seguidas perdia a primeira: o segundo aviso sobrescrevia a captura que
 * ainda esperava a Steam publicar a primeira, e o ponto que vinha depois
 * cobria as duas. A sessão nascia então com duas, quatro, cinco partidas
 * dentro — um ponto de gráfico que não é o desempenho de partida nenhuma.
 * A unicidade mudou de lugar: é da observação, que é o que de fato não
 * pode entrar duas vezes na fila.
 */

const CS2_APPID = 730;

/** A Steam demora a publicar depois que a partida acaba; a primeira tentativa espera isto. */
const GRACE_MS = 90_000;
/**
 * Esperas seguintes. Medido em 12/09/2026: mais de 5 minutos depois de
 * sair do jogo as stats continuavam velhas; o prazo varia, então
 * perguntamos até mudar.
 */
const RETRY_MS = [2, 4, 8, 16].map((min) => min * 60_000);
/** Janela em que um ponto sem contexto ainda é "a partida que o bot viu". */
const JANELA_ANEXO_MS = 30 * 60_000;

/**
 * Quantas capturas de uma pessoa podem estar na fila ao mesmo tempo.
 *
 * Existe porque o rich presence pode oscilar (entrar e sair do lobby
 * várias vezes) e cada oscilação é um aviso. Seis cobre uma noite inteira
 * de Premier com folga; acima disso é ruído, e o cron pega o resto.
 */
const NA_FILA_POR_PESSOA = 6;

export async function agendarCaptura(
  userId: string,
  steamId: string,
  contexto: MatchContext,
  traceId: string,
  observacaoId: string | null,
) {
  const dados = {
    userId,
    steamId,
    observacaoId,
    matchMap: contexto.map ?? null,
    matchMode: contexto.mode ?? null,
    matchScore: contexto.score ?? null,
    traceId,
    tentativa: 0,
    proximaEm: new Date(Date.now() + GRACE_MS),
  };

  // Sem observação (bot antigo, que não manda o id) não há chave de
  // idempotência: cai no comportamento de antes, uma por pessoa, porque
  // duas entradas indistinguíveis na fila seriam duas coletas iguais.
  if (!observacaoId) {
    const pendente = await prisma.pendingCapture.findFirst({ where: { userId, observacaoId: null } });
    if (pendente) return prisma.pendingCapture.update({ where: { id: pendente.id }, data: dados });
    return prisma.pendingCapture.create({ data: dados });
  }

  const criada = await prisma.pendingCapture.upsert({
    where: { observacaoId },
    create: dados,
    update: dados,
  });

  // A fila é por partida, mas não é infinita: sobra a mais recente.
  const excedente = await prisma.pendingCapture.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: NA_FILA_POR_PESSOA,
    select: { id: true },
  });
  if (excedente.length) {
    await prisma.pendingCapture.deleteMany({ where: { id: { in: excedente.map((e) => e.id) } } });
  }
  return criada;
}

export type ResultadoDoTick = {
  processadas: number;
  gravadas: number;
  reagendadas: number;
  desistidas: number;
};

/** Processa as capturas vencidas, uma por vez (rajada contra a Steam custa a chave). */
export async function processarCapturasDevidas(limite = 5): Promise<ResultadoDoTick> {
  const candidatas = await prisma.pendingCapture.findMany({
    where: { proximaEm: { lte: new Date() } },
    orderBy: { proximaEm: "asc" },
    take: limite * 4,
  });
  // Uma por pessoa por rodada: duas coletas do mesmo jogador com segundos
  // de diferença leem o mesmo estado da Steam e a segunda não vira ponto.
  // A outra continua na fila e é processada no tick seguinte.
  const vistos = new Set<string>();
  const devidas = candidatas.filter((c) => !vistos.has(c.userId) && vistos.add(c.userId)).slice(0, limite);

  const r: ResultadoDoTick = { processadas: 0, gravadas: 0, reagendadas: 0, desistidas: 0 };
  for (const c of devidas) {
    r.processadas++;
    const contexto: MatchContext = {
      map: c.matchMap ?? undefined,
      mode: c.matchMode ?? undefined,
      score: c.matchScore ?? undefined,
    };

    let gravou = false;
    try {
      // O trace é o do aviso do bot: é assim que o ponto gravado aqui aponta
      // de volta para a observação que o pediu.
      const result = await syncUser(c.userId, c.steamId, "EVENT", contexto, c.traceId ?? undefined);
      gravou = result.snapshotsCreated > 0 || (await anexarContexto(c.userId, contexto));
    } catch (err) {
      await reportarErro("capturas.sync", err, c.userId);
    }

    if (gravou) {
      await prisma.pendingCapture.deleteMany({ where: { id: c.id } });
      r.gravadas++;
      continue;
    }

    const espera = RETRY_MS[c.tentativa];
    if (espera === undefined) {
      // Quatro tentativas sem a partida aparecer: ou a Steam nunca vai
      // mostrar ("Detalhes do jogo" privado — e a pessoa fica sabendo) ou
      // o cron das 02:00 pega. Guardar mais não ajuda.
      await prisma.pendingCapture.deleteMany({ where: { id: c.id } });
      const avisou = await avisarPrivacidadeSePreciso(c.userId, c.steamId).catch((e) => {
        void reportarErro("capturas.avisoPrivacidade", e, c.userId);
        return false;
      });
      await registrar("captura.desistida", { userId: c.userId, traceId: c.traceId, dados: { mapa: c.matchMap, avisouPrivacidade: avisou } });
      r.desistidas++;
      continue;
    }

    await prisma.pendingCapture.updateMany({
      where: { id: c.id },
      data: { tentativa: c.tentativa + 1, proximaEm: new Date(Date.now() + espera) },
    });
    r.reagendadas++;
  }
  return r;
}

/**
 * Dá mapa e modo ao último ponto de CS2 quando ele nasceu sem — e há pouco.
 *
 * Quem clicou em Sincronizar logo depois da partida já tem o ponto, mas
 * sem contexto: o botão não sabe dele. Só o último, só se ainda não tiver
 * mapa (o que só tem modo foi marcado à mão; o bot sabe mais), e só se
 * for recente — um ponto do cron de ontem não é a partida de agora.
 */
async function anexarContexto(userId: string, contexto: MatchContext): Promise<boolean> {
  if (!contexto.map && !contexto.mode) return false;

  const userGame = await prisma.userGame.findUnique({
    where: { userId_gameAppId: { userId, gameAppId: CS2_APPID } },
    select: {
      snapshots: {
        orderBy: { capturedAt: "desc" },
        take: 1,
        select: { id: true, capturedAt: true, matchMap: true },
      },
    },
  });
  const ultimo = userGame?.snapshots[0];
  if (!ultimo || ultimo.matchMap) return false;
  if (Date.now() - ultimo.capturedAt.getTime() > JANELA_ANEXO_MS) return false;

  await prisma.statSnapshot.update({
    where: { id: ultimo.id },
    data: {
      matchMap: contexto.map ?? null,
      matchMode: contexto.mode ?? null,
      matchScore: contexto.score ?? null,
    },
  });
  // A marca mudou a prova; a sessão que este ponto fecha é refeita.
  await fecharSessao(ultimo.id).catch((e) => console.error("[capturas] sessão não refez:", e instanceof Error ? e.message : e));
  return true;
}
