// Offline view: the Apollo cache is saved on the device and loaded again when the app starts
// without a connection, so the last-seen drinks still show. The service worker (public/sw.js)
// keeps the website's own files; the phone apps have them built in. Logging out deletes the copy.
import type { ApolloClient } from '@apollo/client'
import { useEffect, useState } from 'react'

const KEY = 'beer-offline-cache-v1'
const SAVE_EVERY_MS = 15_000

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/** Start from the saved cache if there's no connection. */
export function restoreIfOffline(client: ApolloClient): boolean {
  if (!isOffline()) return false
  try {
    const saved = localStorage.getItem(KEY)
    if (!saved) return false
    client.cache.restore(JSON.parse(saved))
    return true
  } catch {
    return false
  }
}

/** Save the cache now and then, and when the app goes to the background. */
export function keepSaving(client: ApolloClient): void {
  let last = ''
  const save = () => {
    if (isOffline()) return // keep what we had while online
    try {
      const snapshot = JSON.stringify(client.cache.extract())
      if (snapshot === last) return
      last = snapshot
      if (snapshot.includes('"drinks(')) localStorage.setItem(KEY, snapshot)
    } catch {
      // Storage full or blocked: offline view just isn't available.
    }
  }
  window.setInterval(save, SAVE_EVERY_MS)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && save())
}

export function forgetSaved(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing saved, or storage blocked.
  }
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(!isOffline())
  useEffect(() => {
    const update = () => setOnline(!isOffline())
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}
