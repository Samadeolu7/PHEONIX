# Staging environment

A test copy of Phoenix ERP at **https://staging.krystartrust.ng** (API
**https://api.staging.krystartrust.ng**). It runs on the **same server as
production** and is isolated from production by name. It holds **generated
demo data only** and **cannot contact real people**.

Background and the owner's decisions are in [`STAGING_HANDOVER.md`](STAGING_HANDOVER.md).

---

## 1. How staging is kept apart from production

`erp-backend/phoenix_erp/docker-compose.yml` is shared by both. Every name
that would clash is now `${VAR:-production value}`. Production's `.env` sets
none of these variables, so production's rendered config is **byte-identical**
to before this change. This was checked with `docker compose config` against a
production-shaped `.env`, and also with an empty `.env`. Staging's `.env`
overrides every one of them:

| What | Production (default) | Staging (`.env`) |
|---|---|---|
| Compose project | `phoenix_kti` | `STACK_PROJECT_NAME=phoenix_kti_staging` |
| Container names | `phoenix_kti_postgres`, `phoenix_kti_redis` | `STACK_CONTAINER_PREFIX=phoenix_kti_staging` |
| Private network | `phoenix_kti_backend` | `BACKEND_NETWORK_NAME=phoenix_kti_staging_backend` |
| **Database volume** | `phoenix-kti_kti_postgres_data` | `PG_VOLUME_NAME=phoenix-kti-staging_pg_data` |
| Redis/static/media volumes | `phoenix_kti_*` | `phoenix_kti_staging_*` (follow the project name) |
| Images | `…-backend:latest`, `…-frontend:latest` | `…:staging` |
| Traefik routers/services | `phoenix-kti-*` | `TRAEFIK_PREFIX=phoenix-kti-staging` |
| Traefik middleware | `kti-redirect-to-https` | `TRAEFIK_MIDDLEWARE_PREFIX=kti-staging` |
| Hosts | `erp.krystartrust.ng`, `api.kti.…`, `flower.kti.…` | `staging.…`, `api.staging.…` (Flower is not started) |
| Celery concurrency | 2 | `CELERY_CONCURRENCY=1` |

