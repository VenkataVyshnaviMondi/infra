ALTER TABLE "Customer"
  ADD COLUMN "age" INTEGER,
  ADD COLUMN "contactDetails" TEXT,
  ADD COLUMN "contactType" TEXT NOT NULL DEFAULT 'ENQUIRY',
  ADD COLUMN "contactDate" TIMESTAMP(3);
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_age_check" CHECK ("age" IS NULL OR "age" BETWEEN 1 AND 120);
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_contactType_check" CHECK ("contactType" IN ('VISIT', 'ENQUIRY'));
