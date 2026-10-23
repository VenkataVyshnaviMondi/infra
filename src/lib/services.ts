import { Prisma, type Availability, type Stage } from "@prisma/client";
import { db } from "./db";
import { isFrozenStatus } from "./listing-state";
import { admin, assigned, AppError, type Actor } from "./auth";
import {
  customerSchema,
  customerContactSchema,
  interactionSchema,
  listingSchema,
  requirementSchema,
  transactionSchema,
} from "./validation";
type Tx = Prisma.TransactionClient;
const registerCustomerView = (tx: Tx, customerId: string, listingId: string) =>
  tx.customerPropertyView.upsert({
    where: { customerId_listingId: { customerId, listingId } },
    create: { customerId, listingId },
    update: {},
  });
async function allowExistingContact(
  tx: Tx,
  customerId: string,
  listing: { id: string; status: string },
) {
  if (
    isFrozenStatus(listing.status) &&
    !(await tx.customerPropertyView.findUnique({
      where: { customerId_listingId: { customerId, listingId: listing.id } },
    }))
  )
    throw new AppError(
      "This property is frozen. Only Admin can resume it before linking another customer.",
      409,
    );
}
export const audit = (
  tx: Tx,
  actor: Actor,
  action: string,
  entityId: string,
  detail?: string,
) =>
  tx.auditLog.create({ data: { actorId: actor.id, action, entityId, detail } });
