-- O ADR e as kills de cada jogador pela compra do time no round (pistol,
-- eco, meia, cheia). Ver docs/demos.md §4.3. Só existe em demo lida com o
-- payload v2; linha antiga fica nula, e demo v2 gravada antes desta
-- coluna ganha o número no `npm run recompute:demos` — que é também quem
-- sobe o `versaoRegras` para 3.

-- AlterTable
ALTER TABLE "match_player_demos" ADD COLUMN     "porCompra" JSONB;
