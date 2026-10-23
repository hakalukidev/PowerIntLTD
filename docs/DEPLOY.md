# Deploying to live

One checklist for everything not yet on live:
- 02, two-stage approval
- 01, role permission matrix
- 19, delivered date (its optional backfill)
- 25, stock per warehouse
- 27, stock history

It replaces DEPLOY-02-01.md, DEPLOY-25.md and DEPLOY-27.md. Those are kept for reference only.

Follow the steps in order. Each step says whether it goes **before** or **after the code deploy** (step 5), and what goes wrong if it is skipped or done out of order.

All commands run from the repository root with the live service account in `.env` / `.env.local`.

Every script is a dry run unless given `--apply`; read the dry run's output before applying.

Every `--apply` that changes stored data needs `--backup <dir>` outside the repository and records a marker under `migrations/`. A second `--apply` is refused (except with `--only`, where a script has it).

## Overview

| # | Step | When | Skipped or out of order |
| --- | --- | --- | --- |
| 0 | Freeze | Whole deploy | Role saved in the old editor loses permissions; stock moved by old code stops adding up |
| 1 | Back up live | First | Nothing to restore from |
| 2 | Database rules | Before code | Every stock change refused once the new code is live; approvals slow |
| 3 | Grant approval permissions | Before code | Only admins can review; nearly everything gets stuck |
| 4 | Split Edit into Create + Edit | Before code | Roles with Edit lose their Add/New buttons |
| 5 | **Deploy the code** | — | — |
| 6 | Everyone reloads | After code | Old code moves stock without warehouse counts or history |
| 7 | Verify steps 3 and 4 | After code | A role edited during the window stays broken |
| 8 | Stock-by-warehouse migration | After code, after 6 | Before code: products split early stop adding up |
| 9 | Stock history starting balance | After 8 | Before 8: refused. Skipped: history has no starting counts |
| 10 | Delivered date backfill (optional) | After code | Before code: orders delivered in between get no date |
| 11 | Other optional checks | After code | Nothing breaks |
| 12 | Verify the scripts | After 8–10 | Mistakes go unnoticed |
| 13 | Smoke test | Last | — |

## 0. Freeze (the whole deploy)

Deploy off-hours. Tell staff beforehand.

- **From step 3 until step 7 is done, nobody edits roles** in Role Management. The old role editor drops permission ids it does not know (`approvals.*`, `<module>.create`). A role saved there in that window loses them; step 7 repairs it.
- **From step 5 until step 9 is done, nobody receives, transfers, adjusts or delivers stock.**
  - Old code still open on someone's phone changes the single stock count without the warehouse counts, so a product split by step 8 stops adding up.
  - Stock moved before step 9 shows in the history before the starting balance (the step 9 dry run counts those rows).

## 1. Back up live — first

```sh
node scripts/backup-database.mjs ~/powerint-backups
```

The backup holds:
- `erp` and `portal`;
- `stockMovements` (the stock history) and `migrations` (the script markers), once those exist.

`scripts/seed-emulator.mjs` loads the same file onto the emulators.

**If skipped:** there is nothing to restore if a later step goes wrong. Each script's own backup only covers the part it changes.

## 2. Publish the database rules — before the code deploy

```sh
node scripts/deploy-database-rules.mjs
```

One publish covers everything:
- **02:** indexes on `customerId` for orders and credit sheet entries.
- **27:** the new `stockMovements` section.
  - Any active user can read it.
  - Rows can only be added, by the user named on the row.
  - Only an admin can delete a row. No screen does this; it exists so test runs can clean up.
  - Indexes on `date`, `productId`, `warehouseId`, `productDay` and `warehouseDay`.

The `erp` write rules are unchanged, so the old code keeps working under the new rules.

**If skipped or done after the code deploy:**
- **27:** the new code writes each stock change and its history rows in one update. Without the `stockMovements` rules the whole update is refused, the stock change included. So final approval of purchases, transfers and adjustments fails, and posting or moving a delivery fails, until the rules are published.
- **02:** approvals get slower as data grows, and the server logs index warnings.

## 3. Grant the approval permissions — before the code deploy

```sh
node scripts/grant-approval-permissions.mjs            # dry run: check it lists authorizer and chairman
node scripts/grant-approval-permissions.mjs --apply
```

**If skipped or done after the code deploy:** only admins can review submissions, so nearly everything waits at the first stage until it runs.

## 4. Split Edit into Create + Edit on stored roles — before the code deploy

```sh
node scripts/split-edit-permission.mjs                                         # dry run: lists each role and the .create ids it gets
node scripts/split-edit-permission.mjs --apply --backup ~/powerint-backups
```

It only adds permissions. It saves `erp/roles` to the backup folder first and records itself at `migrations/editCreateSplit`.

**If skipped or done after the code deploy:** every stored role with Edit loses its Add/New buttons until it runs.

## 5. Deploy the code

Push to `main` for the Vercel project `crm`, or `npx vercel --prod`. No new environment variables.

At this point:
- Pending supplier payments, expenses and record changes restart at the Authorizer stage.
- The new code already works on stock that is not split yet: a product counts its whole stock in its main warehouse, and is split the first time its stock moves.

