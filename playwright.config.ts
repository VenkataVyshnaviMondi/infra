import { defineConfig } from "@playwright/test";
process.loadEnvFile(".env");
const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set("schema", "kubera_e2e");
process.env.DATABASE_URL = url.toString();
process.env.APP_URL = "http://localhost:3100";
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/setup.ts",
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://localhost:3100",
    extraHTTPHeaders: { Origin: "http://localhost:3100" },
    trace: "retain-on-failure",
  },
  reporter: "list",
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://localhost:3100/login",
    timeout: 120000,
    reuseExistingServer: false,
  },
});