export async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++)
    try {
      return await db.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15000,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2034" &&
        attempt < 2
      )
        continue;
      throw e;
    }
  throw new AppError("Please retry this operation.", 409);
}
export async function customerAccess(tx: Tx, actor: Actor, id: string) {
  const c = await tx.customer.findUnique({ where: { id } });
  if (!c) throw new AppError("Customer not found.", 404);
  assigned(actor, c.assignedToId);
  return c;
}
export async function setStage(
  tx: Tx,
  actor: Actor,
  leadId: string,
  stage: Stage,
  reason?: string,
) {
  const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (lead.stage === stage) return lead;
  await tx.leadStageHistory.create({
    data: {
      leadId,
      fromStage: lead.stage,
      toStage: stage,
      actorId: actor.id,
      reason,
    },
  });
  return tx.lead.update({
    where: { id: leadId },
    data: {
      stage,
      lostReason: stage === "LOST" ? reason : null,
      needsAttention: false,
    },
  });
}
async function leadFor(
  tx: Tx,
  actor: Actor,
  customerId: string,
  listingId: string,
) {
  const old = await tx.lead.findUnique({
    where: { customerId_listingId: { customerId, listingId } },
  });
  if (old) return old;
  return tx.lead.create({
    data: {
      customerId,
      listingId,
      generatedById: actor.id,
      history: { create: { toStage: "NEW", actorId: actor.id } },
    },
  });
}
async function status(
  tx: Tx,
  actor: Actor,
  listingId: string,
  fromStatus: Availability,
  toStatus: Availability,
  reason?: string,
) {
  await tx.listing.update({
    where: { id: listingId },
    data: { status: toStatus },
  });
  await tx.listingStatusHistory.create({
    data: { listingId, fromStatus, toStatus, actorId: actor.id, reason },
  });
  await audit(
    tx,
    actor,
    "LISTING_STATUS",
    listingId,
    `${fromStatus} → ${toStatus}: ${reason || ""}`,
  );
}
export async function saveListing(actor: Actor, input: unknown, id?: string) {
  const v = listingSchema.parse(input);
  const max = Number(process.env.MAX_PHOTOS || 12);
  if (v.photoIds.length > max) throw new AppError(`Maximum ${max} photos.`);
  return transaction(async (tx) => {
    if (id)
      await tx.$queryRaw`SELECT id FROM "Listing" WHERE id = ${id} FOR UPDATE`;
    const old = id ? await tx.listing.findUnique({ where: { id } }) : null;
    if (id && !old) throw new AppError("Listing not found.", 404);
    if (old && isFrozenStatus(old.status))
      throw new AppError(
        "This property is frozen. Ask Admin to resume it before editing.",
        409,
      );
    if (old && actor.role !== "ADMIN" && old.creatorId !== actor.id)
      throw new AppError("You can only edit your own listings.", 403);
    if (
      old &&
      (old.categoryId !== v.categoryId || old.optionId !== v.optionId) &&
      (await tx.booking.count({ where: { listingId: old.id } }))
    )
      throw new AppError(
        "Category and transaction type cannot change after booking history has been recorded. Create a separate listing instead.",
        409,
      );
    const option = await tx.categoryOption.findUnique({
      where: { id: v.optionId },
    });
    if (!option || option.categoryId !== v.categoryId)
      throw new AppError("Choose a valid subcategory.");
    if (v.categoryId !== "furniture" && v.property) {
      if (option.transactionType === "Rent" && v.property.deposit === undefined)
        throw new AppError("Security deposit is required.");
      if (
        option.transactionType === "Lease" &&
        (!v.property.billingPeriod ||
          !v.property.leaseDuration ||
          v.property.deposit === undefined)
      )
        throw new AppError(
          "Lease billing period, duration and deposit are required.",
        );
      if (
        option.transactionType === "Sale" &&
        v.categoryId !== "plots" &&
        !["New Launch", "Under Construction", "Ready to Move"].includes(
          v.property.constructionStatus || "",
        )
      )
        throw new AppError("Choose construction status.");
    }
    const photos = await tx.photo.findMany({
      where: { id: { in: v.photoIds } },
    });
    if (
      new Set(v.photoIds).size !== v.photoIds.length ||
      photos.length !== v.photoIds.length ||
      photos.some(
        (p) =>
          (p.listingId && p.listingId !== id) ||
          (!p.listingId && p.ownerId !== actor.id),
      )
    )
      throw new AppError("One or more photos cannot be used.", 403);
    const { photoIds, property, furniture, ...data } = v;
    const listing = id
      ? await tx.listing.update({ where: { id }, data })
      : await tx.listing.create({ data: { ...data, creatorId: actor.id } });
    await tx.propertyDetail.deleteMany({ where: { listingId: listing.id } });
    await tx.furnitureDetail.deleteMany({ where: { listingId: listing.id } });
    if (v.categoryId === "furniture" && furniture)
      await tx.furnitureDetail.create({
        data: { ...furniture, listingId: listing.id },
      });
    if (v.categoryId !== "furniture" && property)
      await tx.propertyDetail.create({
        data: {
          ...property,
          availabilityDate: property.availabilityDate
            ? new Date(property.availabilityDate)
            : undefined,
          listingId: listing.id,
        },
      });
    await tx.photo.updateMany({
      where: { listingId: listing.id, id: { notIn: photoIds } },
      data: { listingId: null },
    });
    for (let i = 0; i < photoIds.length; i++)
      await tx.photo.update({
        where: { id: photoIds[i] },
        data: { listingId: listing.id, position: i },
      });
    if (!old)
      await tx.listingStatusHistory.create({
        data: {
          listingId: listing.id,
          toStatus: "AVAILABLE",
          actorId: actor.id,
        },
      });
    await audit(tx, actor, old ? "LISTING_EDIT" : "LISTING_CREATE", listing.id);
    return listing;
  });
}
export async function saveCustomer(actor: Actor, input: unknown, id?: string) {
  const v = customerSchema.parse(input);
  if (v.contactDate && new Date(v.contactDate).getTime() > Date.now() + 60000)
    throw new AppError("Visit or enquiry date cannot be in the future.");
  if (v.source === "Other" && !v.contactDetails)
    throw new AppError("Describe the other contact mode.");
  return transaction(async (tx) => {
    const old = id ? await customerAccess(tx, actor, id) : null;
    const duplicate = await tx.customer.findUnique({
      where: { phone: v.phone },
    });
    if (duplicate && duplicate.id !== id) {
      if (actor.role === "ADMIN" || duplicate.assignedToId === actor.id)
        throw new AppError(
          `This phone belongs to an existing customer: ${duplicate.name}. You can record a new visit or enquiry using their existing record.`,
          409,
          {
            existingCustomer: {
              id: duplicate.id,
              name: duplicate.name,
              phone: duplicate.phone,
            },
          },
        );
      throw new AppError(
        "This phone number already exists. Ask an administrator to review the assignment.",
        409,
      );
    }
    const owner =
      actor.role === "ADMIN"
        ? v.assignedToId || old?.assignedToId || actor.id
        : actor.id;
    if (
      v.assignedToId &&
      v.assignedToId !== old?.assignedToId &&
      actor.role !== "ADMIN" &&
      v.assignedToId !== actor.id
    )
      throw new AppError("Only Admin can reassign customers.", 403);
    const user = await tx.user.findUnique({ where: { id: owner } });
    if (!user?.active) throw new AppError("Choose an active assignee.");
    const { requirement, assignedToId, listingId, ...data } = v;
    void assignedToId;
    await validateRequirement(tx, requirement);
    if (listingId) {
      const listing = await tx.listing.findUnique({ where: { id: listingId } });
      if (
        listing &&
        isFrozenStatus(listing.status) &&
        old?.preferredListingId !== listingId
      )
        throw new AppError(
          "This property is frozen. Only Admin can resume it before linking another customer.",
          409,
        );
      if (
        !listing ||
        (listing.status === "ARCHIVED" && old?.preferredListingId !== listingId)
      )
        throw new AppError(
          "Choose an existing, non-archived uploaded listing.",
        );
      if (
        listing.categoryId !== requirement.categoryId ||
        (requirement.optionId && listing.optionId !== requirement.optionId)
      )
        throw new AppError(
          "The selected property must match the property type.",
        );
    }
    const customer = old
      ? await tx.customer.update({
          where: { id },
          data: {
            ...data,
            preferredListingId: listingId,
            age:
              input && typeof input === "object" && "age" in input
                ? (data.age ?? null)
                : undefined,
            contactDetails:
              data.source === "Other" ? data.contactDetails : null,
            contactDate: data.contactDate
              ? new Date(data.contactDate)
              : undefined,
            assignedToId: owner,
          },
        })
      : await tx.customer.create({
          data: {
            ...data,
            preferredListingId: listingId,
            contactDetails:
              data.source === "Other" ? data.contactDetails : null,
            contactDate: data.contactDate
              ? new Date(data.contactDate)
              : new Date(),
            assignedToId: owner,
            requirements: { create: requirement },
          },
        });
    if (listingId) await registerCustomerView(tx, customer.id, listingId);
    if (old) {
      const latest = await tx.requirement.findFirst({
        where: { customerId: customer.id },
        orderBy: { createdAt: "desc" },
      });
      if (latest)
        await tx.requirement.update({
          where: { id: latest.id },
          data: requirement,
        });
      else
        await tx.requirement.create({
          data: { ...requirement, customerId: customer.id },
        });
      if (listingId && old.preferredListingId !== listingId)
        await audit(
          tx,
          actor,
          "CUSTOMER_PROPERTY_CHANGE",
          customer.id,
          `${old.preferredListingId || "None"} → ${listingId}`,
        );
    }
    if (!old && listingId) {
      await tx.interaction.create({
        data: {
          requestKey: "customer-create:" + customer.id,
          customerId: customer.id,
          listingId,
          employeeId: actor.id,
          type: "ENQUIRY",
          interest: "UNDECIDED",
          occurredAt: v.contactDate ? new Date(v.contactDate) : new Date(),
          notes:
            v.contactType === "VISIT"
              ? "Customer visit recorded when adding the customer. Contact mode: " +
                v.source
              : "Initial enquiry recorded when adding the customer. Contact mode: " +
                v.source,
        },
      });
      await audit(tx, actor, "CUSTOMER_LISTING_LINK", customer.id, listingId);
    }
    if (old && (v.contactDate || v.contactType)) {
      await tx.interaction.updateMany({
        where: {
          customerId: customer.id,
          requestKey: "customer-create:" + customer.id,
        },
        data: {
          occurredAt: v.contactDate ? new Date(v.contactDate) : undefined,
          notes:
            (v.contactType || old.contactType) === "VISIT"
              ? "Customer visit. Contact mode: " + v.source
              : "Initial enquiry. Contact mode: " + v.source,
        },
      });
    }
    if (!old || old.assignedToId !== owner) {
      await tx.customerAssignment.create({
        data: {
          customerId: customer.id,
          fromUserId: old?.assignedToId,
          toUserId: owner,
          actorId: actor.id,
        },
      });
      await tx.followUp.updateMany({
        where: { customerId: customer.id, doneAt: null },
        data: { employeeId: owner },
      });
    }
    await audit(
      tx,
      actor,
      old ? "CUSTOMER_EDIT" : "CUSTOMER_CREATE",
      customer.id,
    );
    return customer;
  });
}
export async function recordCustomerContact(
  actor: Actor,
  customerId: string,
  input: unknown,
) {
  const v = customerContactSchema.parse(input);
  if (new Date(v.contactDate).getTime() > Date.now() + 60000)
    throw new AppError("Visit or enquiry date cannot be in the future.");
  if (v.source === "Other" && !v.contactDetails)
    throw new AppError("Describe the other contact mode.");
  return transaction(async (tx) => {
    await customerAccess(tx, actor, customerId);
    const requestKey = actor.id + ":contact:" + v.requestKey;
    const prior = await tx.interaction.findUnique({ where: { requestKey } });
    if (prior) {
      if (prior.customerId !== customerId || prior.listingId !== v.listingId)
        throw new AppError(
          "This submission has already been used for a different contact.",
          409,
        );
      return prior;
    }
    const listing = await tx.listing.findUnique({ where: { id: v.listingId } });
    if (!listing || listing.status === "ARCHIVED")
      throw new AppError("Choose an existing, non-archived uploaded listing.");
    await allowExistingContact(tx, customerId, listing);
    await registerCustomerView(tx, customerId, listing.id);
    const existingRequirement = await tx.requirement.findFirst({
      where: {
        customerId,
        categoryId: listing.categoryId,
        optionId: listing.optionId,
      },
    });
    if (!existingRequirement)
      await tx.requirement.create({
        data: {
          customerId,
          categoryId: listing.categoryId,
          optionId: listing.optionId,
          locations: listing.locality + ", " + listing.city,
        },
      });
    const contact = await tx.interaction.create({
      data: {
        requestKey,
        customerId,
        listingId: listing.id,
        employeeId: actor.id,
        type: "ENQUIRY",
        interest: "UNDECIDED",
        occurredAt: new Date(v.contactDate),
        notes: `${v.contactType === "VISIT" ? "Customer visit" : "Customer enquiry"}. Contact mode: ${v.source}${v.contactDetails ? " (" + v.contactDetails + ")" : ""}.${v.notes ? " " + v.notes : ""}`,
      },
    });
    await audit(tx, actor, "CUSTOMER_CONTACT_ADD", customerId, listing.id);
    return contact;
  });
}
export async function markCustomerInterested(
  actor: Actor,
  customerId: string,
  listingId: string,
) {
  if (!listingId)
    throw new AppError("Choose the customer's current property first.");
  return transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${customerId} FOR UPDATE`;
    const customer = await customerAccess(tx, actor, customerId);
    if (customer.preferredListingId !== listingId)
      throw new AppError(
        "The current property changed. Refresh and select the correct property.",
        409,
      );
    const listing = await tx.listing.findUnique({ where: { id: listingId } });
    if (!listing || listing.status === "ARCHIVED")
      throw new AppError("Choose a non-archived property.");
    const previous = await tx.lead.findUnique({
      where: { customerId_listingId: { customerId, listingId } },
    });
    if (previous && previous.stage !== "LOST") return previous;
    if (isFrozenStatus(listing.status))
      throw new AppError(
        "This property is frozen. Ask Admin to resume it first.",
        409,
      );
    const lead = await leadFor(tx, actor, customerId, listingId);
    if (lead.stage === "LOST")
      await setStage(tx, actor, lead.id, "NEW", "Customer interested again");
    await tx.interaction.create({
      data: {
        requestKey:
          "lead-interest:" + lead.id + ":" + lead.updatedAt.toISOString(),
        customerId,
        listingId,
        employeeId: actor.id,
        type: "ENQUIRY",
        interest: "INTERESTED",
        occurredAt: new Date(),
        notes: "Customer marked interested in their current property.",
      },
    });
    await audit(tx, actor, "CUSTOMER_INTERESTED", customerId, listingId);
    return tx.lead.findUniqueOrThrow({ where: { id: lead.id } });
  });
}
export async function validateRequirement(
  tx: Tx,
  r: ReturnType<typeof requirementSchema.parse>,
) {
  if (!(await tx.category.findUnique({ where: { id: r.categoryId } })))
    throw new AppError("Choose a valid preferred category.");
  if (
    r.optionId &&
    !(await tx.categoryOption.findFirst({
      where: { id: r.optionId, categoryId: r.categoryId },
    }))
  )
    throw new AppError("Choose a valid preferred subcategory.");
}
export async function recordInteraction(actor: Actor, input: unknown) {
  const v = interactionSchema.parse(input);
  const requestKey = actor.id + ":" + v.requestKey;
  return transaction(async (tx) => {
    await customerAccess(tx, actor, v.customerId);
    const previous = await tx.interaction.findUnique({ where: { requestKey } });
    if (previous) {
      if (
        previous.customerId !== v.customerId ||
        previous.listingId !== v.listingId
      )
        throw new AppError(
          "This submission key has already been used for another record.",
          409,
        );
      return previous;
    }
    const listing = await tx.listing.findUnique({ where: { id: v.listingId } });
    if (!listing) throw new AppError("Listing not found.", 404);
    await allowExistingContact(tx, v.customerId, listing);
    if (isFrozenStatus(listing.status) && v.interest === "INTERESTED") {
      const existingLead = await tx.lead.findUnique({
        where: {
          customerId_listingId: {
            customerId: v.customerId,
            listingId: listing.id,
          },
        },
      });
      if (!existingLead || existingLead.stage === "LOST")
        throw new AppError(
          "This property is frozen. Ask Admin to resume it before creating an interested lead.",
          409,
        );
    }
    await registerCustomerView(tx, v.customerId, listing.id);
    if (new Date(v.occurredAt).getTime() > Date.now() + 60000)
      throw new AppError("Interaction time cannot be in the future.");
    const { nextFollowUp, ...data } = v;
    const interaction = await tx.interaction.create({
      data: {
        ...data,
        requestKey,
        employeeId: actor.id,
        occurredAt: new Date(v.occurredAt),
      },
    });
    if (v.interest === "INTERESTED") {
      const lead = await leadFor(tx, actor, v.customerId, v.listingId);
      if (lead.stage === "LOST")
        await setStage(tx, actor, lead.id, "NEW", "Customer interested again");
    }
    if (nextFollowUp)
      await tx.followUp.create({
        data: {
          customerId: v.customerId,
          listingId: v.listingId,
          employeeId: actor.id,
          dueAt: new Date(nextFollowUp),
          notes: v.notes || "Follow up on " + listing.title,
        },
      });
    await audit(tx, actor, "INTERACTION_CREATE", interaction.id);
    return interaction;
  });
}
export async function listingAction(
  actor: Actor,
  id: string,
  v: {
    action: string;
    customerId?: string;
    amount?: number;
    paymentDate?: string;
    method?: string;
    reference?: string;
    notes?: string;
    reason?: string;
    requestKey?: string;
  },
) {
  v = transactionSchema.parse(v);
  return transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Listing" WHERE id = ${id} FOR UPDATE`;
    const listing = await tx.listing.findUnique({
      where: { id },
      include: { option: true },
    });
    if (!listing) throw new AppError("Listing not found.", 404);
    let action = v.action;
    if (action === "resume") {
      admin(actor);
      if (!isFrozenStatus(listing.status))
        throw new AppError("This property is not frozen.", 409);
      action = ["BOOKED", "ADVANCE_PAID"].includes(listing.status)
        ? "cancel"
        : "reverse";
    }
    const active = await tx.booking.findFirst({
      where: { listingId: id, active: true },
    });
    if (
      ["archive", "restore", "complete", "reverse", "cancel"].includes(action)
    )
      admin(actor);
    if (action === "archive" || action === "restore") {
      const target = action === "archive" ? "ARCHIVED" : "AVAILABLE";
      if (
        (action === "archive" && listing.status !== "AVAILABLE") ||
        (action === "restore" && listing.status !== "ARCHIVED")
      )
        throw new AppError("This status change is not allowed.", 409);
      if (!v.reason?.trim()) throw new AppError("A reason is required.");
      await status(tx, actor, id, listing.status, target, v.reason);
      return { ok: true };
    }
    if (action === "reverse") {
      if (!v.reason?.trim())
        throw new AppError("A reversal reason is required.");
      const completion = await tx.completion.findFirst({
        where: { listingId: id, reversedAt: null },
      });
      if (!completion)
        throw new AppError("No completed transaction to reverse.", 409);
      await tx.completion.update({
        where: { id: completion.id },
        data: { reversedAt: new Date(), reversalReason: v.reason },
      });
      await setStage(tx, actor, completion.leadId, "NEGOTIATION", v.reason);
      await status(tx, actor, id, listing.status, "AVAILABLE", v.reason);
      return { ok: true };
    }
    const customerId = v.customerId || active?.customerId;
    if (!customerId) throw new AppError("Choose a customer.");
    const customer = await customerAccess(tx, actor, customerId);
    if (action === "cancel") {
      if (
        !active ||
        active.customerId !== customerId ||
        !["BOOKED", "ADVANCE_PAID"].includes(listing.status)
      )
        throw new AppError("No matching active booking.", 409);
      if (!v.reason?.trim())
        throw new AppError("A cancellation reason is required.");
      await tx.booking.update({
        where: { id: active.id },
        data: {
          active: false,
          cancelledAt: new Date(),
          cancellationReason: v.reason,
        },
      });
      const lead = await leadFor(tx, actor, customerId, id);
      await setStage(tx, actor, lead.id, "NEGOTIATION", v.reason);
      await status(tx, actor, id, listing.status, "AVAILABLE", v.reason);
      return { ok: true };
    }
    if (action === "advance" && v.requestKey) {
      const prior = await tx.advance.findUnique({
        where: { requestKey: actor.id + ":" + v.requestKey },
      });
      if (prior) {
        if (prior.listingId !== id || prior.customerId !== customerId)
          throw new AppError(
            "This receipt key has already been used for another record.",
            409,
          );
        return prior;
      }
    }
    if (action === "book") {
      if (listing.status !== "AVAILABLE" || active)
        throw new AppError("This listing is no longer available.", 409);
      await registerCustomerView(tx, customerId, id);
      await tx.booking.create({
        data: {
          listingId: id,
          customerId,
          actorId: actor.id,
          notes: v.notes || "",
        },
      });
      const lead = await leadFor(tx, actor, customerId, id);
      await setStage(tx, actor, lead.id, "BOOKED");
      await status(tx, actor, id, listing.status, "BOOKED");
      return { ok: true };
    }
    if (
      !active ||
      active.customerId !== customerId ||
      !["BOOKED", "ADVANCE_PAID"].includes(listing.status)
    )
      throw new AppError(
        "Book this listing for the selected customer first.",
        409,
      );
    const lead = await leadFor(tx, actor, customerId, id);
    const advances = await tx.advance.aggregate({
      where: {
        listingId: id,
        customerId,
        createdAt: { gte: active.createdAt },
      },
      _sum: { amount: true },
    });
    const received = advances._sum.amount || new Prisma.Decimal(0);
    if (action === "advance") {
      if (
        !v.requestKey ||
        !Number.isFinite(v.amount) ||
        Number(v.amount) <= 0 ||
        Number(v.amount) > 999999999999 ||
        !v.paymentDate ||
        !Number.isFinite(new Date(v.paymentDate).getTime()) ||
        !["Cash", "UPI", "Bank transfer", "Cheque", "Other"].includes(
          v.method || "",
        )
      )
        throw new AppError(
          "Enter a positive amount, valid payment date and payment method.",
        );
      const amount = new Prisma.Decimal(v.amount!);
      if (amount.decimalPlaces() > 2)
        throw new AppError(
          "Enter an amount with no more than two decimal places.",
        );
      if (received.plus(amount).greaterThan(listing.price))
        throw new AppError(
          "Payment exceeds the remaining balance. Total payments cannot exceed the property price.",
        );
      await tx.advance.create({
        data: {
          requestKey: actor.id + ":" + v.requestKey,
          listingId: id,
          customerId,
          actorId: actor.id,
          amount: v.amount!,
          paymentDate: new Date(v.paymentDate),
          method: v.method!,
          reference: v.reference,
          notes: v.notes,
        },
      });
      await setStage(tx, actor, lead.id, "ADVANCE_PAID");
      await status(tx, actor, id, listing.status, "ADVANCE_PAID");
      return { ok: true };
    }
    if (action === "complete") {
      if (
        !Number.isFinite(v.amount) ||
        Number(v.amount) <= 0 ||
        Number(v.amount) > 999999999999
      )
        throw new AppError("Enter the final transaction amount.");
      const total = new Prisma.Decimal(v.amount!);
      if (total.decimalPlaces() > 2)
        throw new AppError(
          "Enter an amount with no more than two decimal places.",
        );
      if (total.greaterThan(listing.price))
        throw new AppError(
          "Final deal value cannot exceed the property price.",
        );
      if (total.lessThan(received))
        throw new AppError(
          "Final deal value cannot be less than advances already received. It must include those advances.",
        );
      const terminal = (
        { Sale: "SOLD", Rent: "RENTED", Lease: "LEASED" } as const
      )[listing.option.transactionType as "Sale" | "Rent" | "Lease"];
      await tx.completion.create({
        data: {
          listingId: id,
          customerId,
          employeeId: customer.assignedToId,
          leadId: lead.id,
          actorId: actor.id,
          amount: v.amount!,
          status: terminal,
        },
      });
      await tx.booking.update({
        where: { id: active.id },
        data: { active: false },
      });
      await setStage(tx, actor, lead.id, "CONVERTED");
      await tx.lead.updateMany({
        where: {
          listingId: id,
          id: { not: lead.id },
          stage: { notIn: ["CONVERTED", "LOST"] },
        },
        data: { needsAttention: true },
      });
      await status(tx, actor, id, listing.status, terminal);
      return { ok: true };
    }
    throw new AppError("Unknown action.");
  });
}
