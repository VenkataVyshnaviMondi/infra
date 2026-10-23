import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { compare, hash } from "bcryptjs";
import sharp from "sharp";
import { z } from "zod";
import { Prisma, type Stage } from "@prisma/client";
import { db } from "@/lib/db";
import {
  AppError,
  admin,
  checkOrigin,
  clearSession,
  currentUser,
  digest,
  newSession,
  requireUser,
  safeUser,
} from "@/lib/auth";
import { employeeSchema, password, requirementSchema } from "@/lib/validation";
import {
  audit,
  customerAccess,
  listingAction,
  recordInteraction,
  recordCustomerContact,
  markCustomerInterested,
  saveCustomer,
  saveListing,
  setStage,
  transaction,
  validateRequirement,
} from "@/lib/services";
import {
  crm,
  customerDetail,
  inventory,
  listingDetail,
  metrics,
} from "@/lib/queries";
import { storage } from "@/lib/storage";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function route(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    const parts = (await ctx.params).path;
    const [resource, id, operation] = parts;
    const method = req.method;
    if (method !== "GET") checkOrigin(req);
    if (resource === "auth") {
      if (id === "login" && method === "POST") {
        const input = z
          .object({
            username: z.string().trim().toLowerCase().min(1).max(40),
            password: z.string().min(1).max(72),
          })
          .parse(await req.json());
        // Username buckets cannot be bypassed using an untrusted forwarded IP header.
        const key = digest(input.username);
        const now = new Date();
        await db.loginAttempt.upsert({
          where: { key },
          create: { key, count: 0, resetAt: new Date(Date.now() + 15 * 60000) },
          update: {},
        });
        const bucket = await db.loginAttempt.findUniqueOrThrow({
          where: { key },
        });
        if (bucket.resetAt < now)
          await db.loginAttempt.update({
            where: { key },
            data: { count: 0, resetAt: new Date(Date.now() + 15 * 60000) },
          });
        const attempt = await db.loginAttempt.update({
          where: { key },
          data: { count: { increment: 1 } },
        });
        if (attempt.count > 8)
          throw new AppError(
            "Too many login attempts. Try again in 15 minutes.",
            429,
          );
        const user = await db.user.findUnique({
          where: { username: input.username },
        });
        const valid = await compare(
          input.password,
          user?.passwordHash ||
            "$2b$12$uHDn9pDYg1ObWLkYtsvJAeS5LftVNZM9BLjGDN5BWbkBc2GT5Yw4e",
        );
        if (!user || !user.active || !valid)
          throw new AppError("Username or password is incorrect.", 401);
        await db.loginAttempt.deleteMany({ where: { key } });
        await newSession(user.id);
        return NextResponse.json(safeUser(user));
      }
      if (id === "logout" && method === "POST") {
        await clearSession();
        return NextResponse.json({ ok: true });
      }
      const actor = await requireUser(true);
      if (id === "password" && method === "POST") {
        const input = z
          .object({ currentPassword: z.string(), newPassword: password })
          .parse(await req.json());
        const user = await db.user.findUniqueOrThrow({
          where: { id: actor.id },
        });
        if (!(await compare(input.currentPassword, user.passwordHash)))
          throw new AppError("Current password is incorrect.");
        if (input.newPassword === input.currentPassword)
          throw new AppError("Choose a different password.");
        await db.$transaction([
          db.user.update({
            where: { id: actor.id },
            data: {
              passwordHash: await hash(input.newPassword, 12),
              mustChangePassword: false,
            },
          }),
          db.session.deleteMany({ where: { userId: actor.id } }),
          db.auditLog.create({
            data: {
              actorId: actor.id,
              action: "PASSWORD_CHANGE",
              entityId: actor.id,
            },
          }),
        ]);
        await newSession(actor.id);
        return NextResponse.json({ ok: true });
      }
      if (id === "me" && method === "GET")
        return NextResponse.json(await currentUser());
    }
    const actor = await requireUser();
    let result: unknown;
    if (resource === "categories" && method === "GET")
      result = await db.category.findMany({ include: { options: true } });
    else if (resource === "options" && method === "GET")
      result = {
        users: await db.user.findMany({
          where: actor.role === "ADMIN" ? { active: true } : { id: actor.id },
          select: { id: true, name: true, role: true },
        }),
        creators: await db.user.findMany({ select: { id: true, name: true } }),
        maxPhotos: Number(process.env.MAX_PHOTOS || 12),
        maxImageMB: Number(process.env.MAX_IMAGE_MB || 10),
      };
    else if (resource === "dashboard" && method === "GET")
      result = await metrics(actor, req.nextUrl.searchParams);
    else if (resource === "listings") {
      if (method === "GET")
        result = id
          ? await listingDetail(actor, id)
          : await inventory(actor, req.nextUrl.searchParams);
      else if (method === "POST" && id)
        result = await listingAction(actor, id, await req.json());
      else if (method === "POST" || method === "PATCH")
        result = await saveListing(
          actor,
          await req.json(),
          method === "PATCH" ? id : undefined,
        );
    } else if (resource === "customers") {
      if (method === "GET")
        result = id ? await customerDetail(actor, id) : await crm(actor);
      else if (operation === "interest" && method === "POST") {
        const input = z
          .object({ listingId: z.string().min(1).max(100) })
          .parse(await req.json());
        result = await markCustomerInterested(actor, id, input.listingId);
      } else if (operation === "contacts" && method === "POST")
        result = await recordCustomerContact(actor, id, await req.json());
      else if (operation === "requirements" && method === "POST") {
        const r = requirementSchema.parse(await req.json());
        result = await transaction(async (tx) => {
          await customerAccess(tx, actor, id);
          await validateRequirement(tx, r);
          await audit(tx, actor, "REQUIREMENT_ADD", id);
          return tx.requirement.create({ data: { ...r, customerId: id } });
        });
      } else if (method === "POST" || method === "PATCH")
        result = await saveCustomer(
          actor,
          await req.json(),
          method === "PATCH" ? id : undefined,
        );
    } else if (resource === "interactions" && method === "POST")
      result = await recordInteraction(actor, await req.json());
    else if (resource === "leads" && method === "PATCH") {
      const v = z
        .object({
          stage: z.enum([
            "NEW",
            "CONTACTED",
            "VISIT_SCHEDULED",
            "VISITED",
            "NEGOTIATION",
            "LOST",
          ]),
          reason: z.string().trim().max(2000).optional(),
        })
        .parse(await req.json());
      result = await transaction(async (tx) => {
        const lead = await tx.lead.findUniqueOrThrow({ where: { id } });
        await customerAccess(tx, actor, lead.customerId);
        if (["BOOKED", "ADVANCE_PAID", "CONVERTED"].includes(lead.stage))
          throw new AppError(
            "Manage this lead through its listing transaction.",
            409,
          );
        if (v.stage === "LOST" && !v.reason)
          throw new AppError("Lost leads require a reason.");
        await audit(tx, actor, "LEAD_STAGE", id, v.reason);
        return setStage(tx, actor, id, v.stage as Stage, v.reason);
      });
    } else if (resource === "followups" && method === "PATCH") {
      const input = z
        .object({
          done: z.boolean().optional(),
          dueAt: z.iso.datetime({ offset: true }).optional(),
          notes: z.string().max(2000).optional(),
        })
        .parse(await req.json());
      result = await transaction(async (tx) => {
        const f = await tx.followUp.findUniqueOrThrow({ where: { id } });
        await customerAccess(tx, actor, f.customerId);
        await audit(tx, actor, "FOLLOWUP_UPDATE", id, JSON.stringify(input));
        return tx.followUp.update({
          where: { id },
          data: {
            ...(input.done !== undefined
              ? { doneAt: input.done ? new Date() : null }
              : {}),
            ...(input.dueAt ? { dueAt: new Date(input.dueAt) } : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
          },
        });
      });
    } else if (resource === "employees") {
      admin(actor);
      if (method === "GET")
        result = await metrics(actor, req.nextUrl.searchParams, id);
      else if (operation === "reset" && method === "POST") {
        const v = z.object({ password }).parse(await req.json());
        const employee = await db.user.findUnique({ where: { id } });
        if (!employee || employee.role !== "EMPLOYEE")
          throw new AppError("Employee not found.", 404);
        await db.$transaction([
          db.user.update({
            where: { id },
            data: {
              passwordHash: await hash(v.password, 12),
              mustChangePassword: true,
            },
          }),
          db.session.deleteMany({ where: { userId: id } }),
          db.auditLog.create({
            data: {
              actorId: actor.id,
              action: "EMPLOYEE_PASSWORD_RESET",
              entityId: id,
            },
          }),
        ]);
        result = { ok: true };
      } else if (method === "POST" || method === "PATCH") {
        const v = employeeSchema.parse(await req.json());
        if (method === "POST" && !v.password)
          throw new AppError("A temporary password is required.");
        const { password: pass, ...data } = v;
        if (method === "PATCH") {
          const employee = await db.user.findUnique({ where: { id } });
          if (!employee || employee.role !== "EMPLOYEE")
            throw new AppError("Employee not found.", 404);
        }
        result = await transaction(async (tx) => {
          const u =
            method === "POST"
              ? await tx.user.create({
                  data: {
                    ...data,
                    passwordHash: await hash(pass!, 12),
                    role: "EMPLOYEE",
                    mustChangePassword: true,
                  },
                })
              : await tx.user.update({ where: { id }, data });
          if (data.active === false)
            await tx.session.deleteMany({ where: { userId: u.id } });
          await audit(
            tx,
            actor,
            method === "POST" ? "EMPLOYEE_CREATE" : "EMPLOYEE_EDIT",
            u.id,
          );
          return safeUser(u);
        });
      }
    } else if (resource === "photos") {
      if (method === "POST") {
        const form = await req.formData();
        const file = form.get("file");
        const max = Number(process.env.MAX_IMAGE_MB || 10) * 1024 * 1024;
        if (
          !(file instanceof File) ||
          file.size === 0 ||
          file.size > max ||
          !["image/jpeg", "image/png", "image/webp"].includes(file.type)
        )
          throw new AppError(
            `Upload a JPEG, PNG or WebP image up to ${max / 1024 / 1024} MB.`,
          );
        const input = Buffer.from(await file.arrayBuffer());
        let output: Buffer;
        try {
          output = await sharp(input, { limitInputPixels: 40000000 })
            .rotate()
            .resize({
              width: 2000,
              height: 2000,
              fit: "inside",
              withoutEnlargement: true,
            })
            .webp({ quality: 85 })
            .toBuffer();
        } catch {
          throw new AppError("This file is not a valid supported image.");
        }
        const key = randomUUID() + ".webp";
        await storage().write(key, output);
        result = await db.photo.create({ data: { key, ownerId: actor.id } });
      }
      if (method === "GET" && id) {
        const photo = await db.photo.findUnique({ where: { id } });
        if (!photo || (!photo.listingId && photo.ownerId !== actor.id))
          throw new AppError("Photo not found.", 404);
        return new NextResponse(
          new Uint8Array(await storage().read(photo.key)),
          {
            headers: {
              "Content-Type": "image/webp",
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
            },
          },
        );
      }
    }
    if (result === undefined) throw new AppError("Endpoint not found.", 404);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof AppError)
      return NextResponse.json(
        { error: e.message, ...e.details },
        { status: e.status },
      );
    if (e instanceof z.ZodError)
      return NextResponse.json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("\n"),
          fields: e.flatten(),
        },
        { status: 400 },
      );
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002")
        return NextResponse.json(
          {
            error:
              "This record already exists. Refresh to see the saved result.",
          },
          { status: 409 },
        );
      if (e.code === "P2025")
        return NextResponse.json(
          { error: "Record not found." },
          { status: 404 },
        );
    }
    console.error("API error", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "We could not complete this request. Please try again." },
      { status: 500 },
    );
  }
}
export { route as GET, route as POST, route as PATCH };
