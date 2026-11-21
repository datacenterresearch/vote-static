-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'LATE_PAYMENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MutationStatus" AS ENUM ('MATCHED', 'UNMATCHED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "ProofStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "pricePerVote" INTEGER NOT NULL,
    "qrisImagePath" TEXT,
    "qrisRawPayload" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "orderCutoffMinutes" INTEGER NOT NULL DEFAULT 15,
    "isBlindMode" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "photoPath" TEXT,
    "description" TEXT,
    "totalVotes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoteOrder" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "voterName" TEXT NOT NULL,
    "voterContact" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "voteQty" INTEGER NOT NULL,
    "baseAmount" INTEGER NOT NULL,
    "uniqueCode" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoteOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMutation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "amount" INTEGER NOT NULL,
    "rrn" TEXT NOT NULL,
    "rawMessage" TEXT,
    "source" TEXT NOT NULL,
    "status" "MutationStatus" NOT NULL,
    "matchedOrderId" TEXT,
    "transactionAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMutation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoteLedger" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "voteQty" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoteLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualProof" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "imageHash" TEXT NOT NULL,
    "rrnInput" TEXT,
    "status" "ProofStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListenerHeartbeat" (
    "id" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "lastPingAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "ListenerHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE INDEX "Candidate_eventId_idx" ON "Candidate"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_eventId_number_key" ON "Candidate"("eventId", "number");

-- CreateIndex
CREATE INDEX "VoteOrder_eventId_status_idx" ON "VoteOrder"("eventId", "status");

-- CreateIndex
CREATE INDEX "VoteOrder_eventId_uniqueCode_expiresAt_idx" ON "VoteOrder"("eventId", "uniqueCode", "expiresAt");

-- CreateIndex
CREATE INDEX "VoteOrder_sessionKey_eventId_status_idx" ON "VoteOrder"("sessionKey", "eventId", "status");

-- Custom Partial Unique Index: guarantees no two PENDING orders in the same event share totalAmount
CREATE UNIQUE INDEX "uniq_pending_order_amount" ON "VoteOrder"("eventId", "totalAmount") WHERE ("status" = 'PENDING');

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMutation_rrn_key" ON "PaymentMutation"("rrn");

-- CreateIndex
CREATE INDEX "PaymentMutation_amount_status_idx" ON "PaymentMutation"("amount", "status");

-- CreateIndex
CREATE INDEX "PaymentMutation_receivedAt_idx" ON "PaymentMutation"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VoteLedger_orderId_key" ON "VoteLedger"("orderId");

-- CreateIndex
CREATE INDEX "VoteLedger_candidateId_idx" ON "VoteLedger"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "ManualProof_imageHash_key" ON "ManualProof"("imageHash");

-- CreateIndex
CREATE INDEX "ManualProof_orderId_idx" ON "ManualProof"("orderId");

-- CreateIndex
CREATE INDEX "ManualProof_status_idx" ON "ManualProof"("status");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "ListenerHeartbeat_deviceName_key" ON "ListenerHeartbeat"("deviceName");

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteOrder" ADD CONSTRAINT "VoteOrder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteOrder" ADD CONSTRAINT "VoteOrder_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMutation" ADD CONSTRAINT "PaymentMutation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMutation" ADD CONSTRAINT "PaymentMutation_matchedOrderId_fkey" FOREIGN KEY ("matchedOrderId") REFERENCES "VoteOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteLedger" ADD CONSTRAINT "VoteLedger_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "VoteOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteLedger" ADD CONSTRAINT "VoteLedger_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualProof" ADD CONSTRAINT "ManualProof_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "VoteOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
