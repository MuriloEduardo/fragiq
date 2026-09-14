import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { cogniflow } from "@/lib/env";
import { garantirAnaliseDaSessao, listarAnalises } from "@/lib/analises";
import { carregarFonte } from "@/lib/fonte";

export const dynamic = "force-dynamic";


const schema = z.object({
  appId: z.number().int().positive(),
});

/**
 * POST pede a análise da última sessão, se ela ainda não existe. Não há
 * pergunta livre: as análises são disparadas por nós — no sync, no cron,
 * no bot, e aqui, quando a página abre e a sessão mais recente está sem
 * uma. O GET lista as existentes; é o que a tela consulta enquanto espera.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (!cogniflow()) {
    return NextResponse.json({ error: "Analista não configurado." }, { status: 404 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const sessao = await garantirAnaliseDaSessao(session.userId, parsed.data.appId);
  if (!sessao) {
    return NextResponse.json({ error: "Nenhuma sessão para analisar ainda." }, { status: 404 });
  }
  return NextResponse.json({ id: sessao.id }, { status: sessao.criada ? 202 : 200 });
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const appId = Number(request.nextUrl.searchParams.get("appId"));
  if (!Number.isInteger(appId)) {
    return NextResponse.json({ error: "appId inválido." }, { status: 400 });
  }
  const modo = request.nextUrl.searchParams.get("modo") ?? undefined;
  const fonte = await carregarFonte(session.userId, appId);
  return NextResponse.json({ analyses: await listarAnalises(session.userId, appId, { modo, rows: fonte?.rows }) });
}
