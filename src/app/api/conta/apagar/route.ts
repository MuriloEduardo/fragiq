import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { destroySession, getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Apagar a conta e tudo que veio com ela.
 *
 * Um DELETE no usuário: coletas, sessões, análises, participação, quem
 * segue quem e feedback caem em cascata. Não há "desativar": apagar é
 * apagar. A Steam não é tocada — nunca foi.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  await prisma.user.delete({ where: { id: session.userId } });
  await destroySession();
  return NextResponse.json({ ok: true });
}
