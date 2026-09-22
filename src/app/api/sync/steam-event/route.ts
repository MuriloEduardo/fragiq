import { NextResponse, type NextRequest } from "next/server";
import { segredoOpcional } from "@/lib/segredos";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { agendarCaptura } from "@/lib/capturas";

export const dynamic = "force-dynamic";

/**
 * O bot de presença viu alguém terminar uma partida (ou fechar o jogo).
 *
 * Duas gravações, nesta ordem: a **observação** (o que o bot viu — mapa,
 * modo, placar, quando), que fica para sempre e é a prova de modo das
 * sessões; e o pedido de coleta, que acontece no tick (`/api/bot/tick`),
 * depois do prazo que a Steam leva para publicar, com as retentativas
 * guardadas no banco — não na memória de um processo que reinicia. O
 * `traceId` nasce no bot e amarra as duas ao ponto que vier.
 */
const schema = z.object({
  steamId: z.string().regex(/^7656119\d{10}$/),
  event: z.enum(["match_ended", "left_game"]),
  /** Observado pelo bot no rich presence, quando disponível. */
  map: z.string().max(64).optional(),
  mode: z.string().max(64).optional(),
  score: z.string().max(32).optional(),
  /** Quando o bot viu; sem ele, agora. */
  observedAt: z.string().datetime().optional(),
  /** Um bot antigo não manda; a rota inventa um para o fio não se perder. */
  traceId: z.string().uuid().optional(),
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

  const d = parsed.data;
  const traceId = d.traceId ?? crypto.randomUUID();
  const user = await prisma.user.findUnique({
    where: { steamId: d.steamId },
    select: { id: true, steamId: true },
  });

  // A observação fica mesmo para quem não tem conta: o bot é amigo de gente
  // que talvez entre no site depois, e aí a história já está lá.
  const observacao = await prisma.botObservation.create({
    data: {
      steamId: d.steamId,
      userId: user?.id ?? null,
      kind: d.event === "match_ended" ? "MATCH_ENDED" : "LEFT_GAME",
      map: d.map ?? null,
      mode: d.mode ?? null,
      score: d.score ?? null,
      observedAt: d.observedAt ? new Date(d.observedAt) : new Date(),
      traceId,
    },
  });

  if (!user) {
    return NextResponse.json({ skipped: "usuário desconhecido", traceId });
  }

  // A captura é pendurada na observação: é ela que dá a chave de
  // idempotência e, sobretudo, é ela que garante uma coleta por partida
  // vista — o aviso da partida seguinte não apaga mais o da anterior.
  const captura = await agendarCaptura(
    user.id,
    user.steamId,
    { map: d.map, mode: d.mode, score: d.score },
    traceId,
    observacao.id,
  );
  return NextResponse.json({ scheduled: captura.proximaEm.toISOString(), traceId }, { status: 202 });
}
