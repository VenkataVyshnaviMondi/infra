# Verification — 22 October 2026

Kubera Infra runs locally at http://localhost:3000 with PostgreSQL and private persistent image storage. The interface uses text branding as requested.

## Results

| Check                                                                                          | Result                                                             |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Production build and TypeScript compilation                                                    | Passed                                                             |
| Database-backed business, payment tracking, property rates, CRM status and origin tests        | 39 passed                                                          |
| Existing HTTP and browser workflows                                                            | Passed; see tests/e2e/workflows.spec.ts                            |
| Upload → open dashboard → customer listing link                                                | Targeted two-tab browser regression passed                         |
| Admin and Employee → dated customer visit/enquiry → reload → edit                              | Passed; tests/e2e/customer-contact.spec.ts                         |
| Edit current property → interested lead → booked → advance paid → fully paid / dropped filters | Passed for Admin and Employee; tests/e2e/customer-pipeline.spec.ts |
| Conditional form coverage                                                                      | All 11 category/subcategory combinations passed                    |
| Desktop and mobile rendering                                                                   | Passed at 1280px and 390px; screenshots inspected                  |
| Browser client errors in rendering suite                                                       | None                                                               |
| Impeccable mechanical design detector                                                          | No findings                                                        |
| npm dependency audit                                                                           | 0 reported vulnerabilities                                         |
| Development login endpoint                                                                     | HTTP 200                                                           |
| Secrets, database, images and generated output excluded from Git                               | Confirmed                                                          |

## Verified stories

- Plot/flat upload forms derive a read-only price per sqft from price and plot area or super built-up area, respectively. It recalculates when either input changes and is derived again from saved values for review, inventory cards and listing details. Flat rentals label the rate per month. Invalid or missing inputs do not display a rate.

- Dashboard Properties sold counts current SOLD plots, flats and houses, excluding furniture and reversed sales. It is independent of activity dates and follows inventory creator scope on employee views. Clicking the card opens the existing inventory filtered to the same sold-property scope; database tests check count/list agreement, employee isolation and reversal.

- Lost customers appears beside views in property cards, inventory rows and property details. It counts the unique customer/property leads currently in Dropped (LOST), and decreases when a lead is reopened. Only the aggregate count is exposed across assignment boundaries.

- Payment validation uses database decimals inside the existing listing lock and serializable transaction. Tests reject cumulative overpayment, final values above the property price, final values below advances received, and sub-paise values. Two concurrent advances competing for the remaining balance allow exactly one winner. Payment summaries treat completion as the total deal value, without double counting advances, and exclude historical receipts from a new booking.
- The customer pipeline browser test verifies the displayed advance/balance, native amount bounds, direct HTTP overpayment rejection and successful full-payment completion. Desktop/mobile payment-summary captures are saved under `test-results/payment-tracking-*.png`. The production build passed using `NEXT_DIST_DIR=.next-payment-check` to avoid a Windows file lock in the running app's default output folder.

- Current-property edits update the linked preference without duplicating the customer or changing earlier enquiry records; mismatched property/category edits roll back. Interested promotion is idempotent per customer/property and restricted to authorized staff. Pure status tests cover Enquiry, Interested, Booked, Advance paid, Fully paid, Dropped, and isolation from completed deals for another property.

- Customer rows open the existing detail page; the per-row Edit button reuses CustomerForm and saves without navigating or creating a new customer. The CRM header contains Add customer; interaction entry remains within customer details.

- A duplicate normalized phone number offers the authorized existing customer by name and preserves the draft. Admin and Employee can explicitly save another dated contact against the selected listing without duplicating the customer or changing profile fields. Contact submission retries are idempotent; other employees cannot add contacts to a restricted customer.

- The four-step upload opens the selected category after a successful save. An independent browser session sees the record through automatic refresh; reload preserves it and editing does not increase the listing count. Covered by `tests/e2e/property-upload.spec.ts`.
- Customer contact validation covers age bounds and integer values, future dates, category/listing mismatch, custom contact modes, staff assignment, access restrictions, timestamp persistence and clearing age/custom source details. New database columns are additive and existing data is preserved.
- The customer browser test saves real records under Admin and Employee, verifies their property links and exact IST-to-UTC timestamps after reload, edits age and a custom contact mode without duplicating the initial enquiry, and checks employee assignment isolation. Desktop and mobile form screenshots are inspected. The first Save can use the known active assignee while staff options load.

