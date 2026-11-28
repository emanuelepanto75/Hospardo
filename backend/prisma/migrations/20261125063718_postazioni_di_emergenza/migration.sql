-- CreateTable
CREATE TABLE "emergency_devices" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_prefix" TEXT NOT NULL,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "last_ip" TEXT,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "emergency_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "emergency_devices_token_hash_key" ON "emergency_devices"("token_hash");
