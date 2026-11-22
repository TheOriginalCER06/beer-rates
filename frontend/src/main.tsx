import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './app.css'
import './i18n'

import { ApolloProvider } from '@apollo/client/react'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { client } from './apollo'
import App from './App'
import { keepSaving, restoreIfOffline } from './lib/offline'
import { startOutbox } from './lib/outbox'
import { ensureCsrfCookie, isNative, loadNativeSettings } from './lib/platform'
import { registerServiceWorker } from './lib/push'
import { theme } from './theme'

async function setUpNative() {
  if (!isNative) return
  document.documentElement.classList.add('native')
  const [{ StatusBar, Style }, { SplashScreen }, { Keyboard }] = await Promise.all([
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
    import('@capacitor/keyboard'),
  ])
  await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined)
  // The bottom tab bar hides while typing, so it never sits on top of the keyboard.
  void Keyboard.addListener('keyboardWillShow', () => document.documentElement.classList.add('keyboard-open'))
  void Keyboard.addListener('keyboardWillHide', () => document.documentElement.classList.remove('keyboard-open'))
  void SplashScreen.hide()
}

function render() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MantineProvider theme={theme} defaultColorScheme="auto">
        <Notifications position="top-center" containerWidth={420} />
        <ApolloProvider client={client}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ApolloProvider>
      </MantineProvider>
    </StrictMode>,
  )
}

// Cloudflare's hotlink protection refuses photos requested from pages on another site, and the
// app's pages come from https://localhost. Without a referer, Cloudflare lets them through.
if (isNative) {
  const referrer = document.createElement('meta')
  referrer.name = 'referrer'
  referrer.content = 'no-referrer'
  document.head.appendChild(referrer)
}

registerServiceWorker()
void (async () => {
  await loadNativeSettings().catch(() => undefined)
  // Offline: start from what was saved last time (lib/offline.ts).
  restoreIfOffline(client)
  keepSaving(client)
  await ensureCsrfCookie().catch(() => undefined)
  render()
  startOutbox(client)
  void setUpNative()
})()
