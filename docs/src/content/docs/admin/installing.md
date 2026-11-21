---
title: Installere og flytte fra den gamle appen
description: Sette opp CT-en på 192.168.20.234, bytte fra den gamle Node-appen og importere dataene.
sidebar:
  order: 1
---

Appen kjører som Docker Compose-containere i en Proxmox-CT, som BLAP: `web` (nginx, app og bilder, port `WEB_PORT` = 3000), `backend` (Django + GraphQL), `worker` (e-post og varsler), `db` (PostgreSQL 18), og valgfritt `docs` og `backup`. Bildene ligger i volumet `beer-rates_media`, databasen i `beer-rates_pgdata`.

## 1. CT-en

Den gamle appen kjører allerede i CT-en på **192.168.20.234** (Alpine, Docker, `/opt/beer-rates`, port 3000), og reverse proxyen for `øl.cer06.no` peker dit. Enklest er å bruke den videre:

```bash
apk add --no-cache bash openssh openssl curl git
rc-update add sshd default && rc-service sshd start
mkdir -p ~/.ssh && chmod 700 ~/.ssh
vi ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys   # lim inn PC-ens offentlige nøkkel
```

Skriptene trenger `bash`, og `scripts/deploy.sh` trenger SSH. Gi CT-en **2 GB RAM** mens bildene bygges.

:::note[Ny Debian 13-CT i stedet?]
Følg BLAP-veiledningen, gi den adressen 192.168.20.234 etter at den gamle er slått av, og kopier gamle data som fil: på den gamle CT-en `docker run --rm -v beer-rates_drink_data:/data -v /root:/out alpine tar czf /out/old-data.tar.gz -C /data .`, `scp` filen over og bruk den i steg 4.
:::

## 2. Hent den nye koden

```bash
cd /opt/beer-rates
git pull --ff-only
cp .env.example .env
openssl rand -base64 48     # -> DJANGO_SECRET_KEY
openssl rand -hex 24        # -> POSTGRES_PASSWORD
vi .env && chmod 600 .env
```

Sett minst `DJANGO_SECRET_KEY`, `POSTGRES_PASSWORD`, `DJANGO_SUPERUSER_PASSWORD` og e-postinnloggingen. Domeneinnstillingene for øl.cer06.no er fylt ut.

## 3. Start (og slå av den gamle appen)

```bash
scripts/update.sh
```

Første gang stopper og fjerner den den gamle appens container (datavolumet `beer-rates_drink_data` beholdes) og den gamle cron-jobben for automatisk oppdatering, og bygger og starter alt. Den nye appen lytter på port 3000 som før, så proxyen trenger ingen endring.

## 4. Importer gamle data

```bash
scripts/import-old.sh --dry-run    # hva som ville blitt importert
scripts/import-old.sh              # gjør det
```

Fra fil: `scripts/import-old.sh /root/old-data.tar.gz`. Brukere (med passord, roller og aktiv-status; `local_admin` blir superbruker), drikker (med hvem, datoer og **bilder**) og innstillingene flyttes. Kan kjøres igjen: det som er importert før, hoppes over. Når alt ser riktig ut: `docker volume rm beer-rates_drink_data`.

## 5. Sjekk

`https://øl.cer06.no` viser drikkene; logg inn som `local_admin` (gammelt passord) eller den nye admin-en; se **Administrer → Innstillinger**; `docker compose ps` viser alt som `healthy`.

## Domene og HTTPS

`øl.cer06.no` (`xn--l-4ga.cer06.no`) er satt opp i Nginx Proxy Manager mot `192.168.20.234:3000`. Proxyen må sende `Host` og `X-Forwarded-Proto: https` (NPM gjør det), og tillate opplasting på minst 16 MB (NPM: *Advanced* → `client_max_body_size 16m;` hvis bildeopplasting feiler med 413).

## Dokumentasjonen på samme CT (valgfritt)

I `.env`: `COMPOSE_PROFILES=docs`, `DOCS_PORT=3001`, `DOCS_ADMIN_PASSWORD=<12+ tegn>`. Kjør `scripts/update.sh` og legg til `docs.øl.cer06.no` → `192.168.20.234:3001` i NPM.
