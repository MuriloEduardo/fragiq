import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { segredoOpcional } from "@/lib/segredos";
import { gravarPreco, nomesParaPrecificar } from "@/lib/precos";

export const dynamic = "force-dynamic";

/**
 * A fila de preços do Mercado, servida ao bot (docs em `lib/precos.ts`):
 * GET devolve os nomes vencidos; POST recebe o que o bot leu.
 */
async function autorizado(request: NextRequest) {
  const secret = await segredoOpcional("BOT_WEBHOOK_SECRET");
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!(await autorizado(request))) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  return NextResponse.json({ nomes: await nomesParaPrecificar(10) });
}

const resultado = z.object({
  marketHashName: z.string().min(1).max(200),
  listado: z.boolean(),
  menorCents: z.number().int().nonnegative().nullable(),
  medianaCents: z.number().int().nonnegative().nullable(),
  volume: z.number().int().nonnegative().nullable(),
});

export async function POST(request: NextRequest) {
  if (!(await autorizado(request))) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const parsed = resultado.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Resultado inválido." }, { status: 400 });
  const { marketHashName, ...r } = parsed.data;
  await gravarPreco(marketHashName, r);
  return NextResponse.json({ ok: true });
}
