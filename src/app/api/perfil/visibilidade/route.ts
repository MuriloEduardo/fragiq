import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Liga ou desliga a própria página pública. */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const publico = body && typeof body === "object" && (body as { publico?: unknown }).publico === true;
  await prisma.user.update({ where: { id: session.userId }, data: { perfilPublico: publico } });
  return NextResponse.json({ ok: true, publico });
}
