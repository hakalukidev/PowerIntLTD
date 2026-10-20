# 15 — Show/hide columns on the Sales & Billing table

**Project:** Power International BD ERP (`erp.powerinternationalbd.com`)

## Screenshots
![Sales & Billing table](../screenshots/15-sales-table-columns.png)
*`screenshots/15-sales-table-columns.png` — Sales & Billing table*

## Context
The client liked the column picker in Reports and wants the same here, e.g. to hide Status and print only what they need.

## Current behaviour (code)
- `src/components/admin/ReportScreen.tsx` has the pattern: `hiddenColumns` state, `toggleColumn`, "Columns (x/y)" dropdown with `DropdownMenuCheckboxItem`.

## Required change
1. Add a "Columns" dropdown to the Sales & Billing table header using the same pattern/components.
2. Hidden columns are hidden in the table, in "Export data" (Excel) and in "Full PDF"/print.
3. Remember the selection per user (localStorage key including the user id). At least one column must stay visible.

## Acceptance criteria
- [ ] Hiding Status removes it from the table, the Excel export and the PDF.

## Working rules
- Open and look at the screenshot(s) above before starting; red boxes mark the area this task is about.
- Keep the change scoped to this task. Do not refactor unrelated code.
- Match the existing stack and style: Next.js App Router, TypeScript, Tailwind, shadcn/ui components in `src/components/ui`, data via `useERP()` (`src/lib/erp/provider.tsx`) and Firebase Realtime Database.
- UI text stays in English, consistent with the rest of the app.
- Must work on mobile (most users are on phones) and in dark mode.
- Run `npm run build` and the relevant Playwright tests; add a test when the task changes behaviour.
- At the end, summarise which files changed and anything you could not do or had to assume.
