import { readFileSync } from 'node:fs'

import { defineConfig, devices } from '@playwright/test'

// Point the tests at another server (such as a production build) with E2E_BASE_URL.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

/** The database URL the app under test will use: the environment wins over .env files, as in Next. */
function databaseURL() {
  if (process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL) return process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
  for (const file of ['.env.local', '.env']) {
    try {
      const line = readFileSync(file, 'utf8').split('\n').find((row) => row.trim().startsWith('NEXT_PUBLIC_FIREBASE_DATABASE_URL='))
      if (line) return line.slice(line.indexOf('=') + 1).trim().replace(/^"|"$/g, '')
    } catch {
      continue
    }
  }
  return ''
}

// The specs create and approve real records, so they run against the emulators
// (`npm run test:e2e:local`) unless ALLOW_LIVE_E2E=1 says the live database is intended.
const emulator =
  process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === '1' && /^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(databaseURL())
if (!emulator && process.env.ALLOW_LIVE_E2E !== '1') {
  throw new Error(
    `Refusing to run E2E tests against ${databaseURL() || 'an unknown database'}. ` +
      'Use `npm run test:e2e:local` for the emulators, or set ALLOW_LIVE_E2E=1 to run against the live database.'
  )
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: emulator
    ? {
        // A fresh server on its own port, so a dev server already running on the live database is never reused.
        command: `npx next dev --webpack --port ${new URL(baseURL).port || 3100}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 180_000,
      }
    : {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 60_000,
      },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
