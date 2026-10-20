# 11 — Sales table: Sale date column, all products, clickable row with invoice popup

**Project:** Power International BD ERP (`erp.powerinternationalbd.com`)

## Screenshots
![No sale-date column; Product shows only the first item](../screenshots/15-sales-table-columns.png)
*`screenshots/15-sales-table-columns.png` — No sale-date column; Product shows only the first item*

## Context
The client cannot see when a sale was made, and an order with several products shows only the first product.

## Current behaviour (code)
- `SalesScreen.tsx` table columns: Bill | Customer | Product (`order.items[0]`) | Sales person | Total | Due | Status | Delivery | Invoice.

## Required change
1. Add a **Sale date** column (from `order.createdAt`, which holds the order date) before Delivery, formatted DD/MM/YYYY.
2. Product column: first product name + a "+N more" chip when there are more items.
3. Make each row clickable (cursor-pointer, hover state, keyboard accessible). Clicking opens a dialog showing the invoice: bill no., dates, customer, every item (product, qty, unit, unit price, amount), discount, payable, paid, due.
4. Clicks on the Print / PDF / JPG buttons inside the row must not open the dialog (`stopPropagation`).
5. The dialog has Print, PDF and JPG buttons (JPG from prompt 13).

## Acceptance criteria
- [ ] A 2-product order shows "Men's Jacket +1 more" and both items in the dialog.

## Working rules
- Open and look at the screenshot(s) above before starting; red boxes mark the area this task is about.
- Keep the change scoped to this task. Do not refactor unrelated code.
- Match the existing stack and style: Next.js App Router, TypeScript, Tailwind, shadcn/ui components in `src/components/ui`, data via `useERP()` (`src/lib/erp/provider.tsx`) and Firebase Realtime Database.
- UI text stays in English, consistent with the rest of the app.
- Must work on mobile (most users are on phones) and in dark mode.
- Run `npm run build` and the relevant Playwright tests; add a test when the task changes behaviour.
- At the end, summarise which files changed and anything you could not do or had to assume.
