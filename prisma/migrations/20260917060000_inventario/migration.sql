-- Inventário de CS2 como fato com história (entrou/saiu), sem preço.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "inventarioLidoEm" TIMESTAMP(3),
ADD COLUMN     "inventarioPublico" BOOLEAN;

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "marketHashName" TEXT,
    "type" TEXT,
    "imageUrl" TEXT,
    "rarity" TEXT,
    "rarityKey" TEXT,
    "rarityColor" TEXT,
    "exterior" TEXT,
    "exteriorKey" TEXT,
    "weapon" TEXT,
    "category" TEXT,
    "stattrak" BOOLEAN NOT NULL DEFAULT false,
    "souvenir" BOOLEAN NOT NULL DEFAULT false,
    "tradable" BOOLEAN NOT NULL DEFAULT false,
    "marketable" BOOLEAN NOT NULL DEFAULT false,
    "primeiraVezEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaVezEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saiuEm" TIMESTAMP(3),

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_items_userId_saiuEm_idx" ON "inventory_items"("userId", "saiuEm");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_userId_assetId_key" ON "inventory_items"("userId", "assetId");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

