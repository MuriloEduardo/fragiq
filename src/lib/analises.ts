import { prisma } from "./prisma";

/**
 * Depois disto uma pergunta sem resposta é dada como perdida, para não
 * travar a próxima. O cogniflow costuma responder em segundos; dois minutos
 * cobrem uma fila cheia e um modelo lento.
 */
export const TIMEOUT_MS = 2 * 60 * 1000;

export type AnaliseDTO = {
  id: string;
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
