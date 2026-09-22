import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * As duas visibilidades do perfil, numa porta só.
 *
 * `publico` é a página existir; `curvaVisivel` é quem segue ver a série.
 * Ficam juntas porque são a mesma pergunta em dois níveis, e separá-las em
 * duas rotas faria a tela escolher qual chamar para um controle que, do
 * lado de quem usa, é o mesmo tipo de interruptor. Cada chamada manda só o
 * campo que mudou.
 */
const schema = z
  .object({ publico: z.boolean().optional(), curvaVisivel: z.boolean().optional() })
  .refine((v) => v.publico !== undefined || v.curvaVisivel !== undefined, "Nada para mudar.");

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });

  const { publico, curvaVisivel } = parsed.data;
  const dados = {
    ...(publico === undefined ? {} : { perfilPublico: publico }),
    ...(curvaVisivel === undefined ? {} : { curvaVisivel }),
  };
  await prisma.user.update({ where: { id: session.userId }, data: dados });
  return NextResponse.json({ ok: true, ...dados });
}
