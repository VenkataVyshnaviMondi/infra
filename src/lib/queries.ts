import { db } from "./db";
import { type Actor, admin, assigned, AppError } from "./auth";
import type { Prisma } from "@prisma/client";
export const listingInclude = {
  category: true,
  option: true,
  property: true,
  furniture: true,
  creator: { select: { id: true, name: true } },
  photos: { orderBy: { position: "asc" as const } },
  _count: {
    select: {
      interactions: true,
      customerViews: true,
      leads: { where: { stage: "LOST" as const } },
    },
  },
};
export async function inventory(actor: Actor, p: URLSearchParams) {
  for (const key of ["min", "max", "page"]) {
    const raw = p.get(key);
    if (raw && (!Number.isFinite(Number(raw)) || Number(raw) < 0))
      throw new AppError("Enter valid non-negative filter values.");
  }
  if (
    p.get("min") &&
    p.get("max") &&
    Number(p.get("min")) > Number(p.get("max"))
  )
    throw new AppError("Maximum price must be at least minimum price.");
  if (
    p.get("status") &&
    ![
      "AVAILABLE",
      "BOOKED",
      "ADVANCE_PAID",
      "SOLD",
      "RENTED",
      "LEASED",
      "ARCHIVED",
    ].includes(p.get("status")!)
  )
    throw new AppError("Choose a valid availability status.");
  const where: Prisma.ListingWhereInput = {};
  const q = p.get("q");
  if (q)
    where.OR = [
      { id: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
      { locality: { contains: q, mode: "insensitive" } },
      { property: { projectName: { contains: q, mode: "insensitive" } } },
    ];
  if (p.get("category")) where.categoryId = p.get("category")!;
  if (p.get("kind") === "property")
    where.AND = [{ categoryId: { not: "furniture" } }];
  if (p.get("option")) where.optionId = p.get("option")!;
  if (p.get("status")) where.status = p.get("status") as never;
  else where.status = { not: "ARCHIVED" };
  if (p.get("creator")) where.creatorId = p.get("creator")!;
  if (p.get("location"))
    where.city = { contains: p.get("location")!, mode: "insensitive" };
  if (p.get("min") || p.get("max"))
    where.price = {
      ...(p.get("min") ? { gte: Number(p.get("min")) } : {}),
      ...(p.get("max") ? { lte: Number(p.get("max")) } : {}),
    };
  const page = Math.max(1, Number(p.get("page")) || 1);
  const sort = p.get("sort");
  const all = await db.listing.findMany({
    where,
    include: listingInclude,
    orderBy:
      sort === "price-asc"
        ? { price: "asc" }
        : sort === "price-desc"
          ? { price: "desc" }
          : { createdAt: "desc" },
  });
  const ids = all.map((l) => l.id);
  const counts = await db.interaction.groupBy({
    by: ["listingId", "type"],
    where: { listingId: { in: ids } },
    _count: true,
  });
  const rows = all.map((l) => ({
    ...l,
    views: l._count.customerViews,
    lostCustomers: l._count.leads,
    enquiries:
      counts.find((c) => c.listingId === l.id && c.type === "ENQUIRY")
        ?._count || 0,
  }));
  if (sort === "views") rows.sort((a, b) => b.views - a.views);
  return {
    rows: rows.slice((page - 1) * 12, page * 12),
    categoryCounts: await db.listing.groupBy({
      by: ["categoryId"],
      where: { status: { not: "ARCHIVED" } },
      _count: true,
    }),
    total: rows.length,
    page,
    pages: Math.max(1, Math.ceil(rows.length / 12)),
  };
}
export async function listingDetail(actor: Actor, id: string) {
  const l = await db.listing.findUnique({
    where: { id },
    include: {
      ...listingInclude,
      statusHistory: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!l) throw new AppError("Listing not found.", 404);
  const visible =
    actor.role === "ADMIN" ? {} : { customer: { assignedToId: actor.id } };
  const [interactions, bookings, advances, completions, counts, viewers] =
    await Promise.all([
      db.interaction.findMany({
        where: { listingId: id, ...visible },
        include: {
          customer: { select: { id: true, name: true } },
          employee: { select: { name: true } },
        },
        orderBy: { occurredAt: "desc" },
      }),
      db.booking.findMany({
        where: { listingId: id, ...visible },
        include: { customer: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      db.advance.findMany({
        where: { listingId: id, ...visible },
        include: { customer: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      db.completion.findMany({
        where: { listingId: id, ...visible },
        include: { customer: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      db.interaction.groupBy({
        by: ["type"],
        where: { listingId: id },
        _count: true,
      }),
      db.customerPropertyView.findMany({
        where: { listingId: id },
        select: { customerId: true },
        distinct: ["customerId"],
      }),
    ]);
  return {
    ...l,
    statusHistory: l.statusHistory.map((h) =>
      actor.role === "ADMIN"
        ? h
        : { ...h, reason: undefined, actorId: undefined },
    ),
    interactions,
    bookings,
    advances,
    completions,
    views: l._count.customerViews,
    lostCustomers: l._count.leads,
    enquiries: counts.find((c) => c.type === "ENQUIRY")?._count || 0,
    uniqueViewers: viewers.length,
  };
}
export async function crm(actor: Actor) {
  const where = actor.role === "ADMIN" ? {} : { assignedToId: actor.id };
  const customers = await db.customer.findMany({
    where,
    include: {
      preferredListing: { select: { id: true, title: true, status: true } },
      requirements: { orderBy: { createdAt: "desc" } },
      assignedTo: { select: { id: true, name: true } },
      leads: {
        include: {
          listing: { select: { id: true, title: true, status: true } },
        },
      },
      interactions: {
        select: {
          listingId: true,
          interest: true,
          rejectionReason: true,
          offer: true,
          occurredAt: true,
          listing: { select: { id: true, title: true, status: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
  const followUps = await db.followUp.findMany({
    where: { customer: where },
    include: {
      customer: { select: { id: true, name: true } },
      employee: { select: { name: true } },
    },
    orderBy: { dueAt: "asc" },
  });
  return {
    customers: customers.map((c) => ({
      ...c,
      linkedListings: [
        ...new Map(
          c.interactions.map((i) => [i.listingId, i.listing]),
        ).values(),
      ],
    })),
    followUps,
  };
}
export async function customerDetail(actor: Actor, id: string) {
  const c = await db.customer.findUnique({
    where: { id },
    include: {
      preferredListing: { select: { id: true, title: true, status: true } },
      assignedTo: { select: { id: true, name: true } },
      requirements: { orderBy: { createdAt: "desc" } },
      assignments: { orderBy: { createdAt: "desc" } },
      interactions: {
        include: {
          listing: { select: { id: true, title: true } },
          employee: { select: { name: true } },
        },
        orderBy: { occurredAt: "desc" },
      },
      leads: {
        include: {
          listing: { select: { id: true, title: true, status: true } },
          history: { orderBy: { createdAt: "desc" } },
        },
      },
      followUps: { orderBy: { dueAt: "asc" } },
      bookings: {
        include: {
          listing: { select: { id: true, title: true, price: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      advances: {
        include: { listing: { select: { id: true, title: true } } },
        orderBy: { createdAt: "desc" },
      },
      completions: {
        include: { listing: { select: { id: true, title: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!c) throw new AppError("Customer not found.", 404);
  assigned(actor, c.assignedToId);
  return c;
}
export async function metrics(
  actor: Actor,
  p: URLSearchParams,
  employeeId?: string,
) {
  if (employeeId) admin(actor);
  const person =
    employeeId || (actor.role === "EMPLOYEE" ? actor.id : undefined);
  const start = p.get("from")
    ? new Date(p.get("from")! + "T00:00:00+05:30")
    : new Date(Date.now() - 30 * 86400000);
  const end = p.get("to")
    ? new Date(p.get("to")! + "T23:59:59.999+05:30")
    : new Date();
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    start > end
  )
    throw new AppError("Choose a valid date range.");
  const range = { gte: start, lte: end };
  const [
    interactions,
    leads,
    completions,
    listingCount,
    inventoryCounts,
    customerCount,
    followUps,
    employees,
    recentListings,
    advances,
    allTimeLeads,
    soldProperties,
  ] = await Promise.all([
    db.interaction.findMany({
      where: { employeeId: person, occurredAt: range },
      include: {
        customer: { select: { id: true, name: true, assignedToId: true } },
        listing: { select: { id: true, title: true } },
        employee: { select: { name: true } },
      },
      orderBy: { occurredAt: "desc" },
    }),
    db.lead.findMany({
      where: { ...(person ? { customer: { assignedToId: person } } : {}) },
      include: { customer: { select: { name: true } } },
    }),
    db.completion.findMany({
      where: { employeeId: person, createdAt: range, reversedAt: null },
    }),
    db.listing.count({ where: { creatorId: person, createdAt: range } }),
    db.listing.groupBy({
      by: ["status"],
      where: { creatorId: person },
      _count: true,
    }),
    db.customer.count({ where: { assignedToId: person } }),
    db.followUp.findMany({
      where: {
        ...(person ? { customer: { assignedToId: person } } : {}),
        doneAt: null,
      },
      include: {
        customer: { select: { id: true, name: true } },
        employee: { select: { name: true } },
      },
      orderBy: { dueAt: "asc" },
    }),
    db.user.findMany({
      where: { role: "EMPLOYEE" },
      select: {
        id: true,
        name: true,
        active: true,
        username: true,
        phone: true,
        createdAt: true,
      },
    }),
    db.listing.findMany({
      where: { creatorId: person },
      include: listingInclude,
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    db.advance.aggregate({
      where: {
        createdAt: range,
        ...(person ? { customer: { assignedToId: person } } : {}),
      },
      _sum: { amount: true },
    }),
    db.lead.findMany({
      where: { generatedById: person },
      select: { customerId: true, generatedById: true, createdAt: true },
    }),
    db.listing.count({
      where: {
        creatorId: person,
        status: "SOLD",
        categoryId: { not: "furniture" },
      },
    }),
  ]);
  const first = new Map<string, Date>();
  for (const l of allTimeLeads) {
    const key = l.generatedById + ":" + l.customerId;
    if (!first.has(key) || l.createdAt < first.get(key)!)
      first.set(key, l.createdAt);
  }
  const generatedKeys = [...first]
    .filter(([, d]) => d >= start && d <= end)
    .map(([k]) => k);
  const handled = new Set(interactions.map((i) => i.customerId)).size;
  const generated = new Set(generatedKeys.map((k) => k.split(":")[1])).size;
  const performance = await Promise.all(
    employees.map(async (e) => {
      const records =
        person && person !== e.id
          ? []
          : await db.interaction.findMany({
              where: { employeeId: e.id, occurredAt: range },
              select: { customerId: true },
            });
      const generated = await db.lead.groupBy({
        by: ["customerId"],
        where: { generatedById: e.id },
        _min: { createdAt: true },
      });
      return {
        ...e,
        handled: new Set(records.map((r) => r.customerId)).size,
        generated: generated.filter(
          (l) => l._min.createdAt! >= start && l._min.createdAt! <= end,
        ).length,
        conversions: await db.completion.count({
          where: { employeeId: e.id, createdAt: range, reversedAt: null },
        }),
      };
    }),
  );
  const daily = new Map<
    string,
    { date: string; enquiries: number; viewings: number }
  >();
  for (const i of interactions) {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
    }).format(i.occurredAt);
    const r = daily.get(day) || { date: day, enquiries: 0, viewings: 0 };
    if (i.type === "ENQUIRY") r.enquiries++;
    if (i.type === "PROPERTY_VIEWING") r.viewings++;
    daily.set(day, r);
  }
  const assignedCustomers = person
    ? await db.customer.findMany({
        where: { assignedToId: person },
        select: {
          id: true,
          name: true,
          phone: true,
          leads: {
            select: {
              id: true,
              stage: true,
              listing: { select: { id: true, title: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      })
    : [];
  return {
    from: start,
    to: end,
    listingsUploaded: listingCount,
    soldProperties,
    totalListings: inventoryCounts.reduce(
      (total, item) => total + item._count,
      0,
    ),
    inventory: inventoryCounts,
    customers: customerCount,
    handled,
    generated,
    conversionRate: handled ? Math.round((generated / handled) * 1000) / 10 : 0,
    completed: completions.length,
    enquiries: interactions.filter((i) => i.type === "ENQUIRY").length,
    viewings: interactions.filter((i) => i.type === "PROPERTY_VIEWING").length,
    overdue: followUps.filter((f) => f.dueAt < new Date()).length,
    followUps: followUps.slice(0, 12),
    pending: followUps.length,
    employees: person ? [] : performance,
    employee: employeeId
      ? performance.find((e) => e.id === employeeId)
      : undefined,
    activeEmployees: employees.filter((e) => e.active).length,
    totalEmployees: employees.length,
    advanceTotal: advances._sum.amount || 0,
    leadsByStage: leads.reduce(
      (a, l) => ({ ...a, [l.stage]: (a[l.stage] || 0) + 1 }),
      {} as Record<string, number>,
    ),
    recentActivity: interactions
      .filter(
        (i) => actor.role === "ADMIN" || i.customer.assignedToId === actor.id,
      )
      .slice(0, 8),
    recentListings,
    assignedCustomers,
    trends: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
