---
title: Phone apps
description: Building and signing the Android app, push through Firebase, and iPhone.
sidebar:
  order: 2
---

The Android and iOS apps are built with [Capacitor](https://capacitorjs.com/) from the same code as the website (`frontend/`). They contain the app itself, so they open instantly and work offline, and talk to `https://øl.cer06.no` with a login token instead of a cookie. The server address can be changed on the login screen (it must be HTTPS).

## Android: getting the APK

GitHub Actions builds the APK on every push (job **android** in `.github/workflows/ci.yml`):

- **Any run**: the run's page → *Artifacts* → `beer-rates-android` (a zip with the APK).
- **Releases**: tagging `vX.Y.Z` also attaches the APK to the GitHub release.

Copy the APK to the phone and open it. To make it easy for others, put it somewhere they can download it (e.g. a shared folder) and send them [the user guide](/docs/en/guide/app/).

### Signing key (do this once)

Without a key, CI makes a *debug* APK. That installs fine, but every build is signed with a different key, so a new version can't be installed over the old one (you'd have to uninstall first, losing the login). With a key, updates install over each other.

Make the key (Docker, no Java needed on the PC):

```bash
docker run --rm -it -v "$PWD:/out" eclipse-temurin:21-jdk \
  keytool -genkeypair -v -keystore /out/beer-rates.jks -alias beer-rates \
  -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 beer-rates.jks > beer-rates.jks.b64
```

In GitHub → repository → *Settings → Secrets and variables → Actions*, add:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | contents of `beer-rates.jks.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `beer-rates` |
| `ANDROID_KEY_PASSWORD` | the key password (same as the keystore's if you didn't set one) |

Keep `beer-rates.jks` and the password safe (e.g. in a password manager). If they're lost, the next version must be installed fresh.

### Building on your own PC

Needs Node 22, JDK 21 and Android Studio (or the SDK command-line tools):

```bash
cd frontend
npm ci
npm run android        # builds, syncs and opens Android Studio
```

## Push notifications to the Android app (optional)

Web Push (browsers and the iPhone home screen app) works without setup. The Android app gets pushes through Firebase Cloud Messaging:

1. [Firebase console](https://console.firebase.google.com/) → new project → *Add app → Android*, package name **`no.cer06.beerrates`**. Download `google-services.json`.
2. GitHub secret `GOOGLE_SERVICES_JSON` = the file's contents. The next CI build includes Firebase.
3. Firebase → *Project settings → Service accounts → Generate new private key*. Copy the file to the CT as `/opt/beer-rates/secrets/fcm-service-account.json` (`chmod 600`).
4. In `.env`: `FCM_SERVICE_ACCOUNT_FILE=/run/secrets/beer-rates/fcm-service-account.json`, then `docker compose up -d`.
5. In the app: **Profile → Notifications → Turn on for this device**, then **Send a test**.

## iPhone

The easy way is the website added to the home screen (Safari → *Share → Add to Home Screen*): it opens full screen, works offline, and gets notifications on iOS 16.4+.

A real iOS app is in `frontend/ios/` (same code), but building it needs a Mac with Xcode, and installing it on phones needs an Apple Developer account (99 USD/year; a free account can install on your own phone for 7 days at a time):

```bash
cd frontend && npm ci && npm run build && npx cap sync ios && npx cap open ios
```

Barcodes on iOS use the in-app scanner (as on the website), since the ML Kit plugin doesn't support Swift Package Manager.
