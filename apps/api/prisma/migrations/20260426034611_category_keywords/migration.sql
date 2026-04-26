-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "description" TEXT,
ADD COLUMN     "keywords" TEXT[];

-- CreateIndex
CREATE INDEX "categories_keywords_idx" ON "categories" USING GIN ("keywords");
