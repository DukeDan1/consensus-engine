-- AlterTable
ALTER TABLE "public"."UserPasswordResetCode" ADD COLUMN     "used" BOOLEAN NOT NULL DEFAULT false;
