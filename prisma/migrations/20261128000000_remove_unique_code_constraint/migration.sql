-- DropIndex: allow multiple concurrent PENDING orders with the exact same totalAmount
DROP INDEX IF EXISTS "uniq_pending_order_amount";

-- DropIndex
DROP INDEX IF EXISTS "VoteOrder_eventId_uniqueCode_expiresAt_idx";

-- AlterTable
ALTER TABLE "VoteOrder" ALTER COLUMN "uniqueCode" SET DEFAULT 0;
