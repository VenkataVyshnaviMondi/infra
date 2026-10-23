import { test, expect, type APIRequestContext } from "@playwright/test";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
const temporary = "Test-Employee-Only-123!";
const permanent = "Test-Employee-New-123!";
async function checked(
  request: APIRequestContext,
  url: string,
  data: unknown,
  method = "POST",
) {
  const r = await request.fetch("/api/" + url, { method, data });
  const body = await r.json();
  expect(r.ok(), JSON.stringify(body)).toBe(true);
  return body;
}
test("complete authenticated business workflow and access enforcement", async ({
  playwright,
}) => {
  const admin = await playwright.request.newContext({
    baseURL: "http://localhost:3100",
    extraHTTPHeaders: { Origin: "http://localhost:3100" },
  });
  const employee = await playwright.request.newContext({
    baseURL: "http://localhost:3100",
    extraHTTPHeaders: { Origin: "http://localhost:3100" },
  });
  const other = await playwright.request.newContext({
    baseURL: "http://localhost:3100",
    extraHTTPHeaders: { Origin: "http://localhost:3100" },
  });
  expect((await admin.get("/api/listings")).status()).toBe(401);
  await checked(admin, "auth/login", {
    username: "e2e.admin",
    password: "Test-Admin-Only-123!",
  });
  const user = await checked(admin, "employees", {
    name: "Workflow Employee",
    username: "e2e.employee",
    phone: "9000000002",
    password: temporary,
  });
  const user2 = await checked(admin, "employees", {
    name: "Other Employee",
    username: "e2e.other",
    phone: "9000000003",
    password: temporary,
  });
  await checked(employee, "auth/login", {
    username: "e2e.employee",
    password: temporary,
  });
  expect((await employee.get("/api/customers")).status()).toBe(403);
  await checked(employee, "auth/password", {
    currentPassword: temporary,
    newPassword: permanent,
  });
  await checked(other, "auth/login", {
    username: "e2e.other",
    password: temporary,
  });
  await checked(other, "auth/password", {
    currentPassword: temporary,
    newPassword: permanent,
  });
  expect((await employee.get("/api/employees")).status()).toBe(403);
  const bytes = await fs.readFile("public/kubera-logo.png");
  const photo = await employee.post("/api/photos", {
    multipart: {
      file: { name: "property.png", mimeType: "image/png", buffer: bytes },
    },
  });
  expect(photo.ok()).toBe(true);
  const p = await photo.json();
  const secondPhoto = await employee.post("/api/photos", {
    multipart: {
      file: { name: "property-two.png", mimeType: "image/png", buffer: bytes },
    },
  });
  const p2 = await secondPhoto.json();
  expect(secondPhoto.ok()).toBe(true);
  const listing = await checked(employee, "listings", {
    title: "Workflow 3 BHK flat",
    categoryId: "flats",
    optionId: "flats-sale",
    price: 8500000,
    state: "Telangana",
    city: "Hyderabad",
    locality: "Kondapur",
    address: "Test address",
    description: "Real persisted end-to-end test listing.",
    photoIds: [p.id, p2.id],
    property: {
      type: "Apartment",
      facing: "East",
      bhk: 3,
      bathrooms: 2,
      superArea: 1650,
      carpetArea: 1350,
      totalFloors: 10,
      floorNo: 5,
      furnishing: "Semi-furnished",
      constructionStatus: "Ready to Move",
    },
  });
  const reloaded = await (
    await employee.get("/api/listings/" + listing.id)
  ).json();
  expect(reloaded.photos).toHaveLength(2);
  expect(reloaded.title).toBe("Workflow 3 BHK flat");
  expect((await other.get("/api/photos/" + p.id)).ok()).toBe(true);
  const customer = await checked(employee, "customers", {
    name: "Workflow Customer",
    phone: "9000000100",
    source: "Walk-in",
    requirement: {
      categoryId: "flats",
      budgetMin: 7000000,
      budgetMax: 9000000,
      locations: "Kondapur",
    },
  });
  expect((await other.get("/api/customers/" + customer.id)).status()).toBe(403);
  const leak = await other.post("/api/customers", {
    data: {
      name: "Duplicate attempt",
      phone: "9000000100",
      source: "Walk-in",
      requirement: { categoryId: "flats" },
    },
  });
  expect(leak.status()).toBe(409);
  expect(JSON.stringify(await leak.json())).not.toContain(customer.id);
  await checked(employee, "customers/" + customer.id + "/requirements", {
    categoryId: "furniture",
    optionId: "furniture-sofa",
    locations: "Hyderabad",
  });
  const data = {
    requestKey: randomUUID(),
    customerId: customer.id,
    listingId: listing.id,
    type: "ENQUIRY",
    interest: "UNDECIDED",
    occurredAt: new Date().toISOString(),
    notes: "Enquiry",
  };
  await checked(employee, "interactions", data);
  expect(
    (await (await employee.get("/api/listings/" + listing.id)).json()).views,
  ).toBe(1);
  const view = {
    ...data,
    requestKey: randomUUID(),
    type: "PROPERTY_VIEWING",
    interest: "INTERESTED",
    nextFollowUp: new Date(Date.now() + 86400000).toISOString(),
  };
  await checked(employee, "interactions", view);
  await checked(employee, "interactions", view);
  const detail = await (
    await employee.get("/api/listings/" + listing.id)
  ).json();
  expect(detail.views).toBe(1);
  expect(detail.enquiries).toBe(1);
  expect(detail.uniqueViewers).toBe(1);
  const c = await (await employee.get("/api/customers/" + customer.id)).json();
  expect(c.leads).toHaveLength(1);
  expect(c.requirements).toHaveLength(2);
  expect(c.followUps).toHaveLength(1);
  await checked(employee, "interactions", {
    ...data,
    requestKey: randomUUID(),
    interest: "NOT_INTERESTED",
    rejectionReason: "Layout does not meet current requirements",
  });
  await checked(employee, "listings/" + listing.id, {
    action: "book",
    customerId: customer.id,
  });
  expect(
    (
      await other.post("/api/listings/" + listing.id, {
        data: { action: "book", customerId: customer.id },
      })
    ).ok(),
  ).toBe(false);
  const advance = {
    action: "advance",
    customerId: customer.id,
    amount: 50000,
    paymentDate: new Date().toISOString(),
    method: "UPI",
    requestKey: randomUUID(),
  };
  await checked(employee, "listings/" + listing.id, advance);
  await checked(employee, "listings/" + listing.id, advance);
  expect(
    (
      await employee.post("/api/listings/" + listing.id, {
        data: { action: "complete", amount: 8000000 },
      })
    ).status(),
  ).toBe(403);
  await checked(admin, "listings/" + listing.id, {
    action: "complete",
    customerId: customer.id,
    amount: 8000000,
  });
  const completed = await (
    await admin.get("/api/listings/" + listing.id)
  ).json();
  expect(completed.status).toBe("SOLD");
  expect(completed.advances).toHaveLength(1);
  expect(completed.completions).toHaveLength(1);
  expect(
    (await (await employee.get("/api/customers/" + customer.id)).json())
      .leads[0].stage,
  ).toBe("CONVERTED");
  const m = await (await employee.get("/api/dashboard")).json();
  expect(m.viewings).toBe(1);
  expect(m.enquiries).toBe(2);
  expect(m.handled).toBe(1);
  expect(m.completed).toBe(1);
  await checked(admin, "listings/" + listing.id, {
    action: "reverse",
    reason: "Test reversal",
  });
  expect(
    (await (await admin.get("/api/listings/" + listing.id)).json()).status,
  ).toBe("AVAILABLE");
  await checked(
    admin,
    "employees/" + user.id,
    {
      name: user.name,
      username: user.username,
      phone: user.phone,
      active: false,
    },
    "PATCH",
  );
  expect((await employee.get("/api/customers")).status()).toBe(401);
  await checked(admin, "employees/" + user2.id + "/reset", {
    password: "Another-Temporary-123!",
  });
  expect((await other.get("/api/customers")).status()).toBe(401);
  const wrongOrigin = await admin.post("/api/customers", {
    headers: { Origin: "https://invalid.example" },
    data: {},
  });
  expect(wrongOrigin.status()).toBe(403);
  await admin.dispose();
  await employee.dispose();
  await other.dispose();
});
test("branded desktop and mobile pages render without client errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: "Kubera Infra" })).toBeVisible();
  await page.screenshot({
    path: "test-results/login-desktop.png",
    fullPage: true,
    caret: "initial",
  });
  await checked(page.request, "auth/login", {
    username: "e2e.admin",
    password: "Test-Admin-Only-123!",
  });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Business overview" }),
  ).toBeVisible();
  await expect(page.getByText("Loading your records…")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
    caret: "initial",
  });
  for (const [route, title] of [
    ["/categories", "Categories & inventory"],
    ["/uploads", "Upload a new listing"],
    ["/crm", "Customer relationships"],
    ["/employees", "Employee management"],
  ]) {
    await page.goto(route);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Loading your records…")).toHaveCount(0);
    await page.screenshot({
      path: "test-results/" + route.slice(1) + "-desktop.png",
      fullPage: true,
      caret: "initial",
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Business overview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
    caret: "initial",
  });
  expect(errors).toEqual([]);
});

