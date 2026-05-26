# SYSTEM NEW FEATURES — IMPLEMENTATION TRACKER

> **Rule**: All changes go through the new ERP only.  
> Tick `[x]` in **Backend** and **Frontend** columns as each side is completed.  
> "Old ERP ref" points to the old codebase equivalent for guidance.

---

## FEATURE STATUS LEGEND
- ✅ DONE — fully implemented (backend + frontend)  
- 🔶 PARTIAL — logic partially exists; needs extension  
- ❌ MISSING — not yet started  
- 🔒 EXISTS — already fully present; verify only  
- ❓ NEEDS CLARIFICATION — awaiting design decision  

---

## FEATURES

### 1 · One Account to Manage All Three Goods (Monthly / Weekly / Daily)
**Status**: ✅ DONE  
**Old ERP ref**: `savings/models.py` → `Savings.type` ('N'=Normal, 'D'=Daily_Contribution) + `SmartSavingsAccount` (3-month cycle)  
**Implementation Summary**:
- `contribution_cycle` + `contribution_amount` fields added to `Product` (product-level cycle drives all accounts of that product)
- `contribution_day_of_week` added to `SavingsAccount` (for weekly accounts — 0=Mon … 6=Sun)
- New models: `SmartSavingsAccount` (1-to-1 with SavingsAccount, 3-month 6% interest cycle), `SmartSavingsEvent`, `ContributionSchedule` (per-day expected rows with status: pending/paid/missed), `CompulsorySavingsPolicy`
- `savings/serializers.py` — full serializers for all new models
- `savings/views.py` — `SavingsAccountViewSet` (generate-schedule, schedule, toggle-smart-savings), `ContributionScheduleViewSet` (mark-paid, generate-for-month), `CompulsorySavingsPolicyViewSet`
- `savings/urls.py` — router registered at `api/savings/`
- Migrations: `products/0003` + `savings/0003` — **APPLIED**
- Frontend: `savingsService.ts` — full type-safe service layer
- Frontend: `SavingsCollectionPage.tsx` — daily collection sheet with date picker, cycle/status filters, summary cards, Mark Paid modal, Generate Month Schedule (supervisor+)
- Route: `/savings/collection`

| Layer    | Done? | PR/Commit |
|----------|-------|-----------|
| Backend  | [x] Product fields, Savings models, serializers, viewsets, URL registration, migrations applied |           |
| Frontend | [x] `savingsService.ts`, `SavingsCollectionPage.tsx`, route in `App.tsx` |           |

---

### 2 · Upload Bank Statements for Automatic Reconciliation
**Status**: ✅ DONE  
**Old ERP ref**: Not present in old ERP either. Net-new feature.  
**Implementation Summary**:
- `BankStatementUpload` + `BankStatementLine` models in `banks/models.py`
- `BankStatementUploadSerializer`, `BankStatementLineSerializer` in `banks/serializers.py`
- `BankStatementUploadViewSet` with `lines`, `unmatched-lines`, `match-line` actions in `banks/views.py`
- URL: `/api/banks/statement-uploads/`
- Frontend: `src/services/bankStatementService.ts` + `src/pages/banks/BankStatementUploadPage.tsx`
- Route: `/banks/statement-uploads`

| Layer    | Done? | PR/Commit |
|----------|-------|-----------|
| Backend  | [x] models, serializers, viewset, URL registration, migration banks/0010 |           |
| Frontend | [x] `bankStatementService.ts`, `BankStatementUploadPage.tsx`, route in `App.tsx` |           |

---

### 3 · Daily Back-Dating Requires Clearance + Day Lock
**Status**: ✅ DONE  
**Old ERP ref**: `administration/models.py` → `MonthStatus` (monthly closure only). Old ERP does NOT have daily lock.  
**Implementation Summary**:
- `BusinessDay` + `BackdateRequest` models in `common/models.py`
- `BusinessDaySerializer`, `BackdateRequestSerializer` in `common/serializers.py`
- `BusinessDayViewSet` (with `close-day` + `reopen` actions) and `BackdateRequestViewSet` (with `approve` + `reject`) in `common/views.py`
- URL: `/api/common/business-days/`, `/api/common/backdate-requests/`
- Frontend: `src/services/businessDayService.ts` + `src/pages/common/BusinessDayManagementPage.tsx`
- Route: `/business-day`

