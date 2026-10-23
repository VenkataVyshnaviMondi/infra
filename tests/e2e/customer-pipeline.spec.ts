import { test, expect, type APIRequestContext } from "@playwright/test";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
async function post(
  request: APIRequestContext,
  path: string,
  data: unknown,
  method = "POST",
) {
  const response = await request.fetch("/api/" + path, { method, data });
  const result = await response.json();
  expect(response.ok(), JSON.stringify(result)).toBe(true);
  return result;
}
test("property editing, interested leads and customer status filters use one customer record", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  await post(page.request, "auth/login", {
    username: "e2e.admin",
    password: "Test-Admin-Only-123!",
  });
  const employee = await post(page.request, "employees", {
    name: "Pipeline Employee",
    username: "pipeline.employee",
    phone: "9000000400",
    password: "Temporary-Pipeline-123!",
  });
  const employeeContext = await browser.newContext({
    baseURL: "http://localhost:3100",
    extraHTTPHeaders: { Origin: "http://localhost:3100" },
  });
  try {
    await post(employeeContext.request, "auth/login", {
      username: "pipeline.employee",
      password: "Temporary-Pipeline-123!",
    });
    await post(employeeContext.request, "auth/password", {
      currentPassword: "Temporary-Pipeline-123!",
      newPassword: "Permanent-Pipeline-123!",
    });
    const properties = [];
    for (const title of ["Original CRM property", "Changed CRM property"]) {
      const uploaded = await page.request.post("/api/photos", {
        multipart: {
          file: {
            name: "property.png",
            mimeType: "image/png",
            buffer: await fs.readFile("public/kubera-logo.png"),
          },
        },
      });
      expect(uploaded.ok()).toBe(true);
      const photo = await uploaded.json();
      properties.push(
        await post(page.request, "listings", {
          title,
          categoryId: "plots",
          optionId: "plots-sale",
          price: 5000000,
          state: "Telangana",
          city: "Hyderabad",
          locality: "Shadnagar",
          address: "Survey 42, Main Road",
          description: "Uploaded property for the customer CRM pipeline.",
          photoIds: [photo.id],
          property: { type: "Residential", facing: "East", plotArea: 1800 },
        }),
      );
    }
    const [original, changed] = properties;
    const employeePage = await employeeContext.newPage();
    for (const [screen, name, phone, owner] of [
      [page, "Admin pipeline customer", "9000000401", undefined],
      [employeePage, "Employee pipeline customer", "9000000402", employee.id],
    ] as const) {
      const customer = await post(page.request, "customers", {
        name,
        phone,
        source: "Phone",
        age: 30,
        assignedToId: owner,
        listingId: original.id,
        requirement: { categoryId: "plots", optionId: "plots-sale" },
      });
      await screen.goto("/crm");
      const row = screen.getByRole("row").filter({ hasText: name });
      await row
        .getByRole("button", { name: "Edit " + name, exact: true })
        .click();
      const edit = screen.getByRole("dialog");
      const dropdown = edit.getByRole("combobox", {
        name: /^Uploaded listing/,
      });
      await expect(dropdown).toHaveValue(original.id);
      await dropdown.selectOption(changed.id);
      await edit
        .getByRole("button", { name: "Save customer", exact: true })
        .click();
      await expect(edit).toHaveCount(0);
      await expect(row).toContainText(changed.title);
      const persisted = await (
        await screen.request.get("/api/customers/" + customer.id)
      ).json();
      expect(persisted.preferredListingId).toBe(changed.id);
      expect(persisted.interactions).toHaveLength(1);
      expect(persisted.interactions[0].listingId).toBe(original.id);
      await row.getByRole("cell", { name: "+91" + phone, exact: true }).click();
      await screen.waitForURL(/\/customers\//);
      await screen
        .getByRole("button", { name: "Mark as interested", exact: true })
        .click();
      await screen.waitForURL(/tab=Leads/);
      await expect(
        screen.locator(".lead-card").filter({ hasText: name }),
      ).toHaveCount(1);
      await post(screen.request, "customers/" + customer.id + "/interest", {
        listingId: changed.id,
      });
      const interested = await (
        await screen.request.get("/api/customers/" + customer.id)
      ).json();
      expect(interested.leads).toHaveLength(1);
      expect(interested.leads[0].listingId).toBe(changed.id);
      expect(interested.interactions).toHaveLength(2);
      const stage = screen.getByRole("combobox", {
        name: "Lead stage",
        exact: true,
      });
      await stage.selectOption("CONTACTED");
      await expect(
        screen.locator(".lead-card").filter({ hasText: name }),
      ).toHaveCount(0);
      await post(
        screen.request,
        "leads/" + interested.leads[0].id,
        { stage: "CONTACTED" },
        "PATCH",
      );
      await screen.reload();
      await stage.selectOption("CONTACTED");
      await expect(
        screen.locator(".lead-card").filter({ hasText: name }),
      ).toHaveCount(1);
      await post(
        screen.request,
        "leads/" + interested.leads[0].id,
        { stage: "VISIT_SCHEDULED" },
        "PATCH",
      );
      await screen.reload();
      await stage.selectOption("VISIT_SCHEDULED");
      await expect(
        screen.locator(".lead-card").filter({ hasText: name }),
      ).toHaveCount(1);
      await screen.goto("/crm");
      const filter = screen.getByRole("combobox", {
        name: "Customer status",
        exact: true,
      });
      await filter.selectOption("INTERESTED");
      await expect(row).toBeVisible();
      await filter.selectOption("ENQUIRY");
      await expect(row).toHaveCount(0);
      if (screen === page) {
        await post(
          page.request,
          "leads/" + interested.leads[0].id,
          { stage: "LOST", reason: "Customer dropped this enquiry" },
          "PATCH",
        );
        await screen.reload();
        await filter.selectOption("DROPPED");
        await expect(row).toBeVisible();
      } else {
        await post(screen.request, "listings/" + changed.id, {
          action: "book",
          customerId: customer.id,
        });
        await screen.reload();
        await filter.selectOption("BOOKED");
        await expect(row).toBeVisible();
        await post(screen.request, "listings/" + changed.id, {
          action: "advance",
          customerId: customer.id,
          amount: 100000,
          method: "Cash",
          paymentDate: new Date().toISOString(),
          requestKey: randomUUID(),
        });
        await screen.reload();
        await filter.selectOption("ADVANCE_PAID");
        await expect(row).toBeVisible();
        await page.goto("/listings/" + changed.id);
        const tracking = page.getByRole("region", { name: "Payment tracking" });
        await expect(
          page
            .locator(".summary-counts > div")
            .filter({ hasText: "Lost customers" }),
        ).toContainText("1");
        await expect(tracking).toContainText("Advance paid");
        await expect(tracking).toContainText("₹49,00,000");
        await page
          .getByRole("button", {
            name: "Record full payment / complete",
            exact: true,
          })
          .click();
        const paymentDialog = page.getByRole("dialog");
        const totalAmount = paymentDialog.getByLabel(
          "Total deal value including advances (₹)",
        );
        await expect(totalAmount).toHaveAttribute("max", "5000000");
        await expect(totalAmount).toHaveAttribute("min", "100000");
        await totalAmount.fill("5000001");
        expect(
          await totalAmount.evaluate(
            (input: HTMLInputElement) => input.validity.rangeOverflow,
          ),
        ).toBe(true);
        const rejectedPayment = await page.request.post(
          "/api/listings/" + changed.id,
          { data: { action: "complete", amount: 5000001 } },
        );
        expect(rejectedPayment.status()).toBe(400);
        await totalAmount.fill("5000000");
        await paymentDialog
          .getByRole("button", { name: "Confirm full payment", exact: true })
          .click();
        await expect(paymentDialog).toHaveCount(0);
        await expect(tracking).toContainText("Fully paid · completed");
        await expect(tracking).toContainText("Final payment");
        await page.goto("/dashboard");
        const soldCard = page.getByRole("link", {
          name: "Properties sold: 1. View sold properties",
          exact: true,
        });
        await expect(soldCard).toBeVisible();
        await page.screenshot({
          path: "test-results/dashboard-sold-properties.png",
          fullPage: true,
        });
        await soldCard.click();
        await expect(
          page.getByRole("heading", { name: "Sold properties", exact: true }),
        ).toBeVisible();
        await expect(page.locator(".listing-card")).toHaveCount(1);
        await expect(page.locator(".listing-card")).toContainText(
          changed.title,
        );
        await page.reload();
        await expect(page.locator(".listing-card")).toHaveCount(1);
        await page.goto("/listings/" + changed.id);
        await expect(tracking).toContainText("Fully paid · completed");
        await page.screenshot({
          path: "test-results/payment-tracking-desktop.png",
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
          path: "test-results/payment-tracking-mobile.png",
          fullPage: true,
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.setViewportSize({ width: 1280, height: 720 });
        await screen.reload();
        await filter.selectOption("FULLY_PAID");
        await expect(row).toBeVisible();
        await screen.screenshot({
          path: "test-results/crm-status-filters-desktop.png",
          fullPage: true,
        });
        await screen.setViewportSize({ width: 390, height: 844 });
        await expect
          .poll(async () => {
            const bounds = await screen.locator(".sidebar").boundingBox();
            return bounds ? bounds.x + bounds.width : 0;
          })
          .toBeLessThanOrEqual(1);
        await screen.screenshot({
          path: "test-results/crm-status-filters-mobile.png",
          fullPage: true,
        });
        expect(
          await screen.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await screen.goto("/listings/" + changed.id);
        await expect(
          screen.getByText("Property frozen", { exact: true }),
        ).toBeVisible();
        await expect(
          screen.getByRole("button", { name: "Resume property", exact: true }),
        ).toHaveCount(0);
        expect(
          (
            await screen.request.post("/api/listings/" + changed.id, {
              data: { action: "resume", reason: "Employee cannot release it" },
            })
          ).status(),
        ).toBe(403);
        await page.goto("/listings/" + changed.id);
        await page
          .getByRole("button", { name: "Resume property", exact: true })
          .click();
        const resume = page.getByRole("dialog");
        await resume
          .getByLabel("Reason")
          .fill("Admin explicitly resumes this property");
        await resume
          .getByRole("button", { name: "Resume", exact: true })
          .click();
        await expect(resume).toHaveCount(0);
        await expect(
          page.getByRole("link", { name: "Edit listing", exact: true }),
        ).toBeVisible();
        const resumed = await (
          await page.request.get("/api/listings/" + changed.id)
        ).json();
        expect(resumed.status).toBe("AVAILABLE");
        expect(resumed.views).toBe(2);
        expect(resumed.lostCustomers).toBe(1);
      }
    }
  } finally {
    await employeeContext.close();
  }
});
