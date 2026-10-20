# Power International BD ERP — change prompts for a Claude coding agent

From the client review meeting (Approvals, Stock & warehouse, Sales & Billing, User & Role Management).
Each file in `prompts/` is one small, self-contained task. Give them to the agent one at a time, from the repo root, with this folder copied into the repo (e.g. `docs/agent-prompts/`) so the screenshot paths resolve.

Suggested order: 04 → 05 → 06 → 03 → 07 → 08 → 09 → 11 → 13 → 15 → 14 → 10 → 12 → 02 → 01
(small UI items first; 02 and 01 change data/permission models and are the largest).

| # | Task | Screenshots |
|---|------|-------------|
| 01 | [Replace the role permission picker with a View / Create / Edit / Delete matrix](prompts/01-role-permission-matrix.md) | 01-role-permission-picker.png |
| 02 | [Every create / edit / delete goes through Authorizer → Chairman, posted on the entry date](prompts/02-two-stage-approval-everywhere.md) | 02-approvals-tabs.png |
| 03 | [Add an "All" tab to the Approvals page](prompts/03-approvals-all-tab.md) | 02-approvals-tabs.png |
| 04 | [Show all dates as DD/MM/YYYY](prompts/04-date-display-ddmmyyyy.md) | 03-sales-dates-mmddyyyy.png, 04-approvals-day-input.png |
| 05 | [Shared DateInput: DD/MM/YYYY, whole box clickable, tidy calendar](prompts/05-date-input-component.md) | 05-date-picker-calendar.png, 03-sales-dates-mmddyyyy.png |
| 06 | [Numeric inputs: no spinner arrows, no stuck leading zero](prompts/06-number-input-fix.md) | 06-quantity-spinner.png |
| 07 | [Warehouse report: one row per product with merged warehouse cells](prompts/07-warehouse-report-per-product.md) | 08-warehouse-report-current.png |
| 08 | [New stock table: previous qty, new qty, totals](prompts/08-new-stock-table.md) | 09-new-stock-table-current.png, 10-receive-purchase-dialog.png |
| 09 | [Compact tables on mobile](prompts/09-mobile-compact-tables.md) | 11a-mobile-approvals-scroll.png, 11b-mobile-dealers-scroll.png |
| 10 | [Remove "New sale"; add an optional Payment section to the Order Form](prompts/10-order-form-payment-section.md) | 12-new-sale-order-details.png, 13-new-sale-payment-section.png, 14-next-payment-autosaves.png, 07-order-form-paid-now.png |
| 11 | [Sales table: Sale date column, all products, clickable row with invoice popup](prompts/11-sales-table-date-and-details.md) | 15-sales-table-columns.png |
| 12 | [Due column and invoice show the cumulative customer due (snapshot)](prompts/12-cumulative-due-on-invoice.md) | 15-sales-table-columns.png, 17-invoice-no-previous-due.png |
| 13 | [Download invoice as JPG](prompts/13-invoice-jpg-download.md) | 18-invoice-buttons.png |
| 14 | [Admin-configurable order statuses](prompts/14-configurable-order-statuses.md) | 16-status-options.png |
| 15 | [Show/hide columns on the Sales & Billing table](prompts/15-sales-table-column-picker.md) | 15-sales-table-columns.png |

## Not yet specified by the client (no prompt written)
- Sales & Billing top cards (Open / Ready / Customer receivable / Supplier payable): client said he would explain later.
- Daily closing: client said it was missing from his sheet.
- Invoice format: discussion was cut off when the meeting ended.

## Assumptions to confirm
- 07: "Low-stock qty" = the product's minimum stock level.
- 08: "Total value" = total qty × new unit cost.
- 02: whether admin actions also need to pass both approval stages.
