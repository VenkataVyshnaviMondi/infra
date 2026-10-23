# Kubera Infra design system

Use the Kubera Infra name as text branding in the sidebar and login screen; the user requested removal of the logo from the interface. The sidebar is deep navy and gold identifies active navigation. White working surfaces sit on a pale gray canvas. Green, amber and red are semantic status colors, always accompanied by text.

- Navy: #08264f; sidebar: #061c3c; gold: #b27f21; working background: #f5f7fa; text: #172b46; muted text: #627086; borders: #e2e7ee.
- Segoe UI/system sans for readable business data. Page titles 28–30px, section headings 16–18px, tables 12px. Tabular numerals for money and metrics.
- Consistent Lucide stroke icons. Main actions use navy buttons, secondary actions use outlined white buttons. Gold focus outlines support keyboard navigation.
- Sidebar is 232px on large screens; becomes a dismissible drawer below 900px. Inventory is 1–4 columns. Forms become single-column on phones; wide tables and lead stages scroll within their containers.
- Native dialog modals provide keyboard focus containment and Escape dismissal. Fields have persistent labels, form errors preserve entries, saving controls disable while pending. Empty states explain the next action.
- Listing uploads use four numbered steps: category and purpose, photos, details, review. Successful uploads open the selected category with confirmation and a link to the listing. Photo order defines cover order. Customer/transaction forms carry clear role and assignment constraints. Completion controls are Admin-only; enforcement also runs on the server.
- Restrained interface motion, reduced-motion support, themed selection/caret/scrollbars. No decorative charts, marketplace favorites or public-facing navigation.

Reference concepts: `design-previews/kubera-infra-screens-v1.png`. They are static generated concepts; source code and supplied original logo govern the working application.
