import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Entrar para a comunidade, ou atualizar o que se disse ao entrar.
 *
 * Uma linha por usuário; o upsert é o que torna o formulário reeditável
 * sem duplicar ninguém. O GitHub é validado só no formato — o convite ao
 * repositório é manual, e é aí que se confere se o usuário existe.
 */
const PAPEIS = ["testar", "desenvolver", "dados", "design"] as const;

const schema = z.object({
  githubLogin: z
    .string()
    .trim()
    .max(39)
    .regex(/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i, "Usuário do GitHub inválido.")
    .optional()
    .or(z.literal("")),
  papeis: z.array(z.enum(PAPEIS)).min(1, "Escolha ao menos uma forma de ajudar."),
  mensagem: z.string().trim().max(600).optional(),
  visivel: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Entre com a Steam para participar." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const nossa = issue?.message && !/^(Invalid|Expected|Too )/.test(issue.message);
    return NextResponse.json({ error: nossa ? issue.message : "Dados inválidos." }, { status: 400 });
  }
  const { githubLogin, papeis, mensagem, visivel } = parsed.data;

  await prisma.participant.upsert({
    where: { userId: session.userId },
    create: {
      userId: session.userId,
      githubLogin: githubLogin || null,
      papeis,
      mensagem: mensagem || null,
      visivel,
    },
    update: { githubLogin: githubLogin || null, papeis, mensagem: mensagem || null, visivel },
  });

  return NextResponse.json({ ok: true });
}
