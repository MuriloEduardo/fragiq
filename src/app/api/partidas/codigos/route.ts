import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { decifrar } from "@/lib/partidas";

export const dynamic = "force-dynamic";

/**
 * Os códigos da corrente, para o dono ver: o de autenticação (decifrado
 * na hora, nunca cacheado), o share code atual (de onde a próxima busca
 * continua) e o da última partida gravada. Só com sessão, só os próprios.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { steamAuthCode: true, shareCodeAtual: true, partidasAtivadasEm: true, partidasErro: true } });
  if (!user?.partidasAtivadasEm) return NextResponse.json({ ativo: false });
  let authCode: string | null = null;
  let authLegivel = true;
  try {
    authCode = user.steamAuthCode ? await decifrar(user.steamAuthCode) : null;
  } catch {
    authLegivel = false;
  }
  const ultima = await prisma.match.findFirst({ where: { status: "DONE", jogadores: { some: { userId: session.userId } } }, orderBy: { jogadaEm: "desc" }, select: { shareCode: true, jogadaEm: true, mapa: true } });
  return NextResponse.json({
    ativo: true,
    authCode,
    authLegivel,
    shareCodeAtual: user.shareCodeAtual,
    ultimaPartida: ultima ? { shareCode: ultima.shareCode, jogadaEm: ultima.jogadaEm, mapa: ultima.mapa } : null,
    erro: user.partidasErro,
  });
}
