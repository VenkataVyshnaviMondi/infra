import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

test("Admin and Employee record dated customer visits and enquiries against uploaded properties", async ({
  page,
  browser,
}) => {
  test.setTimeout(150000);
  expect(
    (
      await page.request.post("/api/auth/login", {
        data: { username: "e2e.admin", password: "Test-Admin-Only-123!" },
      })
    ).ok(),
  ).toBe(true);
  const photoResponse = await page.request.post("/api/photos", {
    multipart: {
      file: {
        name: "test-property.png",
        mimeType: "image/png",
        buffer: await fs.readFile("public/kubera-logo.png"),
      },
    },
  });
  expect(photoResponse.ok()).toBe(true);
  const photo = await photoResponse.json();
  const listingResponse = await page.request.post("/api/listings", {
    data: {
      title: "Customer contact feature plot",
      categoryId: "plots",
      optionId: "plots-sale",
      price: 5000000,
      state: "Telangana",
      city: "Hyderabad",
      locality: "Shadnagar",
      address: "Survey 80, Main Road",
      description:
        "Residential property for customer contact workflow verification.",
      photoIds: [photo.id],
      property: { type: "Residential", facing: "East", plotArea: 1800 },
    },
  });
  expect(listingResponse.ok()).toBe(true);
  const listing = await listingResponse.json();
  const employeeResponse = await page.request.post("/api/employees", {
    data: {
      name: "Contact Feature Employee",
      username: "contact.employee",
      phone: "9000000300",
      password: "Temporary-Contact-123!",
    },
  });
  expect(employeeResponse.ok()).toBe(true);
  const employeeContext = await browser.newContext({
    baseURL: "http://localhost:3100",
    extraHTTPHeaders: { Origin: "http://localhost:3100" },
  });
  try {
    expect(
      (
        await employeeContext.request.post("/api/auth/login", {
          data: {
            username: "contact.employee",
            password: "Temporary-Contact-123!",
          },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await employeeContext.request.post("/api/auth/password", {
          data: {
            currentPassword: "Temporary-Contact-123!",
            newPassword: "Permanent-Contact-123!",
          },
        })
      ).ok(),
    ).toBe(true);
    const employeePage = await employeeContext.newPage();
    for (const [screen, name, phone, age, mode, type] of [
      [page, "Admin visit customer", "9000000301", "42", "Walk-in", "VISIT"],
      [
        employeePage,
        "Employee phone customer",
        "9000000302",
        "36",
        "Phone",
        "ENQUIRY",
      ],
    ] as const) {
      await screen.goto("/crm");
      await screen
        .getByRole("button", { name: "Add customer", exact: true })
        .click();
      const dialog = screen.getByRole("dialog");
      await dialog.getByLabel("Customer name").fill(name);
      await dialog.getByLabel("Phone number", { exact: false }).fill(phone);
      await dialog.getByLabel("Age (optional)").fill(age);
      await dialog.getByLabel("Contact mode").selectOption(mode);
      await dialog
        .getByRole("combobox", { name: /^Visit or enquiry/ })
        .selectOption(type);
      await dialog
        .getByLabel("Date and time visited or enquired")
        .fill("2026-10-20T11:30");
      await dialog.getByLabel("Property type").selectOption("plots");
      await dialog
        .getByRole("combobox", { name: /^Uploaded listing/ })
        .selectOption(listing.id);
      if (screen === page) {
        await screen.screenshot({
          path: "test-results/customer-contact-desktop.png",
          fullPage: true,
        });
        await screen.setViewportSize({ width: 390, height: 844 });
        await screen.screenshot({
          path: "test-results/customer-contact-mobile.png",
          fullPage: true,
        });
        expect(
          await screen.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        await screen.setViewportSize({ width: 1280, height: 900 });
      }
      await dialog
        .getByRole("button", { name: "Add customer", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      const row = screen.getByRole("row").filter({ hasText: name });
      await expect(row).toContainText(age);
      await expect(row).toContainText(listing.title);
      await expect(
        screen.getByRole("button", { name: "Record interaction", exact: true }),
      ).toHaveCount(0);
      await row
        .getByRole("button", { name: "Edit " + name, exact: true })
        .click();
      const rowEdit = screen.getByRole("dialog");
      await expect(rowEdit.getByLabel("Customer name")).toHaveValue(name);
      await rowEdit
        .getByLabel("Notes", { exact: true })
        .fill("Edited from the customer row.");
      await rowEdit
        .getByRole("button", { name: "Save customer", exact: true })
        .click();
      await expect(rowEdit).toHaveCount(0);
      expect(new URL(screen.url()).pathname).toBe("/crm");
      await row.getByRole("cell", { name: "+91" + phone, exact: true }).click();
      await screen.waitForURL(/\/customers\//);
      await screen.reload();
      await expect(
        screen.getByRole("heading", { name, level: 1 }),
      ).toBeVisible();
      const id = new URL(screen.url()).pathname.split("/").pop();
      const persisted = await (
        await screen.request.get("/api/customers/" + id)
      ).json();
      expect(persisted.age).toBe(Number(age));
      expect(persisted.notes).toBe("Edited from the customer row.");
      expect(persisted.source).toBe(mode);
      expect(persisted.contactType).toBe(type);
      expect(persisted.contactDate).toBe("2026-10-20T06:00:00.000Z");
      expect(persisted.interactions).toHaveLength(1);
      expect(persisted.interactions[0].listingId).toBe(listing.id);
      expect(persisted.interactions[0].type).toBe("ENQUIRY");
      if (screen === employeePage) {
        await screen
          .getByRole("button", { name: "Edit customer", exact: true })
          .click();
        const edit = screen.getByRole("dialog");
        await edit.getByLabel("Age (optional)").fill("37");
        await edit.getByLabel("Contact mode").selectOption("Other");
        await edit.getByLabel("Other contact mode").fill("Property exhibition");
        await edit
          .getByRole("button", { name: "Save customer", exact: true })
          .click();
        await expect(edit).toHaveCount(0);
        await screen.reload();
        const updated = await (
          await screen.request.get("/api/customers/" + id)
        ).json();
        expect(updated.age).toBe(37);
        expect(updated.contactDetails).toBe("Property exhibition");
        expect(updated.interactions).toHaveLength(1);
      }
      await screen.goto("/crm");
      await screen
        .getByRole("button", { name: "Add customer", exact: true })
        .click();
      const repeat = screen.getByRole("dialog");
      await repeat
        .getByLabel("Customer name")
        .fill("Draft name must not overwrite profile");
      await repeat
        .getByLabel("Phone number", { exact: false })
        .fill("+91 " + phone);
      await repeat.getByLabel("Age (optional)").fill("99");
      await repeat.getByLabel("Contact mode").selectOption("Phone");
      await repeat
        .getByLabel("Date and time visited or enquired")
        .fill("2026-10-21T14:00");
      await repeat.getByLabel("Property type").selectOption("plots");
      await repeat
        .getByRole("combobox", { name: /^Uploaded listing/ })
        .selectOption(listing.id);
      await repeat
        .getByRole("button", { name: "Add customer", exact: true })
        .click();
      await expect(
        repeat.getByRole("region", { name: "Existing customer found" }),
      ).toContainText(name);
      await expect(repeat.getByLabel("Age (optional)")).toHaveValue("99");
      await repeat
        .getByRole("button", { name: "Save new visit / enquiry", exact: true })
        .click();
      await expect(repeat).toHaveCount(0);
      await screen.waitForURL(/contactSaved=1/);
      await expect(
        screen.getByText(
          "New visit or enquiry saved to this customer’s history.",
          { exact: true },
        ),
      ).toBeVisible();
      const repeated = await (
        await screen.request.get("/api/customers/" + id)
      ).json();
      expect(repeated.name).toBe(name);
      expect(repeated.age).toBe(screen === page ? 42 : 37);
      expect(repeated.interactions).toHaveLength(2);
      expect(repeated.interactions[0].occurredAt).toBe(
        "2026-10-21T08:30:00.000Z",
      );
      expect(repeated.interactions[0].notes).toContain("Contact mode: Phone");
    }
    const customers = await (
      await employeeContext.request.get("/api/customers")
    ).json();
    expect(
      customers.customers.some(
        (customer: any) => customer.name === "Admin visit customer",
      ),
    ).toBe(false);
  } finally {
    await employeeContext.close();
  }
});
