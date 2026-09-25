-- A economia de cada time na partida: quantos rounds jogou e venceu em
-- cada classe de compra (pistol, eco, meia, cheia). Ver docs/demos.md
-- §4.3. Sai da amostra `round.economia` do payload v2, então demo lida em
-- v1 fica com tudo nulo — nulo é "sem amostra", não zero —, e o `npm run
-- recompute:demos` é quem preenche as v2 já gravadas.

-- AlterTable
ALTER TABLE "match_team_demos" ADD COLUMN     "cheia" INTEGER,
ADD COLUMN     "cheiaGanhas" INTEGER,
ADD COLUMN     "eco" INTEGER,
ADD COLUMN     "ecoGanhos" INTEGER,
ADD COLUMN     "meia" INTEGER,
ADD COLUMN     "meiaGanhas" INTEGER,
ADD COLUMN     "pistol" INTEGER,
ADD COLUMN     "pistolGanhos" INTEGER;
