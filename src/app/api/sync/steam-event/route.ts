import { NextResponse, type NextRequest } from "next/server";
import { segredoOpcional } from "@/lib/segredos";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { agendarCaptura } from "@/lib/capturas";

export const dynamic = "force-dynamic";

/**
 * O bot de presença viu alguém terminar uma partida.
 *
 * Só gravamos o pedido: a coleta em si acontece no tick (`/api/bot/tick`),
 * depois do prazo que a Steam leva para publicar, e com as retentativas
 * guardadas no banco — não na memória de um processo que reinicia. A
 * resposta é imediata e o bot não precisa lembrar de nada.
 */
const schema = z.object({
  steamId: z.string().regex(/^7656119\d{10}$/),
  event: z.enum(["match_ended"]),
  /** Observado pelo bot no rich presence, quando disponível. */
  map: z.string().max(64).optional(),
  mode: z.string().max(64).optional(),
  score: z.string().max(32).optional(),
});

export async function POST(request: NextRequest) {
  const secret = await segredoOpcional("BOT_WEBHOOK_SECRET");
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
    select: { id: true, steamId: true },
  });
  // O bot é amigo de gente que talvez nunca tenha entrado no site.
  if (!user) {
    return NextResponse.json({ skipped: "usuário desconhecido" });
  }

  const captura = await agendarCaptura(user.id, user.steamId, {
    map: parsed.data.map,
    mode: parsed.data.mode,
    score: parsed.data.score,
  });
  return NextResponse.json({ scheduled: captura.proximaEm.toISOString() }, { status: 202 });
}
