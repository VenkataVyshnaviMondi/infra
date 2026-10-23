import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import {
  saveCustomer,
  recordCustomerContact,
  markCustomerInterested,
  recordInteraction,
  saveListing,
  listingAction,
  transaction,
  customerAccess,
} from "../src/lib/services";
import {
  crm,
  metrics,
  listingDetail,
  customerDetail,
  inventory,
} from "../src/lib/queries";
import { normalizePhone, listingSchema } from "../src/lib/validation";
import { type Actor, safeUser } from "../src/lib/auth";
let admin: Actor,
  employee: Actor,
  other: Actor,
  customer: any,
  second: any,
  listing: any,
  third: any;
const input = (phone: string, owner?: string) => ({
  name: "Test Customer",
  phone,
  source: "Walk-in",
  assignedToId: owner,
  requirement: {
    categoryId: "flats",
    budgetMin: 1000000,
    budgetMax: 9000000,
    locations: "Hyderabad",
  },
});
const interaction = (extra: Record<string, unknown> = {}) => ({
  requestKey: randomUUID(),
  customerId: customer.id,
  listingId: listing.id,
  type: "ENQUIRY",
  interest: "UNDECIDED",
  occurredAt: new Date().toISOString(),
  ...extra,
});
beforeAll(async () => {
  if (
    new URL(process.env.DATABASE_URL!).searchParams.get("schema") !==
    "kubera_test"
  )
    throw new Error("Tests require the isolated kubera_test schema.");
  await db.$executeRawUnsafe(
    'TRUNCATE "User", "Category", "LoginAttempt" CASCADE',
  );
  const data = {
    name: "Test",
    phone: "+919999999990",
    passwordHash: "test-only-disabled",
    mustChangePassword: false,
  };
  admin = safeUser(
    await db.user.create({
      data: { ...data, username: "test-admin", role: "ADMIN" },
    }),
  );
  employee = safeUser(
    await db.user.create({ data: { ...data, username: "test-employee" } }),
  );
  other = safeUser(
    await db.user.create({ data: { ...data, username: "test-other" } }),
  );
  await db.category.create({
    data: {
      id: "flats",
      name: "Flats",
      options: {
        create: { id: "flats-sale", name: "Sale", transactionType: "Sale" },
      },
    },
  });
  await db.category.create({
    data: {
      id: "furniture",
      name: "Furniture",
      options: {
        create: {
          id: "furniture-sofa",
          name: "Sofa",
          transactionType: "Sale",
          furnitureSubtype: "Sofa",
        },
      },
    },
  });
  customer = await saveCustomer(employee, input("9999999901"));
  second = await saveCustomer(other, input("9999999902"));
  third = await saveCustomer(employee, input("9999999903"));
  const photo = await db.photo.create({
    data: { key: "test-image.webp", ownerId: employee.id },
  });
  listing = await saveListing(employee, {
    title: "Test sale flat",
    categoryId: "flats",
    optionId: "flats-sale",
    price: 8500000,
    state: "Telangana",
    city: "Hyderabad",
    locality: "Kondapur",
    address: "Test road",
    description: "A test property listing for consistency checks.",
    photoIds: [photo.id],
    property: {
      type: "Apartment",
      facing: "East",
      bhk: 3,
      bathrooms: 2,
      superArea: 1600,
      carpetArea: 1300,
      totalFloors: 10,
      furnishing: "Semi-furnished",
      constructionStatus: "Ready to Move",
    },
  });
});
afterAll(async () => {
  await db.$disconnect();
});
describe("Upload totals and initial customer listing links", () => {
  it("increments organization and creator totals once, independently of the date filter", async () => {
    const range = new URLSearchParams({ from: "2020-01-01", to: "2020-01-02" });
    const before = await metrics(admin, range);
    const ownBefore = await metrics(employee, range);
    const otherBefore = await metrics(other, range);
    const photo = await db.photo.create({
      data: { key: "count-regression.webp", ownerId: employee.id },
    });
    const payload = {
      title: "Count regression sofa",
      categoryId: "furniture",
      optionId: "furniture-sofa",
      price: 18500,
      state: "Telangana",
      city: "Hyderabad",
      locality: "Kondapur",
      address: "Main Road",
      description: "A real listing created to verify the saved listing total.",
      photoIds: [photo.id],
      furniture: { material: "Wood", condition: "Good", quantity: 1 },
    };
    const created = await saveListing(employee, payload);
    expect((await metrics(admin, range)).totalListings).toBe(
      before.totalListings + 1,
    );
    expect((await metrics(employee, range)).totalListings).toBe(
      ownBefore.totalListings + 1,
    );
    expect((await metrics(other, range)).totalListings).toBe(
      otherBefore.totalListings,
    );
    expect((await metrics(employee, range)).listingsUploaded).toBe(0);
    await saveListing(
      employee,
      { ...payload, title: "Edited count regression sofa" },
      created.id,
    );
    expect((await metrics(admin, range)).totalListings).toBe(
      before.totalListings + 1,
    );
  });
  it("does not increase totals when validation rejects an upload", async () => {
    const before = await db.listing.count();
    await expect(
      saveListing(employee, { title: "Invalid upload", price: -1 }),
    ).rejects.toThrow();
    expect(await db.listing.count()).toBe(before);
  });
});
describe("Customer protection and validation", () => {
  it("normalizes Indian phone numbers", () => {
    expect(normalizePhone("98765 43210")).toBe("+919876543210");
    expect(normalizePhone("+91 98765-43210")).toBe("+919876543210");
  });
  it("detects duplicates without exposing another employee’s customer identity", async () => {
    await expect(saveCustomer(other, input(customer.phone))).rejects.toThrow(
      "Ask an administrator",
    );
    await expect(saveCustomer(employee, input(customer.phone))).rejects.toThrow(
      "existing customer",
    );
  });
  it("denies confidential customer details and requirements across assignments", async () => {
    await expect(customerDetail(other, customer.id)).rejects.toThrow(
      "not assigned",
    );
    await expect(
      transaction((tx) => customerAccess(tx, other, customer.id)),
    ).rejects.toThrow("not assigned");
  });
  it("rejects carpet area exceeding super area", () => {
    expect(
      listingSchema.safeParse({
        title: "Bad",
        categoryId: "flats",
        optionId: "flats-sale",
        price: 1,
        state: "TS",
        city: "HYD",
        locality: "X",
        address: "X",
        description: "Valid description",
        photoIds: ["x"],
        property: {
          type: "Apartment",
          facing: "East",
          superArea: 100,
          carpetArea: 200,
          bhk: 2,
          bathrooms: 2,
          totalFloors: 5,
          furnishing: "Unfurnished",
        },
      }).success,
    ).toBe(false);
  });
});
describe("Interactions and derived metrics", () => {
  it("first customer contact adds one view and page opens never increase counts", async () => {
    await recordInteraction(employee, interaction());
    const a = await listingDetail(employee, listing.id);
    const b = await listingDetail(employee, listing.id);
    expect(a.views).toBe(1);
    expect(b.views).toBe(1);
    expect(b.enquiries).toBe(1);
  });
  it("property viewing increments exactly once on retries, including parallel submissions", async () => {
    const v = interaction({ type: "PROPERTY_VIEWING", interest: "INTERESTED" });
    await Promise.all([
      recordInteraction(employee, v),
      recordInteraction(employee, v),
    ]);
    await recordInteraction(employee, v);
    await expect(
      recordInteraction(employee, { ...v, customerId: third.id }),
    ).rejects.toThrow("submission key");
    const l = await listingDetail(employee, listing.id);
    expect(l.views).toBe(1);
    expect(l.uniqueViewers).toBe(1);
    expect(await db.lead.count({ where: { customerId: customer.id } })).toBe(1);
  });
  it("not interested requires a reason and remains specific to a listing", async () => {
    await expect(
      recordInteraction(employee, interaction({ interest: "NOT_INTERESTED" })),
    ).rejects.toThrow();
    await recordInteraction(
      employee,
      interaction({
        interest: "NOT_INTERESTED",
        rejectionReason: "Too far from work",
      }),
    );
    expect(
      (await db.lead.findFirstOrThrow({ where: { customerId: customer.id } }))
        .stage,
    ).toBe("NEW");
    expect(await db.customer.count({ where: { id: customer.id } })).toBe(1);
  });
  it("metrics derive actual distinct customers and first Interested attribution", async () => {
    const m = await metrics(employee, new URLSearchParams());
    expect(m.handled).toBe(1);
    expect(m.generated).toBe(1);
    expect(m.viewings).toBe(1);
    expect(m.enquiries).toBe(2);
    expect(m.conversionRate).toBe(100);
  });
  it("private listing histories are scoped by customer assignment", async () => {
    const l = await listingDetail(other, listing.id);
    expect(l.interactions).toHaveLength(0);
    expect(l.views).toBe(1);
  });
});
describe("Booking consistency and completion", () => {
  it("rejects competing active bookings under concurrency", async () => {
    const attempts = await Promise.allSettled([
      listingAction(employee, listing.id, {
        action: "book",
        customerId: customer.id,
      }),
      listingAction(other, listing.id, {
        action: "book",
        customerId: second.id,
      }),
    ]);
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.booking.count({
        where: { listingId: listing.id, active: true },
      }),
    ).toBe(1);
  });
  it("prevents employees from finalizing transactions", async () => {
    await expect(
      listingAction(employee, listing.id, {
        action: "complete",
        amount: 8000000,
      }),
    ).rejects.toThrow("Administrator");
  });
  it("records advance idempotently, converts only on completion and reverses with history", async () => {
    const booking = await db.booking.findFirstOrThrow({
      where: { listingId: listing.id, active: true },
    });
    const actor = booking.customerId === customer.id ? employee : other;
    const soldBefore = (await metrics(admin, new URLSearchParams()))
      .soldProperties;
    const payload = {
      action: "advance",
      requestKey: randomUUID(),
      customerId: booking.customerId,
      amount: 50000,
      paymentDate: new Date().toISOString(),
      method: "UPI",
    };
    await listingAction(actor, listing.id, payload);
    await listingAction(actor, listing.id, payload);
    expect(await db.advance.count()).toBe(1);
    expect(
      (
        await db.lead.findUniqueOrThrow({
          where: {
            customerId_listingId: {
              customerId: booking.customerId,
              listingId: listing.id,
            },
          },
        })
      ).stage,
    ).toBe("ADVANCE_PAID");
    await listingAction(admin, listing.id, {
      action: "complete",
      customerId: booking.customerId,
      amount: 8000000,
    });
    expect(
      (await db.listing.findUniqueOrThrow({ where: { id: listing.id } }))
        .status,
    ).toBe("SOLD");
    expect((await metrics(admin, new URLSearchParams())).soldProperties).toBe(
      soldBefore + 1,
    );
    const soldList = await inventory(
      admin,
      new URLSearchParams({ status: "SOLD", kind: "property" }),
    );
    expect(soldList.rows.map((row) => row.id)).toContain(listing.id);
    expect(soldList.total).toBe(soldBefore + 1);
    expect(
      (
        await metrics(
          employee,
          new URLSearchParams({ from: "2000-01-01", to: "2000-01-02" }),
        )
      ).soldProperties,
    ).toBe(1);
    expect((await metrics(other, new URLSearchParams())).soldProperties).toBe(
      0,
    );
    expect(
      await db.lead.count({
        where: { listingId: listing.id, stage: "CONVERTED" },
      }),
    ).toBe(1);
    await expect(
      listingAction(admin, listing.id, { action: "reverse" }),
    ).rejects.toThrow("reason");
    await listingAction(admin, listing.id, {
      action: "reverse",
      reason: "Transaction rescinded",
    });
    expect((await metrics(admin, new URLSearchParams())).soldProperties).toBe(
      soldBefore,
    );
    expect(
      (await db.listing.findUniqueOrThrow({ where: { id: listing.id } }))
        .status,
    ).toBe("AVAILABLE");
    expect(
      await db.completion.count({ where: { reversedAt: { not: null } } }),
    ).toBe(1);
    expect(await db.advance.count()).toBe(1);
  });
  it("cancelled bookings retain receipt and status history", async () => {
    await listingAction(employee, listing.id, {
      action: "book",
      customerId: customer.id,
    });
    await listingAction(admin, listing.id, {
      action: "cancel",
      reason: "Customer changed requirements",
    });
    expect(
      await db.booking.count({
        where: { listingId: listing.id, cancelledAt: { not: null } },
      }),
    ).toBe(1);
    expect(
      (await db.listing.findUniqueOrThrow({ where: { id: listing.id } }))
        .status,
    ).toBe("AVAILABLE");
  });
  it("reassignment preserves original historical employee attribution", async () => {
    await saveCustomer(
      admin,
      { ...input(customer.phone, other.id), name: customer.name },
      customer.id,
    );
    expect(
      (
        await db.interaction.findFirstOrThrow({
          where: { customerId: customer.id },
        })
      ).employeeId,
    ).toBe(employee.id);
    await expect(customerDetail(employee, customer.id)).rejects.toThrow(
      "not assigned",
    );
    expect((await customerDetail(other, customer.id)).phone).toBe(
      customer.phone,
    );
  });
  it("handles zero denominators and denies employee ownership spoofing", async () => {
    const blank = safeUser(
      await db.user.create({
        data: {
          name: "Blank",
          username: "blank",
          phone: "+919999999999",
          passwordHash: "disabled",
          mustChangePassword: false,
        },
      }),
    );
    expect((await metrics(blank, new URLSearchParams())).conversionRate).toBe(
      0,
    );
    await expect(
      saveCustomer(employee, input("9999999910", other.id)),
    ).rejects.toThrow("Only Admin");
  });
});

