import { gunzipSync } from "node:zlib";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { segredoOpcional } from "@/lib/segredos";
import { filaDeDemos, gravarDemo, registrarFalhaDaDemo } from "@/lib/demos";

export const dynamic = "force-dynamic";
/** Uma demo inteira leva alguns segundos para validar e gravar; o padrão de 10 s é curto demais no Hobby. */
export const maxDuration = 60;

/**
 * A fila de demos para o bot ler.
 *
 * GET devolve a próxima partida com demo por ler; POST traz os eventos
 * (gzip, ~300 KB por partida) ou o motivo de não terem vindo. Mesmo Bearer
 * das outras filas: é o mesmo bot.
 */
async function autorizado(request: NextRequest) {
  const secret = await segredoOpcional("BOT_WEBHOOK_SECRET");
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!(await autorizado(request))) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  return NextResponse.json({ demos: await filaDeDemos(1) });
}

const resultado = z.object({
  matchId: z.string().min(1),
  status: z.enum(["DONE", "EXPIRED", "FAILED"]),
  error: z.string().max(400).optional(),
  payload: z.unknown().optional(),
});

/** O corpo vem gzipado pelo bot; se algum proxy no caminho já descomprimiu, o JSON puro também serve. */
async function corpo(request: NextRequest): Promise<unknown> {
  const bytes = Buffer.from(await request.arrayBuffer());
  const gzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  try {
    return JSON.parse((gzip ? gunzipSync(bytes) : bytes).toString("utf8"));
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (!(await autorizado(request))) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const parsed = resultado.safeParse(await corpo(request));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });

  const { matchId, status, error, payload } = parsed.data;
  if (status === "DONE" && payload !== undefined) {
    try {
      const { jogadores } = await gravarDemo(matchId, payload);
      return NextResponse.json({ ok: true, jogadores });
    } catch (e) {
      // Payload que não bate com o contrato: fica registrado como falha, com o motivo, e não volta à fila para sempre.
      const motivo = e instanceof Error ? e.message.slice(0, 300) : "payload inválido";
      console.error("[demos] não gravou:", motivo);
      await registrarFalhaDaDemo(matchId, "FAILED", `contrato: ${motivo}`);
      return NextResponse.json({ error: "Payload inválido." }, { status: 422 });
    }
  }
  await registrarFalhaDaDemo(matchId, status === "EXPIRED" ? "EXPIRED" : "FAILED", error);
  return NextResponse.json({ ok: true });
}
