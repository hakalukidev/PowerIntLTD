'use client'

import { useEffect } from 'react'

/** Registers public/sw.js in production builds only, so dev and E2E runs never see a service worker. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Installability is a nice-to-have; the app works the same without it.
    })
  }, [])
  return null
}