describe("Customer creation linked to uploaded inventory", () => {
  it("saves the selected listing and customer atomically as an enquiry without adding a view or lead", async () => {
    const before = await listingDetail(admin, listing.id);
    const linked = await saveCustomer(employee, {
      ...input("9999999912"),
      name: "Customer linked to uploaded item",
      listingId: listing.id,
    });
    const profile = await customerDetail(employee, linked.id);
    expect(profile.interactions).toHaveLength(1);
    expect(profile.interactions[0].listingId).toBe(listing.id);
    expect(profile.interactions[0].type).toBe("ENQUIRY");
    expect(profile.leads).toHaveLength(0);
    const after = await listingDetail(admin, listing.id);
    expect(after.enquiries).toBe(before.enquiries + 1);
    expect(after.views).toBe(before.views + 1);
    const customers = await crm(employee);
    expect(
      customers.customers
        .find((c) => c.id === linked.id)
        ?.linkedListings.map((l) => l.id),
    ).toEqual([listing.id]);
    await expect(customerDetail(other, linked.id)).rejects.toThrow(
      "not assigned",
    );
    expect(
      (await listingDetail(other, listing.id)).interactions.some(
        (i) => i.customerId === linked.id,
      ),
    ).toBe(false);
    await saveCustomer(
      employee,
      {
        ...input("9999999912"),
        name: "Updated linked customer",
        listingId: listing.id,
      },
      linked.id,
    );
    expect(
      (await customerDetail(employee, linked.id)).interactions,
    ).toHaveLength(1);
  });
  it("saves dated visits and enquiries with age for both staff roles", async () => {
    const contactDate = "2026-10-20T10:15:00+05:30";
    for (const [actor, phone, contactType, source] of [
      [admin, "9999999921", "VISIT", "Walk-in"],
      [employee, "9999999922", "ENQUIRY", "WhatsApp"],
    ] as const) {
      const saved = await saveCustomer(actor, {
        ...input(phone),
        age: "42",
        listingId: listing.id,
        contactDate,
        contactType,
        source,
      });
      const detail = await customerDetail(actor, saved.id);
      expect(detail.age).toBe(42);
      expect(detail.source).toBe(source);
      expect(detail.contactType).toBe(contactType);
      expect(detail.contactDate?.toISOString()).toBe(
        new Date(contactDate).toISOString(),
      );
      expect(detail.assignedToId).toBe(actor.id);
      expect(detail.interactions).toHaveLength(1);
      expect(detail.interactions[0].type).toBe("ENQUIRY");
      expect(detail.interactions[0].occurredAt.toISOString()).toBe(
        new Date(contactDate).toISOString(),
      );
      expect(detail.interactions[0].listingId).toBe(listing.id);
      if (actor.role === "EMPLOYEE")
        await expect(customerDetail(other, saved.id)).rejects.toThrow();
    }
  });
  it("rejects invalid ages, future dates, mismatched property types and unspecified other contact modes atomically", async () => {
    const before = await db.customer.count();
    const base = { ...input("9999999923"), listingId: listing.id };
    for (const fields of [
      { age: 121 },
      { age: 22.5 },
      { contactDate: new Date(Date.now() + 86400000).toISOString() },
      { source: "Other" },
      { requirement: { categoryId: "furniture" } },
    ]) {
      await expect(
        saveCustomer(employee, { ...base, ...fields }),
      ).rejects.toThrow();
    }
    expect(await db.customer.count()).toBe(before);
    const saved = await saveCustomer(employee, {
      ...base,
      source: "Other",
      contactDetails: "Property exhibition",
      age: 30,
    });
    expect(saved.contactDetails).toBe("Property exhibition");
    const edited = await saveCustomer(
      employee,
      { ...base, age: "", source: "Phone" },
      saved.id,
    );
    expect(edited.age).toBeNull();
    expect(edited.contactDetails).toBeNull();
  });
  it("records a repeat customer contact without duplicate profiles, inflated views or overwritten identity", async () => {
    const profile = await saveCustomer(employee, {
      name: "Returning customer",
      phone: "9999999928",
      source: "Walk-in",
      requirement: { categoryId: "flats" },
    });
    const before = await db.customer.count();
    const original = await db.customer.findUniqueOrThrow({
      where: { id: profile.id },
    });
    const input = {
      requestKey: randomUUID(),
      listingId: listing.id,
      source: "Walk-in",
      contactType: "VISIT",
      contactDate: "2026-10-20T11:00:00+05:30",
      notes: "Repeat visit for the same property",
    };
    const first = await recordCustomerContact(employee, profile.id, input);
    const retry = await recordCustomerContact(employee, profile.id, input);
    expect(retry.id).toBe(first.id);
    expect(first.type).toBe("ENQUIRY");
    expect(first.notes).toContain("Customer visit");
    expect(first.occurredAt.toISOString()).toBe(
      new Date(input.contactDate).toISOString(),
    );
    expect(await db.customer.count()).toBe(before);
    const unchanged = await db.customer.findUniqueOrThrow({
      where: { id: profile.id },
    });
    expect(unchanged).toEqual(original);
    await expect(
      recordCustomerContact(other, profile.id, {
        ...input,
        requestKey: randomUUID(),
      }),
    ).rejects.toThrow("not assigned");
    try {
      await saveCustomer(employee, {
        ...input,
        ...{
          name: "Duplicate",
          phone: original.phone,
          requirement: { categoryId: "flats" },
        },
      });
      throw new Error("Expected duplicate");
    } catch (error) {
      expect((error as any).details.existingCustomer.id).toBe(profile.id);
    }
  });
  it("edits the current property without duplicating customers or rewriting previous enquiries", async () => {
    const linked = await saveCustomer(employee, {
      ...input("9999999931"),
      listingId: listing.id,
    });
    const alternate = await db.listing.create({
      data: {
        title: "Alternate uploaded sofa",
        categoryId: "furniture",
        optionId: "furniture-sofa",
        price: 5000,
        state: "TS",
        city: "Hyderabad",
        locality: "Kondapur",
        address: "Test street",
        description: "Alternative property selection for testing",
        creatorId: employee.id,
      },
    });
    const before = await db.customer.count();
    const original = await db.interaction.findMany({
      where: { customerId: linked.id },
    });
    const edited = await saveCustomer(
      employee,
      {
        ...input("9999999931"),
        listingId: alternate.id,
        requirement: {
          categoryId: "furniture",
          optionId: "furniture-sofa",
          locations: "Kondapur",
        },
      },
      linked.id,
    );
    expect(edited.preferredListingId).toBe(alternate.id);
    expect(await db.customer.count()).toBe(before);
    expect(
      await db.interaction.findMany({ where: { customerId: linked.id } }),
    ).toEqual(original);
    expect(
      (await customerDetail(employee, linked.id)).preferredListing?.id,
    ).toBe(alternate.id);
    await expect(
      saveCustomer(
        employee,
        { ...input("9999999931"), listingId: alternate.id },
        linked.id,
      ),
    ).rejects.toThrow("match the property type");
    expect(
      (await customerDetail(employee, linked.id)).preferredListing?.id,
    ).toBe(alternate.id);
  });
  it("promotes interested customers once per property and enforces staff access", async () => {
    for (const [actor, phone] of [
      [admin, "9999999934"],
      [employee, "9999999935"],
    ] as const) {
      const contact = await saveCustomer(actor, {
        ...input(phone),
        listingId: listing.id,
      });
      const first = await markCustomerInterested(actor, contact.id, listing.id);
      const repeated = await markCustomerInterested(
        actor,
        contact.id,
        listing.id,
      );
      expect(repeated.id).toBe(first.id);
      expect(await db.lead.count({ where: { customerId: contact.id } })).toBe(
        1,
      );
      expect(
        await db.interaction.count({
          where: { customerId: contact.id, interest: "INTERESTED" },
        }),
      ).toBe(1);
      expect(
        await db.interaction.count({
          where: { customerId: contact.id, type: "PROPERTY_VIEWING" },
        }),
      ).toBe(0);
      await expect(
        markCustomerInterested(other, contact.id, listing.id),
      ).rejects.toThrow("not assigned");
      await expect(
        markCustomerInterested(actor, contact.id, "different-property"),
      ).rejects.toThrow("current property changed");
    }
  });
  it("rejects missing or archived selected inventory without creating the customer", async () => {
    const before = await db.customer.count();
    await expect(
      saveCustomer(employee, {
        ...input("9999999913"),
        listingId: "missing-listing",
      }),
    ).rejects.toThrow("uploaded listing");
    expect(await db.customer.count()).toBe(before);
    const archived = await db.listing.create({
      data: {
        title: "Archived item",
        categoryId: "furniture",
        optionId: "furniture-sofa",
        price: 100,
        state: "TS",
        city: "Hyderabad",
        locality: "X",
        address: "X",
        description: "Archived inventory for customer linking validation",
        creatorId: employee.id,
        status: "ARCHIVED",
      },
    });
    await expect(
      saveCustomer(employee, {
        ...input("9999999913"),
        listingId: archived.id,
      }),
    ).rejects.toThrow("uploaded listing");
    expect(await db.customer.count()).toBe(before);
  });
  it("counts each linked customer once and keeps booked, advanced and sold inventory frozen until Admin resumes", async () => {
    const photo = await db.photo.create({
      data: { key: "freeze-test.webp", ownerId: employee.id },
    });
    const payload = {
      title: "Frozen inventory test",
      categoryId: "furniture",
      optionId: "furniture-sofa",
      price: 10000,
      state: "TS",
      city: "Hyderabad",
      locality: "Kondapur",
      address: "Test road",
      description: "Dedicated inventory for freezing and customer-view tests.",
      photoIds: [photo.id],
      furniture: { material: "Wood", condition: "Good", quantity: 1 },
    };
    const property = await saveListing(employee, payload);
    const contact = (phone: string) => ({
      name: "Freeze test customer",
      phone,
      source: "Walk-in",
      listingId: property.id,
      requirement: { categoryId: "furniture", optionId: "furniture-sofa" },
    });
    const first = await saveCustomer(employee, contact("9999999941"));
    expect((await listingDetail(admin, property.id)).views).toBe(1);
    await saveCustomer(employee, contact("9999999941"), first.id);
    await recordCustomerContact(employee, first.id, {
      listingId: property.id,
      source: "Phone",
      contactDate: new Date().toISOString(),
      requestKey: randomUUID(),
    });
    expect((await listingDetail(admin, property.id)).views).toBe(1);
    const secondLinked = await saveCustomer(employee, contact("9999999942"));
    expect((await listingDetail(admin, property.id)).views).toBe(2);
    await listingAction(employee, property.id, {
      action: "book",
      customerId: first.id,
    });
    await expect(
      recordInteraction(employee, {
        requestKey: randomUUID(),
        customerId: secondLinked.id,
        listingId: property.id,
        type: "ENQUIRY",
        interest: "INTERESTED",
        occurredAt: new Date().toISOString(),
      }),
    ).rejects.toThrow("frozen");
    for (const actor of [employee, admin])
      await expect(saveListing(actor, payload, property.id)).rejects.toThrow(
        "frozen",
      );
    await expect(
      listingAction(employee, property.id, {
        action: "resume",
        reason: "Attempt",
      }),
    ).rejects.toThrow("Administrator");
    await expect(
      listingAction(employee, property.id, {
        action: "cancel",
        reason: "Attempt",
      }),
    ).rejects.toThrow("Administrator");
    const count = await db.customer.count();
    await expect(saveCustomer(employee, contact("9999999943"))).rejects.toThrow(
      "frozen",
    );
    expect(await db.customer.count()).toBe(count);
    await listingAction(employee, property.id, {
      action: "advance",
      customerId: first.id,
      requestKey: randomUUID(),
      amount: 1000,
      paymentDate: new Date().toISOString(),
      method: "Cash",
    });
    const receipt = {
      action: "advance",
      customerId: first.id,
      amount: 9000,
      paymentDate: new Date().toISOString(),
      method: "Cash",
    };
    await expect(
      listingAction(employee, property.id, {
        ...receipt,
        amount: 9000.01,
        requestKey: randomUUID(),
      }),
    ).rejects.toThrow("remaining balance");
    await expect(
      listingAction(employee, property.id, {
        ...receipt,
        amount: 0.001,
        requestKey: randomUUID(),
      }),
    ).rejects.toThrow("two decimal");
    await expect(
      listingAction(admin, property.id, {
        action: "complete",
        amount: 10000.01,
      }),
    ).rejects.toThrow("property price");
    await expect(
      listingAction(admin, property.id, { action: "complete", amount: 999.99 }),
    ).rejects.toThrow("advances already received");
    const competing = await Promise.allSettled(
      [1, 2].map(() =>
        listingAction(employee, property.id, {
          ...receipt,
          requestKey: randomUUID(),
        }),
      ),
    );
    expect(
      competing.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      Number(
        (
          await db.advance.aggregate({
            where: { listingId: property.id },
            _sum: { amount: true },
          })
        )._sum.amount,
      ),
    ).toBe(10000);
    expect((await listingDetail(admin, property.id)).status).toBe(
      "ADVANCE_PAID",
    );
    await listingAction(admin, property.id, {
      action: "resume",
      reason: "Admin releases reservation",
    });
    expect((await listingDetail(admin, property.id)).status).toBe("AVAILABLE");
    expect(await db.advance.count({ where: { listingId: property.id } })).toBe(
      2,
    );
    await listingAction(employee, property.id, {
      action: "book",
      customerId: first.id,
    });
    await listingAction(admin, property.id, {
      action: "complete",
      customerId: first.id,
      amount: 10000,
    });
    expect(
      (
        await inventory(
          admin,
          new URLSearchParams({ status: "SOLD", kind: "property" }),
        )
      ).rows.map((row) => row.id),
    ).not.toContain(property.id);
    await expect(saveListing(admin, payload, property.id)).rejects.toThrow(
      "frozen",
    );
    await listingAction(admin, property.id, {
      action: "resume",
      reason: "Admin resumes completed inventory",
    });
    expect((await listingDetail(admin, property.id)).status).toBe("AVAILABLE");
    expect(
      await db.completion.count({
        where: { listingId: property.id, reversedAt: { not: null } },
      }),
    ).toBe(1);
    expect((await listingDetail(admin, property.id)).views).toBe(2);
    await db.lead.update({
      where: {
        customerId_listingId: { customerId: first.id, listingId: property.id },
      },
      data: { stage: "LOST", lostReason: "Customer dropped the property" },
    });
    expect((await listingDetail(admin, property.id)).lostCustomers).toBe(1);
    expect((await listingDetail(employee, property.id)).lostCustomers).toBe(1);
    const listed = await inventory(
      admin,
      new URLSearchParams({ q: property.id }),
    );
    expect(listed.rows[0].lostCustomers).toBe(1);
    await markCustomerInterested(employee, first.id, property.id);
    expect((await listingDetail(admin, property.id)).lostCustomers).toBe(0);
  });
});
