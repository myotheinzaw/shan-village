'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker so staff can install the app on their phone.
 * Only in production: in development it would serve stale build assets.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // A failed registration must never break the page; the app works
        // perfectly well without it.
      })
    }

    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  return null
}
