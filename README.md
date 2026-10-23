# Kubera Infra

Internal property inventory and CRM built with Next.js, TypeScript, Tailwind CSS, PostgreSQL and Prisma. Exactly two authenticated roles: Admin and Employee. Customers are CRM records.

## Start locally (Windows, macOS or Linux)

Requires Node.js 24 LTS and npm. The local database helper downloads official packaged PostgreSQL binaries through `embedded-postgres`; Docker is not required.

```powershell
npm install
npm run setup:local
```

Setup creates a private `.env` with a random database password, applies migrations, and seeds every category with sample listings, photos and CRM activity. Seed photos are downloaded from Unsplash during setup; the application subsequently serves them from private local storage. Internet access is needed for the first setup.

Open **two terminals** in this project:

```powershell
# Terminal 1 — keep PostgreSQL running
npm run db:local
```

```powershell
# Terminal 2
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Initial usernames and randomly generated temporary passwords are in `.local/development-credentials.txt`. All seeded accounts must change their password at first login. Passwords are hashed in the database and cannot be retrieved. The development credentials file is ignored by Git; remove it after recording the initial credentials in a password manager.

If a database process is already running, keep that terminal and do not run a second `db:local` or `setup:local`. `Ctrl+C` in the database terminal shuts it down cleanly. Data persists under `.local/postgres`; do not delete this directory to restart. Stop both processes before moving this OneDrive project or backing it up. Avoid synchronizing a running PostgreSQL data directory between computers.

## Daily workflow

Property freeze: Booked, Advance paid, Sold, Rented and Leased properties are automatically frozen. Their details cannot be edited and new customers cannot be linked until Admin chooses **Resume property** with a reason. Existing advances and transaction completion can continue for the reserved customer. Resume cancels the active reservation or reverses the completed status, restores availability and retains receipts/history. Employees cannot release inventory. Frozen properties are excluded from new-customer property choices; an existing current selection remains visible.

Interested leads has a **Lead stage** filter for New, Contacted, Visit scheduled, Visited, Negotiation, Booked, Advance paid, Fully paid and Dropped. It works in board and table views. The default board shows active stages; completed or dropped stages can be selected explicitly.

Returning customers: if Add customer finds an existing phone number that you are authorized to access, it shows the customer’s name and retains the entered form. Choose **Save new visit / enquiry** to append the selected property, actual contact date and contact mode to that customer’s history. This does not overwrite identity or assignment, create another customer, count a property viewing or create an interested lead. Repeated network submissions with the same submission key are recorded once. Numbers assigned to other employees remain restricted; Admin can review those assignments.

Customer table: click a customer row to open full details, or use its **Edit** button to update the existing record without leaving the table. A focused row also opens with Enter or Space. Property links retain their own destination. The separate interaction action is available within customer details rather than the CRM page header; row editing reuses the same customer form and update service.

Current property and pipeline: Edit customer preselects the current uploaded property and permits changing its type and selection. Saving updates the current property and requirement without adding an enquiry or rewriting historical interactions, bookings, or transactions. Existing property links are backfilled by migration. Open customer details and choose **Mark as interested** to create or reopen a single lead for that customer/property and open **Interested leads**. Retries do not create extra leads or interest events. All Customers remains the master list of the same customer records.

The **Customer status** filter and row status derive from the current property’s deal: Enquiry (no lead), Interested (active lead), Booked (active booking), Advance paid (recorded advance), Fully paid (Admin-completed transaction), and Dropped (lost lead). A completed deal for an old property does not mark a newly selected property fully paid. Converted and dropped deals are excluded from the active interested-lead board; their history remains on the customer profile. Access follows the existing assignment rules.

1. Admin creates an employee from **Employee Management → Add employee** and shares the temporary credentials privately.
2. Employee signs in and changes the temporary password.
3. **Uploads** guides Admin and employees through four steps: category and purpose, photos, details and review. Required fields and photo types/sizes are checked before publishing. First photo is the cover; photos can be reordered, removed or promoted to cover. Publishing saves the listing, specifications, ordered photo links and history in one database transaction, then opens its category with confirmation. Editing updates the existing record.
4. **Categories** shows shared database inventory with category counts and sale/rent/lease or furniture subtype buttons. Search, optional advanced filters, sorting and pagination are available. Filters are stored in the URL so reload and browser Back retain the selection. Saved changes refresh across tabs immediately; visible category pages also poll every 15 seconds for changes from other sessions or devices. This is automatic refresh, not a persistent push connection.
5. **Customer Data / CRM → Add customer** is available to Admin and Employee. Enter name, phone, optional age (1–120), contact mode, visit/enquiry type and the actual date/time in IST. Contact modes include Walk-in, Phone, WhatsApp, Email, Website, Referral and Other (with a required description). Choose a property type to filter the uploaded-property dropdown; the exact selected listing is previewed with its photo, location and price. Saving creates the customer, initial requirement, assignment and dated enquiry in one database transaction. The table and profile show age, contact mode, visit/enquiry date and linked listing. A customer visit is distinct from a property viewing and does not inflate viewing or lead counts. Edits preserve the customer and initial history rather than creating duplicates. Employees can access their assigned customers; Admin can assign records to any active staff member. Visible CRM pages refresh every 15 seconds and across same-browser tabs. Phones are normalized and duplicate records are rejected. Use Record interaction for additional property enquiries or viewings by an existing customer.
6. **Record interaction** links a customer and listing. The first customer/property link adds one customer view; further contacts, edits, retries and page opens do not add another. Actual property-viewing events are recorded separately in history and activity metrics. Interested creates a lead; it does not mean converted.
7. Schedule follow-ups, mark them done, reopen or reschedule them. The lead pipeline scrolls horizontally to show all nine stages. Lost leads require a reason.
8. Book an available listing for an authorized customer. Record manual advances with date, amount and method. Payment tracking on property details and customer Transactions shows the price, advances, total received and balance due. Each new advance must fit the remaining balance; cumulative advances cannot exceed the property price, including simultaneous submissions. Amounts support up to two decimal places. No payment gateway is included.
9. Admin chooses **Record full payment / complete** and confirms the total deal value, including advances. It cannot exceed the property price or be less than advances already received. Completion confirms receipt of the remaining balance; the total is not added to advances a second time. The winning lead becomes Converted, the inventory reaches its appropriate terminal status, and competing open leads are flagged for follow-up. Receipts from cancelled or reversed bookings remain historical and do not carry into a new booking.
10. Booking cancellations and completed transaction reversals require reasons. Booking, receipt, completion and status histories remain available. Refund processing is outside this application.

## Permissions

Employees can upload listings and edit their own listings; Admin can edit any listing. Category and transaction type are fixed after booking history exists, so historical transaction meaning cannot be changed. All authenticated staff can browse inventory and aggregate listing view/enquiry counts. Customer identities, interactions, booking parties and financial records are restricted to currently assigned customers. Admin has organization-wide access, employee management, customer assignment, listing archive/restore, finalization and reversal.

Permission checks run in the API and service layer, not only in navigation. Deactivation and password resets revoke existing sessions. Reassignment transfers pending follow-ups while preserving original activity and lead-generation attribution.

## Metrics

- Customer views: distinct saved customer/property links. Each customer counts once per property, including the initial enquiry. Page visits and repeat contacts never increment this.
- Unique viewers: distinct customers with a Property Viewing.
- Enquiries: count of saved `ENQUIRY` interactions.
- Customers handled: distinct customers with an interaction recorded by the employee in the selected period.
- Leads generated: distinct customers first marked Interested by that employee in the period, across their listing-specific leads.
- Lead rate: leads generated / customers handled × 100; zero handled = 0%. This measures activity in a period, rather than a closed cohort, so its numerator and denominator may refer to different interactions.
- Completed conversions: unreversed completions credited to the responsible employee at completion time. Later reassignment does not rewrite this credit.
- Recorded advances: historical manual receipt totals for the period, including cancelled bookings. This is not a net balance or refund ledger.
- Inventory availability and pipeline stage totals show current state; activity metrics use the date filter. All dates display in Asia/Kolkata, areas in sqft and prices in INR.
- **Total listings** shows every saved listing in the current role’s scope (organization-wide for Admin; their own listings for Employee), independently of the activity date filter. Each successful new upload adds one; editing a listing or adding a customer does not. Data refreshes after saved changes, across open tabs of the same browser, and when returning to the tab. Refreshes keep unsaved form entries intact.

## Database and storage

The schema covers users, sessions, login throttling, categories/options, listings, separate property/furniture attributes, photos, customers, requirements, assignment history, interactions, leads and history, follow-ups, bookings, advance receipts, completions, listing status history and audit logs.

Money uses PostgreSQL decimals. Foreign keys, positive amount checks, area/budget checks and partial unique indexes protect consistency. Booking and transaction changes lock the listing row inside a serializable transaction with bounded retry. Interaction and advance keys prevent duplicate creation on retries.

Images are validated by MIME, size and decoded image content; re-encoded as WebP with metadata stripped; saved with generated names outside `public/`; and served only after session checks. `StorageAdapter` in `src/lib/storage.ts` is the extension point for a cloud object store. Only the `local` driver is implemented. `MAX_PHOTOS` and `MAX_IMAGE_MB` configure limits. The original supplied logo is served unchanged from `public/kubera-logo.png`.

Back up PostgreSQL with `pg_dump` and the `storage/` directory together. A restore must preserve photo keys. Back up `.env` securely, separately from source control. Never copy a live raw PostgreSQL data directory as a backup.

## Production setup

1. Provision a PostgreSQL database with UTF-8 encoding and persistent image storage. The embedded helper is for local development only.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`, `APP_URL` to your exact HTTPS origin, and `STORAGE_PATH` to an absolute persistent volume path. Cookies use Secure when APP_URL is HTTPS; the server enforces this origin for mutations.
3. Run `npm install`, `npm run db:generate`, `npm run db:migrate`, and `npm run build`. Stop the application before regenerating Prisma on Windows, where loaded DLLs cannot be replaced.
4. Set `ADMIN_USERNAME`, a unique `ADMIN_PASSWORD` of 12–72 characters, and `ADMIN_NAME`, then run `npm run admin:bootstrap`. This creates an admin and categories only, without demo records. Remove bootstrap credentials from the environment afterward.
5. Run `npm start` behind an HTTPS reverse proxy on a private/internal network. Configure proxy request-size limits to match upload limits. Do not use the demonstration seed in production.

There is no public registration, customer login, payment gateway, email/SMS integration or cloud deployment in this delivery.

## Verification

Keep the local database running:

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run build
npm audit
```

`npm test` migrates the isolated `kubera_test` schema and runs database-backed tests. `npm run test:e2e` uses `kubera_e2e` with a separate Next.js server on port 3100 and real HTTP requests, plus desktop/mobile browser rendering checks. These schemas are test-only and their fixture tables are cleared at the start of each run; the application’s public schema is preserved. The Playwright Chromium binary must be installed (`npx playwright install chromium`) if it is not already present. Screenshots and failure traces are in `test-results/`.

See `VERIFICATION.md` for recorded results and limitations.
