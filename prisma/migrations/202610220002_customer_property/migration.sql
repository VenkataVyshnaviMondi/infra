ALTER TABLE "Customer" ADD COLUMN "preferredListingId" TEXT;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_preferredListingId_fkey" FOREIGN KEY ("preferredListingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Customer_preferredListingId_idx" ON "Customer"("preferredListingId");
UPDATE "Customer" AS c SET "preferredListingId" = i."listingId"
FROM (
  SELECT DISTINCT ON ("customerId") "customerId", "listingId"
  FROM "Interaction"
  ORDER BY "customerId", ("requestKey" = 'customer-create:' || "customerId") DESC, "occurredAt" DESC, "id"
) AS i WHERE i."customerId" = c."id";
