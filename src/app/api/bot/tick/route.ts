import { NextResponse, type NextRequest } from "next/server";
import { processarCapturasDevidas } from "@/lib/capturas";

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
export async function GET(request: NextRequest) {
  const secret = process.env.BOT_WEBHOOK_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  return NextResponse.json(await processarCapturasDevidas());
}
