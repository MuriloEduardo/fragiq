import { prisma } from "./prisma";
import { appUrl } from "./env";
import { formatarQuando } from "./sessoes";

/**
 * A análise da sessão, no chat da Steam.
 *
 * Quem adicionou o bot já recebe mapa e modo por ele; receber também a
 * leitura, minutos depois de fechar o jogo, é o produto chegando onde a
 * pessoa está. A mensagem é enfileirada aqui e o bot a entrega; ele só
 * consegue falar com quem é amigo, e quem não quiser desliga em
 * /seguranca.
 *
 * O texto é o do analista, inteiro, com cabeçalho e o link de volta. Sem
 * markdown: o chat da Steam não renderiza, e asteriscos soltos leem como
 * ruído.
 */
const LIMITE = 1800;

export async function enfileirarAnaliseNoSteam(analysisId: string): Promise<boolean> {
  const analise = await prisma.analysis.findUnique({
    where: { id: analysisId },
    select: {
      answer: true,
      kind: true,
      user: { select: { id: true, steamId: true, avisoSteam: true } },
      snapshot: { select: { capturedAt: true, matchMode: true, matchMap: true } },
    },
  });
  if (!analise?.answer || analise.kind !== "SESSION" || !analise.user.avisoSteam) return false;

  const quando = analise.snapshot ? formatarQuando(analise.snapshot.capturedAt) : "agora";
  const cabecalho = `FragIQ · sessão de ${quando}`;
  const corpo = semMarkdown(analise.answer);
  const rodape = `Curva completa: ${appUrl()}/cs2 · Para parar de receber: ${appUrl()}/seguranca`;
  const texto = [cabecalho, "", corpo, "", rodape].join("\n").slice(0, LIMITE);

  await prisma.steamMessage.create({
    data: { userId: analise.user.id, steamId: analise.user.steamId, texto },
  });
  return true;
}

function semMarkdown(t: string) {
  return t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^\s*[-•*]\s+/gm, "• ");
}
