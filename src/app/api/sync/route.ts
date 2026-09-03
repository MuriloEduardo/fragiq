import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { syncUser } from "@/lib/steam/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Intervalo mínimo entre syncs manuais. Protege a chave da Steam Web API de
// um usuário clicando no botão repetidamente.
const COOLDOWN_MS = 1000 * 60 * 2;

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const running = await prisma.syncRun.findFirst({
    where: { userId: session.userId, status: "RUNNING" },
    orderBy: { startedAt: "desc" },
  });

  // Uma corrida travada não pode bloquear o usuário para sempre.
  if (running && Date.now() - running.startedAt.getTime() < COOLDOWN_MS) {
    return NextResponse.json(
      { error: "Uma sincronização já está em andamento." },
      { status: 409 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { lastSyncedAt: true },
  });

  if (user?.lastSyncedAt && Date.now() - user.lastSyncedAt.getTime() < COOLDOWN_MS) {
    return NextResponse.json(
      { error: "Aguarde alguns instantes antes de sincronizar novamente." },
      { status: 429 },
    );
  }

  try {
    const result = await syncUser(session.userId, session.steamId, "MANUAL");
    return NextResponse.json(result);
  } catch (err) {
    console.error("[sync] falhou", err);
    return NextResponse.json(
      { error: "Não foi possível sincronizar com a Steam." },
      { status: 502 },
    );
  }
}
