import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { lerCorpoAssinado, parseConversationId } from "@/lib/cogniflow";
import { carregarFonte } from "@/lib/fonte";
import { consultar, ViewInvalida } from "@/lib/analista";

export const dynamic = "force-dynamic";

/**
 * O que o analista consulta durante o turno.
 *
 * O cogniflow chama aqui quando o agente invoca `data.read`, com a `view`
 * e os `params` que o modelo escolheu e o `context` que mandamos junto da
 * pergunta. A assinatura garante que é o cogniflow; o `context` diz de quem
 * é a série — e é conferido contra a conversa, para que um agente confuso
 * não leia a série de outro jogador.
 *
 * Um 4xx aqui vira texto que o modelo lê e corrige (view errada, parâmetro
 * inválido). Um 5xx derruba o turno para retry, então só é 5xx o que de
 * fato é nosso.
 */

const schema = z.object({
  conversation_id: z.string().min(1),
  context: z.object({ userId: z.string().min(1), appId: z.number().int().positive() }),
  view: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  const lido = await lerCorpoAssinado(request);
  if (!lido.ok) return NextResponse.json({ error: lido.error }, { status: lido.status });

  const parsed = schema.safeParse(lido.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Consulta malformada: faltam conversation_id, context ou view." }, { status: 400 });
  }
  const { conversation_id, context, view, params } = parsed.data;

  const conversa = parseConversationId(conversation_id);
  if (!conversa || conversa.userId !== context.userId || conversa.appId !== context.appId) {
    return NextResponse.json({ error: "O contexto não pertence a esta conversa." }, { status: 403 });
  }

  const fonte = await carregarFonte(context.userId, context.appId);
  if (!fonte) {
    return NextResponse.json({ error: "Este jogador não tem série para este jogo." }, { status: 404 });
  }

  try {
    return NextResponse.json(consultar(fonte, view, params ?? {}));
  } catch (e) {
    if (e instanceof ViewInvalida) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
