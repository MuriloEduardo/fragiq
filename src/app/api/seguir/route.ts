import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Três gestos, todos imediatos e idempotentes.
 *
 * `seguir` e `deixar` são meus sobre outra pessoa; `remover` tira alguém
 * de quem me segue. Não há mais `pedir`, `aceitar` nem `recusar`: seguir
 * não depende de autorização, e o que era autorizado pessoa a pessoa —
 * ver a curva — é agora uma escolha só, em Configurações.
 */
const schema = z.object({
  steamId: z.string().regex(/^7656119\d{10}$/),
  acao: z.enum(["seguir", "deixar", "remover"]),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  const { steamId, acao } = parsed.data;
  if (steamId === session.steamId) return NextResponse.json({ error: "Você já se acompanha." }, { status: 400 });

  const outro = await prisma.user.findUnique({ where: { steamId }, select: { id: true, perfilPublico: true } });
  if (!outro) return NextResponse.json({ error: "Essa pessoa ainda não está no FragIQ." }, { status: 404 });

  const eu = session.userId;
  switch (acao) {
    case "seguir":
      // Perfil oculto é a única recusa que resta: sem página pública não há
      // o que acompanhar.
      if (!outro.perfilPublico) return NextResponse.json({ error: "Perfil oculto." }, { status: 403 });
      await prisma.follow.upsert({
        where: { seguidorId_seguidoId: { seguidorId: eu, seguidoId: outro.id } },
        create: { seguidorId: eu, seguidoId: outro.id },
        update: {},
      });
      break;
    case "deixar":
      await prisma.follow.deleteMany({ where: { seguidorId: eu, seguidoId: outro.id } });
      break;
    case "remover":
      await prisma.follow.deleteMany({ where: { seguidorId: outro.id, seguidoId: eu } });
      break;
  }
  return NextResponse.json({ ok: true });
}
