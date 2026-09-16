import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { decodificarGameType } from "../src/lib/game-type";

/**
 * Preenche `modo` (e `mapa`, quando faltar) das partidas gravadas antes de
 * o `game_type` ser lido como bitmask — até então só 8 e 264 eram
 * conhecidos, e todo competitivo de um mapa só ficou com modo nulo.
 * Idempotente: só toca linhas DONE com `modo` nulo e `gameType` conhecido.
 *
 *   npm run backfill:modo          # usa DATABASE_URL do ambiente
 */
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const partidas = await prisma.match.findMany({
    where: { status: "DONE", modo: null, gameType: { not: null } },
    select: { id: true, gameType: true, mapa: true },
  });
  let modos = 0;
  let mapas = 0;
  for (const p of partidas) {
    const { modo, mapa } = decodificarGameType(p.gameType);
    if (!modo && !(mapa && !p.mapa)) continue;
    await prisma.match.update({
      where: { id: p.id },
      data: { ...(modo ? { modo } : {}), ...(mapa && !p.mapa ? { mapa } : {}) },
    });
    if (modo) modos += 1;
    if (mapa && !p.mapa) mapas += 1;
  }
  console.log(`backfill: ${partidas.length} partida(s) sem modo; ${modos} modo(s) e ${mapas} mapa(s) preenchidos`);
}

main().finally(() => prisma.$disconnect());
