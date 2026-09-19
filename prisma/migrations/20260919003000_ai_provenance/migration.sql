ALTER TABLE "AISuggestion"
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "redactions" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "fallbackUsed" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "AISuggestion_requestId_idx" ON "AISuggestion"("requestId");
