import { prisma } from "./prisma";
import { syncUser, type MatchContext } from "./steam/sync";
import { avisarPrivacidadeSePreciso } from "./mensagem-steam";
import { registrar, reportarErro } from "./eventos";
import { fecharSessao } from "./sessao/materializar";

/**
 * Coleta reativa com memória.
 *
 * O bot de presença vê o fim da partida e avisa; daqui em diante o estado
 * é do banco. Cada pessoa tem no máximo uma captura pendente, com o
 * contexto observado (mapa, modo, placar), quantas vezes já tentamos e
 * quando é a próxima. O bot só serve de relógio: a cada tick processamos
 * o que venceu. Reiniciar o bot, trocar de host ou subir uma segunda
 * instância não perde nada — e o cron pode processar o mesmo balde.
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

export async function agendarCaptura(userId: string, steamId: string, contexto: MatchContext, traceId: string) {
  const dados = {
    steamId,
    matchMap: contexto.map ?? null,
    matchMode: contexto.mode ?? null,
    matchScore: contexto.score ?? null,
    traceId,
    tentativa: 0,
    proximaEm: new Date(Date.now() + GRACE_MS),
  };
  return prisma.pendingCapture.upsert({
    where: { userId },
    create: { userId, ...dados },
    update: dados,
  });
}

export type ResultadoDoTick = {
  processadas: number;
  gravadas: number;
  reagendadas: number;
  desistidas: number;
};

/** Processa as capturas vencidas, uma por vez (rajada contra a Steam custa a chave). */
export async function processarCapturasDevidas(limite = 5): Promise<ResultadoDoTick> {
  const devidas = await prisma.pendingCapture.findMany({
    where: { proximaEm: { lte: new Date() } },
    orderBy: { proximaEm: "asc" },
    take: limite,
  });

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
