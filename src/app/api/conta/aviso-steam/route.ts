import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Liga ou desliga a análise no chat da Steam. */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const ligado = body && typeof body === "object" && (body as { ligado?: unknown }).ligado === true;
  await prisma.user.update({ where: { id: session.userId }, data: { avisoSteam: ligado } });
  return NextResponse.json({ ok: true, ligado });
}