## 6. Make sure everyone is on the new code — after the code deploy

Ask staff to close and reopen the app, the installed app too.

**If skipped:** anyone still on the old code changes stock without the warehouse counts (split products stop adding up), and writes no stock history. Anyone still on the old role editor can still drop permissions.

## 7. Verify the role scripts — straight after the code deploy

```sh
node scripts/grant-approval-permissions.mjs     # expect: authorizer / chairman "already has …"
node scripts/split-edit-permission.mjs          # expect: "Nothing to change"
```

If the second one lists a role, that role was saved in the old role editor during the window and lost its Create permissions. Give them back for that role only:

```sh
node scripts/split-edit-permission.mjs --apply --only <thatRoleId> --backup ~/powerint-backups
```

(`--only` takes a comma-separated list and is the only way past the "already applied" guard.)

If a role lost `approvals.*`, run step 3 again with `--apply`.

The role freeze ends here.

**If skipped:** a role edited during the window stays without its Create or approval permissions, and nobody notices until its users miss a button.

## 8. Split each product's stock into its main warehouse — after the code deploy (and step 6)

```sh
node scripts/migrate-stock-by-warehouse.mjs                                    # dry run
node scripts/migrate-stock-by-warehouse.mjs --apply --backup ~/powerint-backups
```

The dry run lists, per product, the total before and after. They are always the same: the total is never written. It also gives the warehouse the stock goes into.

It also lists, and skips:
- products whose main warehouse no longer exists;
- products with stock below zero.

It also lists products that look like the same item entered once per warehouse (same name or model/SKU). They are **not merged**; decide by hand which to keep.

`--apply`:
- saves `erp/products` to the backup folder first;
- checks every total again after writing;
- records itself at `migrations/stockByWarehouse`.

To split products it skipped (after fixing their main warehouse), name them:

```sh
node scripts/migrate-stock-by-warehouse.mjs --apply --only <productId,...> --backup ~/powerint-backups
```

**If done before the code deploy:** the old code keeps changing only the single count, so every product split early stops adding up (its warehouses no longer sum to its total). Correct each one with a Stock adjustment.

**If skipped:** stock keeps working: each product is split the first time its stock moves. But step 9 is refused, and products whose stock never moves are never split.

## 9. Write the stock history starting balance — after step 8

```sh
node scripts/stock-history-starting-balance.mjs                                    # dry run
node scripts/stock-history-starting-balance.mjs --apply --backup ~/powerint-backups
```

It writes one "Starting balance" row per product per warehouse with its current count, dated today. The history starts from these rows. Older movements are not rebuilt: older purchases have no warehouse, older orders took stock off a single count, and stock used to be edited by hand.

The dry run lists every row it will write. It also lists, and skips:
- products not split by warehouse yet;
- counts in warehouses that no longer exist.

It says how many history rows the app has already written since step 5. With the stock freeze held, that is none.

`--apply`:
- saves `erp/products` and `stockMovements` to the backup folder first;
- writes the rows and checks they are all there;
- records itself at `migrations/stockHistoryStartingBalance`.

The stock freeze ends here.

**If done before step 8:** it is refused ("Stock is not split by warehouse yet"); run step 8 first.

**If skipped:** the history works, but each warehouse's history starts from its first movement with no count before it, so the balance column has no visible starting point.

**If stock moved between step 5 and this step:** those rows list before the starting balance. Their balances are still right, but the order reads oddly.

## 10. Optional: fill the delivered date on older orders — after the code deploy

```sh
node scripts/backfill-delivered-at.mjs                                         # dry run
node scripts/backfill-delivered-at.mjs --apply --backup ~/powerint-backups
```

Since 19, an order gets a delivered date when its delivery document is submitted or it moves to a status that counts as delivered. Older orders have none.

This fills it only where there is a real record of the date: the order is in a delivered status and has a submitted delivery document. It uses that document's submitted date.

The dry run also lists, and leaves empty:
- orders marked delivered by hand with no document (with their last status change from the Daily Audit, for reference);
- orders whose document was submitted but that have since moved out of a delivered status.

`--apply` saves the orders to the backup folder first and records itself at `migrations/deliveredAtBackfill`. To fill named orders after that, use `--only <orderId,...>`.

It does not depend on steps 8–9 and can run any time after the code deploy.

**If done before the code deploy:** orders delivered between this run and the deploy get no date. A second `--apply` is refused, so they need `--only`.

**If skipped:** older delivered orders show no delivered date, so they are missing from anything that sorts or filters by it.

## 11. Other optional steps — after the code deploy

- `node scripts/recompute-dealer-dues.mjs` (dry run) should report no differences.
- A **Cancelled** status: Sales → Manage statuses → Add status, tick "Cancels the order". An approved order moved there before its delivery is posted gives its stock back.

## 12. Verify the scripts — after steps 8–10

```sh
node scripts/migrate-stock-by-warehouse.mjs        # expect "Nothing to write" and "0 of them not adding up"
node scripts/stock-history-starting-balance.mjs    # expect "Already applied" and the same rows
node scripts/backfill-delivered-at.mjs             # if step 10 ran: expect "Nothing to write" or only orders delivered since
```

