"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Grid2X2,
  List,
  MapPin,
  Eye,
  MessageSquare,
  Plus,
  ArrowLeft,
  Pencil,
  CalendarCheck,
  Wallet,
  CheckCircle2,
  UserMinus,
} from "lucide-react";
import type { Actor } from "@/lib/auth";
import { isFrozenStatus } from "@/lib/listing-state";
import { pricePerSqft } from "@/lib/property-price";
import { bookingPayment } from "@/lib/payments";
import { PaymentSummary } from "./payment-summary";
import { CATEGORIES, date, label, money, STATUSES } from "@/lib/constants";
import {
  ActionForm,
  api,
  Badge,
  Empty,
  ErrorBox,
  Field,
  Loading,
  Modal,
  Photo,
  Select,
  useData,
} from "./ui";
import { InteractionForm } from "./crm";
export function Inventory({ user }: { user: Actor }) {
  void user;
  const params = useSearchParams();
  const router = useRouter();
  const filters = Object.fromEntries(params.entries());
  const savedId = params.get("saved");
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState("grid");
  const [q, setQ] = useState(params.get("q") || "");
  useEffect(() => {
    setQ(params.get("q") || "");
  }, [params]);
  const { data, error, busy, reload } = useData(
    "listings?" + new URLSearchParams(filters),
    15000,
  );
  const options = useData("options");
  const update = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.delete("saved");
    if (v) next.set(k, v);
    else next.delete(k);
    if (k === "category") {
      next.delete("option");
      if (v === "furniture") next.delete("kind");
    }
    next.set("page", k === "page" ? v : "1");
    router.replace("/categories?" + next, { scroll: false });
  };
  const category = CATEGORIES.find((c) => c.id === filters.category);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            {filters.kind === "property" && filters.status === "SOLD"
              ? "Sold properties"
              : "Categories & inventory"}
          </h1>
          <p>
            {filters.kind === "property" && filters.status === "SOLD"
              ? "Completed sales of plots, flats and individual houses."
              : "Find the right property or furniture for your customer."}
          </p>
          {filters.kind === "property" && (
            <Link href="/categories">Show all inventory</Link>
          )}
        </div>
        <Link className="button" href="/uploads">
          <Plus size={17} />
          Add listing
        </Link>
      </div>
      {savedId && !busy && data?.rows.some((l: any) => l.id === savedId) && (
        <div className="success-box upload-success" role="status">
          <div>
            <strong>Listing uploaded successfully</strong>
            <p>
              Saved to the database and available in{" "}
              {CATEGORIES.find((c) => c.id === filters.category)?.name ||
                "Categories"}
              .
            </p>
          </div>
          <Link
            className="button secondary small"
            href={"/listings/" + savedId}
          >
            View listing
          </Link>
          <Link className="button small" href="/uploads">
            Add another listing
          </Link>
        </div>
      )}
      <div className="category-tabs">
        <button
          className={!filters.category ? "active" : ""}
          aria-pressed={!filters.category}
          onClick={() => {
            update("category", "");
          }}
        >
          All inventory{" "}
          <span className="category-count">
            {data?.categoryCounts?.reduce(
              (sum: number, c: any) => sum + c._count,
              0,
            ) ?? "—"}
          </span>
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={filters.category === c.id ? "active" : ""}
            aria-pressed={filters.category === c.id}
            onClick={() => {
              update("category", c.id);
            }}
          >
            {c.name}
            <span className="category-count">
              {data?.categoryCounts?.find(
                (count: any) => count.categoryId === c.id,
              )?._count ?? 0}
            </span>
          </button>
        ))}
      </div>
      {category && (
        <div className="transaction-tabs" aria-label="Listing purpose">
          <button
            className={!filters.option ? "active" : ""}
            onClick={() => update("option", "")}
          >
            All {category.name.toLowerCase()}
          </button>
          {category.options.map((name) => {
            const id =
              category.id + "-" + name.toLowerCase().replaceAll(" ", "-");
            return (
              <button
                key={id}
                className={filters.option === id ? "active" : ""}
                aria-pressed={filters.option === id}
                onClick={() => update("option", id)}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
      <section className="panel filter-panel">
        <form
          className="search-field"
          onSubmit={(e) => {
            e.preventDefault();
            update("q", q);
          }}
        >
          <Search size={18} />
          <input
            aria-label="Search inventory"
            placeholder="Search by title, listing ID, project or locality"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="button small secondary">Search</button>
        </form>
        <button
          className="text-button filter-disclosure"
          aria-expanded={showFilters}
          aria-controls="inventory-filters"
          onClick={() => setShowFilters((value) => !value)}
        >
          {showFilters ? "Hide filters" : "Filter by city, price or status"}
        </button>
        <div className="filters" id="inventory-filters" hidden={!showFilters}>
          <Select
            label="Subcategory"
            options={(category?.options || []).map((o) => ({
              value: category!.id + "-" + o.toLowerCase().replaceAll(" ", "-"),
              label: o,
            }))}
            value={filters.option || ""}
            onChange={(v) => update("option", v)}
          />
          <Field
            label="City"
            value={filters.location || ""}
            onChange={(e) => update("location", e.target.value)}
          />
          <Select
            label="Status"
            options={STATUSES.map((s) => ({ value: s, label: label(s) }))}
            value={filters.status || ""}
            onChange={(v) => update("status", v)}
          />
          <Field
            label="Minimum price (₹)"
            type="number"
            min={0}
            value={filters.min || ""}
            onChange={(e) => update("min", e.target.value)}
          />
          <Field
            label="Maximum price (₹)"
            type="number"
            min={0}
            value={filters.max || ""}
            onChange={(e) => update("max", e.target.value)}
          />
          <Select
            label="Created by"
            options={
              options.data?.creators.map((u: any) => ({
                value: u.id,
                label: u.name,
              })) || []
            }
            value={filters.creator || ""}
            onChange={(v) => update("creator", v)}
          />
        </div>
      </section>
      <div className="results-bar">
        <span>
          {busy ? "Loading…" : `${data?.total || 0} listings`}{" "}
          <small className="muted">· Refreshes automatically</small>
        </span>
        <div>
          <button
            className="text-button"
            onClick={() => {
              router.replace("/categories", { scroll: false });
              setQ("");
            }}
          >
            Clear filters
          </button>
          <select
            aria-label="Sort listings"
            value={filters.sort || ""}
            onChange={(e) => update("sort", e.target.value)}
          >
            <option value="">Newest first</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="views">Most customer views</option>
          </select>
          <div className="view-toggle">
            <button
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              className={view === "grid" ? "active" : ""}
              onClick={() => setView("grid")}
            >
              <Grid2X2 size={18} />
            </button>
            <button
              aria-label="Table view"
              aria-pressed={view === "table"}
              className={view === "table" ? "active" : ""}
              onClick={() => setView("table")}
            >
              <List size={18} />
            </button>
          </div>
        </div>
      </div>
      <ErrorBox message={error} />
      {error && <button onClick={reload}>Retry</button>}
      {error && !data ? null : busy ? (
        <Loading />
      ) : !data?.rows.length ? (
        <Empty
          title="No matching listings"
          description="Try clearing a filter or upload your first listing."
        >
          <Link href="/uploads" className="button">
            Add listing
          </Link>
        </Empty>
      ) : view === "grid" ? (
        <div className="listing-grid">
          {data.rows.map((l: any) => (
            <ListingCard key={l.id} l={l} />
          ))}
        </div>
      ) : (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Listing</th>
                <th>Category</th>
                <th>Price</th>
                <th>Location</th>
                <th>Status</th>
                <th>Views</th>
                <th>Lost customers</th>
                <th>Enquiries</th>
                <th>Creator</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((l: any) => (
                <tr key={l.id}>
                  <td>
                    <Link href={"/listings/" + l.id}>{l.title}</Link>
                    <small>{l.id}</small>
                  </td>
                  <td>
                    {l.category.name} / {l.option.name}
                  </td>
                  <td>{money(l.price)}</td>
                  <td>
                    {l.locality}, {l.city}
                  </td>
                  <td>
                    <Badge value={l.status} />
                  </td>
                  <td>{l.views}</td>
                  <td>{l.lostCustomers || 0}</td>
                  <td>{l.enquiries}</td>
                  <td>{l.creator.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && (
        <div className="pagination">
          <button
            className="button secondary"
            disabled={data.page <= 1}
            onClick={() => update("page", String(data.page - 1))}
          >
            Previous
          </button>
          <span>
            Page {data.page} of {data.pages}
          </span>
          <button
            className="button secondary"
            disabled={data.page >= data.pages}
            onClick={() => update("page", String(data.page + 1))}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
export function ListingCard({ l }: { l: any }) {
  const rate = pricePerSqft(l.categoryId, l.price, l.property);
  return (
    <Link className="listing-card" href={"/listings/" + l.id}>
      <div className="listing-cover">
        <Photo id={l.photos[0]?.id} alt={l.title} />
        <Badge value={l.status} />
        <span className="listing-category">
          {l.category.name} · {l.option.name}
        </span>
      </div>
      <div className="listing-card-body">
        <strong className="price">
          {money(l.price)}
          {l.option.transactionType === "Rent" && <small> / month</small>}
        </strong>
        <h2>{l.title}</h2>
        {rate !== null && (
          <p className="muted">
            {money(rate)} / sqft
            {l.option.transactionType === "Rent" ? " / month" : ""}
          </p>
        )}
        <p className="listing-location">
          <MapPin size={14} />
          {l.locality}, {l.city}
        </p>
        <p className="listing-attributes">
          {l.property?.bhk
            ? `${l.property.bhk} BHK · ${l.property.bathrooms} baths · ${l.property.superArea} sqft`
            : l.property?.plotArea
              ? `${l.property.plotArea} sqft · ${l.property.facing} facing`
              : `${l.furniture?.material} · ${l.furniture?.condition}`}
        </p>
        <div className="listing-counts">
          <span>
            <Eye size={14} />
            {l.views || 0} views
          </span>
          <span title="Customers whose lead is currently Dropped for this property">
            <UserMinus size={14} />
            {l.lostCustomers || 0} lost customers
          </span>
          <span>
            <MessageSquare size={14} />
            {l.enquiries || 0} enquiries
          </span>
        </div>
      </div>
    </Link>
  );
}
export function ListingDetail({ user, id }: { user: Actor; id: string }) {
  const { data: l, error, busy, reload } = useData("listings/" + id);
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState("Overview");
  const [action, setAction] = useState("");
  const customers = useData("customers");
  const saved = useSearchParams().get("saved");
  if (busy) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!l) return null;
  const admin = user.role === "ADMIN";
  const active = l.bookings.find((b: any) => b.active);
  const rate = pricePerSqft(l.categoryId, l.price, l.property);
  const currentBooking = active || l.bookings[0];
  const payment = currentBooking
    ? bookingPayment(
        l.price,
        currentBooking,
        l.bookings,
        l.advances,
        l.completions,
      )
    : null;
  const frozen = isFrozenStatus(l.status);
  const editable = !frozen && (admin || l.creatorId === user.id);
  const terminal = ["SOLD", "RENTED", "LEASED"].includes(l.status);
  return (
    <>
      <Link href="/categories" className="back-link">
        <ArrowLeft size={16} />
        Back to inventory
      </Link>
      {saved && (
        <div className="success-box" role="status">
          Listing saved successfully and visible to your team.
        </div>
      )}
      <div className="detail-heading">
        <div>
          <span className="muted">
            {l.category.name} / {l.option.name}
          </span>
          <h1>{l.title}</h1>
          <p>
            <MapPin size={15} />
            {l.locality}, {l.city}, {l.state}
          </p>
        </div>
        <div className="button-row">
          {editable && (
            <Link href={"/uploads/" + id} className="button secondary">
              <Pencil size={16} />
              Edit listing
            </Link>
          )}
          <button
            className="button"
            disabled={frozen}
            onClick={() => setAction("interaction")}
          >
            <Plus size={16} />
            Record interaction
          </button>
        </div>
      </div>
      <div className="listing-detail-grid">
        <section>
          <div className="gallery-main">
            <Photo
              id={l.photos[selected]?.id || l.photos[0]?.id}
              alt={l.title}
            />
            <Badge value={l.status} />
          </div>
          <div className="gallery-thumbnails">
            {l.photos.map((p: any, i: number) => (
              <button
                key={p.id}
                aria-label={"View photo " + (i + 1)}
                aria-pressed={selected === i}
                className={selected === i ? "selected" : ""}
                onClick={() => setSelected(i)}
              >
                <Photo id={p.id} alt={"Photo " + (i + 1)} />
              </button>
            ))}
          </div>
        </section>
        <section className="panel listing-summary">
          <Badge value={l.status} />
          <strong className="price large">
            {money(l.price)}
            {l.option.transactionType === "Rent" && <small> / month</small>}
          </strong>
          <p>{l.negotiable ? "Price negotiable" : "Fixed asking price"}</p>
          {rate !== null && (
            <p>
              {money(rate)} / sqft
              {l.option.transactionType === "Rent" ? " / month" : ""}
              <br />
              <small>
                Based on{" "}
                {l.categoryId === "plots" ? "plot area" : "super built-up area"}
              </small>
            </p>
          )}
          <div className="summary-counts">
            <div>
              <Eye size={19} />
              <strong>{l.views}</strong>
              <span>Customer views</span>
            </div>
            <div title="Customers whose lead is currently Dropped for this property">
              <UserMinus size={19} />
              <strong>{l.lostCustomers || 0}</strong>
              <span>Lost customers</span>
            </div>
            <div>
              <MessageSquare size={19} />
              <strong>{l.enquiries}</strong>
              <span>Enquiries</span>
            </div>
          </div>
          <small>
            Each customer linked to this property counts once. Edits, repeat
            contacts and page opens do not add views.
          </small>
          {frozen && (
            <div className="notice" role="status">
              <strong>Property frozen</strong>
              <p>
                This property cannot be edited or linked to another customer.
                Only Admin can resume it. Existing payment and completion
                records can continue.
              </p>
            </div>
          )}
          <div className="transaction-actions">
            {l.status === "AVAILABLE" && (
              <button className="button" onClick={() => setAction("book")}>
                <CalendarCheck size={18} />
                Book for a customer
              </button>
            )}
            {active && ["BOOKED", "ADVANCE_PAID"].includes(l.status) && (
              <>
                <p>
                  Booked for{" "}
                  <Link href={"/customers/" + active.customerId}>
                    {active.customer.name}
                  </Link>
                </p>
                <button
                  className="button"
                  disabled={payment?.balance === 0}
                  onClick={() => setAction("advance")}
                >
                  <Wallet size={18} />
                  Record advance
                </button>
                {admin && (
                  <button
                    className="button"
                    onClick={() => setAction("complete")}
                  >
                    <CheckCircle2 size={18} />
                    Record full payment / complete
                  </button>
                )}
              </>
            )}
            {!active && ["BOOKED", "ADVANCE_PAID"].includes(l.status) && (
              <p className="notice">
                This listing is reserved. Customer details are restricted by
                assignment.
              </p>
            )}
            {admin && frozen && (
              <button
                className="button secondary danger"
                onClick={() => setAction("resume")}
              >
                Resume property
              </button>
            )}
            {admin && l.status === "AVAILABLE" && (
              <button
                className="text-button"
                onClick={() => setAction("archive")}
              >
                Archive listing
              </button>
            )}
            {admin && l.status === "ARCHIVED" && (
              <button
                className="button secondary"
                onClick={() => setAction("restore")}
              >
                Restore listing
              </button>
            )}
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="tabs">
          {["Overview", "Customer activity", "Transactions", "History"].map(
            (t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ),
          )}
        </div>
        {tab === "Overview" && (
          <>
            {payment && <PaymentSummary payment={payment} />}
            <h2>About this listing</h2>
            <p className="description">{l.description}</p>
            <dl className="attribute-grid">
              {Object.entries(l.property || l.furniture || {})
                .filter(([k, v]) => k !== "listingId" && v !== null && v !== "")
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{k.replace(/([A-Z])/g, " $1")}</dt>
                    <dd>
                      {k === "availabilityDate" ? date(String(v)) : String(v)}
                    </dd>
                  </div>
                ))}
            </dl>
            <h3>Location & record details</h3>
            <dl className="attribute-grid">
              {Object.entries({
                address: l.address,
                locality: l.locality,
                city: l.city,
                state: l.state,
                "PIN code": l.pinCode,
                "listed by": l.listedBy,
                "created by": l.creator.name,
                "listing ID": l.id,
                created: date(l.createdAt, true),
                updated: date(l.updatedAt, true),
              })
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{String(v)}</dd>
                  </div>
                ))}
            </dl>
          </>
        )}
        {tab === "Customer activity" &&
          (l.interactions.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Interaction</th>
                    <th>Interest</th>
                    <th>Offer</th>
                    <th>Notes / reason</th>
                    <th>Recorded by / date</th>
                  </tr>
                </thead>
                <tbody>
                  {l.interactions.map((i: any) => (
                    <tr key={i.id}>
                      <td>
                        <Link href={"/customers/" + i.customerId}>
                          {i.customer.name}
                        </Link>
                      </td>
                      <td>{label(i.type)}</td>
                      <td>
                        <Badge value={i.interest} />
                      </td>
                      <td>{i.offer ? money(i.offer) : "—"}</td>
                      <td>{i.rejectionReason || i.notes}</td>
                      <td>
                        {i.employee.name}
                        <small>{date(i.occurredAt, true)}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No authorized activity yet"
              description="Record an enquiry, viewing or follow-up for an assigned customer."
            />
          ))}
        {tab === "Transactions" && (
          <>
            {payment && <PaymentSummary payment={payment} />}
            <h3>Booking history</h3>
            {l.bookings.length ? (
              l.bookings.map((b: any) => (
                <div className="history-item" key={b.id}>
                  <Link href={"/customers/" + b.customerId}>
                    {b.customer.name}
                  </Link>
                  <Badge
                    value={
                      b.active
                        ? "BOOKED"
                        : b.cancelledAt
                          ? "CANCELLED"
                          : "COMPLETED"
                    }
                  />
                  <span>{date(b.createdAt, true)}</span>
                  <p>
                    {b.notes}
                    {b.cancellationReason &&
                      " · Cancellation: " + b.cancellationReason}
                  </p>
                </div>
              ))
            ) : (
              <p className="muted">No authorized booking records.</p>
            )}
            <h3>Advance receipts</h3>
            {l.advances.map((a: any) => (
              <div className="history-item" key={a.id}>
                <strong>{money(a.amount)}</strong>
                <span>
                  {a.customer.name} · {a.method} · {date(a.paymentDate)}
                </span>
                <p>
                  {a.reference} {a.notes}
                </p>
              </div>
            ))}
            <h3>Completed transactions</h3>
            {l.completions.map((c: any) => (
              <div className="history-item" key={c.id}>
                <strong>{money(c.amount)}</strong>
                <Badge value={c.reversedAt ? "REVERSED" : c.status} />
                <span>
                  {c.customer.name} · {date(c.createdAt, true)}
                </span>
                {c.reversalReason && <p>Reversal: {c.reversalReason}</p>}
              </div>
            ))}
            <p className="metric-note">
              Receipts remain in history after cancellations and reversals.
              Refunds are handled outside this application.
            </p>
          </>
        )}
        {tab === "History" &&
          l.statusHistory.map((h: any) => (
            <div className="history-item" key={h.id}>
              <Badge value={h.toStatus} />
              <span>
                {h.fromStatus ? `From ${label(h.fromStatus)} · ` : ""}
                {date(h.createdAt, true)}
              </span>
              {h.reason && <p>{h.reason}</p>}
            </div>
          ))}
      </section>
      {action && (
        <Modal
          title={
            action === "interaction"
              ? "Record customer interaction"
              : (
                  {
                    book: "Book listing",
                    advance: "Record advance payment",
                    complete: "Record full payment and complete",
                    cancel: "Cancel booking",
                    archive: "Archive listing",
                    restore: "Restore listing",
                    reverse: "Reverse transaction",
                    resume: "Resume property",
                  } as any
                )[action]
          }
          onClose={() => setAction("")}
          wide={action === "interaction"}
        >
          {action === "interaction" ? (
            <InteractionForm
              listingId={id}
              customers={customers.data?.customers || []}
              onDone={() => {
                setAction("");
                reload();
              }}
            />
          ) : (
            <ActionForm
              submit={
                action === "complete" ? "Confirm full payment" : label(action)
              }
              onCancel={() => setAction("")}
              onSubmit={async (values, submissionKey) => {
                await api("listings/" + id, {
                  method: "POST",
                  body: JSON.stringify({
                    ...values,
                    action,
                    customerId: active?.customerId || values.customerId,
                    amount: values.amount ? Number(values.amount) : undefined,
                    requestKey: submissionKey,
                    paymentDate: values.paymentDate
                      ? new Date(
                          values.paymentDate + "T12:00:00+05:30",
                        ).toISOString()
                      : undefined,
                  }),
                });
                setAction("");
                reload();
              }}
            >
              {["advance", "complete"].includes(action) && payment && (
                <>
                  <PaymentSummary payment={payment} />
                  <p>
                    {action === "advance"
                      ? "Enter only the payment received now. It cannot exceed the balance due."
                      : "Enter the total deal value including all advances. Completing confirms the remaining balance has been received; advances are not counted twice."}
                  </p>
                </>
              )}
              {action === "book" && (
                <Select
                  label="Customer"
                  name="customerId"
                  options={(customers.data?.customers || []).map((c: any) => ({
                    value: c.id,
                    label: c.name + " · " + c.phone,
                  }))}
                  required
                />
              )}
              {action === "book" && !customers.data?.customers.length && (
                <p>Add an assigned customer in CRM before booking.</p>
              )}
              {["advance", "complete"].includes(action) && (
                <Field
                  label={
                    action === "advance"
                      ? "Advance amount (₹)"
                      : "Total deal value including advances (₹)"
                  }
                  name="amount"
                  type="number"
                  min={
                    action === "complete" && payment?.advance
                      ? payment.advance
                      : "0.01"
                  }
                  max={action === "advance" ? payment?.balance : l.price}
                  step="0.01"
                  required
                />
              )}
              {action === "advance" && (
                <>
                  <Field
                    label="Payment date"
                    name="paymentDate"
                    type="date"
                    required
                  />
                  <Select
                    label="Payment method"
                    name="method"
                    options={[
                      "Cash",
                      "UPI",
                      "Bank transfer",
                      "Cheque",
                      "Other",
                    ]}
                    required
                  />
                  <Field
                    label="Payment reference (optional)"
                    name="reference"
                  />
                </>
              )}
              {["cancel", "reverse", "archive", "restore", "resume"].includes(
                action,
              ) && (
                <>
                  <p>
                    {action === "resume" &&
                      "Resuming releases this property for new customers. Its active booking will be cancelled, or its completed transaction reversed. Previous receipts and history are retained. "}
                    This change is saved in the audit history.
                    {action === "reverse"
                      ? " The inventory becomes available and the winning lead returns to Negotiation."
                      : ""}
                  </p>
                  <Field label="Reason" name="reason" required />
                </>
              )}
              {["book", "advance"].includes(action) && (
                <Field label="Notes (optional)" name="notes" />
              )}
            </ActionForm>
          )}
        </Modal>
      )}
    </>
  );
}
function UsersIcon() {
  return <Eye size={19} />;
}