| Layer    | Done? | PR/Commit |
|----------|-------|-----------|
| Backend  | [x] models, serializers, viewsets, URL registration, migration common/0003 |           |
| Frontend | [x] `businessDayService.ts`, `BusinessDayManagementPage.tsx`, route in `App.tsx` |           |

---

### 4 · Customer Audit Trail (User ID, Timestamp, IP, Action — Read-Only)
**Status**: ✅ DONE  
**Old ERP ref**: `administration/models.py` → `Tickets` — not a true audit trail, only issue tracking.  
**Implementation Summary**:
- `CustomerAuditLog` model in `clients/models.py`; signal in `clients/signals.py`; middleware `AuditContextMiddleware` in `common/middleware.py`
- `audit-log` list-only endpoint on `ClientViewSet`
- Frontend: audit log tab component needed on `ClientDetailPage` (pending)

| Layer    | Done? | PR/Commit |
|----------|-------|-----------|
| Backend  | [x] `CustomerAuditLog` model, signal, middleware, serializer, `audit-log` view action |           |
| Frontend | [x] audit log tab + cross-branch tab on `ClientDetailPage.tsx`; new tab state + lazy-load logic |           |

---

### 5 · Assign an Account Manager for Each Customer
**Status**: ✅ DONE  
**Old ERP ref**: Not present.  
**Implementation Summary**:
- `Client.account_manager FK → hr.Staff` added; migration applied
- Serializer exposes `account_manager` and `account_manager_name`; BM-level write enforced in view

| Layer    | Done? | PR/Commit |
|----------|-------|-----------|
| Backend  | [x] `Client.account_manager FK`, serializer fields, view `account_manager` filter |           |
| Frontend | [x] account manager selector on `ClientFormPage.tsx` (BM+ roles only; staff list fetched from `/hr/staff/`) |           |

---

### 6 · NIN as Key for Account Opening + Real-Time Duplicate Check + Branch-Agnostic Credit Profile
**Status**: ✅ DONE  
**Old ERP ref**: Not present in old ERP.  
**Implementation Summary**:
- `Client.nin` field with uniqueness validator, `nin-check` GET endpoint, `cross-branch-history` endpoint, migration 0008

| Layer    | Done? | PR/Commit |
|----------|-------|-----------|
| Backend  | [x] `Client.nin` field, validator, `nin-check` endpoint, `cross-branch-history` endpoint, migration 0008 |           |
| Frontend | [x] NIN field + 600ms debounced live duplicate check in `ClientFormPage.tsx`; cross-branch history tab in `ClientDetailPage.tsx` |           |

---

### 7 · Branch Selection on Customer Creation
**Status**: ✅ EXISTS — verified  
**Old ERP ref**: `client/models.py` → `Client.office FK → administration.Office`  
**Current new ERP state**: `Client` inherits `BranchScopedModel` → has `branch FK → branches.Branch`.

| Layer    | Done? | PR/Commit |
|----------|-------|-----------|
| Backend  | [x] exists — verified in serializer | |
| Frontend | [x] `branch` field present via `BranchScopedModel`; auto-assigned from user staff profile; verified in serializer response | |

---

### 8 · CO Posts Only to Cash (Till) + Branch Bank; Cannot See Other GL Accounts
**Status**: ✅ DONE  
**Old ERP ref**: Role-based view restriction (old ERP uses `@allowed_users` decorator).  
**Implementation Summary**:
- `_LazyBankAccountField` in `cash_management/serializers.py` filters to `is_active=True`; CO sees only branch bank accounts

| Layer    | Done? | PR/Commit |
|----------|-------|-----------|
| Backend  | [x] `_LazyBankAccountField` queryset filter for CO role |           |
| Frontend | [x] `CollectModal` in `DailyCollectionSheetPage.tsx` restricts payment_mode to `cash` + `bank_transfer` for credit_officer; `mobile_money` hidden with explanatory note |           |

