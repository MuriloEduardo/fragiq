-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avisosPartidas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "avisosPrivacidade" INTEGER NOT NULL DEFAULT 0;

-- Quem já recebeu o aviso único de antes conta como um lembrete enviado.
UPDATE "users" SET "avisosPrivacidade" = 1 WHERE "avisoPrivacidadeEm" IS NOT NULL;
UPDATE "users" SET "avisosPartidas" = 1 WHERE "avisoPartidasEm" IS NOT NULL;
