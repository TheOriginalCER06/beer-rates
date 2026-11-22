---
title: Telefonappene
description: Bygge og signere Android-appen, push via Firebase, og iPhone.
sidebar:
  order: 2
---

Android- og iOS-appene bygges med [Capacitor](https://capacitorjs.com/) fra samme kode som nettsiden (`frontend/`). Appen ligger i dem, så de åpner med en gang og virker uten nett, og de snakker med `https://øl.cer06.no` med en innloggingsnøkkel i stedet for en cookie. Serveradressen kan endres på innloggingsskjermen (må være HTTPS).

## Android: få tak i APK-en

GitHub Actions bygger APK-en ved hver push (jobben **android** i `.github/workflows/ci.yml`):

- **Hver kjøring**: kjøringens side → *Artifacts* → `drikke-vurderinger-android`.
- **Utgivelser**: en tag `vX.Y.Z` legger den signerte APK-en ved en GitHub-utgivelse, også med det faste navnet `drikke-vurderinger.apk`, så [denne lenken](https://github.com/TheOriginalCER06/beer-rates/releases/latest/download/drikke-vurderinger.apk) alltid gir den nyeste. Profil-siden i appen lenker dit. En tag uten signerings-secrets feiler med vilje.

### Signeringsnøkkel (én gang)

Uten nøkkel lages en *debug*-APK. Den kan installeres, men hver bygging signeres med en ny nøkkel, så en ny versjon kan ikke installeres over den gamle. Med nøkkel installeres oppdateringer over hverandre.

```bash
docker run --rm -it -v "$PWD:/out" eclipse-temurin:21-jdk \
  keytool -genkeypair -v -keystore /out/beer-rates.jks -alias beer-rates \
  -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 beer-rates.jks > beer-rates.jks.b64
```

Legg til i GitHub → *Settings → Secrets and variables → Actions*: `ANDROID_KEYSTORE_BASE64` (innholdet i `.b64`-filen), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`beer-rates`) og `ANDROID_KEY_PASSWORD`. Ta vare på `beer-rates.jks` og passordet.

### Bygge på egen PC

Krever Node 22, JDK 21 og Android Studio: `cd frontend && npm ci && npm run android`.

## Push-varsler til Android-appen (valgfritt)

1. [Firebase-konsollen](https://console.firebase.google.com/) → nytt prosjekt → *Add app → Android*, pakkenavn **`no.cer06.beerrates`**. Last ned `google-services.json`.
2. GitHub-secret `GOOGLE_SERVICES_JSON` = innholdet i filen.
3. Firebase → *Project settings → Service accounts → Generate new private key*; legg filen på CT-en som `/opt/beer-rates/secrets/fcm-service-account.json` (`chmod 600`).
4. I `.env`: `FCM_SERVICE_ACCOUNT_FILE=/run/secrets/beer-rates/fcm-service-account.json`, så `docker compose up -d`.
5. I appen: **Profil → Varsler → Slå på for denne enheten** og **Send en test**.

## iPhone

Enklest er nettsiden lagt til på hjemskjermen (Safari → *Del → Legg til på Hjem-skjerm*): fullskjerm, virker uten nett, og varsler på iOS 16.4+.

En ekte iOS-app ligger i `frontend/ios/`, men den må bygges på en Mac med Xcode, og installasjon på telefoner krever en Apple Developer-konto (99 USD/år; en gratis konto kan installere på egen telefon i 7 dager av gangen): `cd frontend && npm ci && npm run build && npx cap sync ios && npx cap open ios`.
