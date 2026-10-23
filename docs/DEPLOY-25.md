# Deploying 25 (stock per warehouse)

> **Replaced by [DEPLOY.md](DEPLOY.md).** Kept for reference only; deploy with the single checklist in DEPLOY.md, which merges this file with the others in the right order.

Deploy off-hours, when nobody is receiving, transferring or delivering stock. All commands run
from the repository root with the live service account in `.env` / `.env.local`. The script is a
dry run unless given `--apply`; read its output before applying.

1. **Back up live**

   ```sh
   node scripts/backup-database.mjs ~/powerint-backups
   ```

2. **Deploy the code**: push to `main` for the Vercel project `crm`, or `npx vercel --prod`. No new
   environment variables or database rules.

   The new code works before the migration: a product that is not split yet counts its whole stock
   in its main warehouse, and is split the first time its stock moves.

3. **Make sure everyone is on the new code.** Ask staff to close and reopen the app (the installed
   app too). Old code still changes the single stock count without the warehouse counts, so a
   product split while old code is in use stops adding up.

4. **Split each product's stock into its main warehouse.** Must be after the code deploy (step 2).

   ```sh
   node scripts/migrate-stock-by-warehouse.mjs                                    # dry run
   node scripts/migrate-stock-by-warehouse.mjs --apply --backup ~/powerint-backups
   ```

   The dry run lists, per product, the total before and after (always the same: the total is never
   written) and the warehouse it goes into. It also lists:
   - products whose main warehouse no longer exists, and products with stock below zero (both are skipped);
   - products that look like the same item entered once per warehouse (same name or model/SKU).
     They are **not merged**; decide by hand which to keep.

   `--apply` saves `erp/products` to the backup folder first, checks every total again after
   writing, and records itself at `migrations/stockByWarehouse`, so a second `--apply` is refused.
   To split products it skipped (after fixing their main warehouse), name them:

   ```sh
   node scripts/migrate-stock-by-warehouse.mjs --apply --only <productId,...> --backup ~/powerint-backups
   ```

5. **Verify**: run the dry run again. Expect "Nothing to write" and "0 of them not adding up".

6. **Optional: a Cancelled status.** Sales → Manage statuses → Add status, tick "Cancels the order".
   An approved order moved there before its delivery is posted gives its stock back.

7. **Smoke test on live**
   - Inventory: the Warehouse column lists stock by warehouse; Edit product shows stock read-only.
   - Receive 2 units of a cheap product split 1 + 1 over two warehouses; after both approvals the
     Approvals → Stock & warehouse report shows 1 in each.
   - Transfer 1 unit back; it moves only after the Chairman's approval.
   - Post one delivery; the warehouse picker says what that warehouse has of each line.

## What changed for orders

- **Order approval** now holds the stock (`reservedQty`) instead of taking it off a warehouse.
  Available stock (`stockQty`) still drops at approval, as before.
- **Posting the delivery** takes the units from the chosen warehouse, and is refused if that
  warehouse does not have every line. Moving a posted delivery to another warehouse puts the units
  back into the first warehouse and takes them from the new one.
- **Moving an approved order to a status that counts as delivered** (Completed) is refused until
  its delivery is posted, since posting is what takes the stock from a warehouse.
- Orders approved before this deploy took their stock off the single count already. Posting them
  moves no stock, so nothing is taken twice.

## Rollback

Redeploy the previous commit. The old code ignores `stockByWarehouse`, `reservedQty`, the
transfers and the adjustments; it keeps using `stockQty`, which stays correct. Pending transfers and
adjustments, including new products' opening stock, just wait.

While rolled back, stock that moves on a split product (a purchase approved, an order approved)
changes only the single count, so its warehouse counts no longer add up, and orders posted for
delivery stay "held". After rolling forward, the migration's dry run lists those products under
"not adding up"; correct each with a Stock adjustment. To put `erp/products` back exactly as it was before step 4, use the
`migrate-stock-by-warehouse-<timestamp>.json` file in `~/powerint-backups`.
