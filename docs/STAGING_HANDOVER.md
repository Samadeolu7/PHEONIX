# Staging environment: handover

Written 2026-11-14 at the end of the customer-portal session, so that staging can
be provisioned in a separate session. Read all of it before changing anything:
production runs on the same server and some of its names are hard-coded.

## Goal

A staging copy of Phoenix ERP where we can **simulate a client end to end**
without touching production or contacting real people:

1. A director sets up the portal (Admin → Online Portal Settings).
2. Staff invite a demo client from the client record (Online Portal Access card).
3. The client accepts the invite, applies for a loan, uploads documents, and sees
   balances on My accounts.
4. A credit officer picks the application up (Loans → Online Applications), staff
   accept it, and it is approved and disbursed through the normal loan workflow.
5. The client requests a withdrawal, staff forward it (Savings → Online Withdrawal
   Requests), and it is approved and paid out through Savings Withdrawal.

## Decisions already made (by the owner)

- **Same server as production.** No new VPS. Staging must therefore be fully
  isolated by name: its own database volume, containers, network, routes and
  image tags.
- **Data: small generated demo data** (preferred), or a **scrambled copy** of
  production if realistic volume is needed later. **Never a raw copy of real
  client data** (NIN/BVN, names, phones, balances: NDPR).

## Production as it is today (do not change its behaviour)

- Server folder: `/opt/phoenix-kti` holds `docker-compose.yml` (copied by CI) and
  `.env` (server-only, not in git). Compose project name = folder name
  (`phoenix-kti`).
- CI: `.github/workflows/deploy.yml`, on push to `main`:
  - builds `${DOCKERHUB_USERNAME}/phoenix-kti-backend:latest` and `…-frontend:latest`
  - scp's the compose file, then over ssh:
    `docker compose pull` → wait for postgres → `migrate` + `collectstatic` →
    restart backend → restart celery_worker, celery_beat, flower → frontend → done
  - secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `SSH_HOST`, `SSH_USER`,
    `SSH_PRIVATE_KEY`; vars: `VITE_BRAND_*`
- Frontend build args bake the API address **at build time**:
  `VITE_API_URL=https://api.kti.krystartrust.ng/api`,
  `VITE_API_BASE_URL=https://api.kti.krystartrust.ng/api`.
- Domains (Traefik labels, Let's Encrypt `certresolver=letsencrypt`, network
  `traefik_public`): `erp.krystartrust.ng` (frontend),
  `api.kti.krystartrust.ng` (backend, `/ws` → backend_ws),
  `flower.kti.krystartrust.ng`.
- Backend env vars (names only): ALLOWED_HOSTS, CELERY_BROKER_URL,
  CELERY_RESULT_BACKEND, DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USER, DEBUG,
  DEFAULT_FROM_EMAIL, DJANGO_SETTINGS_MODULE, EMAIL_BACKEND, EMAIL_HOST,
  EMAIL_HOST_PASSWORD, EMAIL_HOST_USER, EMAIL_PORT, EMAIL_USE_TLS, PYTHONPATH,
  REDIS_URL, SECRET_KEY. Also read by settings: CORS_ALLOWED_ORIGINS,
  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, PORTAL_* (see
  `erp-backend/phoenix_erp/src/portal/README.md`).

## Collision points: fix these before running a second copy

All in `erp-backend/phoenix_erp/docker-compose.yml`:

| What | Current value | Risk if copied as-is |
|---|---|---|
| Postgres volume | `kti_postgres_data` → `external: true`, `name: phoenix-kti_kti_postgres_data` | **Staging would mount the PRODUCTION database.** Highest risk. |
| `container_name` (2 of them) | `phoenix_kti_postgres`, `phoenix_kti_redis` | Name clash; the second stack fails or replaces the first. |
| Network | `phoenix_kti_backend` with explicit `name:` (the separate Bank-Recon stack joins it as external) | Staging would share production's internal network. |
| Traefik router/service names | `phoenix-kti-api`, `phoenix-kti-ws`, `phoenix-kti-flower`, `phoenix-kti-frontend`, `phoenix-kti-frontend-http`, middleware `kti-redirect-to-https` | Duplicate router names fight over production's routes. |
| Host rules | the domains above | Must be staging hosts. |
| Image tags | `${DOCKER_IMAGE_BACKEND:-…:latest}`, `${DOCKER_IMAGE_FRONTEND:-…:latest}` | Staging must use `:staging` tags so builds never overwrite prod's `:latest`. |

