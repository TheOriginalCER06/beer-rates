# Changelog

## [2.0.2] - 2026-11-22

### Fixed
- A new docs admin password now takes effect: `scripts/update.sh` rebuilds the docs from scratch when `DOCS_ADMIN_PASSWORD` changes (Docker's build cache didn't notice).
- `scripts/update.sh` warns when a setting appears twice in `.env`, where only the last line counts.

## [2.0.1] - 2026-11-22

### Changed
- The app is called **Drikke Vurderinger**: website, home screen, the Android and iOS apps, emails, notifications and docs. (The repository, Docker project and app ID keep their technical names.)
- The docs are at øl.cer06.no/docs, served by the app, instead of needing a domain of their own.
- `scripts/update.sh` builds and downloads images while the running version stays up, so an update is down for about a minute at most.
- `scripts/deploy.sh` logs in with its own restricted key, `~/.ssh/beerrates_deploy`.

### Fixed
- The Android build in CI (the SDK setup step, `gradlew` not executable, the version code).

## [2.0.0] - 2026-11-21

Rebuilt from scratch in the style of BLAP: Django + GraphQL + PostgreSQL, React with Mantine, Docker Compose with nginx, deployed with `scripts/deploy.sh` / `scripts/update.sh`.

### Added
- Android app (and an iOS project) built with Capacitor from the same code, with token login, native camera, native barcode scanner and push through Firebase.
- Crop photos yourself (drag, pinch, aspect ratios, rotate), with blur and darkness warnings.
- Barcode scanning with Open Food Facts look-up and "already logged with this barcode".
- Label reading on the device, used as suggestions and a database search instead of guessing fields.
- Offline saving: drinks and photos wait on the device and upload by themselves.
- Self sign-up, admin approval, default role and public viewing as admin settings; password reset by email.
- Cheers, filter by person, "who logs most", per-year statistics, XLSX export.
- Web Push notifications; Norwegian and English UI; installable web app that works offline.
- Optional docs site, nightly backups of database and photos, CI with an Android APK build.
- `import_beerrates` / `scripts/import-old.sh`: moves users (with their passwords), drinks, photos and settings from the old app.

### Fixed
- Phone photos no longer end up rotated twice (EXIF orientation is applied once).

### Removed
- The Node.js/Express app, the Alpine setup and weekly cron scripts, and the TensorFlow drink detection (replaced by manual cropping, barcode scanning and label reading).
