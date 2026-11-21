// Push notifications. Website: Web Push through the service worker (public/sw.js). Android app:
// Firebase Cloud Messaging (only when the app was built with Firebase, VITE_NATIVE_PUSH=true,
// and the server has a service account, siteConfig.pushFcm).
import { PushNotifications } from '@capacitor/push-notifications'
import { isNative, platform } from './platform'

export const nativePushBuilt = isNative && platform === 'android' && import.meta.env.VITE_NATIVE_PUSH === 'true'

export function webPushSupported(): boolean {
  return !isNative && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** iPhone/iPad only allow web push for apps added to the home screen (iOS 16.4+). */
export function needsHomeScreen(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const standalone = window.matchMedia('(display-mode: standalone)').matches
  return !isNative && ios && !standalone
}

/** Registered on start-up (website only): makes it installable, works offline, gets pushes. */
export function registerServiceWorker(): void {
  if (isNative || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function encode(buffer: ArrayBuffer | null): string {
  if (!buffer) return ''
  let raw = ''
  for (const b of new Uint8Array(buffer)) raw += String.fromCharCode(b)
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function currentWebSubscription(): Promise<PushSubscription | null> {
  if (!webPushSupported()) return null
  const registration = await navigator.serviceWorker.getRegistration('/')
  return registration ? registration.pushManager.getSubscription() : null
}

/** Ask for permission and subscribe this browser. Throws 'denied' if the user says no. */
export async function subscribeWeb(publicKey: string): Promise<{ endpoint: string; p256dh: string; auth: string }> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('denied')
  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
  return {
    endpoint: subscription.endpoint,
    p256dh: encode(subscription.getKey('p256dh')),
    auth: encode(subscription.getKey('auth')),
  }
}

export async function unsubscribeWeb(): Promise<string | null> {
  const subscription = await currentWebSubscription()
  if (!subscription) return null
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  return endpoint
}

/** Android app: ask for permission and get the Firebase token. Throws 'denied' if the user says no. */
export async function registerNative(): Promise<string> {
  let permission = await PushNotifications.checkPermissions()
  if (permission.receive !== 'granted') permission = await PushNotifications.requestPermissions()
  if (permission.receive !== 'granted') throw new Error('denied')
  await PushNotifications.createChannel({ id: 'default', name: 'Beer Rates', importance: 4 }).catch(() => undefined)
  return new Promise((resolve, reject) => {
    void PushNotifications.addListener('registration', (token) => resolve(token.value))
    void PushNotifications.addListener('registrationError', (error) => reject(new Error(error.error)))
    void PushNotifications.register()
  })
}

/** Android app: open the drink (or page) a tapped notification is about. */
export function onNativeNotificationTap(navigate: (path: string) => void): void {
  if (!nativePushBuilt) return
  void PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const url = (action.notification.data as { url?: string } | undefined)?.url
    if (url?.startsWith('/')) navigate(url)
  })
}
