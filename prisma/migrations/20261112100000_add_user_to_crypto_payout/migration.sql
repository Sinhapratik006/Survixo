-- AddUserToCryptoPayout
ALTER TABLE "CryptoPayoutAccount" ADD COLUMN "userId" TEXT;
CREATE INDEX "CryptoPayoutAccount_userId_idx" ON "CryptoPayoutAccount"("userId");
-- AddForeignKey
ALTER TABLE "CryptoPayoutAccount" ADD CONSTRAINT "CryptoPayoutAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;