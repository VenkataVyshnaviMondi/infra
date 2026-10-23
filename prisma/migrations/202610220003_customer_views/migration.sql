CREATE TABLE "CustomerPropertyView" (
  "customerId" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerPropertyView_pkey" PRIMARY KEY ("customerId", "listingId"),
  CONSTRAINT "CustomerPropertyView_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CustomerPropertyView_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CustomerPropertyView_listingId_idx" ON "CustomerPropertyView"("listingId");
INSERT INTO "CustomerPropertyView" ("customerId", "listingId", "createdAt")
SELECT "customerId", "listingId", MIN("occurredAt") FROM "Interaction" GROUP BY "customerId", "listingId" ON CONFLICT DO NOTHING;
INSERT INTO "CustomerPropertyView" ("customerId", "listingId", "createdAt")
SELECT "id", "preferredListingId", "createdAt" FROM "Customer" WHERE "preferredListingId" IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO "CustomerPropertyView" ("customerId", "listingId", "createdAt")
SELECT "customerId", "listingId", MIN("createdAt") FROM "Booking" GROUP BY "customerId", "listingId" ON CONFLICT DO NOTHING;