**Approach:** parameterise these with env vars whose **defaults are exactly
today's production values**, so production's behaviour and `.env` stay
untouched. Staging's `.env` overrides them. Keep the pg volume `external` name
for prod via an env default, e.g. `name: ${PG_VOLUME_NAME:-phoenix-kti_kti_postgres_data}`.
Alternatively, use a separate `docker-compose.staging.yml`; either is fine as long
as prod's file renders identically. Verify with `docker compose config` against
prod's `.env` before and after (the output must be byte-identical).

## Staging specifics

- Suggested hosts: `staging.krystartrust.ng` (frontend) and
  `api.staging.krystartrust.ng` (backend). Flower is optional; skip it or keep it
  private.
- Server folder `/opt/phoenix-kti-staging` (separate compose project), with its
  own `.env`: new `SECRET_KEY`, new DB name and password, its own volumes.
- `ALLOWED_HOSTS`: settings already allow `.krystartrust.ng`.
  `CORS_ALLOWED_ORIGINS` must include `https://staging.krystartrust.ng`
  (settings read it from env; the default list is prod's).
- CI: a **new** workflow (e.g. `.github/workflows/deploy-staging.yml`) on push to
  a `staging` branch (plus manual dispatch). Build `:staging` images with
  `VITE_API_BASE_URL=https://api.staging.krystartrust.ng/api` (and `VITE_API_URL`),
  scp to `/opt/phoenix-kti-staging`, and run the same deploy steps there. Do not
  edit `deploy.yml`, apart from parameterising if strictly necessary.
- Server capacity: roughly 1–2 GB extra RAM for the second stack. Check `free -h`
  and `docker stats` first. Consider `celery_worker` concurrency 1 for staging.

## Safety switches: staging must not contact real people

Add a single `STAGING=true` env flag (default false) that, when on:

- **Email:** default `EMAIL_BACKEND` to console or file-based, or redirect every
  outgoing email to one test inbox (e.g. a `STAGING_EMAIL_REDIRECT` address). Never
  deliver to client addresses.
- **SMS, WhatsApp, Telegram, Push:** providers in
  `erp-backend/phoenix_erp/src/notifications/providers.py` (`SMSProvider`,
  `WhatsAppProvider`, `TelegramProvider`, `PushProvider`) become no-ops that only
  log. Also `notifications/telegram_alerts.py` (`notify_directors`, …). Leave
  `TELEGRAM_*` unset in staging's `.env` too.
- **Celery beat** (`CELERY_BEAT_SCHEDULE` in `phoenix/settings.py`) can run, since
  data is isolated, but only after the above are in place.
- **Visible banner:** a "STAGING — test data only" bar in both the staff app and the
  customer portal (frontend env var, e.g. `VITE_ENV_LABEL=staging`).
- Write tests asserting that with `STAGING=true` no provider makes a network call
  and email never goes to a client address.

## Demo data (preferred): `manage.py seed_staging_demo`

Make it idempotent and refuse to run unless `STAGING=true`. It should create:

- A tenant, two branches, and a director login (password printed once, or from an
  env var).
- Staff users: a branch admin, a credit officer (role scoped to "assigned clients"),
  and a teller/approver, each with roles and Permission Setup policies covering
  Online Applications (view, edit, approve), Online Portal Access (view, create),
  Loan Accounts and Savings Withdrawals.
- A chart-of-accounts minimum: loan parent, cash/bank, interest income, savings
  parent. See how the tests build these in
  `erp-backend/phoenix_erp/src/portal/tests/test_portal_security.py` (`make_tenant`)
  and `src/tests/test_savings_operations.py`.
- A loan product (weekly + monthly) and a savings product.
- 5–10 demo clients with fake names. Use **11-digit fake NIN/BVN that can't be
  real** (e.g. prefix `000`), phones `0800000xxxx`, and emails at the test inbox
  domain.
- Savings balances **posted through real transactions** (e.g.
  `SavingsAccount.deposit(...)` with a cashier GL account). The ledger forbids
  setting `Account.balance` directly (`accounts/models.py`, "Direct balance updates
  are prohibited").
- One or two existing active loans, so My accounts shows repayments and arrears.
- `PortalConfig`: `is_enabled=True`, `allow_registration=False`,
  `public_url=https://staging.krystartrust.ng`, plus at least one
  `PortalLoanOffering`.

## Scrambled copy (only if demo data isn't enough)

Write a `manage.py scramble_personal_data` (refuses unless `STAGING=true`) that
runs **on the staging database after restoring a prod dump**. It should
overwrite names, phones, emails, addresses, NIN, BVN, bank account numbers and
next-of-kin fields on Client, Guarantor and HR Staff, and blank uploaded file
references. Delete `PortalCustomer`, sessions, invitations and audit IP data.
Keep amounts and balances. Restore and scramble before staging's backend ever
starts, so it never runs on real personal data.

## Owner's manual steps (about 1–2 hours)

1. DNS A records → server IP: `staging.krystartrust.ng`,
   `api.staging.krystartrust.ng`.
2. On the server: `mkdir /opt/phoenix-kti-staging` and create its `.env` (a
   template will be provided by the staging session).
3. GitHub: probably nothing new, since the new workflow can reuse the existing
   secrets.
4. Push to the `staging` branch (or run the workflow manually), then run
   `seed_staging_demo` once.

## Pitfalls learned in the portal session

- **Tenant resolution:** `common/middleware.py` maps any `*.krystartrust.ng` host
  whose first label is in a skip list (`api`, `erp`, `www`, …) to a hard-coded
  default tenant slug `mt`. Staff requests are fine (the JWT carries the tenant).
  The **portal** resolves its organisation from `PortalConfig.public_url` matched
  against the browser's Origin/Referer (`portal/services.py: resolve_portal`), so
  staging's PortalConfig must have `public_url=https://staging.krystartrust.ng`.
  A staging host like `staging.krystartrust.ng` has first label `staging`; check
  what the middleware does with it.
- **Permission pages:** `manage.py seed_permissions` **fails on production**
  (`Module.MultipleObjectsReturned`: per-tenant catalog duplicates; see
  `permissions/management/commands/fix_module_catalog_duplicates.py`). Permission
  Setup creates pages from `erp-frontend/src/config/permissionRegistry.ts` when an
  admin opens it. On a fresh staging DB, `seed_permissions` may work; either way,
  opening Permission Setup once is enough.
- **Portal cookies:** `SameSite=Strict`, path `/api/portal/`. This works because the
  frontend and API share the registrable domain `krystartrust.ng`, which also holds
  for the staging hosts above.
- **Nav lists:** new pages need entries in three places: sidebar
  (`dashboardSidebarConfig.ts`), permissions (`permissionRegistry.ts`) and module
  cards (`featureRegistry.ts` + `routeToPageMap.ts`).
- **Tests:** need Postgres. A fresh test DB takes about 10 minutes to migrate; use
  `--keepdb`. Pre-existing failures that aren't regressions: 8 date-dependent HR
  leave tests, and 3 client test modules with stale imports.
- **Deploys:** read the whole deploy log after every merge. A step that logs an
  error can still report success.

## Done when

- Production's `docker compose config` output is unchanged, and prod deploys still
  pass.
- Staging is reachable at its hosts with valid TLS and shows the STAGING banner.
- `seed_staging_demo` works, and the five-step simulation in **Goal** completes.
- No real email, SMS, WhatsApp or Telegram can leave staging (tests prove it).

## Related docs

- `erp-backend/phoenix_erp/src/portal/README.md`: portal setup, invitations,
  withdrawals, alerts
- `erp-backend/phoenix_erp/src/common/PRIVATE_FILES.md`: private file storage
