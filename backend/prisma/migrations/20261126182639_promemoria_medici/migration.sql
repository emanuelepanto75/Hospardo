-- CreateTable
CREATE TABLE "doctor_reminders" (
    "id" SERIAL NOT NULL,
    "doctor_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "recipient" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "sent_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doctor_reminders_doctor_id_date_idx" ON "doctor_reminders"("doctor_id", "date");

-- AddForeignKey
ALTER TABLE "doctor_reminders" ADD CONSTRAINT "doctor_reminders_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
