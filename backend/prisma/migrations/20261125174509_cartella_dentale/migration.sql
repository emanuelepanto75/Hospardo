-- AlterTable
ALTER TABLE "doctors" ADD COLUMN     "is_dentist" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "dental_teeth" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "tooth" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SANO',
    "surfaces" JSONB NOT NULL DEFAULT '{}',
    "note" TEXT,
    "updated_by_id" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dental_teeth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dental_treatments" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "tooth" INTEGER,
    "surfaces" TEXT,
    "service_id" INTEGER,
    "doctor_id" INTEGER NOT NULL,
    "appointment_id" INTEGER,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dental_treatments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dental_teeth_patient_id_tooth_key" ON "dental_teeth"("patient_id", "tooth");

-- CreateIndex
CREATE INDEX "dental_treatments_patient_id_date_idx" ON "dental_treatments"("patient_id", "date");

-- AddForeignKey
ALTER TABLE "dental_teeth" ADD CONSTRAINT "dental_teeth_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dental_treatments" ADD CONSTRAINT "dental_treatments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dental_treatments" ADD CONSTRAINT "dental_treatments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dental_treatments" ADD CONSTRAINT "dental_treatments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dental_treatments" ADD CONSTRAINT "dental_treatments_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
