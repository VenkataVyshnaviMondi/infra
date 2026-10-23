"use client";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  ArrowLeft,
  Phone,
  Mail,
  CalendarClock,
  Check,
  Pencil,
} from "lucide-react";
import type { Actor } from "@/lib/auth";
import { normalizePhone } from "@/lib/validation";
import { CUSTOMER_STATUSES, customerStatus } from "@/lib/customer-status";
import { bookingPayment } from "@/lib/payments";
import { PaymentSummary } from "./payment-summary";
import { ListingPicker } from "./listing-picker";
import {
  CATEGORIES,
  date,
  label,
  localInput,
  money,
  STAGES,
} from "@/lib/constants";
import {
  ActionForm,
  ApiError,
  api,
  Badge,
  Empty,
  ErrorBox,
  Field,
  Loading,
  Modal,
  Select,
  useData,
} from "./ui";
export function RequirementFields({
  initial = {},
  prefix = "",
}: {
  initial?: any;
  prefix?: string;
}) {
  const [category, setCategory] = useState(initial.categoryId || "");
  const [option, setOption] = useState(initial.optionId || "");
  const c = CATEGORIES.find((c) => c.id === category);
  return (
    <div className="form-grid">
      <Select
        label="Preferred category"
        name={prefix + "categoryId"}
        options={CATEGORIES.map((c) => ({ value: c.id, label: c.name }))}
        value={category}
        required
        onChange={(v) => {
          setCategory(v);
          setOption("");
        }}
      />
      <Select
        label="Preferred subcategory"
        name={prefix + "optionId"}
        options={
          c?.options.map((o) => ({
            value: c.id + "-" + o.toLowerCase().replaceAll(" ", "-"),
            label: o,
          })) || []
        }
        value={option}
        onChange={setOption}
      />
      <Field
        label="Budget minimum (₹)"
        name={prefix + "budgetMin"}
        type="number"
        min="0"
        defaultValue={initial.budgetMin || ""}
      />
      <Field
        label="Budget maximum (₹)"
        name={prefix + "budgetMax"}
        type="number"
        min="0"
        defaultValue={initial.budgetMax || ""}
      />
      <Field
        label="Preferred locations"
        name={prefix + "locations"}
        defaultValue={initial.locations || ""}
      />
    </div>
  );
}
function requirement(v: Record<string, string>) {
  return {
    categoryId: v.categoryId,
    optionId: v.optionId || undefined,
    budgetMin: v.budgetMin,
    budgetMax: v.budgetMax,
    locations: v.locations,
  };
}
export function CustomerForm({
  user,
  customer,
  onDone,
  onCancel,
}: {
  user: Actor;
  customer?: any;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { data: options } = useData("options");
  const router = useRouter();
  const [assignee, setAssignee] = useState(customer?.assignedToId || user.id);
  const [listing, setListing] = useState<any>(null);
  const [propertyType, setPropertyType] = useState(
    customer?.requirements?.[0]?.categoryId || "",
  );
  const initialListingId =
    customer?.preferredListingId ||
    customer?.interactions?.[0]?.listingId ||
    customer?.linkedListings?.[0]?.id;
  const [listingLoading, setListingLoading] = useState(!!initialListingId);
  const [listingError, setListingError] = useState("");
  const [preferredLocations, setPreferredLocations] = useState(
    customer?.requirements?.[0]?.locations || "",
  );
  useEffect(() => {
    if (!initialListingId) return;
    let live = true;
    api("listings/" + initialListingId)
      .then((value) => {
        if (!live) return;
        setListing(value);
        setPropertyType(value.categoryId);
      })
      .catch((error) => {
        if (live) setListingError(error.message);
      })
      .finally(() => {
        if (live) setListingLoading(false);
      });
    return () => {
      live = false;
    };
  }, [initialListingId]);
  const [source, setSource] = useState(customer?.source || "Walk-in");
  const [existingCustomer, setExistingCustomer] = useState<{
    id: string;
    name: string;
    phone: string;
  } | null>(null);
  if (listingLoading) return <Loading />;
  return (
    <ActionForm
      submit={
        customer
          ? "Save customer"
          : existingCustomer
            ? "Save new visit / enquiry"
            : "Add customer"
      }
      onCancel={onCancel}
      onSubmit={async (v, requestKey) => {
        if (!listing)
          throw new Error(
            "Choose an uploaded property before adding the customer.",
          );
        if (
          existingCustomer &&
          normalizePhone(v.phone) !== existingCustomer.phone
        ) {
          setExistingCustomer(null);
          throw new Error(
            "The phone number changed. Submit again to check this customer.",
          );
        }
        try {
          await api(
            "customers" +
              (customer
                ? "/" + customer.id
                : existingCustomer
                  ? "/" + existingCustomer.id + "/contacts"
                  : ""),
            {
              method: customer ? "PATCH" : "POST",
              body: JSON.stringify({
                ...v,
                requestKey,
                listingId: listing.id,
                contactDate: v.contactDate
                  ? new Date(v.contactDate + ":00+05:30").toISOString()
                  : undefined,
                requirement: requirement(v),
              }),
            },
          );
        } catch (error) {
          if (error instanceof ApiError && error.data.existingCustomer) {
            setExistingCustomer(error.data.existingCustomer);
            return;
          }
          throw error;
        }
        onDone();
        if (existingCustomer)
          router.push("/customers/" + existingCustomer.id + "?contactSaved=1");
      }}
    >
      {existingCustomer && (
        <section className="notice" aria-label="Existing customer found">
          <h3>{existingCustomer.name} is already a customer</h3>
          <p>
            Save the date, contact mode and selected property as a new visit or
            enquiry on this customer’s record. Their name, phone, age and
            assignment stay unchanged.
          </p>
          <Link
            href={"/customers/" + existingCustomer.id}
            target="_blank"
            rel="noreferrer"
          >
            Open existing customer
          </Link>
          <p>If this is a different person, correct the phone number below.</p>
        </section>
      )}
      <div className="form-grid">
        <Field
          label="Customer name"
          name="name"
          required
          defaultValue={customer?.name}
        />
        <Field
          label="Phone number"
          name="phone"
          type="tel"
          required
          defaultValue={customer?.phone}
          onChange={() => setExistingCustomer(null)}
          hint="Indian numbers can be entered with or without +91."
        />
        <Field
          label="Age (optional)"
          name="age"
          type="number"
          min="1"
          max="120"
          step="1"
          defaultValue={customer?.age ?? ""}
          hint="Leave blank if the customer does not provide their age."
        />
        <label className="field">
          <span>Contact mode *</span>
          <select
            name="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            required
          >
            {[
              "Walk-in",
              "Phone",
              "WhatsApp",
              "Email",
              "Website",
              "Referral",
              "Other",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        {source === "Other" && (
          <Field
            label="Other contact mode"
            name="contactDetails"
            required
            maxLength={2000}
            defaultValue={customer?.contactDetails || ""}
            placeholder="e.g. Facebook, property exhibition"
          />
        )}
        <label className="field">
          <span>Visit or enquiry *</span>
          <select
            name="contactType"
            defaultValue={customer?.contactType || "ENQUIRY"}
            required
          >
            <option value="VISIT">Customer visit</option>
            <option value="ENQUIRY">Enquiry</option>
          </select>
        </label>
        <Field
          label="Date and time visited or enquired"
          name="contactDate"
          type="datetime-local"
          required
          max={localInput()}
          defaultValue={localInput(
            customer
              ? new Date(customer.contactDate || customer.createdAt)
              : new Date(),
          )}
          hint="India time (IST). You can enter an earlier visit or enquiry."
        />
        {user.role === "ADMIN" && (
          <label className="field">
            <span>Assigned employee *</span>
            <select
              name="assignedToId"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              required
            >
              {(
                options?.users || [
                  {
                    id: assignee,
                    name: customer?.assignedTo?.name || user.name,
                    role: assignee === user.id ? user.role : "EMPLOYEE",
                  },
                ]
              ).map((u: any) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.role === "ADMIN" ? " (Admin)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <details className="optional-contact">
        <summary>Additional contact details (optional)</summary>
        <div className="form-grid">
          <Field
            label="Alternate phone"
            name="alternatePhone"
            type="tel"
            defaultValue={customer?.alternatePhone || ""}
          />
          <Field
            label="Email (optional)"
            name="email"
            type="email"
            defaultValue={customer?.email || ""}
          />
        </div>
      </details>
      <>
        <ErrorBox message={listingError} />
        <h3>Property the customer is interested in</h3>
        <Select
          label="Property type"
          value={propertyType}
          options={CATEGORIES.map((c) => ({ value: c.id, label: c.name }))}
          required
          onChange={(value) => {
            if (value !== propertyType) {
              setPropertyType(value);
              setListing(null);
            }
          }}
        />
        <ListingPicker
          key={propertyType}
          category={propertyType}
          selected={listing}
          onChange={(value) => {
            setListing(value);
            if (value) {
              setPropertyType(value.categoryId);
              setPreferredLocations(value.locality + ", " + value.city);
              setListingError("");
            }
          }}
          required
        />
        <input type="hidden" name="categoryId" value={propertyType} />
        <input type="hidden" name="optionId" value={listing?.optionId || ""} />
        {!customer && (
          <input
            type="hidden"
            name="locations"
            value={listing ? listing.locality + ", " + listing.city : ""}
          />
        )}
      </>
      {customer && (
        <details className="optional-contact">
          <summary>Budget and location preferences (optional)</summary>
          <div className="form-grid">
            <Field
              label="Budget minimum (₹)"
              name="budgetMin"
              type="number"
              min="0"
              defaultValue={customer.requirements?.[0]?.budgetMin ?? ""}
            />
            <Field
              label="Budget maximum (₹)"
              name="budgetMax"
              type="number"
              min="0"
              defaultValue={customer.requirements?.[0]?.budgetMax ?? ""}
            />
            <Field
              label="Preferred locations"
              name="locations"
              value={preferredLocations}
              onChange={(event) => setPreferredLocations(event.target.value)}
            />
          </div>
        </details>
      )}
      <label className="field">
        <span>Notes</span>
        <textarea name="notes" rows={3} defaultValue={customer?.notes || ""} />
      </label>
    </ActionForm>
  );
}
export function InteractionForm({
  listingId,
  customerId,
  customers,
  onDone,
}: {
  listingId?: string;
  customerId?: string;
  customers: any[];
  onDone: () => void;
}) {
  const [interest, setInterest] = useState("UNDECIDED");
  const requestKey = useRef(crypto.randomUUID());
  const [query, setQuery] = useState("");
  const listings = useData("listings?" + new URLSearchParams({ q: query }));
  return (
    <ActionForm
      submit="Save interaction"
      onSubmit={async (v) => {
        await api("interactions", {
          method: "POST",
          body: JSON.stringify({
            ...v,
            listingId: listingId || v.listingId,
            customerId: customerId || v.customerId,
            interest,
            requestKey: requestKey.current,
            occurredAt: new Date(v.occurredAt + ":00+05:30").toISOString(),
            nextFollowUp: v.nextFollowUp
              ? new Date(v.nextFollowUp + ":00+05:30").toISOString()
              : undefined,
          }),
        });
        onDone();
      }}
    >
      <p>
        Record the customer’s actual activity. Only Property Viewing increases
        the listing’s view count.
      </p>
      <div className="form-grid">
        {!customerId && (
          <Select
            label="Customer"
            name="customerId"
            options={customers.map((c) => ({
              value: c.id,
              label: c.name + " · " + c.phone,
            }))}
            required
          />
        )}
        {!listingId && (
          <>
            <Field
              label="Find listing by title, locality or ID"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Select
              label="Listing"
              name="listingId"
              options={
                listings.data?.rows.map((l: any) => ({
                  value: l.id,
                  label: l.title + " · " + label(l.status),
                })) || []
              }
              required
            />
          </>
        )}
        <Select
          label="Interaction type"
          name="type"
          options={["ENQUIRY", "PROPERTY_VIEWING", "FOLLOW_UP", "OTHER"].map(
            (s) => ({ value: s, label: label(s) }),
          )}
          required
        />
        <Field
          label="Interaction date & time (IST)"
          name="occurredAt"
          type="datetime-local"
          defaultValue={localInput()}
          required
        />
        <Select
          label="Interest"
          options={["UNDECIDED", "INTERESTED", "NOT_INTERESTED"].map((s) => ({
            value: s,
            label: label(s),
          }))}
          value={interest}
          onChange={setInterest}
          required
        />
        <Field
          label="Customer offer / negotiation amount (₹)"
          name="offer"
          type="number"
          min="0"
          step="0.01"
        />
        {interest === "NOT_INTERESTED" && (
          <Field
            label="Reason for not interested"
            name="rejectionReason"
            required
          />
        )}
        <Field
          label="Next follow-up date & time (IST)"
          name="nextFollowUp"
          type="datetime-local"
        />
      </div>
      <label className="field">
        <span>Notes</span>
        <textarea name="notes" rows={3} />
      </label>
      {interest === "INTERESTED" && (
        <div className="notice">
          This creates or updates a lead for this customer and listing. A
          completed transaction is required for conversion.
        </div>
      )}
    </ActionForm>
  );
}
export function CRM({ user }: { user: Actor }) {
  const router = useRouter();
  const { data, error, busy, reload } = useData("customers", 15000);
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") || "All Customers");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [modal, setModal] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [failure, setFailure] = useState("");
  const [board, setBoard] = useState(true);
  const customers =
    data?.customers.filter(
      (c: any) =>
        (tab === "Leads" ||
          !statusFilter ||
          customerStatus(c) === statusFilter) &&
        (c.name + " " + c.phone + " " + (c.email || ""))
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) || [];
  const leads = customers.flatMap((c: any) =>
    c.leads
      .filter(
        (lead: any) =>
          tab !== "Leads" ||
          (stageFilter
            ? lead.stage === stageFilter
            : !["CONVERTED", "LOST"].includes(lead.stage)),
      )
      .map((l: any) => ({ ...l, customer: c })),
  );
  const done = () => {
    setModal("");
    setSelected(null);
    reload();
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Customer relationships</h1>
          <p>
            {user.role === "ADMIN"
              ? "Your organization’s customers, leads and follow-ups."
              : "Your assigned customers, requirements and next steps."}
          </p>
        </div>
        <div className="button-row">
          <button className="button" onClick={() => setModal("customer")}>
            <Plus size={17} />
            Add customer
          </button>
        </div>
      </div>
      <div className="tabs page-tabs">
        {[
          "All Customers",
          "Leads",
          "Follow-ups",
          "Converted",
          "Not Interested",
        ].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t === "Leads" ? "Interested leads" : t}
          </button>
        ))}
      </div>
      <div className="results-bar">
        {tab === "Leads" ? (
          <Select
            label="Lead stage"
            placeholder="All active stages"
            value={stageFilter}
            options={STAGES.map((stage) => ({
              value: stage,
              label:
                stage === "LOST"
                  ? "Dropped"
                  : stage === "CONVERTED"
                    ? "Fully paid"
                    : label(stage),
            }))}
            onChange={setStageFilter}
          />
        ) : (
          <Select
            label="Customer status"
            placeholder="All statuses"
            value={statusFilter}
            options={CUSTOMER_STATUSES}
            onChange={setStatusFilter}
          />
        )}
        <div className="search-field">
          <Search size={18} />
          <input
            aria-label="Search customers"
            placeholder="Search customer name, phone or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {tab === "Leads" && (
          <button
            className="button secondary small"
            onClick={() => setBoard(!board)}
          >
            {board ? "Table view" : "Pipeline board"}
          </button>
        )}
      </div>
      <ErrorBox message={error || failure} />
      {busy ? (
        <Loading />
      ) : tab === "Follow-ups" ? (
        <FollowUps
          records={
            data?.followUps.filter((f: any) =>
              customers.some((c: any) => c.id === f.customerId),
            ) || []
          }
          reload={reload}
        />
      ) : tab === "Not Interested" ? (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Listing</th>
                <th>Reason</th>
                <th>Offer</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {customers.flatMap((c: any) =>
                c.interactions
                  .filter((i: any) => i.interest === "NOT_INTERESTED")
                  .map((i: any, index: number) => (
                    <tr key={c.id + index}>
                      <td>
                        <Link href={"/customers/" + c.id}>{c.name}</Link>
                      </td>
                      <td>
                        <Link href={"/listings/" + i.listingId}>
                          {i.listing.title}
                        </Link>
                      </td>
                      <td>{i.rejectionReason}</td>
                      <td>{i.offer ? money(i.offer) : "—"}</td>
                      <td>{date(i.occurredAt)}</td>
                    </tr>
                  )),
              )}
            </tbody>
          </table>
          <p className="metric-note">
            Not interested applies to the selected listing only. Customers can
            continue considering other listings.
          </p>
        </div>
      ) : tab === "Leads" && board ? (
        <div className="pipeline-board">
          {STAGES.filter((stage) =>
            stageFilter
              ? stage === stageFilter
              : !["CONVERTED", "LOST"].includes(stage),
          ).map((stage) => (
            <section className="pipeline-column" key={stage}>
              <header>
                <h2>
                  {stage === "LOST"
                    ? "Dropped"
                    : stage === "CONVERTED"
                      ? "Fully paid"
                      : label(stage)}
                </h2>
                <span>
                  {leads.filter((l: any) => l.stage === stage).length}
                </span>
              </header>
              {leads
                .filter((l: any) => l.stage === stage)
                .map((l: any) => (
                  <div className="lead-card" key={l.id}>
                    <Link href={"/customers/" + l.customer.id}>
                      <strong>{l.customer.name}</strong>
                    </Link>
                    <Link
                      href={"/listings/" + l.listingId}
                      className="lead-listing"
                    >
                      {l.listing.title}
                    </Link>
                    <p>{l.customer.requirements[0]?.locations}</p>
                    <small>{l.customer.assignedTo.name}</small>
                    {l.needsAttention && (
                      <div className="attention">
                        Listing unavailable · follow up
                      </div>
                    )}
                    {l.lostReason && <p>Lost: {l.lostReason}</p>}
                    <button
                      className="text-button"
                      onClick={() => {
                        setSelected(l);
                        setModal("stage");
                      }}
                    >
                      Update stage
                    </button>
                  </div>
                ))}
              {!leads.some((l: any) => l.stage === stage) && (
                <p className="column-empty">No leads</p>
              )}
            </section>
          ))}
        </div>
      ) : tab === "Leads" || tab === "Converted" ? (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Listing</th>
                <th>Stage</th>
                <th>Assigned to</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {leads
                .filter(
                  (l: any) => tab !== "Converted" || l.stage === "CONVERTED",
                )
                .map((l: any) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={"/customers/" + l.customer.id}>
                        {l.customer.name}
                      </Link>
                    </td>
                    <td>
                      <Link href={"/listings/" + l.listingId}>
                        {l.listing.title}
                      </Link>
                    </td>
                    <td>
                      <Badge value={l.stage} />
                      {l.needsAttention && <small>Needs follow-up</small>}
                    </td>
                    <td>{l.customer.assignedTo.name}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => {
                          setSelected(l);
                          setModal("stage");
                        }}
                      >
                        Update stage
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : customers.length ? (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Age</th>
                <th>Status</th>
                <th>Requirements</th>
                <th>Current property</th>
                <th>Budget</th>
                <th>Assigned to</th>
                <th>Source</th>
                <th>Visit / enquiry</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c: any) => (
                <tr
                  key={c.id}
                  className="customer-row"
                  tabIndex={0}
                  aria-label={"Open details for " + c.name}
                  onClick={(event) => {
                    if (
                      (event.target as HTMLElement).closest(
                        "a, button, input, select, textarea",
                      )
                    )
                      return;
                    router.push("/customers/" + c.id);
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.target === event.currentTarget &&
                      (event.key === "Enter" || event.key === " ")
                    ) {
                      event.preventDefault();
                      router.push("/customers/" + c.id);
                    }
                  }}
                >
                  <td>
                    <Link href={"/customers/" + c.id}>{c.name}</Link>
                    <small>{c.email}</small>
                  </td>
                  <td>{c.phone}</td>
                  <td>{c.age ?? "—"}</td>
                  <td>
                    <span
                      className={
                        "badge badge-" +
                        ((
                          {
                            FULLY_PAID: "converted",
                            DROPPED: "lost",
                          } as Record<string, string>
                        )[customerStatus(c)] || customerStatus(c).toLowerCase())
                      }
                    >
                      {
                        CUSTOMER_STATUSES.find(
                          (status) => status.value === customerStatus(c),
                        )?.label
                      }
                    </span>
                  </td>
                  <td>
                    {c.requirements
                      .map(
                        (r: any) =>
                          CATEGORIES.find((x) => x.id === r.categoryId)?.name,
                      )
                      .join(", ")}
                  </td>
                  <td>
                    {c.preferredListing || c.linkedListings.length ? (
                      (c.preferredListing
                        ? [c.preferredListing]
                        : c.linkedListings
                      ).map((l: any) => (
                        <div key={l.id}>
                          <Link href={"/listings/" + l.id}>{l.title}</Link>
                          <small>{label(l.status)}</small>
                        </div>
                      ))
                    ) : (
                      <span className="muted">No listing linked</span>
                    )}
                  </td>
                  <td>
                    {c.requirements[0]?.budgetMin
                      ? money(c.requirements[0].budgetMin)
                      : "Any"}{" "}
                    –{" "}
                    {c.requirements[0]?.budgetMax
                      ? money(c.requirements[0].budgetMax)
                      : "Any"}
                  </td>
                  <td>{c.assignedTo.name}</td>
                  <td>{c.source}</td>
                  <td>
                    {c.contactType === "VISIT" ? "Visit" : "Enquiry"}
                    <small>{date(c.contactDate || c.createdAt, true)}</small>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="button secondary small"
                      aria-label={"Edit " + c.name}
                      onClick={() => {
                        setSelected(c);
                        setModal("edit");
                      }}
                    >
                      <Pencil size={15} />
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No customers found"
          description="Add a customer or change your search."
        />
      )}
      {modal && (
        <Modal
          title={
            modal === "customer"
              ? "Add customer"
              : modal === "edit"
                ? "Edit customer"
                : modal === "stage"
                  ? "Update lead stage"
                  : "Record interaction"
          }
          onClose={() => setModal("")}
          wide={modal !== "stage"}
        >
          {modal === "customer" || modal === "edit" ? (
            <CustomerForm
              user={user}
              customer={modal === "edit" ? selected : undefined}
              onDone={done}
              onCancel={() => setModal("")}
            />
          ) : (
            <StageForm lead={selected} onDone={done} />
          )}
        </Modal>
      )}
    </>
  );
}
export function StageForm({ lead, onDone }: { lead: any; onDone: () => void }) {
  const [stage, setStage] = useState(lead.stage);
  if (["BOOKED", "ADVANCE_PAID", "CONVERTED"].includes(lead.stage))
    return (
      <p>
        Manage booking, advance and completion through the{" "}
        <Link href={"/listings/" + lead.listingId}>
          listing transaction controls
        </Link>
        .
      </p>
    );
  return (
    <ActionForm
      submit="Update stage"
      onSubmit={async (v) => {
        await api("leads/" + lead.id, {
          method: "PATCH",
          body: JSON.stringify({ ...v, stage }),
        });
        onDone();
      }}
    >
      <Select
        label="Lead stage"
        options={STAGES.filter(
          (s) => !["BOOKED", "ADVANCE_PAID", "CONVERTED"].includes(s),
        ).map((s) => ({
          value: s,
          label: s === "LOST" ? "Dropped" : label(s),
        }))}
        value={stage}
        onChange={setStage}
        required
      />
      {stage === "LOST" && (
        <Field label="Reason for lost lead" name="reason" required />
      )}
      <p className="metric-note">
        Booked, Advance Paid and Converted stages are updated through the
        listing transaction workflow.
      </p>
    </ActionForm>
  );
}
export function FollowUps({
  records,
  reload,
}: {
  records: any[];
  reload: () => void;
}) {
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<any>(null);
  return (
    <>
      <ErrorBox message={error} />
      {records.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Next step</th>
                <th>Assigned to</th>
                <th>Due (IST)</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((f) => (
                <tr key={f.id}>
                  <td>
                    <Link href={"/customers/" + f.customerId}>
                      {f.customer?.name || "Customer"}
                    </Link>
                  </td>
                  <td>{f.notes}</td>
                  <td>{f.employee?.name || "Assigned employee"}</td>
                  <td>{date(f.dueAt, true)}</td>
                  <td>
                    <Badge
                      value={
                        f.doneAt
                          ? "COMPLETED"
                          : new Date(f.dueAt) < new Date()
                            ? "OVERDUE"
                            : "UPCOMING"
                      }
                    />
                  </td>
                  <td>
                    <div className="button-row">
                      <button
                        className="text-button"
                        onClick={async () => {
                          try {
                            await api("followups/" + f.id, {
                              method: "PATCH",
                              body: JSON.stringify({ done: !f.doneAt }),
                            });
                            reload();
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        {f.doneAt ? "Reopen" : "Mark done"}
                      </button>
                      <button
                        className="text-button"
                        onClick={() => setEdit(f)}
                      >
                        Reschedule
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No follow-ups yet"
          description="Schedule a next step when recording a customer interaction."
        />
      )}
      {edit && (
        <Modal title="Reschedule follow-up" onClose={() => setEdit(null)}>
          <ActionForm
            submit="Save follow-up"
            onSubmit={async (v) => {
              await api("followups/" + edit.id, {
                method: "PATCH",
                body: JSON.stringify({
                  ...v,
                  dueAt: new Date(v.dueAt + ":00+05:30").toISOString(),
                }),
              });
              setEdit(null);
              reload();
            }}
          >
            <Field
              label="Due date & time (IST)"
              name="dueAt"
              type="datetime-local"
              defaultValue={localInput(new Date(edit.dueAt))}
              required
            />
            <Field label="Notes" name="notes" defaultValue={edit.notes} />
          </ActionForm>
        </Modal>
      )}
    </>
  );
}
export function CustomerDetail({ user, id }: { user: Actor; id: string }) {
  const router = useRouter();
  const [marking, setMarking] = useState(false);
  const [interestError, setInterestError] = useState("");
  const contactSaved = useSearchParams().get("contactSaved") === "1";
  const { data: c, error, busy, reload } = useData("customers/" + id, 15000);
  const [tab, setTab] = useState("Interactions");
  const [modal, setModal] = useState("");
  const [lead, setLead] = useState<any>(null);
  const done = () => {
    setModal("");
    reload();
  };
  if (busy) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!c) return null;
  return (
    <>
      <Link className="back-link" href="/crm">
        <ArrowLeft size={16} />
        Back to customers
      </Link>
      {contactSaved && (
        <div className="success-box" role="status">
          New visit or enquiry saved to this customer’s history.
        </div>
      )}
      <div className="page-heading">
        <div>
          <h1>{c.name}</h1>
          <p>
            Assigned to {c.assignedTo.name} · Added {date(c.createdAt)}
          </p>
        </div>
        <div className="button-row">
          {(c.preferredListingId && customerStatus(c) === "ENQUIRY") ||
          (c.preferredListingId && customerStatus(c) === "DROPPED") ? (
            <button
              className="button"
              disabled={marking}
              onClick={async () => {
                if (marking) return;
                setMarking(true);
                setInterestError("");
                try {
                  await api("customers/" + id + "/interest", {
                    method: "POST",
                    body: JSON.stringify({ listingId: c.preferredListingId }),
                  });
                  router.push("/crm?tab=Leads");
                } catch (error) {
                  setInterestError((error as Error).message);
                } finally {
                  setMarking(false);
                }
              }}
            >
              {marking ? "Saving…" : "Mark as interested"}
            </button>
          ) : (
            c.leads.length > 0 && (
              <Link
                className="button secondary"
                href={
                  customerStatus(c) === "FULLY_PAID"
                    ? "/crm?tab=Converted"
                    : "/crm?tab=Leads"
                }
              >
                {customerStatus(c) === "FULLY_PAID"
                  ? "View completed deal"
                  : "View interested leads"}
              </Link>
            )
          )}
          <button className="button secondary" onClick={() => setModal("edit")}>
            <Pencil size={16} />
            Edit customer
          </button>
          <button className="button" onClick={() => setModal("interaction")}>
            <Plus size={16} />
            Record interaction
          </button>
        </div>
      </div>
      <ErrorBox message={interestError} />
      <div className="customer-layout">
        <aside className="panel customer-summary">
          <span className="avatar large light">
            {c.name
              .split(" ")
              .map((x: string) => x[0])
              .slice(0, 2)
              .join("")}
          </span>
          <h2>{c.name}</h2>
          <p>
            <Phone size={16} />
            <a href={"tel:" + c.phone}>{c.phone}</a>
          </p>
          {c.alternatePhone && (
            <p>
              <Phone size={16} />
              {c.alternatePhone}
            </p>
          )}
          {c.email && (
            <p>
              <Mail size={16} />
              <a href={"mailto:" + c.email}>{c.email}</a>
            </p>
          )}
          <dl>
            <dt>Customer status</dt>
            <dd>
              {
                CUSTOMER_STATUSES.find(
                  (status) => status.value === customerStatus(c),
                )?.label
              }
            </dd>
            <dt>Age</dt>
            <dd>{c.age ?? "Not provided"}</dd>
            <dt>Visit / enquiry</dt>
            <dd>
              {c.contactType === "VISIT" ? "Customer visit" : "Enquiry"} ·{" "}
              {date(c.contactDate || c.createdAt, true)}
            </dd>
            <dt>Source</dt>
            <dd>
              {c.source}
              {c.contactDetails ? " · " + c.contactDetails : ""}
            </dd>
            <dt>Notes</dt>
            <dd>{c.notes || "No notes recorded."}</dd>
          </dl>
          <h3>Current property</h3>
          {c.preferredListing ? (
            <div className="requirement">
              <Link href={"/listings/" + c.preferredListing.id}>
                {c.preferredListing.title}
              </Link>
            </div>
          ) : (
            <p>No current property selected.</p>
          )}
          <h3>Property history</h3>
          {[
            ...new Map(
              c.interactions.map((i: any) => [i.listingId, i.listing]),
            ).values(),
          ].map((l: any) => (
            <div className="requirement" key={l.id}>
              <Link href={"/listings/" + l.id}>{l.title}</Link>
            </div>
          ))}
          {!c.interactions.length && (
            <p>No listing linked yet. Use Record interaction to add one.</p>
          )}
          <h3>Requirements</h3>
          {c.requirements.map((r: any) => (
            <div className="requirement" key={r.id}>
              <strong>
                {CATEGORIES.find((x) => x.id === r.categoryId)?.name}{" "}
                {r.optionId &&
                  " / " + label(r.optionId.split("-").slice(1).join("_"))}
              </strong>
              <p>
                {r.budgetMin ? money(r.budgetMin) : "Any"} –{" "}
                {r.budgetMax ? money(r.budgetMax) : "Any"}
              </p>
              <small>
                {r.locations || "Any location"} · {date(r.createdAt)}
              </small>
            </div>
          ))}
          <button
            className="button secondary"
            onClick={() => setModal("requirement")}
          >
            <Plus size={16} />
            Add requirement
          </button>
        </aside>
        <section className="panel">
          <div className="tabs">
            {[
              "Interactions",
              "Leads",
              "Follow-ups",
              "Transactions",
              "History",
            ].map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === "Interactions" &&
            (c.interactions.length ? (
              c.interactions.map((i: any) => (
                <div className="history-item" key={i.id}>
                  <strong>{label(i.type)}</strong>
                  <Badge value={i.interest} />
                  <Link href={"/listings/" + i.listingId}>
                    {i.listing.title}
                  </Link>
                  <p>
                    {i.notes}
                    {i.rejectionReason &&
                      " · Not interested: " + i.rejectionReason}
                    {i.offer && " · Offer: " + money(i.offer)}
                  </p>
                  <small>
                    {i.employee.name} · {date(i.occurredAt, true)}
                  </small>
                </div>
              ))
            ) : (
              <Empty
                title="Start the conversation history"
                description="Record an enquiry or viewing for this customer."
              />
            ))}
          {tab === "Leads" &&
            c.leads.map((l: any) => (
              <div className="history-item" key={l.id}>
                <Link href={"/listings/" + l.listingId}>{l.listing.title}</Link>
                <Badge value={l.stage} />
                <button
                  className="text-button"
                  onClick={() => {
                    setLead(l);
                    setModal("stage");
                  }}
                >
                  Update stage
                </button>
                {l.needsAttention && (
                  <p className="attention">
                    Listing availability changed. Contact the customer about
                    alternatives.
                  </p>
                )}
                {l.history.map((h: any) => (
                  <small className="history-line" key={h.id}>
                    {h.fromStage ? label(h.fromStage) + " → " : ""}
                    {label(h.toStage)} · {date(h.createdAt, true)}{" "}
                    {h.reason && " · " + h.reason}
                  </small>
                ))}
              </div>
            ))}
          {tab === "Follow-ups" && (
            <FollowUps
              records={c.followUps.map((f: any) => ({
                ...f,
                customer: { name: c.name },
              }))}
              reload={reload}
            />
          )}{" "}
          {tab === "Transactions" && (
            <>
              <h3>Bookings</h3>
              {c.bookings.map((b: any) => (
                <div className="history-item" key={b.id}>
                  <Link href={"/listings/" + b.listingId}>
                    {b.listing.title}
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
                  <small>{date(b.createdAt, true)}</small>
                  <PaymentSummary
                    payment={bookingPayment(
                      b.listing.price,
                      b,
                      c.bookings,
                      c.advances,
                      c.completions,
                    )}
                  />
                  {b.cancellationReason && <p>{b.cancellationReason}</p>}
                </div>
              ))}
              <h3>Advances</h3>
              {c.advances.map((a: any) => (
                <div className="history-item" key={a.id}>
                  <strong>{money(a.amount)}</strong>
                  <Link href={"/listings/" + a.listingId}>
                    {a.listing.title}
                  </Link>
                  <p>
                    {a.method} · {date(a.paymentDate)} · {a.reference} {a.notes}
                  </p>
                </div>
              ))}
              <h3>Completed transactions</h3>
              {c.completions.map((t: any) => (
                <div className="history-item" key={t.id}>
                  <Link href={"/listings/" + t.listingId}>
                    {t.listing.title}
                  </Link>
                  <strong>{money(t.amount)}</strong>
                  <Badge value={t.reversedAt ? "REVERSED" : t.status} />
                  <p>
                    {date(t.createdAt, true)} {t.reversalReason}
                  </p>
                </div>
              ))}
            </>
          )}
          {tab === "History" && (
            <>
              <h3>Assignment history</h3>
              {c.assignments.map((a: any) => (
                <div className="history-item" key={a.id}>
                  <strong>
                    {a.fromUserId ? "Reassigned" : "Initially assigned"}
                  </strong>
                  <span>{date(a.createdAt, true)}</span>
                  <small>Employee record: {a.toUserId}</small>
                </div>
              ))}
              <p className="metric-note">
                Reassignment retains historical interaction and lead
                attribution.
              </p>
            </>
          )}
        </section>
      </div>
      {modal && (
        <Modal
          title={
            modal === "edit"
              ? "Edit customer"
              : modal === "interaction"
                ? "Record interaction"
                : modal === "stage"
                  ? "Update lead stage"
                  : "Add requirement"
          }
          onClose={() => setModal("")}
          wide={["edit", "interaction", "requirement"].includes(modal)}
        >
          {modal === "edit" ? (
            <CustomerForm
              user={user}
              customer={c}
              onDone={done}
              onCancel={() => setModal("")}
            />
          ) : modal === "interaction" ? (
            <InteractionForm customerId={id} customers={[]} onDone={done} />
          ) : modal === "stage" ? (
            <StageForm lead={lead} onDone={done} />
          ) : (
            <ActionForm
              submit="Add requirement"
              onSubmit={async (v) => {
                await api("customers/" + id + "/requirements", {
                  method: "POST",
                  body: JSON.stringify(requirement(v)),
                });
                done();
              }}
            >
              <RequirementFields />
            </ActionForm>
          )}
        </Modal>
      )}
    </>
  );
}
