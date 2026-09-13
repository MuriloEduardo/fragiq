import { prisma } from "./prisma";
import { cogniflow } from "./env";
import { enviarPergunta } from "./cogniflow";
import { deltaEntre, paresDeMovimento, type SnapshotRow } from "./series";
import { coerce } from "./fonte";

/**
 * Depois disto uma pergunta sem resposta é dada como perdida, para não
 * travar a próxima. O cogniflow costuma responder em segundos; dois minutos
 * cobrem uma fila cheia e um modelo lento.
 */
export const TIMEOUT_MS = 2 * 60 * 1000;

export type AnaliseDTO = {
  id: string;
  kind: "SESSION" | "QUESTION";
  question: string;
  answer: string | null;
  status: "PENDING" | "ACKNOWLEDGED" | "ANSWERED" | "FAILED";
  createdAt: string;
  answeredAt: string | null;
};

/** As últimas perguntas do jogador para o jogo, da mais recente à mais antiga. */
export async function listarAnalises(userId: string, appId: number): Promise<AnaliseDTO[]> {
  const rows = await prisma.analysis.findMany({
    where: { userId, gameAppId: appId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      kind: true,
      question: true,
      answer: true,
      status: true,
      createdAt: true,
      answeredAt: true,
    },
  });
  const limite = Date.now() - TIMEOUT_MS;
  return rows.map((r) => ({
    ...r,
    // Uma pendente velha demais é apresentada como perdida, sem escrever no
    // banco: se a resposta chegar atrasada, o callback ainda a encontra.
    status:
      (r.status === "PENDING" || r.status === "ACKNOWLEDGED") && r.createdAt.getTime() < limite
        ? "FAILED"
        : r.status,
    createdAt: r.createdAt.toISOString(),
    answeredAt: r.answeredAt?.toISOString() ?? null,
  }));
}

/* -------------------------- análise automática ---------------------------- */

const DATA_HORA: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
};

/**
 * A análise chega sozinha.
 *
 * Ninguém deveria ter que perguntar "como fui?" depois de cada partida —
 * essa é a pergunta que o produto existe para responder. Toda coleta que
 * fecha uma sessão (rounds subiram desde o ponto anterior) pede ao analista
 * uma leitura daquela sessão, e a resposta pousa na página antes de a pessoa
 * abrir.
 *
 * Idempotente por coleta: `snapshotId` é único, então o cron, o bot e a
 * própria página podem pedir a mesma sessão e só uma análise nasce. Quem
 * chega segundo recebe a que já existe.
 */
export async function garantirAnaliseDaSessao(
  userId: string,
  appId: number,
): Promise<{ id: string; criada: boolean } | null> {
  const config = cogniflow();
  if (!config) return null;

  const sessao = await sessaoMaisRecente(userId, appId);
  if (!sessao) return null;

  const existente = await prisma.analysis.findUnique({
    where: { snapshotId: sessao.snapshotId },
    select: { id: true },
  });
  if (existente) return { id: existente.id, criada: false };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { personaName: true },
  });
  if (!user) return null;

  const quando = sessao.capturedAt.toLocaleString("pt-BR", DATA_HORA).replace(".", "");
  const texto =
    `Nova sessão registrada em ${quando}: ${sessao.rounds} round${sessao.rounds === 1 ? "" : "s"}` +
    (sessao.partidas ? ` em ${sessao.partidas} partida${sessao.partidas === 1 ? "" : "s"}` : "") +
    `. Analise esta sessão contra o meu normal sem que eu precise perguntar: ` +
    `o que mudou, o que pesou de verdade e o que fazer na próxima. Comece pela view resumo.`;

  let analysis: { id: string };
  try {
    analysis = await prisma.analysis.create({
      data: {
        userId,
        gameAppId: appId,
        kind: "SESSION",
        snapshotId: sessao.snapshotId,
        question: texto,
      },
      select: { id: true },
    });
  } catch (e) {
    // Corrida entre dois gatilhos (bot e página, por exemplo): o índice único
    // decide, e quem perdeu devolve a análise do vencedor.
    if (e instanceof Error && "code" in e && (e as { code?: string }).code === "P2002") {
      const vencedora = await prisma.analysis.findUnique({
        where: { snapshotId: sessao.snapshotId },
        select: { id: true },
      });
      return vencedora ? { id: vencedora.id, criada: false } : null;
    }
    throw e;
  }

  try {
    await enviarPergunta(config, {
      id: analysis.id,
      userId,
      appId,
      personaName: user.personaName,
      texto,
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: { status: "FAILED", error },
    });
    console.error("[analises] falha ao pedir a análise da sessão:", error);
  }

  return { id: analysis.id, criada: true };
}

/** A sessão mais recente existe e ainda não tem análise — a página pede. */
export async function sessaoSemAnalise(userId: string, appId: number): Promise<boolean> {
  const sessao = await sessaoMaisRecente(userId, appId);
  if (!sessao) return false;
  const existente = await prisma.analysis.findUnique({
    where: { snapshotId: sessao.snapshotId },
    select: { id: true },
  });
  return !existente;
}

/**
 * A coleta que fechou a sessão mais recente, e o que ela rendeu.
 *
 * Mesma caminhada de `ultimoPar`: o par mais recente em que os rounds
 * subiram. Pontos sem partida (o cron de todo dia) não contam como sessão.
 */
async function sessaoMaisRecente(userId: string, appId: number) {
  const userGame = await prisma.userGame.findUnique({
    where: { userId_gameAppId: { userId, gameAppId: appId } },
    select: {
      snapshots: {
        orderBy: { capturedAt: "asc" },
        take: 500,
        select: { id: true, capturedAt: true, playtimeForeverMin: true, metrics: true },
      },
    },
  });
  if (!userGame) return null;

  const idPorInstante = new Map<number, string>();
  const rows: SnapshotRow[] = userGame.snapshots.map((s) => {
    idPorInstante.set(s.capturedAt.getTime(), s.id);
    return { capturedAt: s.capturedAt, playtimeForeverMin: s.playtimeForeverMin, metrics: coerce(s.metrics) };
  });

  const pares = paresDeMovimento(rows, "total_rounds_played");
  const par = pares[pares.length - 1];
  if (!par) return null;

  const snapshotId = idPorInstante.get(par.curr.capturedAt.getTime());
  if (!snapshotId) return null;

  return {
    snapshotId,
    capturedAt: par.curr.capturedAt,
    rounds: deltaEntre(par, "total_rounds_played") ?? 0,
    partidas: deltaEntre(par, "total_matches_played"),
  };
}
