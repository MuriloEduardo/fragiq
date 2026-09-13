import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Tudo que guardamos sobre a pessoa, em um JSON. Sem filtro: é o dado dela. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      games: { include: { game: { select: { appId: true, name: true } }, snapshots: { orderBy: { capturedAt: "asc" } } } },
      analyses: { orderBy: { createdAt: "asc" } },
      feedback: true,
      participant: true,
      seguindo: { select: { seguidoId: true, status: true, createdAt: true } },
      seguidores: { select: { seguidorId: true, status: true, createdAt: true } },
      syncRuns: { orderBy: { startedAt: "asc" } },
    },
  });

  return new NextResponse(JSON.stringify({ exportadoEm: new Date().toISOString(), ...user }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="fragiq-${session.steamId}.json"`,
    },
  });
}
