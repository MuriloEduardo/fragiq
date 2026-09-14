import { prisma } from "./prisma";
import { cogniflow } from "./env";
import { enviarPergunta } from "./cogniflow";
import { deltaEntre, paresDeMovimento, type SnapshotRow } from "./series";
import { coerce } from "./fonte";
import { listarSessoes, vitaliciosDoHero } from "./sessoes";
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
  const porModo = new Map<string | null, ReturnType<typeof vitaliciosDoHero>>();
  const referencia = (modo: string | null) => {
    let ref = porModo.get(modo);
    if (!ref) {
      ref = vitaliciosDoHero(rows, modo ? { mode: modo } : undefined);
      porModo.set(modo, ref);
    }
    return ref;
  };
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
      referencia: referencia(s.modoId),
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
        select: { id: true, capturedAt: true, playtimeForeverMin: true, metrics: true, matchMode: true, matchMap: true, matchScore: true },
      },
    },
  });
  if (!userGame) return null;

  const idPorInstante = new Map<number, string>();
  const rows: SnapshotRow[] = userGame.snapshots.map((s) => {
    idPorInstante.set(s.capturedAt.getTime(), s.id);
    return {
      capturedAt: s.capturedAt,
      playtimeForeverMin: s.playtimeForeverMin,
      metrics: coerce(s.metrics),
      matchMode: s.matchMode,
      matchMap: s.matchMap,
      matchScore: s.matchScore,
    };
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
    modo: par.curr.matchMode ?? null,
    mapa: par.curr.matchMap ?? null,
    placar: par.curr.matchScore ?? null,
  };
}
