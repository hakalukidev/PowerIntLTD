# Power International BD ERP — prompts from client meeting 2

Copy this folder into the repo next to the first set, e.g. `docs/agent-prompts-2/`, so the screenshot paths work.

Suggested order: 17 → 16 → 18 → 19 → 24 → 23 → 25 → 26 → 27 → 21 → 22 → 20

| # | Task |
|---|------|
| 16 | [Make the app installable on phones with the company "PI" icon](prompts/16-pwa-install-app-icon.md) |
| 17 | [Sidebar: white in light mode, no visible scrollbar](prompts/17-sidebar-light-mode-and-scrollbar.md) |
| 18 | [Sales & Billing: filter by zone and sub-zone](prompts/18-sales-zone-subzone-filter.md) |
| 19 | [Show "Delivered date" (actual delivery) instead of the planned delivery date](prompts/19-sales-delivered-date.md) |
| 20 | [Per-product status inside an order (partial delivery)](prompts/20-order-item-level-status.md) |
| 21 | [Quantity-based prices (tiers) in the Price List, applied on the Order Form](prompts/21-price-list-quantity-tiers.md) |
| 22 | [Cash price and a Credit / Cash choice on the Order Form](prompts/22-cash-price-and-order-type.md) |
| 23 | [Delivery: fix the document upload and write a plain explanation of the flow](prompts/23-delivery-upload-fix-and-flow-doc.md) |
| 24 | [Inventory value: make it clear it is the purchase (cost) value](prompts/24-inventory-value-clarity.md) |
| 25 | [Receive stock into chosen warehouses; one product in several warehouses](prompts/25-multi-warehouse-stock.md) |
| 26 | [Inventory list: one row per item, click for full details](prompts/26-inventory-product-details.md) |
| 27 | [Stock history with dates for every warehouse action](prompts/27-warehouse-stock-history.md) |

## Already done by the first set (check after deploy)
- Up/down spinner arrows in Price List "New price" boxes: removed app-wide by prompt 06.
- Tables too wide on phones: prompt 09 (compact tables, pinned name column).

## On hold (client asked to note these)
- Delivery redesign: the client will send a new design. Prompt 23 only fixes the upload bug and explains the current flow.
- Who handles "To post" / "Posted" in delivery: to be decided with the client when roles are finalised.
- Suppliers & Imports: discussed at the end of the meeting but not in the transcript. Send the audio/transcript of that part to make prompts.

## Confirm with the client
- 22: one cash price for all dealers? Cash orders always fully paid?
- 21: is "latest price wins" between quantity tiers and dealer/zone prices what he wants?
- 24: inventory value at purchase cost (assumed).
