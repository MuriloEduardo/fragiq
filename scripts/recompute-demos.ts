import "dotenv/config";
import { recomputarMetricasDasDemos } from "../src/lib/demos";
import { prisma } from "../src/lib/prisma";

/**
 * Refaz as métricas por jogador de todas as demos gravadas, com as regras
 * vigentes (`REGRAS_VERSAO` em src/lib/demo/metricas.ts). Idempotente: os
 * eventos ficam em `MatchDemo.dados` e nunca se apagam.
 *
 *   npm run recompute:demos
 */
async function main() {
  const n = await recomputarMetricasDasDemos();
  console.log(`demos: métricas refeitas em ${n} partida(s)`);
}

main().finally(() => prisma.$disconnect());
