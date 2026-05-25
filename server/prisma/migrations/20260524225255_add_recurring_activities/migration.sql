-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "isRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurrence" TEXT,
ADD COLUMN     "recurrenceEndDate" TEXT;
