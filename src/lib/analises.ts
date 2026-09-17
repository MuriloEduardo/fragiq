import { prisma } from "./prisma";
import { cogniflow } from "./env";
import { enviarPergunta } from "./cogniflow";
import type { SnapshotRow } from "./series";
import { listarSessoes, valoresDoNormal } from "./sessoes";
import { rotularMapa, rotularModo } from "./cs2-labels";
import { TUDO, type Modo } from "./modo";

/**
 * Depois disto uma pergunta sem resposta é dada como perdida, para não
 * travar a próxima. O cogniflow costuma responder em segundos; dois minutos
 * cobrem uma fila cheia e um modelo lento.
 */
export const TIMEOUT_MS = 2 * 60 * 1000;

/**
 * A sessão por trás de uma análise, já pronta para o cartão: contexto,
 * os três números e a referência contra a qual eles são lidos — o
 * acumulado do modo quando a sessão tem modo, o vitalício quando não tem.
 */
export type SessaoDaAnalise = {
  modo: string | null;
  modoRotulo: string | null;
  mapa: string | null;
  placar: string | null;
  rounds: number;
  partidas: number | null;
  minutos: number;
  kd: number | null;
  danoPorRound: number | null;
  hs: number | null;
  referencia: { kd: number | null; danoPorRound: number | null; hs: number | null };
};

export type AnaliseDTO = {
  id: string;
  kind: "SESSION" | "QUESTION";
  question: string;
  answer: string | null;
  status: "PENDING" | "ACKNOWLEDGED" | "ANSWERED" | "FAILED";
  createdAt: string;
  answeredAt: string | null;
  /** Quando a sessão analisada foi coletada (SESSION). */
  sessaoEm: string | null;
  /** A sessão em números, quando ainda existe na série. */
  sessao: SessaoDaAnalise | null;
};

/**
 * As últimas análises do jogador para o jogo, da mais recente à mais
 * antiga. Com `modo`, só as de sessões daquele modo; `rows` é o balde da
 * série, para casar cada análise com os números da sessão dela.
 */
export async function listarAnalises(
  userId: string,
  appId: number,
  opcoes: { modo?: Modo; rows?: SnapshotRow[] } = {},
): Promise<AnaliseDTO[]> {
  const modo = opcoes.modo && opcoes.modo !== TUDO ? opcoes.modo : null;
  const rows = await prisma.analysis.findMany({
    where: { userId, gameAppId: appId, ...(modo ? { snapshot: { matchMode: modo } } : {}) },
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
      snapshotId: true,
      snapshot: { select: { capturedAt: true } },
    },
  });
  const sessoes = sessoesPorSnapshot(opcoes.rows ?? []);
  const limite = Date.now() - TIMEOUT_MS;
  return rows.map(({ snapshot, snapshotId, ...r }) => ({
    ...r,
    sessaoEm: snapshot?.capturedAt.toISOString() ?? null,
    sessao: snapshotId ? (sessoes.get(snapshotId) ?? null) : null,
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

function sessoesPorSnapshot(rows: SnapshotRow[]): Map<string, SessaoDaAnalise> {
  if (rows.length === 0) return new Map();
  const saida = new Map<string, SessaoDaAnalise>();
  for (const s of listarSessoes(rows)) {
    if (!s.snapshotId) continue;
    saida.set(s.snapshotId, {
      modo: s.modoId,
      modoRotulo: s.modo,
      mapa: s.mapa,
      placar: s.placar,
      rounds: s.rounds,
      partidas: s.partidas,
      minutos: s.minutos,
      kd: s.kd,
      danoPorRound: s.danoPorRound,
      hs: s.hs,
      referencia: valoresDoNormal(rows, { modo: s.modoId }, s.snapshotId),
    });
  }
  return saida;
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
  const config = await cogniflow();
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
  const contexto = [
    sessao.modo ? `modo ${sessao.modo} (${rotularModo(sessao.modo)})` : null,
    sessao.mapa ? `mapa ${sessao.mapa} (${rotularMapa(sessao.mapa)})` : null,
    sessao.placar ? `placar ${sessao.placar}` : null,
  ].filter(Boolean);
  const texto =
    `Nova sessão registrada em ${quando}: ${sessao.rounds} round${sessao.rounds === 1 ? "" : "s"}` +
    (sessao.partidas ? ` em ${sessao.partidas} partida${sessao.partidas === 1 ? "" : "s"}` : "") +
    (contexto.length ? ` — ${contexto.join(", ")}` : "") +
    `. Analise esta sessão contra o meu normal sem que eu precise perguntar: ` +
    `o que mudou, o que pesou de verdade e o que fazer na próxima. Comece pela view resumo` +
    (sessao.modo ? ` com modo="${sessao.modo}", e mantenha esse modo em toda consulta` : "") +
    `.`;

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
 * A sessão mais recente, já materializada: a última linha de `Session` do
 * jogador. Antes isto recalculava os pares sobre 500 coletas a cada
 * chamada; agora é uma consulta, e o modo é o provado (só `EXATA` e
 * `INFERIDA` chegam com modo).
 */
async function sessaoMaisRecente(userId: string, appId: number) {
  const s = await prisma.session.findFirst({
    where: { userId, gameAppId: appId },
    orderBy: { ate: "desc" },
    select: { ateSnapshotId: true, ate: true, rounds: true, partidas: true, modo: true, modoConfianca: true, mapa: true, placar: true },
  });
  if (!s) return null;
  return {
    snapshotId: s.ateSnapshotId,
    capturedAt: s.ate,
    rounds: s.rounds,
    partidas: s.partidas,
    modo: s.modoConfianca === "MISTA" ? null : s.modo,
    mapa: s.mapa,
    placar: s.placar,
  };
}
