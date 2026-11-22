// Opening the Android app from the home screen: the long-press shortcuts on the app icon and the
// quick-add widget open links like drikkevurderinger://add?photo=camera (android/app/src/main/
// res/xml/shortcuts.xml and QuickAddWidget.java). The add form then starts the camera or scanner.
import { App } from '@capacitor/app'
import { isNative } from './platform'

export type QuickAction = 'camera' | 'gallery' | 'barcode'
const ACTIONS: QuickAction[] = ['camera', 'gallery', 'barcode']

export function asQuickAction(value: string | null): QuickAction | null {
  return ACTIONS.find((action) => action === value) ?? null
}

/** The app's page for a drikkevurderinger:// link, or null for any other link. */
export function pathForLink(url: string): string | null {
  const match = /^drikkevurderinger:\/*([^?#]*)(?:\?([^#]*))?/i.exec(url)
  if (!match || match[1].replace(/\/+$/, '') !== 'add') return null
  const action = asQuickAction(new URLSearchParams(match[2] ?? '').get('photo'))
  return action ? `/add?photo=${action}` : '/add'
}

// Module state, not the caller's: App re-subscribes as it re-renders, and the link the app was
// started with must still only be followed once.
let launchHandled = false
let last = { url: '', at: 0 }

export function onQuickAction(callback: (path: string) => void): () => void {
  if (!isNative) return () => undefined
  const open = (url: string | undefined) => {
    const path = url ? pathForLink(url) : null
    if (!url || !path) return
    if (url === last.url && Date.now() - last.at < 1500) return // the same tap reported twice
    last = { url, at: Date.now() }
    callback(path)
  }
  if (!launchHandled) {
    launchHandled = true
    void App.getLaunchUrl().then((launch) => open(launch?.url))
  }
  // Taps while the app is already running.
  const handle = App.addListener('appUrlOpen', (event) => open(event.url))
  return () => void handle.then((h) => h.remove())
}
