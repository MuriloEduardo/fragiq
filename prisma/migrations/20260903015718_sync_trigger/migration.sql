-- CreateEnum
CREATE TYPE "SyncTrigger" AS ENUM ('MANUAL', 'LOGIN', 'CRON');

-- AlterTable
ALTER TABLE "sync_runs" ADD COLUMN     "trigger" "SyncTrigger" NOT NULL DEFAULT 'MANUAL';
