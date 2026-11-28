-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('PROPOSTO', 'ACCETTATO', 'COMPLETATO', 'RIFIUTATO');

-- CreateEnum
CREATE TYPE "PlanItemStatus" AS ENUM ('DA_FARE', 'PROGRAMMATO', 'ESEGUITO');

-- CreateTable
CREATE TABLE "treatment_plans" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "doctor_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'PROPOSTO',
    "discount_cents" INTEGER NOT NULL DEFAULT 0,
    "valid_until" DATE,
    "notes" TEXT,
    "accepted_at" TIMESTAMP(3),
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_plan_items" (
    "id" SERIAL NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "service_id" INTEGER,
    "description" TEXT NOT NULL,
    "tooth" INTEGER,
    "surfaces" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price_cents" INTEGER NOT NULL DEFAULT 0,
    "status" "PlanItemStatus" NOT NULL DEFAULT 'DA_FARE',
    "appointment_id" INTEGER,
    "treatment_id" INTEGER,
    "done_at" TIMESTAMP(3),

    CONSTRAINT "treatment_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treatment_plans_patient_id_idx" ON "treatment_plans"("patient_id");

-- CreateIndex
CREATE INDEX "treatment_plans_status_idx" ON "treatment_plans"("status");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_plans_year_number_key" ON "treatment_plans"("year", "number");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_plan_items_treatment_id_key" ON "treatment_plan_items"("treatment_id");

-- CreateIndex
CREATE INDEX "treatment_plan_items_plan_id_idx" ON "treatment_plan_items"("plan_id");

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "treatment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "dental_treatments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
