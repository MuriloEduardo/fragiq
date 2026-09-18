import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { segredoOpcional } from "@/lib/segredos";
import { gravarMapaDaDemo, gravarPartidaDoGC, registrarFalhaDoGC } from "@/lib/partidas";
import { garantirAnaliseDaSessao } from "@/lib/analises";

export const dynamic = "force-dynamic";

/**
 * A fila de partidas para o bot perguntar ao Game Coordinator.
 *
 * GET devolve share codes pendentes; POST traz o scoreboard (ou o motivo de
 * não ter vindo). Mesmo Bearer da fila de mensagens: é o mesmo bot.
 */
async function autorizado(request: NextRequest) {
  const secret = await segredoOpcional("BOT_WEBHOOK_SECRET");
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!(await autorizado(request))) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const [partidas, semMapa] = await Promise.all([
    prisma.match.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 5,
      select: { id: true, shareCode: true },
    }),
    // Gravadas antes de o bot ler o cabeçalho da demo, ou quando a leitura
    // falhou: só o mapa falta, e só a demo é consultada.
    prisma.match.findMany({
      where: { status: "DONE", mapa: null, demoUrl: { not: null }, tentativas: { lt: 3 } },
      orderBy: { createdAt: "asc" },
      take: 3,
      select: { shareCode: true, demoUrl: true },
    }),
  ]);
  return NextResponse.json({ partidas, semMapa });
}

const numeros = z.array(z.number().int().nonnegative());
const resultado = z.object({
  shareCode: z.string().min(1),
  status: z.enum(["DONE", "EXPIRED", "FAILED", "MAPA"]),
  error: z.string().max(400).optional(),
  mapa: z.string().max(64).nullable().optional(),
  servidor: z.string().max(200).nullable().optional(),
  partida: z
    .object({
      matchId: z.string().min(1),
      matchtime: z.number().int().positive(),
      duracaoS: z.number().int().nonnegative(),
      rounds: z.number().int().nonnegative(),
      gameType: z.number().int().nullable(),
      demoUrl: z.string().nullable(),
      mapa: z.string().max(64).nullable().optional(),
      servidor: z.string().max(200).nullable().optional(),
      contas: z.array(z.number().int().positive()).min(2).max(10),
      kills: numeros,
      assists: numeros,
      deaths: numeros,
      mvps: numeros,
      scores: numeros,
      hs: numeros,
      pings: numeros.optional(),
      placar: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
      gc: z.unknown().optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  if (!(await autorizado(request))) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const parsed = resultado.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });

  const { shareCode, status, error, partida, mapa, servidor } = parsed.data;
  if (status === "MAPA") {
    await gravarMapaDaDemo(shareCode, mapa ?? null, servidor ?? null);
  } else if (status === "DONE" && partida) {
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
