import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { segredoOpcional } from "@/lib/segredos";

export const dynamic = "force-dynamic";

/**
 * O log do bot, no banco.
 *
 * O bot manda lotes; aqui só gravamos e apagamos o que passou de 30 dias.
 * Nada é interpretado: o painel filtra por nível, jogador e trace. Um
 * lote inválido é recusado inteiro — o bot reenvia no próximo.
 */
const RETENCAO_DIAS = 30;

const linha = z.object({
  nivel: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]),
  mensagem: z.string().min(1).max(2000),
  dados: z.record(z.string(), z.unknown()).optional(),
  steamId: z.string().regex(/^7656119\d{10}$/).optional(),
  traceId: z.string().uuid().optional(),
  em: z.string().datetime(),
});
const lote = z.object({ linhas: z.array(linha).min(1).max(500) });

export async function POST(request: NextRequest) {
  const secret = await segredoOpcional("BOT_WEBHOOK_SECRET");
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const parsed = lote.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Lote inválido." }, { status: 400 });

  const [gravadas] = await prisma.$transaction([
    prisma.botLog.createMany({
      data: parsed.data.linhas.map((l) => ({
        nivel: l.nivel,
        mensagem: l.mensagem,
        dados: l.dados as object | undefined,
        steamId: l.steamId ?? null,
        traceId: l.traceId ?? null,
        em: new Date(l.em),
      })),
    }),
    prisma.botLog.deleteMany({ where: { em: { lt: new Date(Date.now() - RETENCAO_DIAS * 86_400_000) } } }),
  ]);
  return NextResponse.json({ gravadas: gravadas.count });
}
