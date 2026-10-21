/**
 * Runs the Playwright suite against the Firebase Emulator Suite instead of the live project:
 * starts the Auth and Realtime Database emulators, seeds them from the latest backup, then runs
 * Playwright (which starts its own Next dev server on the emulators). The emulators stop when
 * the tests finish.
 *
 * Usage:
 *   npm run test:e2e:local                         # every spec
 *   npm run test:e2e:local -- sales customer-ledger  # extra arguments go to `playwright test`
 */

import { spawnSync } from 'node:child_process'

const env = process.env
if (env.NEXT_PUBLIC_FIREBASE_EMULATOR !== '1' || !env.FIREBASE_AUTH_EMULATOR_HOST || !env.FIREBASE_DATABASE_EMULATOR_HOST) {
  console.error('Emulator settings missing. Copy .env.test.example to .env.test and run through `npm run test:e2e:local`.')
  process.exit(1)
}

const args = process.argv.slice(2)

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', env })
  return result.status ?? 1
}

if (args[0] === '--inner') {
  // Runs inside `firebase emulators:exec`, once the emulators are up.
  const seeded = run('node', ['scripts/seed-emulator.mjs'])
  if (seeded !== 0) process.exit(seeded)
  // The backup's stored roles predate the approval permissions; give them as a live deploy would.
  const granted = run('node', ['scripts/grant-approval-permissions.mjs', '--apply'])
  process.exit(granted === 0 ? run('npx', ['playwright', 'test', ...args.slice(1)]) : granted)
}

const quote = (value) => `'${value.replace(/'/g, `'\\''`)}'`
const inner = ['node', 'scripts/e2e-local.mjs', '--inner', ...args].map(quote).join(' ')
process.exit(
  run('npx', ['firebase', 'emulators:exec', '--only', 'auth,database', '--project', env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, inner])
)
