-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "dental_enabled" BOOLEAN NOT NULL DEFAULT false;

-- le cartelle che contengono già dati restano attive
UPDATE "patients" SET "dental_enabled" = true
WHERE "id" IN (SELECT "patient_id" FROM "dental_teeth" UNION SELECT "patient_id" FROM "dental_treatments");
