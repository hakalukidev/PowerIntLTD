import { readFileSync } from 'node:fs'

import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { get, getDatabase, ref, remove, set, update } from 'firebase/database'

import { ADMIN_EMAIL, ADMIN_PASSWORD } from '../auth'

/**
 * Direct database access for seeding and cleaning up test records, signed in as
 * the same admin the browser tests use. It talks to the real Firebase project in
 * .env, so every helper here is only used on records the test itself created.
 */
function readEnv() {
  const env: Record<string, string> = {}
  for (const file of ['.env', '.env.local']) {
    let text = ''
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      const index = line.indexOf('=')
      if (index > 0 && !line.trimStart().startsWith('#')) {
        env[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^"|"$/g, '')
      }
    }
  }
  return env
}

export type AdminDb = Awaited<ReturnType<typeof connectAsAdmin>>

export async function connectAsAdmin() {
  const env = readEnv()
  const app: FirebaseApp = initializeApp(
    {
      apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      databaseURL: env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
      appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
    },
    `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  const auth = getAuth(app)
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD)
  const db = getDatabase(app)

  return {
    async read<T>(path: string) {
      return (await get(ref(db, path))).val() as T | null
    },
    set: (path: string, value: unknown) => set(ref(db, path), value),
    update: (path: string, value: Record<string, unknown>) => update(ref(db, path), value),
    remove: (path: string) => remove(ref(db, path)),
    idToken: () => auth.currentUser!.getIdToken(),
    close: () => deleteApp(app),
  }
}

/** A dealer record with every field the app expects, for seeding test dealers. */
export function testDealer(id: string, name: string, phone: string, zoneId: string, subZone = '') {
  const now = new Date().toISOString()
  return {
    id,
    name,
    company: 'E2E Test Owner',
    phone,
    email: '',
    location: 'E2E test address',
    due: 0,
    leadSource: 'local-marketing',
    reminderCustomer: false,
    nid: '',
    tradeLicenseNo: '',
    nomineeName: '',
    nomineeNid: '',
    thana: subZone,
    district: '',
    chequeNumber: '',
    bankName: '',
    branchName: '',
    nidCopyUrl: '',
    nidCopyPublicId: '',
    tradeLicenseCopyUrl: '',
    tradeLicenseCopyPublicId: '',
    passportPhotoUrl: '',
    passportPhotoPublicId: '',
    bankDocumentUrl: '',
    bankDocumentPublicId: '',
    dealerPhotoUrl: '',
    dealerPhotoPublicId: '',
    signatureUrl: '',
    signaturePublicId: '',
    zoneId,
    createdAt: now,
    updatedAt: now,
  }
}
