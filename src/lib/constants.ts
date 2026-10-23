export const CATEGORIES = [
  { id: "plots", name: "Plots", options: ["Lease", "Sale"] },
  { id: "flats", name: "Flats", options: ["Rent", "Sale"] },
  { id: "houses", name: "Individual Houses", options: ["Rent", "Sale"] },
  {
    id: "furniture",
    name: "Furniture",
    options: ["Sofa", "Dining", "Beds", "Wardrobes", "Home Decor"],
  },
];
export const STAGES = [
  "NEW",
  "CONTACTED",
  "VISIT_SCHEDULED",
  "VISITED",
  "NEGOTIATION",
  "BOOKED",
  "ADVANCE_PAID",
  "CONVERTED",
  "LOST",
] as const;
export const STATUSES = [
  "AVAILABLE",
  "BOOKED",
  "ADVANCE_PAID",
  "SOLD",
  "RENTED",
  "LEASED",
  "ARCHIVED",
];
export const label = (v: string) =>
  v
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
export const money = (v: unknown) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(v || 0));
export const date = (v: string | Date | undefined | null, time = false) =>
  v
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
      }).format(new Date(v))
    : "—";
export function localInput(v = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(v)
    .replace(" ", "T");
}
