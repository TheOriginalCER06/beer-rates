import type { CapacitorConfig } from '@capacitor/cli'

// The Android and iOS apps bundle the built frontend (dist/) and talk to the server over HTTPS
// with a bearer token (see src/lib/platform.ts). Build: `npm run cap:sync`, then open
// android/ in Android Studio or run the GitHub Actions workflow (see docs: Admin → Phone apps).
const config: CapacitorConfig = {
  appId: 'no.cer06.beerrates',
  appName: 'Drikke Vurderinger',
  webDir: 'dist',
  android: {
    // Photos are uploaded straight from the app; the server is always HTTPS.
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#2b1a0b', showSpinner: false },
    Keyboard: { resize: 'body', resizeOnFullScreen: true },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
    // Edge to edge: Capacitor passes the status/navigation bar sizes to the page as --safe-area-inset-*
    // (used in src/app.css). index.html sets viewport-fit=cover; the hint avoids a jump at start-up.
    SystemBars: { insetsHandling: 'css', style: 'DARK', initialViewportFitValueHint: 'cover' },
  },
}

export default config
