-- Insights materializados, determinísticos e versionados (docs/dados-confiaveis.md §3.3).

-- CreateEnum
CREATE TYPE "InsightEscopo" AS ENUM ('SESSAO', 'MODO', 'PERIODO');

-- CreateEnum
CREATE TYPE "InsightTom" AS ENUM ('BOM', 'RUIM', 'NEUTRO', 'AVISO');

-- CreateEnum
CREATE TYPE "InsightVisual" AS ENUM ('CHIP', 'SELO', 'BARRA', 'SPARKLINE', 'RANK', 'ANEL');

-- CreateTable
CREATE TABLE "insights" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameAppId" INTEGER NOT NULL,
    "escopo" "InsightEscopo" NOT NULL,
    "escopoId" TEXT NOT NULL,
    "regra" TEXT NOT NULL,
    "regraVersao" INTEGER NOT NULL,
    "entradasHash" TEXT NOT NULL,
    "valor" DOUBLE PRECISION,
    "referencia" DOUBLE PRECISION,
    "referenciaTipo" TEXT,
    "delta" DOUBLE PRECISION,
    "deltaUnidade" TEXT,
    "tom" "InsightTom" NOT NULL,
    "confianca" "ModoConfianca",
    "base" JSONB NOT NULL,
    "visual" "InsightVisual" NOT NULL,
    "dados" JSONB NOT NULL,
    "linha" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "insights_userId_gameAppId_escopo_escopoId_idx" ON "insights"("userId", "gameAppId", "escopo", "escopoId");

-- CreateIndex
CREATE UNIQUE INDEX "insights_escopo_escopoId_regra_regraVersao_key" ON "insights"("escopo", "escopoId", "regra", "regraVersao");

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

