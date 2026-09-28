-- Additive change: existing accounts remain LOCAL. No passwords or roles are changed.
BEGIN;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "authSource" TEXT NOT NULL DEFAULT 'LOCAL';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "adObjectId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_adObjectId_key" ON "User"("adObjectId");
COMMIT;
