/**
 * Publishes database.rules.json to the Realtime Database using the service
 * account in .env.local, so no interactive `firebase login` is needed.
 *
 *   node scripts/deploy-database-rules.mjs
 */
import { readFileSync } from 'node:fs'
import { cert, initializeApp } from 'firebase-admin/app'

for (const raw of readFileSync('.env.local', 'utf8').split('\n')) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  const at = line.indexOf('=')
  if (at === -1) continue
  const key = line.slice(0, at).trim()
  let value = line.slice(at + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  if (process.env[key] === undefined) process.env[key] = value
}

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
})

const rules = readFileSync('database.rules.json', 'utf8')
JSON.parse(rules) // fail early on a typo rather than shipping broken rules

const { access_token: token } = await app.options.credential.getAccessToken()
const base = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL.replace(/\/$/, '')

const response = await fetch(`${base}/.settings/rules.json?access_token=${token}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: rules,
})

const body = await response.text()

if (!response.ok) {
  console.error(`Failed (${response.status}): ${body}`)
  process.exit(1)
}

console.log('Database rules published.')
process.exit(0)
