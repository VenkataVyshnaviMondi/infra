"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  Building2,
  UsersRound,
  Target,
  CalendarClock,
  CheckCheck,
  MessageSquare,
  Eye,
  IndianRupee,
} from "lucide-react";
import { type Actor } from "@/lib/auth";
import { date, label, money, STAGES } from "@/lib/constants";
import { Badge, Empty, ErrorBox, Loading, Photo, useData } from "./ui";
export function Dashboard({
  user,
  employeeId,
}: {
  user: Actor;
  employeeId?: string;
}) {
  const [range, setRange] = useState({ from: "", to: "" });
  const {
    data: d,
    error,
    busy,
    reload,
  } = useData(
    (employeeId ? "employees/" + employeeId : "dashboard") +
      "?" +
      new URLSearchParams(range),
  );
  if (busy) return <Loading />;
  if (error)
    return (
      <>
        <ErrorBox message={error} />
        <button onClick={reload}>Try again</button>
      </>
    );
  if (!d) return null;
  const organization = user.role === "ADMIN" && !employeeId;
  const soldFilters = new URLSearchParams({ status: "SOLD", kind: "property" });
  if (!organization) soldFilters.set("creator", employeeId || user.id);
  const available =
    d.inventory.find((i: any) => i.status === "AVAILABLE")?._count || 0;
  const stats = organization
    ? [
        [
          "Total listings",
          d.totalListings,
          Building2,
          `${available} available`,
        ],
        [
          "Active employees",
          d.activeEmployees,
          UsersRound,
          `${d.totalEmployees} total employees`,
        ],
        [
          "Open leads",
          Object.entries(d.leadsByStage).reduce(
            (n, [s, v]) =>
              !["LOST", "CONVERTED"].includes(s) ? n + Number(v) : n,
            0,
          ),
          Target,
          "Across all assigned customers",
        ],
        [
          "Overdue follow-ups",
          d.overdue,
          CalendarClock,
          "Needs your team’s attention",
        ],
      ]
    : [
        [
          "Total listings",
          d.totalListings,
          Building2,
          `${d.listingsUploaded} uploaded in selected period`,
        ],
        [
          "Customers handled",
          d.handled,
          UsersRound,
          "Distinct customers contacted",
        ],
        [
          "Leads generated",
          d.generated,
          Target,
          "Customers first marked interested",
        ],
        [
          "Completed conversions",
          d.completed,
          CheckCheck,
          "Completed transactions",
        ],
      ];
  const cards = [
    stats[0],
    [
      "Properties sold",
      d.soldProperties,
      CheckCheck,
      "View sold properties",
      "/categories?" + soldFilters,
    ],
    ...stats.slice(1),
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            {employeeId
              ? d.employee?.name + " · Performance"
              : organization
                ? "Business overview"
                : "Your work, at a glance"}
          </h1>
          <p>
            {organization
              ? "Your inventory, relationships and team performance in one place."
              : "A clear view of your customer conversations and next steps."}
          </p>
        </div>
        <form
          className="date-filter"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setRange({ from: String(f.get("from")), to: String(f.get("to")) });
          }}
        >
          <label>
            From
            <input
              aria-label="From date"
              type="date"
              name="from"
              defaultValue={range.from}
            />
          </label>
          <label>
            To
            <input
              aria-label="To date"
              type="date"
              name="to"
              defaultValue={range.to}
            />
          </label>
          <button className="button secondary small">Apply</button>
        </form>
      </div>
      <p className="range-caption">
        Activity period: {date(d.from)} – {date(d.to)} · Inventory and lead
        stages show current totals.
      </p>
      <div className="stats-grid">
        {cards.map(([title, value, Icon, sub, href]: any) => {
          const content = (
            <>
              <div className="stat-top">
                <span>{title}</span>
                <Icon size={20} />
              </div>
              <strong>{value}</strong>
              <small>{sub}</small>
            </>
          );
          return href ? (
            <Link
              className="stat stat-link"
              href={href}
              key={title}
              aria-label={`${title}: ${value}. ${sub}`}
            >
              {content}
            </Link>
          ) : (
            <section className="stat" key={title}>
              {content}
            </section>
          );
        })}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Upcoming & overdue follow-ups</h2>
              <p>
                {d.pending} pending · {d.overdue} overdue
              </p>
            </div>
            <Link href="/crm?tab=Follow-ups">
              View all <ArrowUpRight size={15} />
            </Link>
          </div>
          {!d.followUps.length ? (
            <Empty
              title="You’re all caught up"
              description="Scheduled customer follow-ups will appear here."
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Next step</th>
                    <th>Due date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {d.followUps.slice(0, 6).map((f: any) => (
                    <tr key={f.id}>
                      <td>
                        <Link href={"/customers/" + f.customerId}>
                          {f.customer.name}
                        </Link>
                        <small>{f.employee.name}</small>
                      </td>
                      <td className="truncate-cell">{f.notes}</td>
                      <td>{date(f.dueAt, true)}</td>
                      <td>
                        <Badge
                          value={
                            new Date(f.dueAt) < new Date()
                              ? "OVERDUE"
                              : "UPCOMING"
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>
                {organization ? "Employee performance" : "Activity summary"}
              </h2>
              <p>Based on saved records in this period</p>
            </div>
          </div>
          {organization ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Handled</th>
                    <th>Leads</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {d.employees.map((e: any) => (
                    <tr key={e.id}>
                      <td>
                        <Link href={"/employees/" + e.id}>{e.name}</Link>
                      </td>
                      <td>{e.handled}</td>
                      <td>{e.generated}</td>
                      <td>{e.conversions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="activity-metrics">
              <div>
                <MessageSquare />
                <span>Enquiries recorded</span>
                <strong>{d.enquiries}</strong>
              </div>
              <div>
                <Eye />
                <span>Property viewings</span>
                <strong>{d.viewings}</strong>
              </div>
              <div>
                <CalendarClock />
                <span>Pending follow-ups</span>
                <strong>{d.pending}</strong>
              </div>
              <div>
                <IndianRupee />
                <span>Recorded advances</span>
                <strong>{money(d.advanceTotal)}</strong>
              </div>
            </div>
          )}
        </section>
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Lead pipeline</h2>
              <p>
                Customer-to-lead rate: <strong>{d.conversionRate}%</strong>
              </p>
            </div>
            <Link href="/crm?tab=Leads">
              Open CRM <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="pipeline-summary">
            {STAGES.map((s) => (
              <div key={s}>
                <span>{label(s)}</span>
                <strong>{d.leadsByStage[s] || 0}</strong>
                <div className="bar-track">
                  <div
                    style={{
                      width:
                        Math.max(
                          0,
                          ((d.leadsByStage[s] || 0) /
                            Math.max(
                              1,
                              ...Object.values(d.leadsByStage).map(Number),
                            )) *
                            100,
                        ) + "%",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="metric-note">
            Rate = distinct customers first marked Interested by the employee ÷
            distinct customers handled × 100 in this period. Zero handled
            customers = 0%. Historical activity retains its original employee
            attribution.
          </p>
        </section>
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Inventory availability</h2>
              <p>Current status of {organization ? "all" : "their"} listings</p>
            </div>
          </div>
          <div className="inventory-statuses">
            {[
              "AVAILABLE",
              "BOOKED",
              "ADVANCE_PAID",
              "SOLD",
              "RENTED",
              "LEASED",
              "ARCHIVED",
            ].map((s) => (
              <div key={s}>
                <Badge value={s} />
                <strong>
                  {d.inventory.find((i: any) => i.status === s)?._count || 0}
                </strong>
              </div>
            ))}
          </div>
          {organization && (
            <div className="advance-total">
              <span>Advances recorded in period</span>
              <strong>{money(d.advanceTotal)}</strong>
              <small>
                Manual records · historical receipts, including cancelled
                bookings
              </small>
            </div>
          )}
        </section>
      </div>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Recent uploads</h2>
            <p>Latest properties and furniture added to inventory</p>
          </div>
          <Link href="/categories">
            Browse inventory <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="recent-listings">
          {d.recentListings.map((l: any) => (
            <Link href={"/listings/" + l.id} key={l.id}>
              <Photo id={l.photos[0]?.id} alt={l.title} />
              <div>
                <strong>{l.title}</strong>
                <span>{money(l.price)}</span>
                <small>
                  {l.locality} · {date(l.createdAt)}
                </small>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>Recent customer activity</h2>
          </div>
          {d.recentActivity.length ? (
            <div className="activity-list">
              {d.recentActivity.map((i: any) => (
                <div key={i.id}>
                  <span className="avatar light">{i.customer.name[0]}</span>
                  <div>
                    <Link href={"/customers/" + i.customerId}>
                      {i.customer.name}
                    </Link>
                    <p>
                      {label(i.type)} · {i.listing.title}
                    </p>
                    <small>
                      {i.employee.name} · {date(i.occurredAt, true)}
                    </small>
                  </div>
                  <Badge value={i.interest} />
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="No activity in this period"
              description="Record an enquiry or viewing from a customer or listing."
            />
          )}
        </section>
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Enquiries & viewings over time</h2>
              <p>Days with recorded activity</p>
            </div>
          </div>
          <div className="table-wrap trend-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Enquiries</th>
                  <th>Viewings</th>
                </tr>
              </thead>
              <tbody>
                {d.trends.map((t: any) => (
                  <tr key={t.date}>
                    <td>{date(t.date + "T12:00:00+05:30")}</td>
                    <td>{t.enquiries}</td>
                    <td>{t.viewings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!d.trends.length && (
              <Empty
                title="No activity to chart"
                description="Trends appear as interactions are recorded."
              />
            )}
          </div>
        </section>
      </div>
      {(employeeId || user.role === "EMPLOYEE") && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Assigned customers & leads</h2>
              <p>
                Current assignments; historical performance stays with the
                original employee.
              </p>
            </div>
          </div>
          {d.assignedCustomers.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Leads</th>
                  </tr>
                </thead>
                <tbody>
                  {d.assignedCustomers.map((c: any) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={"/customers/" + c.id}>{c.name}</Link>
                      </td>
                      <td>{c.phone}</td>
                      <td>
                        {c.leads.length
                          ? c.leads.map((l: any) => (
                              <div className="button-row" key={l.id}>
                                <Link href={"/listings/" + l.listing.id}>
                                  {l.listing.title}
                                </Link>
                                <Badge value={l.stage} />
                              </div>
                            ))
                          : "No leads yet"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No assigned customers"
              description="Assigned customers will appear here."
            />
          )}
        </section>
      )}
    </>
  );
}
