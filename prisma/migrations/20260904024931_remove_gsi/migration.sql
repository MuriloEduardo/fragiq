
-- DropForeignKey
ALTER TABLE "matches" DROP CONSTRAINT "matches_userId_fkey";

-- DropIndex
DROP INDEX "users_gsiToken_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "gsiToken";

-- DropTable
DROP TABLE "matches";

