---
title: Installere og flytte fra den gamle appen
description: Sette opp CT-en på 192.168.20.234, bytte fra den gamle Node-appen og importere dataene.
sidebar:
  order: 1
---

Appen kjører som Docker Compose-containere i en Proxmox-CT, som BLAP: `web` (nginx, app og bilder, port `WEB_PORT` = 3000), `backend` (Django + GraphQL), `worker` (e-post og varsler), `db` (PostgreSQL 18), og valgfritt `docs` og `backup`. Bildene ligger i volumet `beer-rates_media`, databasen i `beer-rates_pgdata`.

## 1. CT-en

Den gamle appen kjører allerede i **CT 213** (`beerrates` på `pve2`, 192.168.20.234: Alpine, Docker, `/opt/beer-rates`, port 3000), og NPMPlus sender `øl.cer06.no` dit. Enklest er å bruke den videre.

Utrullinger logger inn med en egen nøkkel, `~/.ssh/beerrates_deploy` på PC-en (`ssh-keygen -t ed25519 -N "" -C beerrates-deploy-key -f ~/.ssh/beerrates_deploy`), som `scripts/deploy.sh` bruker av seg selv. I CT-ens konsoll (Proxmox: **pve2 → 213 → Console**):

```bash
apk add --no-cache bash openssh openssl curl git
rc-update add sshd default && rc-service sshd start
mkdir -p /root/.ssh && chmod 700 /root/.ssh
# Utrullingsnøkkelen, bare fra PC-en (192.168.50.88) og VPN-nettene, uten port- eller agent-videresending:
echo 'restrict,pty,from="192.168.50.88,192.168.10.*,192.168.2.*" ssh-ed25519 AAAA… beerrates-deploy-key' >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
```

Skriptene trenger `bash`, og `scripts/deploy.sh` trenger SSH. Slett linjen for å fjerne tilgangen igjen. Gi CT-en **2 GB RAM** mens bildene bygges, og slå på **Options → Start at boot**, ellers er siden nede etter en omstart av `pve2`.

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

Første gang sletter den den gamle cron-jobben for automatisk oppdatering på søndager, og bygger de nye bildene mens den gamle appen fortsatt kjører. Først da stopper og fjerner den den gamle appens container (datavolumet `beer-rates_drink_data` beholdes) og starter den nye, så siden er nede i omtrent ett minutt. Den nye appen lytter på port 3000 som før, så proxyen trenger ingen endring.

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
