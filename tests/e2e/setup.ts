import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { CATEGORIES } from "../../src/lib/constants";
export default async function setup() {
  if (
    new URL(process.env.DATABASE_URL!).searchParams.get("schema") !==
    "kubera_e2e"
  )
    throw new Error("E2E requires an isolated schema.");
  const result = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { stdio: "inherit", env: process.env },
  );
  if (result.status) throw new Error("Test migration failed");
  const db = new PrismaClient();
  await db.$executeRawUnsafe(
    'TRUNCATE "User", "Category", "LoginAttempt" CASCADE',
  );
  await db.user.create({
    data: {
      id: "e2e-admin",
      name: "Test Administrator",
      username: "e2e.admin",
      phone: "+919000000001",
      role: "ADMIN",
      passwordHash: await hash("Test-Admin-Only-123!", 4),
      mustChangePassword: false,
    },
  });
  for (const c of CATEGORIES) {
    await db.category.create({
      data: {
        id: c.id,
        name: c.name,
        options: {
          create: c.options.map((name) => ({
            id: c.id + "-" + name.toLowerCase().replaceAll(" ", "-"),
            name,
            transactionType: c.id === "furniture" ? "Sale" : name,
            furnitureSubtype: c.id === "furniture" ? name : undefined,
          })),
        },
      },
    });
  }
  await db.$disconnect();
}
