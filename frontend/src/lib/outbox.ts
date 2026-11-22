// Upload queue: drinks (and photos) saved without a connection wait here, in IndexedDB on the
// device, and are sent when the connection is back. Each drink has a clientId, so a create that
// reached the server but whose answer got lost isn't added twice.
import type { ApolloClient } from '@apollo/client'
import { CombinedGraphQLErrors } from '@apollo/client'
import { createStore, del, get, keys, set } from 'idb-keyval'
import { useEffect, useState } from 'react'
import { CREATE_DRINK, type DrinkInput } from '../graphql/operations'
import { uploadPhoto, UploadError } from './upload'

export interface OutboxEntry {
  /** Also the drink's clientId. */
  id: string
  kind: 'drink' | 'photo'
  input?: DrinkInput
  /** kind 'photo': the drink on the server. kind 'drink': set once the drink itself is saved. */
  drinkId?: string
  photo?: Blob
  createdAt: number
  attempts: number
  /** Set when the server refused it (not a network problem): shown, not retried automatically. */
  error?: string
}

const store = createStore('beer-rates', 'outbox')
const CHANGED = 'beer-outbox-changed'

function changed() {
  window.dispatchEvent(new Event(CHANGED))
}

export function newClientId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  const ids = (await keys(store)) as string[]
  const entries = await Promise.all(ids.map((id) => get<OutboxEntry>(id, store)))
  return entries.filter((e): e is OutboxEntry => !!e).sort((a, b) => a.createdAt - b.createdAt)
}

export async function addToOutbox(entry: Omit<OutboxEntry, 'createdAt' | 'attempts'>): Promise<void> {
  await set(entry.id, { ...entry, createdAt: Date.now(), attempts: 0 }, store)
  changed()
}

export async function removeFromOutbox(id: string): Promise<void> {
  await del(id, store)
  changed()
}

async function save(entry: OutboxEntry) {
  await set(entry.id, entry, store)
  changed()
}

/** True for "no connection" problems (retry later), false when the server refused the data. */
export function isNetworkError(error: unknown): boolean {
  if (CombinedGraphQLErrors.is(error)) return false
  if (error instanceof UploadError) return error.code === 'SERVER_ERROR'
  return true
}

function errorText(error: unknown): string {
  if (CombinedGraphQLErrors.is(error)) return error.errors.map((e) => e.extensions?.code ?? e.message).join(', ')
  if (error instanceof UploadError) return error.code
  return String(error)
}

let running: Promise<number> | null = null

/** Send everything that's waiting. Returns how many were sent. Safe to call often. */
export function flushOutbox(client: ApolloClient): Promise<number> {
  if (running) return running
  running = (async () => {
    let sent = 0
    for (const entry of await listOutbox()) {
      if (entry.error) continue
      try {
        if (entry.kind === 'drink' && !entry.drinkId && entry.input) {
          const result = await client.mutate({
            mutation: CREATE_DRINK,
            variables: { input: entry.input, clientId: entry.id },
          })
          entry.drinkId = result.data?.createDrink.id
          await save(entry)
        }
        if (entry.photo && entry.drinkId) await uploadPhoto(entry.drinkId, entry.photo)
        await removeFromOutbox(entry.id)
        sent += 1
      } catch (error) {
        entry.attempts += 1
        const network = isNetworkError(error)
        if (!network) entry.error = errorText(error)
        await save(entry)
        // No connection: the rest would fail too.
        if (network) break
      }
    }
    if (sent) await client.refetchQueries({ include: 'active' })
    return sent
  })().finally(() => {
    running = null
  })
  return running
}

/** Try a refused entry again. */
export async function retryEntry(id: string): Promise<void> {
  const entry = await get<OutboxEntry>(id, store)
  if (entry) await save({ ...entry, error: undefined })
}

export function useOutbox(): OutboxEntry[] {
  const [entries, setEntries] = useState<OutboxEntry[]>([])
  useEffect(() => {
    let alive = true
    const load = () => void listOutbox().then((list) => alive && setEntries(list))
    load()
    window.addEventListener(CHANGED, load)
    return () => {
      alive = false
      window.removeEventListener(CHANGED, load)
    }
  }, [])
  return entries
}

/** Flush on start, when the connection comes back, when the app returns to the foreground, and every 30 s. */
export function startOutbox(client: ApolloClient): void {
  const flush = () => {
    if (navigator.onLine !== false) void flushOutbox(client).catch(() => undefined)
  }
  flush()
  window.addEventListener('online', flush)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && flush())
  window.setInterval(() => {
    void listOutbox().then((list) => list.some((e) => !e.error) && flush())
  }, 30_000)
}
