-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancel_seen_at" TIMESTAMP(3),
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "cancelled_by_patient" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "booking_requests" ADD COLUMN     "move_of_id" INTEGER;

-- AddForeignKey
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_move_of_id_fkey" FOREIGN KEY ("move_of_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
