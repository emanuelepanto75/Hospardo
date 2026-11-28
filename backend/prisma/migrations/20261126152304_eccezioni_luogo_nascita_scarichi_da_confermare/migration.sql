-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "birth_place" TEXT;

-- CreateTable
CREATE TABLE "schedule_exceptions" (
    "id" SERIAL NOT NULL,
    "doctor_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "schedule_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_unload_drafts" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "doctor_id" INTEGER NOT NULL,
    "patient_id" INTEGER,
    "tooth" INTEGER,
    "treatment_id" INTEGER,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_unload_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_exceptions_doctor_id_date_idx" ON "schedule_exceptions"("doctor_id", "date");

-- CreateIndex
CREATE INDEX "stock_unload_drafts_doctor_id_date_idx" ON "stock_unload_drafts"("doctor_id", "date");

-- AddForeignKey
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_unload_drafts" ADD CONSTRAINT "stock_unload_drafts_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_unload_drafts" ADD CONSTRAINT "stock_unload_drafts_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_unload_drafts" ADD CONSTRAINT "stock_unload_drafts_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_unload_drafts" ADD CONSTRAINT "stock_unload_drafts_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "dental_treatments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
