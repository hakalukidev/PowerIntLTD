# Deploying 02 (two-stage approval) and 01 (role permission matrix) together

Deploy off-hours. **From step 3 until step 5 is live, nobody edits roles** in Role Management. The
old role editor drops permission ids it does not know (`approvals.*`, `<module>.create`), so a role
saved there in that window loses them. Step 6 shows how to repair a role if that happens anyway.

All commands run from the repository root with the live service account in `.env` / `.env.local`.
Every script below is a dry run unless given `--apply`; read its output before applying.

1. **Back up live**

   ```sh
   node scripts/backup-database.mjs ~/powerint-backups
   ```

2. **Deploy the database rules** (02)

   ```sh
   node scripts/deploy-database-rules.mjs
   ```

   Without it approvals get slower as data grows and the server logs index warnings.

3. **Grant the approval permissions** (02). Must be before the code deploy, or only admins can
   review and nearly everything gets stuck.

   ```sh
   node scripts/grant-approval-permissions.mjs            # dry run: check it lists authorizer and chairman
   node scripts/grant-approval-permissions.mjs --apply
   ```

4. **Split Edit into Create + Edit on stored roles** (01). Must be before the code deploy, or every
   stored role with Edit loses its Add/New buttons until it runs.

   ```sh
   node scripts/split-edit-permission.mjs                                         # dry run: lists each role and the .create ids it gets
   node scripts/split-edit-permission.mjs --apply --backup ~/powerint-backups
   ```

   It only adds permissions, saves `erp/roles` to the backup folder first, and records itself at
   `migrations/editCreateSplit`, so a second `--apply` is refused.

5. **Deploy the code**: push to `main` for the Vercel project `crm`, or `npx vercel --prod`. No new
   environment variables. Pending supplier payments, expenses and record changes restart at the
   Authorizer stage.

6. **Verify the scripts** (straight after the deploy)

   ```sh
   node scripts/grant-approval-permissions.mjs     # expect: authorizer / chairman "already has …"
   node scripts/split-edit-permission.mjs          # expect: "Nothing to change"
   ```

   If the second one lists a role, it was saved in the old role editor during the window and lost
   its Create permissions. Give them back for that role only:

   ```sh
   node scripts/split-edit-permission.mjs --apply --only <thatRoleId> --backup ~/powerint-backups
   ```

   (`--only` takes a comma-separated list and is the only way past the "already applied" guard.)
   If a role lost `approvals.*`, run step 3 again with `--apply`.

7. **Smoke test on live**
   - Role Management → edit a role: the permission editor is the Module / View / Create / Edit /
     Delete matrix, with an Approvals group at the bottom.
   - The Authorizer role has "Authorize submissions (stage 1)" ticked; the Chairman role has
     "Final approval (stage 2)" ticked.
   - Head of Sales has Create ticked next to Edit for sales, dealers, credit sheet, zones and leads.
     Owner and Manager look as before (Owner view-only; Manager with Create and Edit on the sales chain).
   - Submit a small deposit dated yesterday; the Authorizer authorizes, the Chairman rejects: nothing
     should change.
   - Final-approve one real pending item: it appears on its own date in the credit sheet and that
     day's Daily closing, and the dealer's due changes.
   - Vercel logs show `/api/erp/recompute-due` returning 200.

8. **Optional**: `node scripts/recompute-dealer-dues.mjs` (dry run) should report no differences.

## Rollback

Redeploy the previous commit. The new permissions, indexes and the `migrations/editCreateSplit`
marker don't affect the old code: it ignores `approvals.*` and `<module>.create`, and stored roles
still carry `<module>.edit`, which the old code reads as "Create & edit". Pending purchases just sit
unused.

Avoid editing roles while rolled back (the old editor would drop the new ids again). If you do and
then roll forward, repeat step 6. To put `erp/roles` back exactly as it was before step 4, use the
`split-edit-permission-<timestamp>.json` file that step 4 wrote to `~/powerint-backups`.