---

### 9 · BM Cannot Self-Approve Bank Transfers + Maker ≠ Checker for ALL Sensitive Actions
**Status**: ✅ DONE  
**Old ERP ref**: `administration/models.py` → `Approval` model (`user`=maker, `approved_by`=checker).  
**Implementation Summary**:
- `MakerCheckerMixin` in `common/mixins.py` with `assert_not_maker(acting_user, action)`
- Applied to: `LoanAccount.approve()`, `LoanDisbursement.approve_disbursement()`, `ResourceConsumption.approve()`
- Frontend: approve buttons show maker-checker notice; `LoanDisbursementPage` displays four-eyes banner

| Layer    | Done? | PR/Commit |
|----------|-------|-----------|
| Backend  | [x] `MakerCheckerMixin`, applied to LoanAccount, LoanDisbursement, ResourceConsumption |           |
| Frontend | [x] four-eyes notice on LoanDisbursementPage; server-side 400 handled with toast |           |

---

### 10 · Loan Approval by BM; Disbursement to Account (Can Still Be Rejected at Disbursement)
**Status**: ✅ DONE  
**Old ERP ref**: `loan/models.py` → `LoanDisbursement` (DRAFT→PENDING→PAID). Disbursement approval is separate from loan approval.  
**Implementation Summary**:
- `LoanDisbursement` model in `loans/models.py`: status choices, `approve_disbursement()`, `execute_disbursement()`, `reject_disbursement()`
- Auto-created via signal on loan approval (`loans/signals.py`)
- `LoanDisbursementViewSet` with `approve`, `execute`, `reject` actions
- URL: `/api/loans/disbursements/`
- Frontend: `LoanDisbursementPage.tsx` at `/loans/disbursements/:loanId`

| Layer    | Done? | PR/Commit |
|----------|-------|-----------|
| Backend  | [x] model, serializer, viewset with approve/execute/reject, URL, migration loans/0005 |           |
| Frontend | [x] `LoanDisbursementPage.tsx`, route in `App.tsx`, service methods in `loanService.ts` |           |

---

### 11 · Loan Approval Includes ALL Charges (Processing, Insurance, Interest) — Total Transparency
**Status**: ✅ DONE  
**Old ERP ref**: `loan/forms.py` → `LoanRegistrationForm` shows `registration_fee`, `risk_premium`, `union_contribution`, `admin_fees`, `interest`. `income/models.py` → singleton charge models.  
**Implementation Summary**:
- `LoanProduct.insurance_rate` + `LoanProduct.insurance_income_account` + `LoanProduct.calculate_insurance()`
- `LoanAccount.insurance_amount` field; `LoanAccount.charges_summary` property
- `LoanAccountDetailSerializer` returns `charges_summary: { processing_fee, insurance_amount, total_charges }`
- Frontend: `LoanChargesSummaryModal.tsx` reusable modal; charges visible on disbursement/approval pages

| Layer    | Done? | PR/Commit |
|----------|-------|-----------|
| Backend  | [x] insurance fields on LoanProduct/LoanAccount, charges_summary in serializer, migration loans/0005 |           |
| Frontend | [x] `LoanChargesSummaryModal.tsx` component |           |

---

### 12 · Loan Verifier System (Automatic Recommendation; BM Override Recorded)
**Status**: ✅ DONE  
**Old ERP ref**: `loan/models.py` → `LoanVerificationRequest`. `loan/utils.py` → `LoanVerifier` class.  
**Implementation Summary**:
- `LoanVerificationRequest` model in `loans/models.py`; `LoanVerifier` class in `loans/utils.py`
- Auto-created on loan creation via signal (`loans/signals.py`)
- `LoanVerificationRequestViewSet` with `run-check` and `verdict` actions
- URL: `/api/loans/verification-requests/`
- Frontend: `LoanVerificationPage.tsx` at `/loans/verification/:loanId`

