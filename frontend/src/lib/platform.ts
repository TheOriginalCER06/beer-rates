// Website or phone app? The same code runs in both:
//  - Website (browser / installed web app): same origin as the server, session cookie + CSRF token.
//  - Android/iOS app (Capacitor): the bundled files are served from https://localhost (Android) or
//    capacitor://localhost (iOS), and every request goes to the server with a bearer token.
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

export const isNative = Capacitor.isNativePlatform()
export const platform = Capacitor.getPlatform() as 'web' | 'android' | 'ios'

export const DEFAULT_SERVER = (import.meta.env.VITE_SERVER_URL ?? 'https://xn--l-4ga.cer06.no').replace(/\/+$/, '')
const SERVER_KEY = 'server-url'
const TOKEN_KEY = 'api-token'

let server = DEFAULT_SERVER
let token: string | null = null

/** Read the saved server address and login before the app starts (Preferences is async). */
export async function loadNativeSettings(): Promise<void> {
  if (!isNative) return
  const [savedServer, savedToken] = await Promise.all([
    Preferences.get({ key: SERVER_KEY }),
    Preferences.get({ key: TOKEN_KEY }),
  ])
  server = savedServer.value || DEFAULT_SERVER
  token = savedToken.value || null
}

export function serverUrl(): string {
  return isNative ? server : ''
}

/** Show the server as people know it (øl.cer06.no rather than xn--l-4ga.cer06.no). */
export function serverLabel(): string {
  try {
    const host = new URL(isNative ? server : window.location.origin).hostname
    return host === 'xn--l-4ga.cer06.no' ? 'øl.cer06.no' : host
  } catch {
    return server
  }
}

export async function setServerUrl(url: string): Promise<void> {
  let value = url.trim().replace(/\/+$/, '')
  if (value && !/^https?:\/\//.test(value)) value = `https://${value}`
  // URL() turns øl.cer06.no into xn--l-4ga.cer06.no.
  server = value ? new URL(value).origin : DEFAULT_SERVER
  await Preferences.set({ key: SERVER_KEY, value: server })
}

/** Absolute URL for an API path (relative on the website). */
export function apiUrl(path: string): string {
  return serverUrl() + path
}

/** Photos come back as /media/... paths; the apps need the server in front. */
export function mediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  return /^(https?:|blob:|data:)/.test(path) ? path : serverUrl() + path
}

export function getToken(): string | null {
  return token
}

export async function setToken(value: string | null): Promise<void> {
  token = value
  if (value) await Preferences.set({ key: TOKEN_KEY, value })
  else await Preferences.remove({ key: TOKEN_KEY })
}

function getCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`))
    ?.split('=')[1]
}

/** Headers that authenticate a request: the bearer token in the apps, the CSRF token on the website. */
export function authHeaders(): Record<string, string> {
  if (isNative) {
    // "anonymous" before login: the server then treats the request as a logged-out app (no CSRF).
    return { Authorization: `Bearer ${token ?? 'anonymous'}` }
  }
  return { 'X-CSRFToken': getCookie('csrftoken') ?? '' }
}

/** Makes sure Django has set the `csrftoken` cookie before the first mutation (website only). */
export async function ensureCsrfCookie(): Promise<void> {
  if (!isNative && !getCookie('csrftoken')) {
    await fetch('/api/csrf/', { credentials: 'same-origin' })
  }
}

/** A short name for this device, stored with the app login so people can tell their phones apart. */
export function deviceName(): string {
  const ua = navigator.userAgent
  const model = /Android [\d.]+; ([^;)]+)/.exec(ua)?.[1]?.replace(/ Build.*$/, '')
  if (platform === 'android') return model ? `Android (${model})` : 'Android'
  if (platform === 'ios') return /iPad/.test(ua) ? 'iPad' : 'iPhone'
  return 'Browser'
}
