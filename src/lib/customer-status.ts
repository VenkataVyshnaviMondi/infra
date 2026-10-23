export const CUSTOMER_STATUSES = [
  { value: "ENQUIRY", label: "Enquiry" },
  { value: "INTERESTED", label: "Interested" },
  { value: "BOOKED", label: "Booked" },
  { value: "ADVANCE_PAID", label: "Advance paid" },
  { value: "FULLY_PAID", label: "Fully paid" },
  { value: "DROPPED", label: "Dropped" },
];
export function customerStatus(customer: {
  preferredListingId?: string | null;
  leads: { listingId: string; stage: string; updatedAt?: string | Date }[];
}) {
  const leads = customer.leads
    .filter(
      (lead) =>
        !customer.preferredListingId ||
        lead.listingId === customer.preferredListingId,
    )
    .sort(
      (a, b) =>
        new Date(b.updatedAt || 0).getTime() -
        new Date(a.updatedAt || 0).getTime(),
    );
  const stage = leads[0]?.stage;
  if (stage === "CONVERTED") return "FULLY_PAID";
  if (stage === "ADVANCE_PAID") return "ADVANCE_PAID";
  if (stage === "BOOKED") return "BOOKED";
  if (stage === "LOST") return "DROPPED";
  return stage ? "INTERESTED" : "ENQUIRY";
}
