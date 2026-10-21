import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getDatabase } from 'firebase-admin/database'

const ADMIN_APP_NAME = 'erp-admin'

function readServiceAccount() {
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Server is missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY.'
    )
  }

  return { projectId, clientEmail, privateKey }
}

/**
 * Local E2E runs (.env.test) use the Firebase Emulator Suite. The Admin SDK sends auth and
 * database calls to FIREBASE_AUTH_EMULATOR_HOST and FIREBASE_DATABASE_EMULATOR_HOST itself; this
 * also leaves the real service account unused so a test server cannot reach the live project.
 */
export function isEmulatorMode() {
  return process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === '1'
}

function getAdminApp(): App {
  const existing = getApps().find((app) => app.name === ADMIN_APP_NAME)
  if (existing) {
    return existing
  }

  if (isEmulatorMode()) {
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
      throw new Error('Emulator mode needs FIREBASE_AUTH_EMULATOR_HOST and FIREBASE_DATABASE_EMULATOR_HOST.')
    }
    return initializeApp(
      { projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL },
      ADMIN_APP_NAME
    )
  }

  return initializeApp(
    {
      credential: cert(readServiceAccount()),
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    },
    ADMIN_APP_NAME
  )
}

export function getAdminAuth() {
  return getAuth(getAdminApp())
}

export function getAdminDatabase() {
  return getDatabase(getAdminApp())
}