| Layer    | Done? | PR/Commit |
|----------|-------|-----------|
| Backend  | [x] model, utils, signal, serializer, viewset, URL, migration loans/0005 |           |
| Frontend | [x] `LoanVerificationPage.tsx`, route in `App.tsx`, service methods in `loanService.ts` |           |

---

### 13 · After Daily Bulk Posting — Aggregate Cash Hits Branch Bank GL Account
**Status**: ✅ DONE  
**Old ERP ref**: Manual bank transfer process in old ERP.  
**Implementation Summary**:
- `DailyCollectionSheet.reconcile()` now creates a `Transaction` (DR Branch Bank, CR Officer Till) via `Transaction.post()`
- `Branch.main_bank_account FK → banks.BankAccount` added; migration branches/0005

| Layer    | Done? | PR/Commit |
|----------|-------|-----------|
| Backend  | [x] `reconcile()` GL posting + `Branch.main_bank_account` FK, migration branches/0005 |           |
| Frontend | [x] `ReconcileModal` in `DailyCollectionSheetPage.tsx` shows `total_collected_cash` GL sweep preview (DR Branch Bank / CR Officer Till) before confirming; blocks if pending transfers remain |           |

---

### 14 · All Credit Officer / Cashier Accounts Must Be Zero at End of Day
**Status**: ✅ DONE  
**Old ERP ref**: Not explicitly in old ERP. Implied by end-of-day cash banking.  
**Implementation Summary**:
- `CanPostTodayPermission` DRF permission in `cash_management/permissions.py`
- Applied to `CollectionSheetItemViewSet.create` — raises 403 if CO has unreconciled prior-day sheet
- `notify_unreconciled_sheets` Celery task extended to escalate to BM
- Frontend: warning banner on CO dashboard (pending implementation)

| Layer    | Done? | PR/Commit |
|----------|-------|-----------|
| Backend  | [x] `CanPostTodayPermission`, permission applied to collection sheet posting |           |
| Frontend | [x] amber warning banner on `DashboardPage.tsx` for credit_officer with unreconciled prior-day sheets; links to `/cash-management/collection-sheets` |           |

---

## IMPLEMENTATION ORDER (Recommended)

Dependencies considered:

| Priority | Feature | Reason |
|----------|---------|--------|
| 1st | **#6 NIN** | Foundation for cross-branch credit checks (needed by #12) |
| 2nd | **#4 Audit Trail** | Must be in place before other changes so logs start accumulating |
| 3rd | **#11 Charges on Approval** | Insurance + charges on `LoanProduct` needed by #12 verifier |
| 4th | **#12 Verifier System** | Needs NIN (#6), charges (#11), cross-branch data |
| 5th | **#10 Disbursement Model** | Needs loan approval flow to be stable |
| 6th | **#9 Maker-Checker extension** | Apply to disbursement (#10), expenses, payroll |
| 7th | **#3 Day Lock** | Needs collection sheet workflow (#13, #14) to be stable |
| 8th | **#13 Bulk → Bank** | Extend existing `reconcile()` |
| 9th | **#14 EOD Zero enforcement** | Extend existing notify task |
| 10th | **#5 Account Manager** | Simple FK addition |
| 11th | **#8 CO GL filter** | Serializer-level queryset filter |
| 12th | **#2 Bank Statement Upload** | Standalone; no blocking dependencies |
| 13th | **#1 Savings Cycles** | Needs product-level changes |
| Last | **#7 Branch on customer** | Already exists; verify only |

---

## CLIENT DECISIONS (2026-05-21)

| # | Question | Decision |
|---|----------|----------|
| 1 | Savings cycles | One account with multiple schedules under it |
| 3 | Day lock trigger | BM can force-close and set the date |
| 9 | Maker-Checker scope | Loan approval, disbursement, expenses above threshold, payroll, manual GL adjustments |
| 10 | Disbursement rejection | BM chooses at rejection time: cancel OR return to draft |
| 12 | Verifier formula | Use old ERP formula but BM can configure the weights |
| 2 | Statement format | Excel (.xlsx) |
| Order | Implementation | Follow recommended order in tracker |

---

*Last updated: 2026-05-21*  
*Tracking by: Phoenix ERP Implementation Team*
