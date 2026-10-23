import { z } from "zod";
export const transactionSchema = z.object({
  action: z.enum([
    "book",
    "advance",
    "complete",
    "cancel",
    "archive",
    "restore",
    "reverse",
    "resume",
  ]),
  customerId: z.string().max(100).optional(),
  amount: z.number().finite().positive().max(999999999999).optional(),
  paymentDate: z.iso.datetime({ offset: true }).optional(),
  method: z
    .enum(["Cash", "UPI", "Bank transfer", "Cheque", "Other"])
    .optional(),
  reference: z.string().max(500).optional(),
  notes: z.string().max(10000).optional(),
  reason: z.string().trim().max(2000).optional(),
  requestKey: z.uuid().optional(),
});
export const text = z
  .string()
  .trim()
  .min(1, "This field is required.")
  .max(500);
const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => v || undefined);
const num = (max = 999999999999) =>
  z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce.number().finite().min(0).max(max).optional(),
  );
const int = (max = 10000) =>
  z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce.number().int().min(0).max(max).optional(),
  );
export function normalizePhone(input: string) {
  const n = input.replace(/[\s()+-]/g, "");
  return /^\d{10}$/.test(n) ? "+91" + n : /^91\d{10}$/.test(n) ? "+" + n : n;
}
export const phone = z
  .string()
  .transform(normalizePhone)
  .refine(
    (v) => /^\+[1-9]\d{7,14}$/.test(v),
    "Enter a valid phone number, including country code outside India.",
  );
export const password = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(72, "Use at most 72 characters.")
  .refine(
    (v) => new TextEncoder().encode(v).length <= 72,
    "Use at most 72 UTF-8 bytes for the password.",
  );
export const employeeSchema = z.object({
  name: text,
  phone,
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9._-]{3,40}$/,
      "Use 3–40 letters, numbers, dots or underscores.",
    ),
  password: password.optional(),
  active: z.boolean().optional(),
});
export const propertySchema = z.object({
  type: text,
  bhk: int(30),
  bathrooms: int(30),
  superArea: num(),
  carpetArea: num(),
  furnishing: optionalText,
  facing: text,
  parking: int(100),
  maintenance: num(),
  totalFloors: int(200),
  floorNo: int(200),
  projectName: optionalText,
  availabilityDate: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.iso.date().optional(),
  ),
  deposit: num(),
  tenantType: optionalText,
  constructionStatus: optionalText,
  propertyAge: int(300),
  plotArea: num(),
  length: num(),
  breadth: num(),
  roadWidth: num(),
  billingPeriod: optionalText,
  leaseDuration: optionalText,
});
export const listingSchema = z
  .object({
    title: text,
    categoryId: z.enum(["plots", "flats", "houses", "furniture"]),
    optionId: text,
    price: z.coerce.number().positive().max(999999999999),
    negotiable: z.boolean().default(false),
    state: text,
    city: text,
    locality: text,
    address: text,
    pinCode: z
      .string()
      .regex(/^\d{6}$/)
      .optional()
      .or(z.literal("")),
    description: z
      .string()
      .trim()
      .min(10, "Write at least 10 characters.")
      .max(10000),
    listedBy: z.enum(["Owner", "Dealer", "Builder"]).optional(),
    photoIds: z.array(z.string()).min(1, "Add at least one photo.").max(30),
    property: propertySchema.optional(),
    furniture: z
      .object({
        brand: optionalText,
        material: text,
        condition: z.enum(["New", "Like new", "Good", "Fair"]),
        age: int(200),
        dimensions: optionalText,
        color: optionalText,
        quantity: z.coerce.number().int().min(1).max(100000),
      })
      .optional(),
  })
  .superRefine((v, ctx) => {
    const fail = (path: string, msg: string) =>
      ctx.addIssue({ code: "custom", path: path.split("."), message: msg });
    if (v.categoryId === "furniture") {
      if (!v.furniture) fail("furniture", "Furniture details are required.");
      return;
    }
    if (!v.property) {
      fail("property", "Property details are required.");
      return;
    }
    const p = v.property;
    if (v.categoryId === "plots") {
      if (!p.plotArea || p.plotArea <= 0)
        fail("property.plotArea", "Enter a positive plot area.");
    } else {
      for (const k of [
        "bhk",
        "bathrooms",
        "superArea",
        "carpetArea",
        "totalFloors",
      ] as const)
        if (p[k] === undefined || p[k]! <= 0)
          fail("property." + k, "Enter a positive value.");
      if (!p.furnishing) fail("property.furnishing", "Choose furnishing.");
      if (
        p.carpetArea !== undefined &&
        p.superArea !== undefined &&
        p.carpetArea > p.superArea
      )
        fail(
          "property.carpetArea",
          "Carpet area cannot exceed super built-up area.",
        );
      if (
        p.floorNo !== undefined &&
        p.totalFloors !== undefined &&
        p.floorNo > p.totalFloors
      )
        fail("property.floorNo", "Floor number cannot exceed total floors.");
    }
  });
export const requirementSchema = z
  .object({
    categoryId: text,
    optionId: optionalText,
    budgetMin: num(),
    budgetMax: num(),
    locations: z.string().trim().max(2000).default(""),
  })
  .refine(
    (v) =>
      v.budgetMin === undefined ||
      v.budgetMax === undefined ||
      v.budgetMin <= v.budgetMax,
    {
      message: "Maximum budget must be at least minimum budget.",
      path: ["budgetMax"],
    },
  );
export const customerSchema = z.object({
  name: text,
  phone,
  alternatePhone: z.union([phone, z.literal("")]).optional(),
  email: z.union([z.email(), z.literal("")]).optional(),
  source: z.enum([
    "Walk-in",
    "Phone",
    "Referral",
    "WhatsApp",
    "Email",
    "Website",
    "Other",
  ]),
  age: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce.number().int().min(1).max(120).optional(),
  ),
  contactDetails: optionalText,
  contactType: z.enum(["VISIT", "ENQUIRY"]).optional(),
  contactDate: z.iso.datetime({ offset: true }).optional(),
  notes: z.string().max(10000).default(""),
  assignedToId: optionalText,
  listingId: optionalText,
  requirement: requirementSchema,
});
export const customerContactSchema = customerSchema
  .pick({ source: true, contactDetails: true, contactType: true, notes: true })
  .extend({
    listingId: text,
    contactDate: z.iso.datetime({ offset: true }),
    requestKey: z.uuid(),
  });
export const interactionSchema = z
  .object({
    requestKey: z.uuid(),
    customerId: text,
    listingId: text,
    type: z.enum(["ENQUIRY", "PROPERTY_VIEWING", "FOLLOW_UP", "OTHER"]),
    interest: z.enum(["UNDECIDED", "INTERESTED", "NOT_INTERESTED"]),
    occurredAt: z.iso.datetime({ offset: true }),
    offer: num(),
    rejectionReason: optionalText,
    notes: z.string().max(10000).default(""),
    nextFollowUp: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((v) => v.interest !== "NOT_INTERESTED" || !!v.rejectionReason, {
    message: "A reason is required when the customer is not interested.",
    path: ["rejectionReason"],
  });
