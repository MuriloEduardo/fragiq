import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { syncUser } from "@/lib/steam/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Coleta reativa: o bot de presença avisa que alguém terminou de jogar e
 * sincronizamos naquele momento, em vez de esperar o cron do dia seguinte.
 *
 * É o que transforma a série de "um ponto por dia" em "um ponto por sessão"
 * sem que o usuário precise clicar em nada.
 */

const schema = z.object({
  steamId: z.string().regex(/^7656119\d{10}$/),
  event: z.enum(["match_ended"]),
  /** Observado pelo bot no rich presence, quando disponível. */
  map: z.string().max(64).optional(),
  mode: z.string().max(64).optional(),
  score: z.string().max(32).optional(),
});

// Um bot com defeito reconectando em loop não pode virar rajada contra a
// Steam. O cooldown é menor que o do botão manual porque aqui o gatilho é
// um evento real de fim de partida.
const COOLDOWN_MS = 60_000;

export async function POST(request: NextRequest) {
  const secret = process.env.BOT_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[steam-event] BOT_WEBHOOK_SECRET não configurado");
    return NextResponse.json({ error: "Indisponível." }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { steamId: parsed.data.steamId },
    select: { id: true, steamId: true, lastSyncedAt: true },
  });

  // O bot é amigo de gente que talvez nunca tenha entrado no site.
  if (!user) {
    return NextResponse.json({ skipped: "usuário desconhecido" });
  }

  if (user.lastSyncedAt && Date.now() - user.lastSyncedAt.getTime() < COOLDOWN_MS) {
    return NextResponse.json({ skipped: "sincronizado há pouco" });
  }

  try {
    const result = await syncUser(user.id, user.steamId, "EVENT", {
      map: parsed.data.map,
      mode: parsed.data.mode,
      score: parsed.data.score,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[steam-event] sync falhou", err);
    return NextResponse.json({ error: "Falha ao sincronizar." }, { status: 502 });
  }
}
