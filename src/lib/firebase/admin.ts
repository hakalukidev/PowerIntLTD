<<<<<<< HEAD
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

function getAdminApp(): App {
  const existing = getApps().find((app) => app.name === ADMIN_APP_NAME)
  if (existing) {
    return existing
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
=======
import 'server-only'

import { cert, getApps, initializeApp, applicationDefault, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getDatabase } from 'firebase-admin/database'

function getAdminApp(): App {
  const existing = getApps()[0]
  if (existing) return existing

  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  const credential = rawKey ? cert(JSON.parse(rawKey)) : applicationDefault()

  return initializeApp({
    credential,
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  })
}

export function adminAuth() {
  return getAuth(getAdminApp())
}

export function adminDatabase() {
>>>>>>> 64d31e6 (update)
  return getDatabase(getAdminApp())
}
