import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { password } from "../src/lib/validation";
import { CATEGORIES } from "../src/lib/constants";
const db = new PrismaClient();
try {
  const value = password.parse(process.env.ADMIN_PASSWORD);
  if (
    !process.env.ADMIN_USERNAME ||
    !/^[a-z0-9._-]{3,40}$/.test(process.env.ADMIN_USERNAME)
  )
    throw new Error("Set a valid ADMIN_USERNAME.");
  if (await db.user.findFirst({ where: { role: "ADMIN" } }))
    throw new Error("An admin already exists. No changes made.");
  await db.$transaction(async (tx) => {
    for (const c of CATEGORIES) {
      await tx.category.upsert({
        where: { id: c.id },
        create: { id: c.id, name: c.name },
        update: {},
      });
      for (const name of c.options) {
        const id = c.id + "-" + name.toLowerCase().replaceAll(" ", "-");
        await tx.categoryOption.upsert({
          where: { id },
          create: {
            id,
            name,
            categoryId: c.id,
            transactionType: c.id === "furniture" ? "Sale" : name,
            furnitureSubtype: c.id === "furniture" ? name : undefined,
          },
          update: {},
        });
      }
    }
    await tx.user.create({
      data: {
        name: process.env.ADMIN_NAME || "Kubera Administrator",
        username: process.env.ADMIN_USERNAME!,
        phone: process.env.ADMIN_PHONE || "+919000000000",
        role: "ADMIN",
        passwordHash: await hash(value, 12),
        mustChangePassword: true,
      },
    });
  });
  console.log("Admin created. Change the temporary password on first login.");
} catch (e) {
  console.error(e instanceof Error ? e.message : "Admin setup failed.");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