## 13. Smoke test on live — last

**Roles and approvals (01, 02)**
- Role Management → edit a role. The permission editor is the Module / View / Create / Edit / Delete matrix, with an Approvals group at the bottom.
- The Authorizer role has "Authorize submissions (stage 1)" ticked; the Chairman role has "Final approval (stage 2)" ticked.
- Head of Sales has Create ticked next to Edit for sales, dealers, credit sheet, zones and leads. Owner and Manager look as before (Owner view-only; Manager with Create and Edit on the sales chain).
- Submit a small deposit dated yesterday. The Authorizer authorizes, the Chairman rejects: nothing should change.
- Final-approve one real pending item. It appears on its own date in the credit sheet and that day's Daily closing, and the dealer's due changes.
- Vercel logs show `/api/erp/recompute-due` returning 200.

**Stock per warehouse (25)**
- Inventory: the Warehouse column lists stock by warehouse; Edit product shows stock read-only.
- Receive 2 units of a cheap product, split 1 + 1 over two warehouses. After both approvals, the Approvals → Stock & warehouse report shows 1 in each.
- Transfer 1 unit back. It moves only after the Chairman's approval.
- Post one delivery. The warehouse picker says what that warehouse has of each line.

**Stock history (27)**
- Inventory / Stock → Stock history, date range today:
  - one Starting balance row per product and warehouse;
  - the receipt above as two Purchase rows;
  - the transfer as Transfer out + Transfer in;
  - the delivery as a Sale.

  Each row carries the warehouse's count after it.
- That product's details → Show stock history: the same rows.
- Warehouse control → History on one of the two warehouses: only that warehouse's rows.
- Export Excel from the Stock history tab and open the file.

**Delivered date (19)**
- Submit the delivery document of the order posted above: it gets today's delivered date.

## Rollback

Redeploy the previous commit. Leave the rules, roles and markers as they are: the old code ignores what it does not know.

**Roles and approvals**
- The old code ignores `approvals.*` and `<module>.create`. Stored roles still carry `<module>.edit`, which the old code reads as "Create & edit".
- Pending purchases just sit unused.
- Avoid editing roles while rolled back: the old editor drops the new ids again. If you do, repeat step 7 after rolling forward.
- To put `erp/roles` back exactly as before step 4, use the `split-edit-permission-<timestamp>.json` file in `~/powerint-backups`.

**Stock**
- The old code ignores `stockByWarehouse`, `reservedQty`, the transfers, the adjustments and the history. It keeps using `stockQty`, which stays correct.
- Pending transfers and adjustments, including new products' opening stock, just wait.
- While rolled back, stock that moves on a split product changes only the single count, so its warehouse counts stop adding up. Orders posted for delivery stay "held". The history gets no rows for those movements, which leaves a gap.
- After rolling forward, step 8's dry run lists those products under "not adding up"; correct each with a Stock adjustment.
- To put `erp/products` back exactly as before step 8, use the `migrate-stock-by-warehouse-<timestamp>.json` file in `~/powerint-backups`.

**Stock history**
- To remove the starting balance, delete the rows whose `type` is `starting_balance`, and `migrations/stockHistoryStartingBalance`.
- The `stock-history-starting-balance-<timestamp>.json` file holds `stockMovements` as it was before step 9.

**Delivered date**
- The old code ignores `deliveredAt`. To undo step 10, use the backup file it wrote.

## Reference: what changed for orders (25)

- **Order approval** holds the stock (`reservedQty`) instead of taking it off a warehouse. Available stock (`stockQty`) still drops at approval, as before.
- **Posting the delivery** takes the units from the chosen warehouse. It is refused if that warehouse does not have every line. Moving a posted delivery to another warehouse puts the units back into the first warehouse and takes them from the new one.
- **Moving an approved order to a status that counts as delivered** (Completed) is refused until its delivery is posted, since posting is what takes the stock from a warehouse.
- Orders approved before the deploy took their stock off the single count already. Posting them moves no stock, so nothing is taken twice.

## Reference: what writes a stock history row (27)

One row per warehouse whose count changes, written in the same update as the change:

| Action | Rows |
| --- | --- |
| Receive purchase (final approval) | one Purchase per warehouse in the split |
| New product's opening stock (final approval) | one Opening stock per warehouse |
| Transfer stock (final approval) | Transfer out + Transfer in |
| Stock adjustment (final approval) | Adjustment, or Damage when that is the reason |
| Delivery posted | one Sale per product, from the posting warehouse |
| Posted delivery moved to another warehouse | Return into the old one + Sale from the new one |
| Order approved / cancelled / reopened | none: it holds or frees stock, no warehouse count changes |
| `scripts/cleanup-demo-data.mjs` | a Return for stock it puts back on a shelf |

The balance is the warehouse's count after the change, worked out from what the app has loaded at that moment. If two people move the same product in the same warehouse in the same second, the counts stay right, but one row's balance can miss the other's change.
