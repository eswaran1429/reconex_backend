/*
  Warnings:

  - Added the required column `url` to the `Domain` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Domain" ADD COLUMN     "url" TEXT NOT NULL;
