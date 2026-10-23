import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
fs.mkdirSync(".local", { recursive: true });
if (!fs.existsSync(".env")) {
  const secret = randomBytes(24).toString("hex");
  fs.writeFileSync(
    ".env",
    `DATABASE_URL="postgresql://kubera:${secret}@127.0.0.1:54329/kubera?schema=public&connection_limit=5&pool_timeout=20&connect_timeout=20"\nAPP_URL="http://localhost:3000"\nSTORAGE_DRIVER="local"\nSTORAGE_PATH="./storage"\nMAX_PHOTOS="12"\nMAX_IMAGE_MB="10"\n`,
  );
}
process.loadEnvFile(".env");
const { database } = await import("./database.mjs");
const pg = await database();
try {
  for (const args of [
    ["node_modules/prisma/build/index.js", "generate"],
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    ["--import", "tsx", "prisma/seed.ts"],
  ]) {
    const result = spawnSync(process.execPath, args, {
      stdio: "inherit",
      env: process.env,
    });
    if (result.status !== 0) throw new Error("Setup command failed.");
  }
} finally {
  await pg.stop();
}
console.log(
  "Setup complete. Credentials are in .local/development-credentials.txt. Start npm run db:local, then npm run dev.",
);
