-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('CARICO', 'SCARICO', 'RETTIFICA');

-- CreateTable
CREATE TABLE "stock_items" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "category" TEXT,
    "supplier" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pz',
    "purchase_price_cents" INTEGER,
    "min_stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "track_lots" BOOLEAN NOT NULL DEFAULT false,
    "is_implant" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_barcodes" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "pack_qty" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "stock_barcodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_lots" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "lot" TEXT NOT NULL,
    "expiry" DATE,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "lot_id" INTEGER,
    "type" "StockMovementType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit_cost_cents" INTEGER,
    "supplier" TEXT,
    "document" TEXT,
    "patient_id" INTEGER,
    "tooth" INTEGER,
    "treatment_id" INTEGER,
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "serial" TEXT,
    "note" TEXT,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_materials" (
    "service_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "service_materials_pkey" PRIMARY KEY ("service_id","item_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_items_code_key" ON "stock_items"("code");

-- CreateIndex
CREATE INDEX "stock_items_name_idx" ON "stock_items"("name");

-- CreateIndex
CREATE UNIQUE INDEX "stock_barcodes_code_key" ON "stock_barcodes"("code");

-- CreateIndex
CREATE INDEX "stock_lots_expiry_idx" ON "stock_lots"("expiry");

-- CreateIndex
CREATE UNIQUE INDEX "stock_lots_item_id_lot_key" ON "stock_lots"("item_id", "lot");

-- CreateIndex
CREATE INDEX "stock_movements_item_id_created_at_idx" ON "stock_movements"("item_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_patient_id_idx" ON "stock_movements"("patient_id");

-- CreateIndex
CREATE INDEX "stock_movements_treatment_id_idx" ON "stock_movements"("treatment_id");

-- CreateIndex
CREATE INDEX "stock_movements_created_at_idx" ON "stock_movements"("created_at");

-- AddForeignKey
ALTER TABLE "stock_barcodes" ADD CONSTRAINT "stock_barcodes_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "stock_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "dental_treatments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_materials" ADD CONSTRAINT "service_materials_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_materials" ADD CONSTRAINT "service_materials_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
