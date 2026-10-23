export const isFrozenStatus = (status: string) =>
  ["BOOKED", "ADVANCE_PAID", "SOLD", "RENTED", "LEASED"].includes(status);