test("guided upload and walk-in customer forms save real records", async ({
  page,
}) => {
  await checked(page.request, "auth/login", {
    username: "e2e.admin",
    password: "Test-Admin-Only-123!",
  });
  await page.goto("/uploads");
  await page.getByRole("button", { name: /Furniture Home and office/ }).click();
  await page.getByRole("button", { name: "Sofa", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel("Upload listing photos")
    .setInputFiles(["public/kubera-logo.png", "public/kubera-logo.png"]);
  await expect(
    page.getByRole("button", { name: "Remove photo 2" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Set photo 2 as cover" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Super built-up area (sqft)")).toHaveCount(0);
  await page.getByLabel("Listing title").fill("UI workflow sofa");
  await page.getByLabel("Selling price (₹)").fill("18500");
  await page.getByLabel("Material", { exact: false }).fill("Wood and fabric");
  await page.getByLabel("Locality", { exact: false }).fill("Kondapur");
  await page.getByLabel("Address", { exact: false }).fill("UI test road");
  await page
    .getByLabel("Description", { exact: false })
    .fill("Well maintained sofa with a solid wood frame.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review your listing" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Upload listing", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "UI workflow sofa" }),
  ).toBeVisible();
  await page.waitForURL(/\/categories\?/);
  const id = new URL(page.url()).searchParams.get("saved")!;
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "UI workflow sofa" }),
  ).toBeVisible();
  const l = await (await page.request.get("/api/listings/" + id)).json();
  expect(l.photos).toHaveLength(2);
  expect(l.furniture.material).toBe("Wood and fabric");
  await page.goto("/crm");
  await page.getByRole("button", { name: "Add customer", exact: true }).click();
  await page
    .getByLabel("Customer name", { exact: false })
    .fill("UI walk-in customer");
  await page.getByLabel("Phone number", { exact: false }).fill("9000000101");
  await page
    .getByRole("combobox", { name: /^Uploaded listing/ })
    .selectOption(id);
  await page
    .getByLabel("Property type", { exact: false })
    .selectOption("furniture");

  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add customer", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("link", { name: "UI walk-in customer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "UI walk-in customer",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Record interaction", exact: true })
    .click();
  await page
    .getByLabel("Find listing by title, locality or ID")
    .fill("UI workflow sofa");
  await page.getByLabel("Listing", { exact: false }).last().selectOption(id);
  await page
    .getByLabel("Interaction type", { exact: false })
    .selectOption("PROPERTY_VIEWING");
  await page
    .getByLabel("Interest", { exact: false })
    .selectOption("INTERESTED");
  await page
    .getByRole("button", { name: "Save interaction", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Property Viewing", { exact: true }),
  ).toBeVisible();
  const updated = await (await page.request.get("/api/listings/" + id)).json();
  expect(updated.views).toBe(1);
});

test("every category and subcategory shows appropriate detail fields", async ({
  page,
}) => {
  test.setTimeout(120000);
  await checked(page.request, "auth/login", {
    username: "e2e.admin",
    password: "Test-Admin-Only-123!",
  });
  const cases = [
    ["Plots", "Lease"],
    ["Plots", "Sale"],
    ["Flats", "Rent"],
    ["Flats", "Sale"],
    ["Individual Houses", "Rent"],
    ["Individual Houses", "Sale"],
    ...["Sofa", "Dining", "Beds", "Wardrobes", "Home Decor"].map((s) => [
      "Furniture",
      s,
    ]),
  ];
  for (const [category, sub] of cases) {
    await page.goto("/uploads");
    await page
      .getByRole("button", { name: new RegExp("^" + category + " ") })
      .click();
    await page.getByRole("button", { name: sub, exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByLabel("Upload listing photos")
      .setInputFiles("public/kubera-logo.png");
    await expect(
      page.getByRole("button", { name: "Remove photo 1" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Listing details", exact: true }),
    ).toBeVisible();
    if (category === "Furniture") {
      await expect(page.getByLabel("Material", { exact: false })).toBeVisible();
      await expect(
        page.getByLabel("Plot area (sqft)", { exact: false }),
      ).toHaveCount(0);
      await expect(
        page.getByLabel("Bedrooms / BHK", { exact: false }),
      ).toHaveCount(0);
    } else if (category === "Plots") {
      await expect(
        page.getByLabel("Plot area (sqft)", { exact: false }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Bedrooms / BHK", { exact: false }),
      ).toHaveCount(0);
      if (sub === "Lease")
        await expect(
          page.getByLabel("Lease duration", { exact: false }),
        ).toBeVisible();
    } else {
      await expect(
        page.getByLabel("Bedrooms / BHK", { exact: false }),
      ).toBeVisible();
      if (sub === "Rent")
        await expect(
          page.getByLabel("Security deposit (₹)", { exact: false }),
        ).toBeVisible();
      else
        await expect(
          page.getByLabel("Construction status", { exact: false }),
        ).toBeVisible();
    }
  }
});

test("a saved upload increments the open dashboard by one and links to a new customer", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await checked(page.request, "auth/login", {
    username: "e2e.admin",
    password: "Test-Admin-Only-123!",
  });
  const before = await (await page.request.get("/api/dashboard")).json();
  await page.goto("/dashboard");
  const total = page
    .locator("section.stat")
    .filter({ hasText: "Total listings" })
    .locator("strong");
  await expect(total).toHaveText(String(before.totalListings));
  const editor = await context.newPage();
  const title = "Customer-linked uploaded plot";
  await editor.goto("/uploads");
  await editor.getByRole("button", { name: /^Plots Residential/ }).click();
  await editor.getByRole("button", { name: "Sale", exact: true }).click();
  await editor.getByRole("button", { name: "Continue", exact: true }).click();
  await editor
    .getByLabel("Upload listing photos")
    .setInputFiles("public/kubera-logo.png");
  await expect(
    editor.getByRole("button", { name: "Remove photo 1" }),
  ).toBeVisible();
  await expect(
    editor.getByRole("button", { name: "Continue", exact: true }),
  ).toBeEnabled();
  await editor.getByRole("button", { name: "Continue", exact: true }).click();
  await editor.getByLabel("Listing title").fill(title);
  await editor.getByLabel("Sale price (₹)").fill("6000000");
  await editor.getByLabel("Plot area (sqft)", { exact: false }).fill("2400");
  await editor.getByLabel("Locality", { exact: false }).fill("Shadnagar");
  await editor
    .getByLabel("Address", { exact: false })
    .fill("Survey 120, Main Road");
  await editor
    .getByLabel("Description", { exact: false })
    .fill("Residential plot with clear road access and a marked boundary.");
  await editor.getByRole("button", { name: "Continue", exact: true }).click();
  await editor
    .getByRole("button", { name: "Upload listing", exact: true })
    .click();
  await editor.waitForURL(/\/categories\?/);
  const listingId = new URL(editor.url()).searchParams.get("saved")!;
  await expect(
    editor.getByRole("heading", { name: title, level: 2 }),
  ).toBeVisible();
  await expect(total).toHaveText(String(before.totalListings + 1));
  await editor.reload();
  await expect(
    editor.getByRole("heading", { name: title, level: 2 }),
  ).toBeVisible();
  await expect(total).toHaveText(String(before.totalListings + 1));
  await editor.goto("/crm");
  await editor
    .getByRole("button", { name: "Add customer", exact: true })
    .click();
  await editor
    .getByLabel("Customer name", { exact: false })
    .fill("Customer for uploaded plot");
  await editor.getByLabel("Phone number", { exact: false }).fill("9000000123");
  await editor.getByLabel("Property type").selectOption("plots");
  await editor
    .getByRole("combobox", { name: /^Uploaded listing/ })
    .selectOption(listingId);
  await expect(
    editor.getByLabel("Property type", { exact: false }),
  ).toHaveValue("plots");
  await expect(editor.locator('input[name="optionId"]')).toHaveValue(
    "plots-sale",
  );
  await editor
    .getByRole("dialog")
    .getByRole("button", { name: "Add customer", exact: true })
    .click();
  await expect(editor.getByRole("dialog")).toHaveCount(0);
  const row = editor
    .getByRole("row")
    .filter({ hasText: "Customer for uploaded plot" });
  await expect(row.getByRole("link", { name: title })).toBeVisible();
  await row
    .getByRole("link", { name: "Customer for uploaded plot", exact: true })
    .click();
  await expect(
    editor.getByRole("heading", { name: "Linked listings", exact: true }),
  ).toBeVisible();
  await expect(editor.getByRole("link", { name: title }).first()).toBeVisible();
  await expect(editor.getByText("Enquiry", { exact: true })).toBeVisible();
  const listing = await (
    await editor.request.get("/api/listings/" + listingId)
  ).json();
  expect(listing.enquiries).toBe(1);
  expect(listing.views).toBe(1);
  expect(listing.interactions[0].customer.name).toBe(
    "Customer for uploaded plot",
  );
  await editor.reload();
  await expect(editor.getByRole("link", { name: title }).first()).toBeVisible();
  const after = await (await page.request.get("/api/dashboard")).json();
  expect(after.totalListings).toBe(before.totalListings + 1);
  expect(after.customers).toBe(before.customers + 1);
  await editor.close();
});
