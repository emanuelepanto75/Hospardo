-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('CONFERMA', 'PROMEMORIA', 'ANNULLAMENTO', 'SPOSTAMENTO');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('INVIATO', 'SIMULATO', 'ERRORE');

-- AlterTable
ALTER TABLE "doctor_services" ADD COLUMN     "bookable_online" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "duration_min" INTEGER,
ADD COLUMN     "price_cents" INTEGER;

-- AlterTable
ALTER TABLE "doctors" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "whatsapp_opt_in" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "category" TEXT;

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "appointment_id" INTEGER NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "recipient" TEXT NOT NULL,
    "error" TEXT,
    "provider_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_appointment_id_idx" ON "notifications"("appointment_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
