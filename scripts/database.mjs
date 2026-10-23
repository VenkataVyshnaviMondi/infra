import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";
export async function database() {
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1")
    throw new Error("Embedded database is for localhost only.");
  const dir = path.resolve(".local/postgres");
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    port: Number(url.port),
    persistent: true,
    initdbFlags: ["--encoding=UTF8"],
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: (message) => {
      if (String(message).includes("FATAL")) console.error(String(message));
    },
  });
  if (!fs.existsSync(path.join(dir, "PG_VERSION"))) await pg.initialise();
  await pg.start();
  const client = pg.getPgClient();
  await client.connect();
  const name = url.pathname.slice(1);
  if (!/^[a-zA-Z0-9_]+$/.test(name))
    throw new Error(
      "Use a simple database name with letters, digits and underscores.",
    );
  const found = await client.query(
    "SELECT 1 FROM pg_database WHERE datname=$1",
    [name],
  );
  if (!found.rowCount)
    await client.query(
      `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
    );
  await client.end();
  return pg;
}
