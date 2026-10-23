import { PrismaClient } from "@prisma/client";
const globalDb = globalThis as unknown as {
  prisma?: PrismaClient;
  databaseUrl?: string;
};
const connectionUrl = process.env.DATABASE_URL
  ? new URL(process.env.DATABASE_URL)
  : null;
// The development PostgreSQL process binds IPv4; avoid intermittent IPv6
// localhost connection attempts when parallel dashboard queries open the pool.
if (connectionUrl?.hostname === "localhost")
  connectionUrl.hostname = "127.0.0.1";
if (connectionUrl && !connectionUrl.searchParams.has("connection_limit"))
  connectionUrl.searchParams.set("connection_limit", "5");
if (connectionUrl && !connectionUrl.searchParams.has("pool_timeout"))
  connectionUrl.searchParams.set("pool_timeout", "20");
if (connectionUrl && !connectionUrl.searchParams.has("connect_timeout"))
  connectionUrl.searchParams.set("connect_timeout", "20");
const effectiveUrl = connectionUrl?.toString();
if (globalDb.prisma && globalDb.databaseUrl !== effectiveUrl) {
  void globalDb.prisma.$disconnect();
  globalDb.prisma = undefined;
}
export const db =
  globalDb.prisma ??
  new PrismaClient(
    connectionUrl ? { datasourceUrl: connectionUrl.toString() } : undefined,
  );
if (process.env.NODE_ENV !== "production") {
  globalDb.prisma = db;
  globalDb.databaseUrl = effectiveUrl;
}
