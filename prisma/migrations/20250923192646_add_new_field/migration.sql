/*
  Warnings:

  - You are about to drop the column `used` on the `UserPasswordResetCode` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."UserPasswordResetCode" DROP COLUMN "used",
ADD COLUMN     "isUsed" BOOLEAN NOT NULL DEFAULT false;
