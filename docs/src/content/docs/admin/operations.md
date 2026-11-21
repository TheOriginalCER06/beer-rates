---
title: Oppdatering, backup og feilsøking
description: deploy.sh og update.sh, backup og gjenoppretting, logger og vanlige problemer.
sidebar:
  order: 3
---

## Oppdatere

Fra PC-en, i repoet (som med BLAP):

```bash
scripts/deploy.sh
```

Den pusher gjeldende branch og kjører `scripts/update.sh` på CT-en over SSH (`root@192.168.20.234`, eller `DEPLOY_TARGET`). `update.sh` tar backup av databasen og `.env` til `/opt/backup` (hopp over med `--no-backup`), kjører `git pull --ff-only`, viser nytt fra CHANGELOG, bygger bildene ett om gangen og starter på nytt med `docker compose up -d --wait`.

**Ny versjon:** øk `version` i `backend/pyproject.toml` (og `frontend/package.json`, `docs/package.json`), legg til en `## [x.y.z] - dato`-seksjon øverst i `CHANGELOG.md`, commit, tag `vX.Y.Z`, push. Taggen bygger også Android-APK-en.

## Backup

- Før hver oppdatering: database og `.env`.
- Hver natt (valgfritt): legg til `backup` i `COMPOSE_PROFILES`. Lagrer databasedump og `.env` (beholder 14) og en kopi av bildene (beholder 3) i `BACKUP_DIR`. Én nå: `docker compose run --rm backup --now`.

Gjenoppretting: se den engelske siden *Updates, backups and troubleshooting* for kommandoene.

## Logger og admin

```bash
docker compose ps
docker compose logs -f backend worker web
```

Django-admin på `/admin/`: app-innlogginger (slett én for å logge ut en telefon), rate limits (slett én for å oppheve en sperre), e-postkøen.

## Feilsøking

| Problem | Løsning |
|---|---|
| Innlogging feiler med CSRF-feil | Proxyen må sende `Host` og `X-Forwarded-Proto: https`; `DJANGO_CSRF_TRUSTED_ORIGINS=https://xn--l-4ga.cer06.no`. |
| Bildeopplasting feiler (413) | Øk proxyens grense til 16 MB. |
| Appen sier «Ingen kontakt med serveren» | Sjekk serveradressen på innloggingsskjermen (HTTPS), og at siden åpner i telefonens nettleser. |
| E-post kommer ikke fram | `docker compose logs worker`; sjekk `EMAIL_HOST_USER` og `DEFAULT_FROM_EMAIL`. |
| Byggingen stopper med «killed» | CT-en gikk tom for minne: gi den 2 GB RAM. |
