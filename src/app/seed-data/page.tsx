'use client'

import { useState } from 'react'
import { ref, set } from 'firebase/database'

import { database } from '@/lib/firebase/config'
import { createDefaultERPData } from '@/lib/erp/defaultData'

export default function SeedDataPage() {
  const [status, setStatus] = useState('Ready')
  const [seeding, setSeeding] = useState(false)

  async function seedData() {
    setSeeding(true)
    setStatus('Adding data...')

    try {
      if (!database) {
        throw new Error('Firebase Realtime Database is only available in the browser.')
      }

      await set(ref(database, 'erp'), createDefaultERPData())

      setStatus('✅ Seed data added! Log in with phone 01844902338 / password 123456 (Admin: Robin).')
    } catch (error) {
      setStatus(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-4 text-2xl font-bold">Seed Realtime Database</h1>

      <div className="mb-4 rounded-lg bg-yellow-50 p-4">
        <p className="text-sm text-yellow-800">
          ⚠️ This overwrites the entire <code>erp</code> node in Realtime Database with the app&apos;s default demo
          data (users, roles, products, warehouses, suppliers, customers, settings). Only run this once, on a fresh
          database.
        </p>
      </div>

      <button
        onClick={seedData}
        disabled={seeding}
        className="rounded bg-blue-500 px-6 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
      >
        {seeding ? 'Adding...' : 'Add Default Data'}
      </button>

      <div className="mt-4 rounded bg-gray-100 p-4">
        <p className="font-mono text-sm">{status}</p>
      </div>
    </div>
  )
}
