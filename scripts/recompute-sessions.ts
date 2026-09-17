import "dotenv/config";
import { recomputarSessoes } from "../src/lib/sessao/materializar";
import { prisma } from "../src/lib/prisma";

/**
 * Refaz as sessões materializadas a partir dos fatos (snapshots, observações
 * do bot, partidas do GC) com a regra vigente. Idempotente. Rodar quando
 * `REGRA_VERSAO` sobe, ou uma vez depois de a tabela nascer.
 *
 *   npm run recompute:sessions            # todos
 *   npm run recompute:sessions -- <userId>
 */
async function main() {
  const r = await recomputarSessoes(process.argv[2]);
  console.log(`sessões: ${r.sessoes} em ${r.jogadores} jogador(es) — EXATA ${r.porConfianca.EXATA}, INFERIDA ${r.porConfianca.INFERIDA}, MISTA ${r.porConfianca.MISTA}`);
}

main().finally(() => prisma.$disconnect());
