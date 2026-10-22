# Customer Portal & Weekly SMS — Design (draft)

## Goal
Give each customer a read-only view of **only their own** money, so under-delivery by
credit officers (COs) becomes visible to the customer and to management.

Threat model: a CO collects cash, then records less than collected, records it late,
or never records it. The customer is the only party who knows the true amount handed
over, so the system must (a) show them what was recorded, (b) let them dispute it
cheaply, and (c) make management see the disputes and the lag.

## What already exists (reuse, don't rebuild)
| Need | Existing |
|---|---|
| Customer record, assigned CO | `clients.Client` (`assigned_officer`, `phone_primary`, `communication_preference`) |
| Loans + schedule | `loans.LoanAccount`, `LoanRepaymentSchedule` |
| Posted repayments (per-payment split) | `loans.LoanRepaymentAllocation` -> `transactions.Transaction` |
| Cash collected in field, awaiting approval | `loans.OfflinePaymentRecord` (has `recorded_by`, GPS, `created_at`, status) |
| Savings-funded repayments | `loans.LoanRepaymentRequest` |
| Reversals | `Transaction.is_reversed`, `loans.LoanRepaymentReversal` |
| Savings accounts | `savings.SavingsAccount` + GL `Account` entries |
| SMS | `notifications/providers.py` (Termii/Twilio/Africa's Talking), `microfinance_templates.py`, Celery |

## Key finding
`OfflinePaymentRecord` is the transparency gap. Its `payment_date` is entered by the
CO, and nothing ties it to what the customer actually handed over. Customer-visible
**collected -> recorded -> approved/posted** timestamps, plus a dispute path, close it.

## Architecture
New Django app `portal`, mounted at `/api/portal/`.

### 1. Identity (separate from staff `User`)
- `PortalAccount`: OneToOne `Client`, `phone`, `is_active`, `last_login_at`,
  `failed_attempts`, `locked_until`.
- `PortalOTP`: hashed code, expiry (5 min), attempt cap, channel. Never store plain codes.
- Tokens: own token class with `token_type=portal_access`, a `client_id` claim and a
  **different signing key** (derived from `SECRET_KEY`), so a portal token can never be
  accepted by staff endpoints and vice versa.
- `PortalJWTAuthentication` + `IsPortalCustomer` are set explicitly on portal views only.
  Global DRF defaults stay untouched.
- Throttles: strict per-phone and per-IP on OTP request/verify (reuse the `login` scope pattern).
- Never reveal whether a phone number is registered.

### 2. Isolation rule (the whole point)
No portal endpoint accepts a client/loan id from the caller for scoping. Every queryset
starts from `request.auth.client` (e.g. `LoanAccount.all_objects.filter(client=client)`).
Cross-customer access returns 404, not 403. Mandatory test: customer A requesting
customer B's loan/receipt gets 404 on every endpoint.

Note: the existing managers filter by thread-local tenant set by `TenantMiddleware`
from the staff user. Portal requests have no staff user, so the portal auth class must
set the tenant from `client.tenant` explicitly (or queries silently return nothing or,
worse, bypass scoping). This needs a test.

### 3. Read-only endpoints
- `GET me/` - name, client_id, branch, **assigned CO name + branch phone** (so they know who to call)
- `GET loans/`, `loans/{id}/` - balance, status, next due, arrears
- `GET loans/{id}/schedule/` - installments, due vs paid
- `GET loans/{id}/payments/` - **payment timeline** (see below)
- `GET savings/`, `savings/{id}/transactions/`
- `GET summary/` - total owed, total saved, next payments due
- Response serializers are explicit allow-lists. Never expose GL accounts, journal ids,
  internal notes, risk level, `ClientNote`, audit logs, or other staff identities beyond
  the CO's display name.

### 4. Payment timeline (core of the feature)
Per payment, show the customer:
`collected_on` (CO-entered date) -> `recorded_at` (system `created_at`) ->
`status` (pending approval / posted / rejected / reversed) -> `posted_at` -> receipt ref.
Derived fields: `recording_lag_days`. Pending items older than N days are flagged to the
customer as "not yet confirmed" and appear in management's exception list.
Rejected and reversed entries are shown with reason, never silently hidden.

### 5. Disputes
`PaymentDispute`: client, optional loan, claimed amount, claimed date, free-text, optional
receipt ref, status (open / investigating / resolved-valid / resolved-invalid), resolver,
resolution note, timestamps. Append-only status history (same immutability style as
`CustomerAuditLog`). Customer can create and read their own; staff get a scoped queue
(supervisors/directors, not the accused CO) and the CO is excluded from resolving
disputes against their own customers.

### 6. Management oversight (the "curb COs" half)
Per-CO report: disputes per 100 customers, avg recording lag, count of pending > N days,
reversals, customers whose SMS reported a different total than the customer says.
Surfaced on an existing dashboard; no new UI required initially.

### 7. Weekly SMS
- Celery beat task, weekly, per customer with an active loan/savings account and a valid phone.
- Content (<= 2 segments): payments **recorded this week** (count + total), loan balance,
  next due date/amount, and a reply/call line for disputes.
  e.g. `Dear Ada, this week we recorded N20,000 (3 payments) on loan LN123. Balance N145,000.
  Next due 05-Nov N10,000. Wrong? Call 0800-XXX.`
- Include a "no payments recorded" line when none, since a silent week is exactly what a
  customer who paid cash needs to notice.
- Reuse `SMSProvider` and notification templates; add `portal_weekly_summary` template.
- New `WeeklySmsLog` (client, week, status, provider ref) -> idempotent re-runs, no double sends,
  delivery audit.
- Respect `communication_preference` / opt-out; stagger sends; skip closed/written-off loans.
- Cost control: Termii is per-segment, so keep the template tight and budget per month.
- The SMS goes from the **system**, not the CO, and its source data is the ledger, not the CO's
  device. This is the strongest control and it works for customers who never log in.

## Phases
1. `portal` app skeleton: models (`PortalAccount`, `PortalOTP`, `PaymentDispute`), token/auth
   classes, isolation tests.
2. Read-only endpoints + payment timeline.
3. Disputes (customer create/read, staff queue).
4. Weekly SMS task + template + log.
5. Management CO report.
6. Customer-facing frontend (separate route/app; mobile-first, low bandwidth).

## Open decisions (need product input)
1. Login method: phone OTP (needs SMS cost per login) vs phone + PIN vs both.
2. Who may enroll customers: self-signup against phone on file, or staff-initiated only?
   (Staff-only prevents a CO from enrolling the customer's phone with their own number.)
3. Phone-number integrity: COs can currently edit `phone_primary`. A CO could redirect
   SMS/OTP to their own phone. Phone changes should alert the old number and require a
   non-CO approver.
4. Which payments count: only posted, or also pending offline collections? (Recommended: both,
   clearly labelled.)
5. Who owns dispute resolution, and the SLA.
6. SMS day/time, language (English/Yoruba/Pidgin?), and monthly SMS budget.
7. Weekly SMS scope: loans only, or also daily-contribution savings clients (higher volume)?