Connection opening now allows a configurable 20 seconds by default (`connect_timeout`), in addition to the bounded pool and pool timeout, to accommodate the observed Windows development startup delays. Category and CRM refreshes preserve entered form values; customer submission takes the selected listing ID from form state even when a background refresh temporarily disables its dropdown.

- A new upload increases the already-open dashboard Total listings by exactly one, including across browser tabs. Reloading or editing the item does not add another listing. Current totals are independent of activity date filters and respect the creator/organization scope.
- Add customer selects actual uploaded inventory, previews the selected item, fills its category/subcategory, and saves the customer plus initial enquiry atomically. The exact listing link persists in the customer table, customer history and listing activity; the first customer/property link adds one customer view. Invalid, archived or frozen selections do not create a customer.

- Interested leads can be filtered by stage, including Contacted and Visit scheduled, in board and table views. The integrated browser scenario verifies both stages, automatic property freezing after payment, denial of Employee resume, and successful Admin resume with a reason. Resume preserves transaction history and customer-view totals.

- Admin creates employees; temporary-password accounts cannot use protected features before changing passwords.
- Employee password change creates a new session and revokes previous sessions.
- Authenticated multi-image upload, photo order/cover selection, conditional fields, final save and reload persist real records.
- Both Admin and Employee can create listings. All categories are available in shared inventory.
- Customer views count distinct saved customer/property links. The first link adds one; further enquiries, edits, repeated submissions and page opens do not add another. Actual property-viewing activity remains independently recorded in history and dashboard metrics.
- Interested creates a customer/listing lead. Not Interested requires a reason and preserves customer and other listing histories.
- Existing customers can hold multiple requirements without duplicate records. Cross-assignment duplicate checks withhold confidential identities.
- Unauthorized employees cannot read another employee’s customer details, edit assignments, finalize transactions or access employee management through direct HTTP calls.
- Concurrent competing bookings allow exactly one winner, with database uniqueness and transaction protection.
- Advance receipts persist with idempotency. Admin completion updates the appropriate inventory status and converts the winning lead. Reversal retains completion, receipt and status histories.
- Cancellation requires a reason and preserves booking history. Reassignment preserves original employee attribution.
- Dashboard metrics match saved interactions and transactions; zero denominators return 0%.
- Deactivation and password resets invalidate existing authenticated sessions.
- Requests from a different origin are rejected.
- Browser forms save a furniture listing, a walk-in customer and a viewing; the resulting listing view count is checked through the API.

## Development data

The seed starts with 4 users (1 Admin, 3 Employees), 4 categories, 11 listings, 22 privately stored photos and 12 sample customers. Users can add further records. Demonstration records are separate from the isolated test schemas. Temporary credentials are in `.local/development-credentials.txt` and must be changed on first login.

## Local connection reliability

Parallel queries exposed intermittent local connection failures against `localhost`. The local connection now uses explicit IPv4 (`127.0.0.1`), a bounded connection pool and a pool timeout. The Prisma client refreshes when its connection configuration changes during development. Database-backed tests and the two-tab regression passed with this configuration. A direct check confirmed the existing application database and preserved user-created records.

Tests use `kubera_test` and `kubera_e2e` PostgreSQL schemas and clear only those schemas’ fixture records. Test uploads are disposable local files. Browser screenshots and traces are generated under `test-results/`.

## Delivery boundaries

This delivery includes local execution, migrations, a production build, secure admin bootstrap instructions, seed data and automated checks. Production HTTPS, hosting, database backups and a persistent storage volume must be configured for deployment. The local storage adapter is implemented; adding a cloud provider requires implementing the documented StorageAdapter interface. No online payment processing, email/SMS delivery or public marketplace is included.

Automated coverage is Chromium-based; other browsers and assistive technologies have not been independently certified. The test suite proves the covered workflows and invariants, rather than constituting an independent security assessment.