`docker-compose.staging.yml` is used **only** by staging (`COMPOSE_FILE` in
staging's `.env`, and forced by the workflow). It adds the `STAGING=true`
switch and staging URLs, blanks Telegram and Bank-Recon settings, and turns
Flower off.

**`staging-guard.sh`** runs before every staging deploy. It renders the config
and refuses to continue if *anything* still resolves to production: the
project, containers, network, **database volume**, images, router names,
middleware or hosts. It also refuses if `STAGING=true` is missing or a
Telegram token is set.

### The shared `traefik_public` network (tested)

Both stacks' `backend` containers join `traefik_public` so Traefik can reach
them. The frontend's nginx proxies `/api/` to the hostname `backend`, and some
production pages use that path. When a name exists on several networks,
Docker answers from the networks in **alphabetical order of network name**.
This was tested on 2026-11-14 with two stacks side by side:

- `phoenix_kti_backend` and `phoenix_kti_staging_backend` both sort before
  `traefik_public`, so each frontend reaches **its own** backend.
- A private network named `zz_backend` (sorting after `traefik_public`)
  reached the **other stacks'** backends, production included.

The guard therefore also requires `BACKEND_NETWORK_NAME` to sort before
`traefik_public`. Keep the staging name as given.

---

## 2. The `STAGING=true` safety switch

Off by default (production is unaffected). When on (`phoenix/settings.py`,
`common/staging.py`):

| Channel | On staging |
|---|---|
| **Email** (everything sent through Django: portal invitations, verification, password resets, notifications) | `STAGING_EMAIL_REDIRECT` empty: **printed to the backend log only**. Set: re-addressed to that **one inbox** (To/Cc/Bcc replaced; the original addresses are kept in the `X-Staging-Original-To` header and the first line of the body; the subject gets a `[STAGING]` prefix). |
| SMS, WhatsApp, Telegram, Push (`notifications/providers.py`) | No-ops that only log `STAGING: … suppressed`. |
| Director Telegram alerts (`notifications/telegram_alerts.py`) | Skipped (not even queued). |
| Telegram credentials | Forced blank in settings *and* in the compose overlay. |
| Bank-Recon service | URL and token forced blank. |
| Banner | Yellow "STAGING — test data only…" bar on every page of the staff app **and** the customer portal, and `[STAGING]` in the browser tab title (`VITE_ENV_LABEL=staging`, baked in at build time). |

Without a redirect inbox, staging will not send email even if `EMAIL_BACKEND`
says SMTP. The wrapper checks this again at send time.

Tests: `common/tests/test_staging_safety.py` blocks every socket and
asserts:
- each provider in the sender's real provider table makes no call;
- a new provider added later fails the test until it is blocked too;
- no email reaches a client address;
- the switch is off by default and providers still call out when it's off.

---

## 3. Demo data: `manage.py seed_staging_demo`

Refuses unless `STAGING=true`. Safe to run again: second runs report
"nothing new" and post nothing. It builds on what production itself does for a
new organisation: the standard FIRS/IFRS chart of accounts per branch, and
Regular Savings (`SAV-REG`) accounts opened automatically for each new client.

- Organisation slug **`mt`**. `common/middleware.py` maps
  `api.staging.krystartrust.ng` to slug `mt`, exactly as production's API
  host. Two branches: Demo HQ (Ibadan) and Demo Oyo Branch.
- Logins (password printed once, or set `STAGING_DEMO_PASSWORD`):

  | Login | Role | Can |
  |---|---|---|
  | `demo.director` | organisation owner (everything) | portal settings, execute disbursements |
  | `demo.branchadmin` | Demo Branch Admin, own branch; group *Branch Manager* | approve loans and withdrawals |
  | `demo.creditofficer` | Demo Credit Officer, **assigned clients** | invite clients, pick up and accept online applications, forward withdrawals |
  | `demo.teller` | Demo Teller, own branch | pay out withdrawals |

  Each has a Staff record and Permission Setup policies for Online
  Applications (view/edit/approve), Online Portal Access (view/create), Loan
  Accounts and Savings Withdrawals.
- Bank account "Demo Bank (not real)" on GL 1103, ₦5,000,000 opening
  capital and a ₦500,000 teller float, all posted as journal entries.
- Products: **Demo Weekly Business Loan** (4–24 weeks), **Demo Monthly SME
  Loan** (1–12 months), **Regular Savings**. One withdrawal approval tier (1
  approver: Branch Manager or Director).
- **8 fake clients** `DEMO-001…008`: NIN/BVN start with `000`, phones
  `0800000xxxx`, emails `@example.com` (or `STAGING_DEMO_EMAIL_DOMAIN`). All are
  assigned to the credit officer.
- Savings balances are posted through `SavingsAccount.deposit()` (real
  journal entries). The ledger stays balanced.
- Two active loans, through approve → disbursement → repayments:
  - DEMO-001: weekly, up to date.
  - DEMO-003: monthly, in arrears.
- Portal: on, invite-only, `public_url=https://staging.krystartrust.ng`, both
  loan products offered online.

On the first run, three `Staff … has no tenant` leave-balance errors are
logged for `demo.director`. They are harmless: the login has to exist before
the organisation can, and production logs the same for any new organisation
owner.

`common/tests/test_seed_staging_demo.py` runs the seed twice (proves it is
idempotent and posts money once), checks the fake identities and that the
ledger balances, then runs the **five-step client simulation** below end to
end. It uses staging's real host names, so it also proves the API host and
the portal web address resolve to the demo organisation.

---

## 4. Owner's steps (about 1 hour)

### Step 0: before merging, confirm production renders identically on the server

```bash
cd /opt/phoenix-kti && docker compose config > /tmp/prod-before.yml
```

Copy the new `erp-backend/phoenix_erp/docker-compose.yml` from this branch to
`/tmp/phoenix-check/docker-compose.yml` on the server, then:

```bash
docker compose --env-file /opt/phoenix-kti/.env -f /tmp/phoenix-check/docker-compose.yml --project-directory /opt/phoenix-kti config > /tmp/prod-after.yml && diff /tmp/prod-before.yml /tmp/prod-after.yml && echo IDENTICAL
```

It must print `IDENTICAL`. Also confirm production's `.env` doesn't already
use any of the new variable names. This should print nothing:

```bash
grep -E '^(STACK_PROJECT_NAME|STACK_CONTAINER_PREFIX|BACKEND_NETWORK_NAME|PG_VOLUME_NAME|TRAEFIK_PREFIX|TRAEFIK_MIDDLEWARE_PREFIX|FRONTEND_HOST|API_HOST|FLOWER_HOST|CELERY_CONCURRENCY|COMPOSE_FILE|STAGING)=' /opt/phoenix-kti/.env
```

### Step 1: capacity

Staging needs roughly 1–2 GB extra RAM.

```bash
free -h
```

```bash
docker stats --no-stream
```

### Step 2: DNS

At your DNS provider, add two **A records** pointing to the **same IP as
`erp.krystartrust.ng`**:

| Name | Type | Value |
|---|---|---|
| `staging.krystartrust.ng` | A | *server IP* |
| `api.staging.krystartrust.ng` | A | *server IP* |

Check from your computer (both must print the server IP):

```bash
dig +short staging.krystartrust.ng
```

```bash
dig +short api.staging.krystartrust.ng
```

Traefik requests the Let's Encrypt certificates automatically on the first
request.

### Step 3: server folder and `.env`

```bash
sudo mkdir -p /opt/phoenix-kti-staging
```

Copy `erp-backend/phoenix_erp/staging.env.example` to
`/opt/phoenix-kti-staging/.env`, then fill in the `CHANGE-ME` values with
**new** secrets (never production's):

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(50))"
```

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(24))"
```

Use the first for `SECRET_KEY` and the second for `DB_PASSWORD`. Leave
`STAGING_EMAIL_REDIRECT` empty to start (emails then appear only in the
logs). Lock the file down:

```bash
sudo chmod 600 /opt/phoenix-kti-staging/.env
```

The database volume is created by the workflow. Nothing in GitHub needs
changing: the staging workflow reuses the existing secrets.

### Step 4: first deploy

After "merge it", push the code to a branch named **`staging`** (later,
Actions → *Build & Deploy Phoenix KTI — STAGING* → *Run workflow*).
GitHub only offers the manual button once the workflow file is on `main`;
pushing to `staging` works either way. The first deploy migrates an empty
database (10+ minutes; the step allows 30).

**Read the whole job log**, including:
- `GUARD OK: staging is isolated from production.`
- `STAGING on; email via … redirect: …`
- the HTTPS smoke test at the end.

### Step 5: seed the demo data (once)

```bash
cd /opt/phoenix-kti-staging
```

```bash
docker compose exec backend sh -c "cd /app/src && python manage.py seed_staging_demo"
```

Note the printed password (shown once). To set your own instead, add
`--password '…'`, or `--reset-passwords` to change it later.

Then log in at https://staging.krystartrust.ng as `demo.director` and open
**Admin → Permission Setup** once. This adds the full page catalogue (the seed
creates the portal-related pages).

---

## 5. The client simulation (what to click)

Emails are in the backend log (or your redirect inbox):

```bash
cd /opt/phoenix-kti-staging && docker compose logs -f backend celery_worker | grep -A30 "Subject: \[STAGING\]"
```

1. **Director** (`demo.director`): Admin → Online Portal Settings. Already on
   and invite-only with both products; change anything you want to test.
2. **Invite** (`demo.creditofficer`): Clients → *Babatunde Sampleman*
   (DEMO-002) → Online Portal Access → invite to
   `babatunde.sampleman@example.com`. Copy the
   `https://staging.krystartrust.ng/portal/accept-invite?token=…` link from
   the log.
3. **Client** (private browser window): open the link, set a password.
   - My accounts shows the ₦80,000 Regular Savings.
   - Apply for the Demo Monthly SME Loan, upload any small PDF or photo.
4. **Loan** (`demo.creditofficer`): Loans → Online Applications.
   1. *Start review*.
   2. *Accept* (link to the existing client DEMO-002).
   3. As `demo.branchadmin`, approve the loan in Loan Accounts.
   4. As `demo.director`, disburse it in Loans → Disbursements from *Demo Bank
      (not real)*.

   The client sees it on My accounts.
5. **Withdrawal** (client): request ₦20,000, cash.
   1. As `demo.creditofficer`: Savings → Online Withdrawal Requests →
      *Forward*.
   2. As `demo.branchadmin`: approve in Savings → Withdrawals (cash, till
      *Cash on Hand*).
   3. As `demo.teller`: pay out.

   The balance drops to ₦60,000.

The same five steps run automatically in
`common/tests/test_seed_staging_demo.py::ClientSimulationTests`.

---

## 6. Day-to-day

- **Deploy staging:** push to `staging`. Production's `deploy.yml` (push to
  `main`) is unchanged and never touches `/opt/phoenix-kti-staging`. The
  staging workflow never touches `/opt/phoenix-kti` or the `:latest` tags.
- **Reset staging data:** run each command from `/opt/phoenix-kti-staging`:

  ```bash
  docker compose down
  ```

  ```bash
  docker volume rm phoenix-kti-staging_pg_data
  ```

  Then redeploy and seed again. **Never** run `docker compose down -v` or
  `docker volume rm` in `/opt/phoenix-kti`.
- **Remove staging entirely:** the reset steps, then:

  ```bash
  sudo rm -rf /opt/phoenix-kti-staging
  ```

  Then delete the two DNS records.
- **Scrambled copy of production:** not built; demo data was enough for the
  simulation. If it's ever needed, follow "Scrambled copy" in the handover.
  Never restore a raw production dump into staging.

## 7. Known limits

- A suppressed SMS/Telegram notification is marked `sent` in Notifications
  (with `staging_suppressed` in the provider response). Nothing was delivered;
  the log line says so.
- Flower is not run on staging.
- `docker image prune -f` at the end of each deploy (both workflows) removes
  only *dangling* images. Tagged `:latest` / `:staging` images are kept.
