import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { segredoOpcional } from "@/lib/segredos";
import { processarCapturasDevidas } from "@/lib/capturas";
import { atualizarUmPreco } from "@/lib/precos";
import { reportarErro } from "@/lib/eventos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * O relógio da coleta reativa.
 *
 * Serverless não tem loop; o bot tem. A cada meio minuto ele chama aqui e
 * processamos as capturas cujo prazo venceu. O bot não sabe o que há na
 * fila nem precisa: qualquer coisa que chame este endpoint serve de
 * relógio — outro bot, o cron, um curl.
 */
async function autorizado(request: NextRequest) {
  const secret = await segredoOpcional("BOT_WEBHOOK_SECRET");
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!(await autorizado(request))) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  return NextResponse.json(await processarCapturasDevidas());
}

/** Como o bot está — para o painel ver que ele vive sem ninguém abrir log. */
const estado = z.object({
  // Sem sessão na Steam o bot não sabe quantos amigos tem; o painel mantém o último valor.
  amigos: z.number().int().nonnegative().optional(),
  gc: z.boolean(),
  iniciadoEm: z.string().datetime().optional(),
  logado: z.boolean().optional(),
  desconectadoDesde: z.string().datetime().nullable().optional(),
  motivo: z.string().max(500).nullable().optional(),
  /** Quantas vezes o bot já tentou religar; vai para o `motivo` guardado. */
  tentativas: z.number().int().nonnegative().optional(),
});

export async function POST(request: NextRequest) {
  if (!(await autorizado(request))) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const parsed = estado.safeParse(await request.json().catch(() => null));
  if (parsed.success) {
    const dados = {
      ultimoTickEm: new Date(),
      amigos: parsed.data.amigos,
      gcConectado: parsed.data.gc,
      iniciadoEm: parsed.data.iniciadoEm ? new Date(parsed.data.iniciadoEm) : undefined,
      // Um bot antigo não manda `logado`; sem o campo, assume-se com sessão.
      logado: parsed.data.logado ?? true,
      desconectadoDesde: parsed.data.desconectadoDesde ? new Date(parsed.data.desconectadoDesde) : null,
      motivo: parsed.data.motivo
        ? parsed.data.tentativas
          ? `${parsed.data.motivo} · ${parsed.data.tentativas} tentativa${parsed.data.tentativas === 1 ? "" : "s"}`
          : parsed.data.motivo
        : null,
    };
    await prisma.botStatus.upsert({ where: { id: "bot" }, create: { id: "bot", ...dados }, update: dados });
  }
  // O mesmo relógio renova um preço do Mercado por tick (docs em precos.ts).
  // Um preço que falha não pode segurar as capturas — mas também não some: vai para o diário.
  const [capturas] = await Promise.all([processarCapturasDevidas(), atualizarUmPreco().catch((e) => reportarErro("precos.tick", e))]);
  return NextResponse.json(capturas);
}
