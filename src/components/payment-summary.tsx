import { money } from "@/lib/constants";
import type { bookingPayment } from "@/lib/payments";

export function PaymentSummary({
  payment,
}: {
  payment: ReturnType<typeof bookingPayment>;
}) {
  return (
    <section aria-label="Payment tracking" className="payment-summary">
      <h3>Payment status: {payment.status}</h3>
      <dl className="payment-totals">
        <div>
          <dt>Property price</dt>
          <dd>{money(payment.price)}</dd>
        </div>
        <div>
          <dt>Advances received</dt>
          <dd>{money(payment.advance)}</dd>
        </div>
        {!payment.historical && (
          <>
            <div>
              <dt>Total received</dt>
              <dd>{money(payment.received)}</dd>
            </div>
            <div>
              <dt>Balance due</dt>
              <dd>{money(payment.balance)}</dd>
            </div>
          </>
        )}
        {payment.status === "Fully paid · completed" && (
          <>
            <div>
              <dt>Final deal value (includes advances)</dt>
              <dd>{money(payment.total)}</dd>
            </div>
            <div>
              <dt>Final payment</dt>
              <dd>{money(payment.finalPayment)}</dd>
            </div>
          </>
        )}
      </dl>
      {payment.historical && (
        <p className="muted">
          Historical receipts are retained. They do not count toward a new
          booking; refunds are handled separately.
        </p>
      )}
    </section>
  );
}
