import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Sem teto, um campo de texto livre é convite para colar um livro no banco.
const schema = z.object({
  message: z.string().trim().min(4, "Escreva um pouco mais.").max(4000),
  path: z.string().max(200).optional(),
  /** Aparecer na página da comunidade, com o nome. Padrão privado. */
  publico: z.boolean().optional(),
});

// Feedback autenticado não tem problema de spam anônimo, mas ainda cabe um
// limite contra envio acidental repetido.
const MAX_POR_HORA = 8;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (body === null || typeof body !== "object") {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // Só as mensagens que escrevemos: o texto padrão do Zod vem em inglês e
    // fala de tipos, não do que o usuário precisa corrigir.
    const issue = parsed.error.issues[0];
    const nossa = issue?.message && !/^(Invalid|Expected|Too )/.test(issue.message);
    return NextResponse.json(
      { error: nossa ? issue.message : "Mensagem inválida." },
      { status: 400 },
    );
  }

  const recentes = await prisma.feedback.count({
    where: {
      userId: session.userId,
      createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });

  if (recentes >= MAX_POR_HORA) {
    return NextResponse.json(
      { error: "Muitas mensagens seguidas. Tente de novo mais tarde." },
      { status: 429 },
    );
  }

  await prisma.feedback.create({
    data: {
      userId: session.userId,
      message: parsed.data.message,
      path: parsed.data.path ?? null,
      publico: parsed.data.publico ?? false,
    },
  });

  return NextResponse.json({ ok: true });
}
