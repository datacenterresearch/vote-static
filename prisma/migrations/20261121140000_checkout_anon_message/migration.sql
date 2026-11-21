-- AlterTable
ALTER TABLE "VoteOrder" ALTER COLUMN "voterContact" DROP NOT NULL;
ALTER TABLE "VoteOrder" ADD COLUMN "isAnonymous" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VoteOrder" ADD COLUMN "supportMessage" TEXT;
