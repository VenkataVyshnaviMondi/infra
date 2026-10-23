import { spawnSync } from "node:child_process";
process.loadEnvFile(".env");
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set("schema", "kubera_test");
process.env.DATABASE_URL = url.toString();
for (const args of [
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  ["node_modules/vitest/vitest.mjs", "run"],
]) {
  const r = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
