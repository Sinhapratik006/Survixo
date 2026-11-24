-- DropIndex
DROP INDEX "Order_dodoCheckoutId_key";

-- AlterTable
ALTER TABLE "MarketplaceListing" DROP COLUMN "dodoProductId",
DROP COLUMN "dodoPriceId";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "dodoCheckoutId",
DROP COLUMN "dodoPaymentId",
DROP COLUMN "dodoCustomerId",
ADD COLUMN     "paymentNetwork" TEXT,
ADD COLUMN     "paymentToken" TEXT,
ADD COLUMN     "paymentTxHash" TEXT,
ADD COLUMN     "paymentConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentConfirmedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "usdcWalletAddress" TEXT,
ADD COLUMN     "usdtWalletAddress" TEXT;
