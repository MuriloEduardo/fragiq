import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Marcar à mão o modo de uma sessão que o bot não viu.
 *
 * Só o modo, só numa coleta sem contexto e só na coleta da própria pessoa.
 * Mapa fica de fora: sem o bot, ninguém lembra ao certo, e mapa errado suja
 * o recorte mais do que mapa nenhum.
 */
const MODOS = ["competitive", "premier", "casual", "deathmatch", "scrimcomp2v2", "gungameprogressive", "training"] as const;

const schema = z.object({
  snapshotId: z.string().min(1),
  mode: z.enum(MODOS),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });

  const alterado = await prisma.statSnapshot.updateMany({
    where: {
      id: parsed.data.snapshotId,
      matchMode: null,
      userGame: { userId: session.userId },
    },
    data: { matchMode: parsed.data.mode },
  });
  if (alterado.count === 0) {
    return NextResponse.json({ error: "Essa coleta não existe, não é sua ou já tem modo." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
