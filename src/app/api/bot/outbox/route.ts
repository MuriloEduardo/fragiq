import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * A fila de mensagens do bot.
 *
 * GET devolve o que está pendente; POST registra o resultado de uma
 * entrega. O bot é quem chama, com o mesmo Bearer do webhook de eventos —
 * ele não tem porta aberta, então busca em vez de receber.
 */
function autorizado(request: NextRequest) {
  const secret = process.env.BOT_WEBHOOK_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const mensagens = await prisma.steamMessage.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { id: true, steamId: true, texto: true },
  });
  return NextResponse.json({ mensagens });
}

const resultado = z.object({
  id: z.string().min(1),
  status: z.enum(["SENT", "FAILED"]),
  error: z.string().max(400).optional(),
});

export async function POST(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const parsed = resultado.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });

  await prisma.steamMessage.updateMany({
    where: { id: parsed.data.id, status: "PENDING" },
    data: {
      status: parsed.data.status,
      error: parsed.data.error ?? null,
      sentAt: parsed.data.status === "SENT" ? new Date() : null,
    },
  });
  return NextResponse.json({ ok: true });
}
