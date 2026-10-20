# 02 — Every create / edit / delete goes through Authorizer → Chairman, posted on the entry date

**Project:** Power International BD ERP (`erp.powerinternationalbd.com`)

## Screenshots
![Approvals page and its tabs](../screenshots/02-approvals-tabs.png)
*`screenshots/02-approvals-tabs.png` — Approvals page and its tabs*

## Context
Client rule: *any* action (a new entry, an edit, even deleting a single row) must get both approvals – first the Authorizer, then the Chairman (final approval). Nothing reaches the sheets/ledgers before the Chairman approves. Once approved, the record is posted on the date that was entered on the form, not the approval date (example: a dealer deposit entered with date 9th and approved on the 11th must appear on the 9th in the sheet).

## Current behaviour (code)
- `src/lib/erp/utils.ts` → `approvalStage()` / `canActAtStage()` implement Authorizer → Chairman, but only orders, deposits and ledger entries use it.
- `src/lib/erp/provider.tsx` → `submitSupplierPayment`, `submitExpense`, `requestChange` / `reviewChangeRequest` are single-stage (admin only, `requireAdminUser`).
- Admin and some roles write directly without approval (`requiresApproval` on roles).
- `src/components/admin/approvals/ApprovalReports.tsx` → `DailyClosingReport` filters deposits and supplier payments by `reviewedAt` (approval day) instead of the entry date.

## Required change
1. Apply the two-stage flow (pending → authorized → approved/rejected, with `authorizedAt/By` and `reviewedAt/By`) to: orders, deposits, ledger entries, supplier payments, expenses and all change requests (create / update / delete of customers, suppliers, credit entries, expenses).
2. Use the existing `approvalStage`, `canActAtStage`, `APPROVAL_STAGE_LABELS` and `ApprovalStageNote` – do not invent a parallel mechanism.
3. Only the Chairman (or admin) can give final approval. Only after final approval does the change touch ledgers, balances, stock or sheets.
4. When posting, use the record's own business date (`date` / `orderDate` field from the form). Keep `createdAt`, `authorizedAt`, `reviewedAt` purely as audit info (who/when) and keep showing them in the approval cards.
5. Fix `DailyClosingReport` (and any other report/sheet) to use the entry date for approved records.
6. Rejection at either stage leaves data unchanged and notifies the submitter.

## Acceptance criteria
- [ ] A deposit dated D, authorized on D+1 and approved on D+2 appears in the credit sheet and daily closing on D only after the D+2 approval.
- [ ] Deleting a credit ledger row creates a pending request; the row is still visible until the Chairman approves.
- [ ] Playwright tests in `e2e/` cover each record kind through both stages.

## Notes
Confirm with the team before changing the admin bypass (whether admin actions also need approval). Default: admin can act at either stage but submissions still pass through the queue.

## Working rules
- Open and look at the screenshot(s) above before starting; red boxes mark the area this task is about.
- Keep the change scoped to this task. Do not refactor unrelated code.
- Match the existing stack and style: Next.js App Router, TypeScript, Tailwind, shadcn/ui components in `src/components/ui`, data via `useERP()` (`src/lib/erp/provider.tsx`) and Firebase Realtime Database.
- UI text stays in English, consistent with the rest of the app.
- Must work on mobile (most users are on phones) and in dark mode.
- Run `npm run build` and the relevant Playwright tests; add a test when the task changes behaviour.
- At the end, summarise which files changed and anything you could not do or had to assume.
