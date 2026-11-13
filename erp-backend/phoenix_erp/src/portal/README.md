# Customer portal (online registration + loan applications)

Members of the public create an account, verify their email, and submit a loan
application online. Staff review it in **Loans → Online Applications** and either
decline it or accept it, which creates the client (or links an existing one) and a
**pending** loan application. That loan then goes through the normal approval and
disbursement workflow. Nothing online approves or pays out money.

The security model is documented at the top of `portal/models.py`. Read it
before changing this app.

## Turning it on (per organisation)

The portal is **off** by default and returns 404 until enabled.

1. Deploy, then run `python manage.py migrate` (the entrypoint already does this) and
   `python manage.py seed_permissions` to register the *Online Applications* permission page.
2. Django admin → **Portal configurations** → add one for the organisation, tick
   *Is enabled*, and fill in support phone/email and terms/privacy URLs.
   *Allow registration* (open self sign-up) is **off by default**: accounts can then
   only be created from a staff invitation (see below). Tick it to also let anyone sign up.
3. Django admin → **Portal loan offerings** → add each loan product the public may
   apply for. Only listed products are shown. You can set a lower online cap
   (`max_online_amount`) than the product maximum.
4. Permission Setup → give reviewer roles access to **Loans → Online Applications**:
   - *view* to see applications, *edit* to start a review,
   - *approve* to accept/decline (accepting also needs *create* on Loan Accounts).
   Roles still in "legacy" mode (no policies) can view and start reviews, but cannot
   accept or decline.

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `PORTAL_FRONTEND_URL` | `http://localhost:5173` | **Set in production**, e.g. `https://erp.krystartrust.ng`. Used for links in emails. |
| `PORTAL_COOKIE_SAMESITE` | `Strict` | Correct for our deployment: the frontend (`erp.krystartrust.ng`) and API (`api.kti.krystartrust.ng`) are both served from our server under the same registrable domain. Only revisit if the frontend ever moves to a different domain. |
| `PORTAL_COOKIE_DOMAIN` | unset | Leave unset unless you need the cookie on a parent domain. |
| `PORTAL_COOKIE_SECURE` | `True` when `DEBUG=False` | |
| `PORTAL_TRUSTED_PROXY_COUNT` | `1` | Number of reverse proxies (Traefik) in front of Django. Used to find the real client IP for rate limiting. |
| `PORTAL_SESSION_IDLE_MINUTES` / `PORTAL_SESSION_ABSOLUTE_HOURS` | `30` / `12` | |
| `PORTAL_LOCKOUT_THRESHOLD` / `PORTAL_LOCKOUT_MINUTES` | `5` / `15` | |

Email must work: invitations, verification and password reset all depend on it.
Check it on the server before go-live:

```
docker compose exec backend python manage.py sendtestemail you@example.com
```

With Gmail SMTP you need an app password and `EMAIL_USE_TLS=True` in the server's
`.env`. If it's missing, compose passes an empty value, which turns TLS off, and Gmail
refuses the connection. If a staff invitation can't be sent, the staff member sees an
error and no link is left active. Customer-facing emails (verification, reset) fail
silently by design, so attackers can't use error messages to probe which emails
exist; failures go to the server log as "Portal email failed".

Local frontend development: set `VITE_PORTAL_TENANT_SLUG=<tenant slug>` so the
dev server sends the tenant header (production resolves the tenant from the domain).

## Inviting existing clients (the default way in)

On a client's record, the **Online Portal Access** card shows whether they have an
account and lets staff email an invitation (only to an address confirmed as the
client's). The client opens the link, chooses a password and is signed in. Their
account is already linked to their client record and their email counts as verified.

- Links are single-use, expire after 72 hours, and only the hash is stored.
  Sending a new invitation cancels the previous one, and staff can cancel a
  pending one.
- Staff can only invite clients in their own organisation and branch, unless
  they have cross-branch access. Permission page: **Clients → Online Portal Access**.
- When an invited customer applies, accepting the application uses their linked
  client record directly. No NIN/BVN matching step and no duplicate client.

## Supporting documents

After submitting, applicants can attach documents (ID, passport photo, proof of
address, bank statement, ...) on their application page: PDF/JPG/PNG, 5 MB each,
up to 10 per application, and only while the application is open. They can remove
a document until a reviewer starts on it. Staff see them in the Online Applications
review panel; every view is written to the portal audit log.

Files are stored in **private storage** (`media/private/`, see
`common/private_files.py`). They are never reachable through the public `/media/`
URL. The server checks real file content (not just the extension), re-encodes
photos (which strips EXIF data such as phone GPS location), and rejects oversized
uploads from the `Content-Length` header before reading the body.

## URLs

- Customer: `/portal` (landing), `/portal/accept-invite`, `/portal/register` (only if open sign-up is on), `/portal/login`, `/portal/apply`, `/portal/dashboard`
- Staff: `/loans/online-applications`
- API: `/api/portal/...` (customer, cookie session) and `/api/portal/staff/...` (staff JWT)

## Tests

```
python manage.py test portal
```
