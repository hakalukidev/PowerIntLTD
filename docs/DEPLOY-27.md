# Deploying 27 (stock history)

Deploy off-hours, when nobody is receiving, transferring, adjusting or delivering stock. Do this
after 25 (stock per warehouse) is deployed and its migration applied. All commands run from the
repository root with the live service account in `.env` / `.env.local`. Scripts are dry runs
unless given `--apply`; read their output before applying.

The history is stored at `stockMovements`, next to `erp` rather than inside it, so it is not
loaded with the rest of the data. It is read only when the Stock history tab, a product's "Show
stock history" or a warehouse's History is open, filtered (by default the last 30 days) and a page
at a time.

1. **Back up live**

   ```sh
   node scripts/backup-database.mjs ~/powerint-backups
   ```

   Backups now also hold `stockMovements` and `migrations` (the migration markers), and
   `scripts/seed-emulator.mjs` loads them.

2. **Publish the database rules.** This must happen before the code deploy: the new code writes every
   stock change and its history rows in one update, and without the rules for `stockMovements` the
   whole update (the stock change too) is refused.

   ```sh
   node scripts/deploy-database-rules.mjs
   ```

   What changes: a new `stockMovements` section.
   - Any active user can read it.
   - Rows can only be added, by the user named on the row.
   - Only an admin can delete a row. No screen does this; it exists so test runs can clean up.
   - Indexes on `date`, `productId`, `warehouseId`, `productDay` and `warehouseDay`.

   The `erp` rules are unchanged, so the old code keeps working with the new rules.

3. **Deploy the code**: push to `main` for the Vercel project `crm`, or `npx vercel --prod`. No new
   environment variables.

4. **Make sure everyone is on the new code.** Ask staff to close and reopen the app (the installed
   app too). Stock moved by old code is not written to the history.

5. **Write the starting balance**: one "Starting balance" row per product per warehouse with its
   current count, dated today. The history starts from it; older movements are not rebuilt.
   This step must come after 25's migration (`migrate-stock-by-warehouse.mjs --apply`), and the script refuses to run until that migration has been applied.

   ```sh
   node scripts/stock-history-starting-balance.mjs                                    # dry run
   node scripts/stock-history-starting-balance.mjs --apply --backup ~/powerint-backups
   ```

   The dry run lists every row it will write. It also lists, and skips:
   - products not split by warehouse yet;
   - counts in warehouses that no longer exist.

   It also says how many rows the app already wrote since step 3. There should be none if nobody moved stock.

   `--apply` first saves `erp/products` and `stockMovements` to the backup folder. It then writes the rows, checks they are all there, and records itself at
   `migrations/stockHistoryStartingBalance`, so a second `--apply` is refused.

6. **Verify**: run the dry run again. Expect "Already applied" and the same rows. On Inventory /
   Stock → Stock history, set the date range to today: one Starting balance row per product and
   warehouse.

7. **Smoke test on live**
   - Transfer 1 unit of a cheap product and approve it through both stages. Stock history shows a
     Transfer out and a Transfer in, each with the warehouse's new count.
   - Open that product's details → Show stock history: the same two rows under its Starting balance.
   - Warehouse control → History on one of the two warehouses: only that warehouse's rows.
   - Export Excel from the Stock history tab and open the file.

## What writes a row

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

The balance is the warehouse's count after the change, worked out from what the app has loaded at
that moment. If two people move the same product in the same warehouse in the same second, the
stock counts stay right, but one row's balance can miss the other's change.

`scripts/cleanup-demo-data.mjs` writes a Return row for stock it puts back on a shelf.

## Rollback

Redeploy the previous commit; leave the rules as they are (the old code does not use
`stockMovements`). While rolled back, stock moves without history rows, so the history has a gap:
the next row after rolling forward shows the right balance, but the movements in between are
missing. To remove the starting balance, delete the rows whose `type` is `starting_balance` and
`migrations/stockHistoryStartingBalance` (the backup file from step 5 holds `stockMovements` as
it was before).
