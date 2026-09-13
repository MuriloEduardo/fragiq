import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Os cinco gestos de seguir. Quem pede: pedir, cancelar, remover. Quem é
 * seguido: aceitar, recusar, revogar. Tudo idempotente — repetir um gesto
 * não erra, só não muda nada.
 */
const schema = z.object({
  steamId: z.string().regex(/^7656119\d{10}$/),
  acao: z.enum(["pedir", "cancelar", "aceitar", "recusar", "revogar"]),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  const { steamId, acao } = parsed.data;
  if (steamId === session.steamId) return NextResponse.json({ error: "Você já vê a sua curva." }, { status: 400 });

  const outro = await prisma.user.findUnique({ where: { steamId }, select: { id: true, perfilPublico: true } });
  if (!outro) return NextResponse.json({ error: "Essa pessoa ainda não está no FragIQ." }, { status: 404 });

  const eu = session.userId;
  switch (acao) {
    case "pedir":
      if (!outro.perfilPublico) return NextResponse.json({ error: "Perfil oculto." }, { status: 403 });
      await prisma.follow.upsert({
        where: { seguidorId_seguidoId: { seguidorId: eu, seguidoId: outro.id } },
        create: { seguidorId: eu, seguidoId: outro.id },
        update: {},
      });
      break;
    case "cancelar":
      await prisma.follow.deleteMany({ where: { seguidorId: eu, seguidoId: outro.id } });
      break;
    case "aceitar":
      await prisma.follow.updateMany({
        where: { seguidorId: outro.id, seguidoId: eu, status: "PENDING" },
        data: { status: "ACCEPTED", decididoEm: new Date() },
      });
      break;
    case "recusar":
    case "revogar":
      await prisma.follow.deleteMany({ where: { seguidorId: outro.id, seguidoId: eu } });
      break;
  }
  return NextResponse.json({ ok: true });
}
