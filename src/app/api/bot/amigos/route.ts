import { NextResponse, type NextRequest } from "next/server";
import { segredoOpcional } from "@/lib/segredos";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { registrar } from "@/lib/eventos";

export const dynamic = "force-dynamic";

/**
 * A lista de amigos do bot, como ele a vê.
 *
 * É a única fonte que não depende de a lista de amigos da pessoa ser
 * pública: o bot sabe de quem é amigo. Quem entrou ganha `botAmigoDesde`;
 * quem saiu perde. O funil de ativação lê daqui.
 */
const schema = z.object({ steamIds: z.array(z.string().regex(/^7656119\d{10}$/)).max(5000) });

export async function POST(request: NextRequest) {
  const secret = await segredoOpcional("BOT_WEBHOOK_SECRET");
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });

  const { steamIds } = parsed.data;
  const novos = await prisma.user.findMany({
    where: { steamId: { in: steamIds }, botAmigoDesde: null },
    select: { id: true },
  });
  const [entraram, sairam] = await Promise.all([
    prisma.user.updateMany({ where: { steamId: { in: steamIds }, botAmigoDesde: null }, data: { botAmigoDesde: new Date() } }),
    prisma.user.updateMany({ where: { steamId: { notIn: steamIds }, botAmigoDesde: { not: null } }, data: { botAmigoDesde: null } }),
  ]);
  for (const u of novos) await registrar("bot.amigo", { userId: u.id });
  return NextResponse.json({ entraram: entraram.count, sairam: sairam.count });
}
