type Booking = {
  id: string;
  listingId: string;
  customerId: string;
  createdAt: Date | string;
  active: boolean;
  cancelledAt?: Date | string | null;
};
type Receipt = {
  listingId: string;
  customerId: string;
  createdAt: Date | string;
  amount: unknown;
};
type Completion = Receipt & { reversedAt?: Date | string | null };
const cents = (value: unknown) => Math.round(Number(value) * 100);

// Completion.amount is the total deal value, including advances, never an extra receipt.
export function bookingPayment(
  price: unknown,
  booking: Booking,
  bookings: Booking[],
  advances: Receipt[],
  completions: Completion[],
) {
  const start = new Date(booking.createdAt).getTime();
  const next = bookings
    .filter(
      (b) =>
        b.listingId === booking.listingId &&
        new Date(b.createdAt).getTime() > start,
    )
    .reduce(
      (end, b) => Math.min(end, new Date(b.createdAt).getTime()),
      Infinity,
    );
  const belongs = (r: Receipt) =>
    r.listingId === booking.listingId &&
    r.customerId === booking.customerId &&
    new Date(r.createdAt).getTime() >= start &&
    new Date(r.createdAt).getTime() < next;
  const completion = completions.find(belongs);
  const advance = advances
    .filter(belongs)
    .reduce((sum, r) => sum + cents(r.amount), 0);
  const completed =
    completion && !completion.reversedAt && !booking.cancelledAt;
  const total = cents(completed ? completion.amount : price);
  const received = completed ? total : advance;
  const historical = Boolean(booking.cancelledAt || completion?.reversedAt);
  return {
    price: cents(price) / 100,
    total: total / 100,
    advance: advance / 100,
    received: received / 100,
    balance: Math.max(0, total - received) / 100,
    finalPayment: completed ? Math.max(0, total - advance) / 100 : 0,
    historical,
    status: historical
      ? booking.cancelledAt
        ? "Booking cancelled"
        : "Transaction reversed"
      : completed
        ? "Fully paid · completed"
        : received >= total
          ? "Fully paid · awaiting Admin completion"
          : received > 0
            ? "Advance paid"
            : "Payment pending",
  };
}
