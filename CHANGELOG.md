# Changelog

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
