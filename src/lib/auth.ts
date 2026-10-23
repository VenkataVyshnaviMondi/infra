import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import type { User } from "@prisma/client";
import { allowedOrigin } from "./origin";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public details?: {
      existingCustomer: { id: string; name: string; phone: string };
    },
  ) {
    super(message);
  }
}
export type Actor = Pick<
  User,
  | "id"
  | "name"
  | "username"
  | "role"
  | "active"
  | "mustChangePassword"
  | "phone"
>;
export const safeUser = (u: User): Actor => ({
  id: u.id,
  name: u.name,
  username: u.username,
  role: u.role,
  active: u.active,
  mustChangePassword: u.mustChangePassword,
  phone: u.phone,
});
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export async function currentUser(): Promise<Actor | null> {
  const token = (await cookies()).get("kubera_session")?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: digest(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active)
    return null;
  return safeUser(session.user);
}
export async function requireUser(allowTemporary = false) {
  const user = await currentUser();
  if (!user) throw new AppError("Please sign in to continue.", 401);
  if (user.mustChangePassword && !allowTemporary)
    throw new AppError("Change your temporary password first.", 403);
  return user;
}
export function admin(user: Actor) {
  if (user.role !== "ADMIN")
    throw new AppError("Administrator access required.", 403);
}
export function assigned(user: Actor, assignedToId: string) {
  if (user.role !== "ADMIN" && user.id !== assignedToId)
    throw new AppError("This customer is not assigned to you.", 403);
}
export async function newSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.session.create({
    data: {
      id: digest(token),
      userId,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    },
  });
  (await cookies()).set("kubera_session", token, {
    httpOnly: true,
    secure: process.env.APP_URL?.startsWith("https://") ?? false,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
}
export async function clearSession() {
  const jar = await cookies();
  const token = jar.get("kubera_session")?.value;
  if (token) await db.session.deleteMany({ where: { id: digest(token) } });
  jar.delete("kubera_session");
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.APP_URL || request.url).origin;
  // Trust only configured aliases and Vercel's own deployment metadata.
  // Never derive this allowlist from request Host or forwarded headers.
  const aliases = [
    ...(process.env.APP_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean),
    ...[process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
      .filter((value): value is string => Boolean(value))
      .map((value) => `https://${value}`),
  ];
  if (!allowedOrigin(origin, expected, process.env.NODE_ENV === "development", aliases))
    throw new AppError("Request origin is not allowed.", 403);
}
