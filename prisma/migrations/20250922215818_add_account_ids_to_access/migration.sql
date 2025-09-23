-- AlterTable
ALTER TABLE "public"."Access" ADD COLUMN     "accountIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
