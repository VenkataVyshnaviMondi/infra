import { describe, expect, it } from "vitest";
import { customerStatus } from "../src/lib/customer-status";
describe("customer CRM filters", () => {
  it.each([
    ["NEW", "INTERESTED"],
    ["NEGOTIATION", "INTERESTED"],
    ["BOOKED", "BOOKED"],
    ["ADVANCE_PAID", "ADVANCE_PAID"],
    ["CONVERTED", "FULLY_PAID"],
    ["LOST", "DROPPED"],
  ])("maps %s to %s", (stage, expected) => {
    expect(
      customerStatus({
        preferredListingId: "current",
        leads: [{ listingId: "current", stage }],
      }),
    ).toBe(expected);
  });
  it("does not treat a completed transaction for another property as fully paid for the current property", () => {
    expect(
      customerStatus({
        preferredListingId: "current",
        leads: [{ listingId: "past", stage: "CONVERTED" }],
      }),
    ).toBe("ENQUIRY");
  });
});
