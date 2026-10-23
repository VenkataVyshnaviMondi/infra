import { describe, expect, it } from "vitest";
import { bookingPayment } from "../src/lib/payments";
const booking = {
  id: "b1",
  listingId: "p",
  customerId: "c",
  createdAt: "2026-10-20T10:00:00Z",
  active: true,
};
const receipt = {
  listingId: "p",
  customerId: "c",
  createdAt: "2026-10-20T11:00:00Z",
  amount: "30.25",
};
describe("payment tracking", () => {
  it("shows pending, advance and fully received without counting completion twice", () => {
    expect(bookingPayment(100, booking, [booking], [], []).balance).toBe(100);
    expect(
      bookingPayment(100, booking, [booking], [receipt], []),
    ).toMatchObject({
      received: 30.25,
      balance: 69.75,
      status: "Advance paid",
    });
    expect(
      bookingPayment(
        100,
        booking,
        [booking],
        [receipt],
        [{ ...receipt, amount: 90 }],
      ),
    ).toMatchObject({
      received: 90,
      advance: 30.25,
      finalPayment: 59.75,
      balance: 0,
      total: 90,
    });
    expect(
      bookingPayment(100, booking, [booking], [{ ...receipt, amount: 100 }], [])
        .status,
    ).toBe("Fully paid · awaiting Admin completion");
  });
  it("keeps earlier cancelled booking receipts out of a new booking", () => {
    const old = {
      ...booking,
      active: false,
      cancelledAt: "2026-10-20T12:00:00Z",
    };
    const next = { ...booking, id: "b2", createdAt: "2026-10-21T10:00:00Z" };
    expect(bookingPayment(100, next, [next, old], [receipt], [])).toMatchObject(
      { received: 0, balance: 100 },
    );
    expect(bookingPayment(100, old, [next, old], [receipt], [])).toMatchObject({
      advance: 30.25,
      historical: true,
      status: "Booking cancelled",
    });
  });
});
