import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { gravarPartidaDoGC, registrarFalhaDoGC } from "@/lib/partidas";
import { garantirAnaliseDaSessao } from "@/lib/analises";

export const dynamic = "force-dynamic";

/**
 * A fila de partidas para o bot perguntar ao Game Coordinator.
 *
 * GET devolve share codes pendentes; POST traz o scoreboard (ou o motivo de
 * não ter vindo). Mesmo Bearer da fila de mensagens: é o mesmo bot.
 */
function autorizado(request: NextRequest) {
  const secret = process.env.BOT_WEBHOOK_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const partidas = await prisma.match.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 5,
    select: { id: true, shareCode: true },
  });
  return NextResponse.json({ partidas });
}

const numeros = z.array(z.number().int().nonnegative());
const resultado = z.object({
  shareCode: z.string().min(1),
  status: z.enum(["DONE", "EXPIRED", "FAILED"]),
  error: z.string().max(400).optional(),
  partida: z
    .object({
      matchId: z.string().min(1),
      matchtime: z.number().int().positive(),
      duracaoS: z.number().int().nonnegative(),
      rounds: z.number().int().nonnegative(),
      gameType: z.number().int().nullable(),
      demoUrl: z.string().nullable(),
      contas: z.array(z.number().int().positive()).min(2).max(10),
      kills: numeros,
      assists: numeros,
      deaths: numeros,
      mvps: numeros,
      scores: numeros,
      hs: numeros,
      placar: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const parsed = resultado.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });

  const { shareCode, status, error, partida } = parsed.data;
  if (status === "DONE" && partida) {
    const usuarios = await gravarPartidaDoGC(shareCode, partida);
    // O scoreboard chegou: agora a análise da sessão de quem estava nela
    // tem a partida inteira para ler. Quem já tem análise não ganha outra.
    for (const userId of usuarios) {
      await garantirAnaliseDaSessao(userId, 730).catch((e) =>
        console.error("[partidas] análise não disparou:", e instanceof Error ? e.message : e),
      );
    }
  } else {
    await registrarFalhaDoGC(shareCode, status === "EXPIRED" ? "EXPIRED" : "FAILED", error);
  }
  return NextResponse.json({ ok: true });
}
