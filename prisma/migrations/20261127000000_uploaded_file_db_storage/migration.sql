-- CreateTable
CREATE TABLE "UploadedFile" (
    "path" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadedFile_pkey" PRIMARY KEY ("path")
);

-- CreateIndex
CREATE INDEX "UploadedFile_sha256_idx" ON "UploadedFile"("sha256");
