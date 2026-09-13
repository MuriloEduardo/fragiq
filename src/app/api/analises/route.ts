import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { cogniflow } from "@/lib/env";
import { enviarPergunta } from "@/lib/cogniflow";
import { garantirAnaliseDaSessao, listarAnalises, TIMEOUT_MS } from "@/lib/analises";

export const dynamic = "force-dynamic";

/**
 * Perguntas ao analista.
 *
 * POST cria a pergunta e a despacha ao cogniflow; a resposta chega depois,
 * por /api/cogniflow/callback. GET lista as últimas do jogador para o jogo,
 * e é o que a tela consulta enquanto espera.
 */

const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("QUESTION").default("QUESTION"),
    appId: z.number().int().positive(),
    question: z.string().trim().min(4, "Escreva um pouco mais.").max(1000),
  }),
  // A página pede a análise da última sessão ao abrir, caso o sync não
  // tenha conseguido — ou caso a sessão seja anterior a existir análise.
  z.object({
    kind: z.literal("SESSION"),
    appId: z.number().int().positive(),
  }),
]);

/** Uma resposta custa tokens; vinte perguntas por hora é uso, não abuso. */
const MAX_POR_HORA = 20;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const config = cogniflow();
  if (!config) {
    return NextResponse.json({ error: "Analista não configurado." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(
    body && typeof body === "object" && !("kind" in body) ? { ...body, kind: "QUESTION" } : body,
  );
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const nossa = issue?.message && !/^(Invalid|Expected|Too )/.test(issue.message);
    return NextResponse.json(
      { error: nossa ? issue.message : "Pergunta inválida." },
      { status: 400 },
    );
  }

  if (parsed.data.kind === "SESSION") {
    const sessao = await garantirAnaliseDaSessao(session.userId, parsed.data.appId);
    if (!sessao) {
      return NextResponse.json({ error: "Nenhuma sessão para analisar ainda." }, { status: 404 });
    }
    return NextResponse.json({ id: sessao.id }, { status: sessao.criada ? 202 : 200 });
  }

  const { appId, question } = parsed.data;

  const [user, recentes, pendente] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { personaName: true, games: { where: { gameAppId: appId }, select: { id: true } } },
    }),
    prisma.analysis.count({
      where: { userId: session.userId, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
    }),
    prisma.analysis.findFirst({
      where: {
        userId: session.userId,
        gameAppId: appId,
        status: { in: ["PENDING", "ACKNOWLEDGED"] },
        createdAt: { gt: new Date(Date.now() - TIMEOUT_MS) },
      },
      select: { id: true },
    }),
  ]);

  if (!user || user.games.length === 0) {
    return NextResponse.json({ error: "Sem série para este jogo ainda." }, { status: 404 });
  }
  if (recentes >= MAX_POR_HORA) {
    return NextResponse.json(
      { error: "Muitas perguntas seguidas. Tente de novo mais tarde." },
      { status: 429 },
    );
  }
  // Uma de cada vez: a resposta chega sem dizer a qual pergunta pertence,
  // e a conversa no cogniflow é serializada de qualquer jeito.
  if (pendente) {
    return NextResponse.json(
      { error: "Espere a resposta anterior chegar.", pendingId: pendente.id },
      { status: 409 },
    );
  }

  const analysis = await prisma.analysis.create({
    data: { userId: session.userId, gameAppId: appId, question },
    select: { id: true },
  });

  try {
    await enviarPergunta(config, {
      id: analysis.id,
      userId: session.userId,
      appId,
      personaName: user.personaName,
      texto: question,
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: { status: "FAILED", error },
    });
    console.error("[analises] falha ao enviar ao cogniflow:", error);
    return NextResponse.json(
      { error: "O analista está fora do ar. Tente de novo em instantes.", id: analysis.id },
      { status: 502 },
    );
  }

  return NextResponse.json({ id: analysis.id }, { status: 202 });
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
  return NextResponse.json({ analyses: await listarAnalises(session.userId, appId) });
}
