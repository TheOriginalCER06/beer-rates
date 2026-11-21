import type { CapacitorConfig } from '@capacitor/cli'

// The Android and iOS apps bundle the built frontend (dist/) and talk to the server over HTTPS
// with a bearer token (see src/lib/platform.ts). Build: `npm run cap:sync`, then open
// android/ in Android Studio or run the GitHub Actions workflow (see docs: Admin → Phone apps).
const config: CapacitorConfig = {
  appId: 'no.cer06.beerrates',
  appName: 'Beer Rates',
  webDir: 'dist',
  android: {
    // Photos are uploaded straight from the app; the server is always HTTPS.
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#2b1a0b', showSpinner: false },
    Keyboard: { resize: 'body', resizeOnFullScreen: true },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
    SystemBars: { insetsHandling: 'css', style: 'DARK' },
  },
}

export default config
