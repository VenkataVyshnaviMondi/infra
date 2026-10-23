import { test, expect } from "@playwright/test";

test("admin uploads a property into its category and another session sees persisted data", async ({
  page,
  browser,
}) => {
  const credentials = {
    username: "e2e.admin",
    password: "Test-Admin-Only-123!",
  };
  expect(
    (await page.request.post("/api/auth/login", { data: credentials })).ok(),
  ).toBe(true);
  const viewer = await browser.newContext({
    baseURL: "http://localhost:3100",
    extraHTTPHeaders: { Origin: "http://localhost:3100" },
  });
  try {
    expect(
      (
        await viewer.request.post("/api/auth/login", { data: credentials })
      ).ok(),
    ).toBe(true);
    const catalog = await viewer.newPage();
    await catalog.goto("/categories?category=plots&option=plots-sale");
    await expect(catalog.getByText("Loading your records…")).toHaveCount(0);
    const before = await (
      await page.request.get("/api/listings?category=plots&option=plots-sale")
    ).json();
    const title = "Feature one verified plot " + Date.now();
    await page.goto("/uploads");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.locator(".error-box")).toContainText("Choose a category");
    await page.getByRole("button", { name: /^Plots Residential/ }).click();
    await page.getByRole("button", { name: "Sale", exact: true }).click();
    await page.screenshot({
      path: "test-results/property-category-desktop.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.locator(".error-box")).toContainText(
      "Add at least one photo",
    );
    await page.getByLabel("Upload listing photos").setInputFiles({
      name: "invalid.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("invalid"),
    });
    await expect(page.locator(".error-box")).toContainText("choose a JPEG");
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
    await page.getByLabel("Listing title").fill(title);
    await page.getByLabel("Sale price (₹)").fill("4500000");
    await page.getByLabel("Plot area (sqft)").fill("1800");
    await expect(
      page.getByRole("textbox", { name: /^Price per sqft/ }),
    ).toHaveValue("2500.00");
    await expect(
      page.getByRole("textbox", { name: /^Price per sqft/ }),
    ).toHaveAttribute("readonly", "");
    await page.getByLabel("Sale price (₹)").fill("5400000");
    await expect(
      page.getByRole("textbox", { name: /^Price per sqft/ }),
    ).toHaveValue("3000.00");
    await page.getByLabel("Sale price (₹)").fill("4500000");
    await page.screenshot({
      path: "test-results/property-price-per-sqft-form.png",
      fullPage: true,
    });
    await page.getByLabel("Locality").fill("Shadnagar");
    await page
      .getByLabel("Address", { exact: false })
      .fill("Survey 210, Main Road");
    await page
      .getByLabel("Description")
      .fill("Residential plot with a clear boundary and main road access.");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Review your listing" }),
    ).toBeVisible();
    const unsaved = await (
      await page.request.get("/api/listings?category=plots&option=plots-sale")
    ).json();
    expect(unsaved.total).toBe(before.total);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByLabel("Listing title")).toHaveValue(title);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByRole("button", { name: "Upload listing", exact: true })
      .click();
    await page.waitForURL(/\/categories\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get("category")).toBe("plots");
    expect(url.searchParams.get("option")).toBe("plots-sale");
    const id = url.searchParams.get("saved")!;
    await expect(page.locator(".upload-success")).toContainText(
      "Listing uploaded successfully",
    );
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(catalog.getByRole("heading", { name: title })).toBeVisible({
      timeout: 25000,
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    const persisted = await (
      await page.request.get("/api/listings/" + id)
    ).json();
    expect(Number(persisted.property.plotArea)).toBe(1800);
    expect(persisted.photos).toHaveLength(1);
    expect(persisted.status).toBe("AVAILABLE");
    await expect(
      page.locator(".listing-card").filter({ hasText: title }),
    ).toContainText("₹2,500 / sqft");
    const after = await (
      await page.request.get("/api/listings?category=plots&option=plots-sale")
    ).json();
    expect(after.total).toBe(before.total + 1);
    await page.screenshot({
      path: "test-results/property-categories-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(async () => {
        const bounds = await page.locator(".sidebar").boundingBox();
        return bounds ? bounds.x + bounds.width : 0;
      })
      .toBeLessThanOrEqual(1);
    await page.screenshot({
      path: "test-results/property-categories-mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("link", { name: "View listing", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: title, level: 1 }),
    ).toBeVisible();
    await page.getByRole("link", { name: /Edit listing/ }).click();
    await page.getByLabel("Listing title").fill(title + " updated");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: title + " updated", level: 1 }),
    ).toBeVisible();
    expect(
      (
        await (
          await page.request.get(
            "/api/listings?category=plots&option=plots-sale",
          )
        ).json()
      ).total,
    ).toBe(after.total);
  } finally {
    await viewer.close();
  }
});
