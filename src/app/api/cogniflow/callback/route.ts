import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { lerCorpoAssinado, parseConversationId } from "@/lib/cogniflow";
import { enfileirarAnaliseNoSteam } from "@/lib/mensagem-steam";

export const dynamic = "force-dynamic";

/**
 * O que o cogniflow nos devolve: a resposta do analista, ou o aviso de que
 * a pergunta chegou e está sendo respondida.
 *
 * A resposta não diz a qual pergunta pertence — o agente responde à
 * conversa, não a um ID nosso. Como só existe uma pergunta em aberto por
 * conversa (o POST recusa a segunda), a mais antiga em aberto é a dona.
 *
 * Repetições são esperadas: o `id` da resposta é determinístico por turno e
 * a fila entrega ao menos uma vez. Um `replyId` já gravado responde 200 sem
 * escrever nada, senão a fila tentaria de novo.
 */

const mensagem = z.object({
  type: z.literal("message"),
  id: z.string().min(1),
  conversation_id: z.string().min(1),
  text: z.string(),
});

const confirmacao = z.object({
  type: z.literal("acknowledgement"),
  conversation_id: z.string().min(1),
  message_id: z.string().min(1),
});

const schema = z.discriminatedUnion("type", [mensagem, confirmacao]);

export async function POST(request: NextRequest) {
  const lido = await lerCorpoAssinado(request);
  if (!lido.ok) return NextResponse.json({ error: lido.error }, { status: lido.status });

  const parsed = schema.safeParse(lido.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }
  const evento = parsed.data;

  const conversa = parseConversationId(evento.conversation_id);
  if (!conversa) {
    return NextResponse.json({ error: "conversation_id inválido." }, { status: 400 });
  }

  if (evento.type === "acknowledgement") {
    // message_id é o nosso próprio ID de pergunta — foi o que mandamos.
    await prisma.analysis.updateMany({
      where: { id: evento.message_id, userId: conversa.userId, status: "PENDING" },
      data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  const repetida = await prisma.analysis.findUnique({
    where: { replyId: evento.id },
    select: { id: true },
  });
  if (repetida) return NextResponse.json({ ok: true, duplicate: true });

  const aberta = await prisma.analysis.findFirst({
    where: {
      userId: conversa.userId,
      gameAppId: conversa.appId,
      status: { in: ["PENDING", "ACKNOWLEDGED"] },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!aberta) {
    // Resposta sem pergunta em aberto: chegou tarde demais, ou o agente
    // falou sem ser perguntado. Aceitar sem gravar é o que mantém a fila do
    // cogniflow andando; o log é para descobrir qual dos dois foi.
    console.warn("[cogniflow] resposta sem pergunta aberta:", evento.conversation_id);
    return NextResponse.json({ ok: true, orphan: true });
  }

  await prisma.analysis.update({
    where: { id: aberta.id },
    data: {
      answer: evento.text,
      status: "ANSWERED",
      replyId: evento.id,
      answeredAt: new Date(),
    },
  });

  // A análise de sessão também vai para o chat da Steam, pelo bot. Falha
  // aqui não pode derrubar o callback — a resposta já está gravada.
  await enfileirarAnaliseNoSteam(aberta.id).catch((e) =>
    console.error("[cogniflow] não enfileirou a mensagem da Steam:", e instanceof Error ? e.message : e),
  );

  return NextResponse.json({ ok: true });
}
