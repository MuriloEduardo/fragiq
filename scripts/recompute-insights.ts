import "dotenv/config";
import { recomputarInsights } from "../src/lib/insights/materializar";
import { prisma } from "../src/lib/prisma";

/**
 * Refaz os insights materializados com as regras vigentes. Idempotente.
 * Rodar quando a versão de uma regra sobe, ou depois de `recompute:sessions`.
 *
 *   npm run recompute:insights            # todos
 *   npm run recompute:insights -- <userId>
 */
async function main() {
  const r = await recomputarInsights(process.argv[2]);
  console.log(`insights: ${r.insights} em ${r.jogadores} jogador(es)`);
}

main().finally(() => prisma.$disconnect());
