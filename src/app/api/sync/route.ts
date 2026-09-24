import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { syncUser } from "@/lib/steam/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Intervalo mínimo entre syncs manuais. Protege a chave da Steam Web API de
// um usuário clicando no botão repetidamente.
const COOLDOWN_MS = 1000 * 60 * 2;

/**
 * Contexto informado à mão.
 *
 * O bot lia modo e mapa do rich presence; sem ele, quem sabe o que foi jogado
 * é a pessoa. O valor gravado é a mesma string que o rich presence do CS2
 * publica ("competitive", "casual"…), e não um rótulo nosso — assim as duas
 * origens caem no mesmo campo e o filtro não precisa saber quem preencheu.
 *
 * Vale para tudo que aconteceu desde a última coleta, não para uma partida:
 * quem joga uma casual e uma competitiva antes de sincronizar marca as duas
 * como uma coisa só. O bot não tinha esse problema porque coletava ao fim de
 * cada partida.
 */
const schema = z.object({
  mode: z.string().max(64).optional(),
});

export async function POST(request: NextRequest) {
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
    const faltam = Math.ceil((COOLDOWN_MS - (Date.now() - user.lastSyncedAt.getTime())) / 1000);
    return NextResponse.json(
      { error: `Acabamos de sincronizar. Dá para tentar de novo em ${faltam} s.` },
      { status: 429 },
    );
  }

  // Corpo é opcional: sincronizar sem marcar modo continua valendo.
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  try {
    const result = await syncUser(session.userId, session.steamId, "MANUAL", {
      mode: parsed.data.mode || null,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[sync] falhou", err);
    return NextResponse.json(
      { error: "Não foi possível sincronizar com a Steam." },
      { status: 502 },
    );
  }
}
