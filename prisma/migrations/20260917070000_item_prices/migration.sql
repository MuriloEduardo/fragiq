-- Preço de item do Mercado da Comunidade, um por market_hash_name, em centavos de BRL.

-- CreateTable
CREATE TABLE "item_prices" (
    "marketHashName" TEXT NOT NULL,
    "listado" BOOLEAN NOT NULL DEFAULT true,
    "menorCents" INTEGER,
    "medianaCents" INTEGER,
    "volume" INTEGER,
    "moeda" TEXT NOT NULL DEFAULT 'BRL',
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_prices_pkey" PRIMARY KEY ("marketHashName")
);

-- CreateIndex
CREATE INDEX "item_prices_atualizadoEm_idx" ON "item_prices"("atualizadoEm");

