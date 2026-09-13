import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { ativarPartidas, CodigoInvalido, desativarPartidas } from "@/lib/partidas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Liga (POST) ou desliga (DELETE) a corrente de partidas da pessoa logada.
 * Os códigos são validados contra a Steam antes de qualquer gravação; o
 * erro volta apontando o campo, para o formulário marcar o certo.
 */
const schema = z.object({
  authCode: z.string().trim().min(1).max(40),
  shareCode: z.string().trim().min(1).max(400),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Preencha os dois códigos." }, { status: 400 });

  try {
    const novas = await ativarPartidas(session.userId, session.steamId, parsed.data.authCode, parsed.data.shareCode);
    return NextResponse.json({ ok: true, novas });
  } catch (err) {
    if (err instanceof CodigoInvalido) {
      return NextResponse.json({ error: err.message, campo: err.campo }, { status: err.campo === "steam" ? 502 : 422 });
    }
    throw err;
  }
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  await desativarPartidas(session.userId);
  return NextResponse.json({ ok: true });
}
