-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('NUOVA', 'CONFERMATA', 'RIFIUTATA');

-- CreateTable
CREATE TABLE "booking_requests" (
    "id" SERIAL NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'NUOVA',
    "doctor_id" INTEGER NOT NULL,
    "service_id" INTEGER NOT NULL,
    "preferred_start" TIMESTAMP(3),
    "preferred_end" TIMESTAMP(3),
    "preferences" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "fiscal_code" TEXT,
    "birth_date" DATE,
    "notes" TEXT,
    "whatsapp_opt_in" BOOLEAN NOT NULL DEFAULT true,
    "appointment_id" INTEGER,
    "handled_by_id" INTEGER,
    "handled_at" TIMESTAMP(3),
    "reject_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "booking_requests_appointment_id_key" ON "booking_requests"("appointment_id");

-- CreateIndex
CREATE INDEX "booking_requests_status_created_at_idx" ON "booking_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "booking_requests_doctor_id_preferred_start_idx" ON "booking_requests"("doctor_id", "preferred_start");

-- AddForeignKey
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
