# Phoenix ERP — Microfinance ERP Gap Analysis

**Date**: May 26, 2026  
**Scope**: Full system audit against the standard feature set required by a licensed Microfinance Bank (MFB) operating under CBN/NDIC guidelines (Nigeria)  
**Methodology**: Static code review of all Django app models, viewsets, Celery tasks, frontend pages, and companion service specification documents  

---

## Scoring Key

| Symbol | Meaning |
|--------|---------|
| ✅ **PRESENT** | Fully implemented — model + API + frontend page confirmed |
| 🔶 **PARTIAL** | Data model or backend exists; frontend incomplete, or workflow not closed end-to-end |
| ❌ **MISSING** | Not implemented anywhere in the system |

---

## Module-by-Module Assessment

---

### 1. CLIENT MANAGEMENT (KYC)

| Feature | Status | Notes |
|---------|--------|-------|
| Client registration (individual) | ✅ | `Client` model, `ClientFormPage.tsx` |
| NIN capture + real-time duplicate check | ✅ | `nin-check` endpoint, 600ms debounce on form |
| Cross-branch credit profile lookup | ✅ | `cross-branch-history` endpoint + tab on ClientDetailPage |
| Client classification (risk tier) | ✅ | `ClientClassification` model + `ClientClassificationsPage.tsx` |
| Client groups / solidarity groups | 🔶 | `ClientGroup` model exists; no Group Loan link — group is a contact structure only, not a lending unit |
| Client documents upload | ✅ | `ClientDocument` model |
| Client relationships (next-of-kin, guarantor links) | ✅ | `ClientRelationship` model |
| Client notes | ✅ | `ClientNote` model |
| Account manager assignment | ✅ | `Client.account_manager FK → Staff` |
| Customer audit trail | ✅ | `CustomerAuditLog` model + signal + tab on detail page |
| Client statement | ✅ | `ClientStatement.tsx`, `views_statement.py` |
| Client bulk import (Excel) | ✅ | `ClientBulkImportPage.tsx` |
| **Blacklist / watchlist management** | ❌ | No blacklist model. Required by NFIU AML guidelines — clients on EFCC/NFIU lists must be blocked from account opening |
| **Corporate client / legal entity registration** | ❌ | `Client` model has no `client_type` (individual vs corporate), no `rc_number` (CAC), no `directors` list. Cooperative societies and SME clients cannot be properly captured |
| **KYC completeness score / compliance status** | ❌ | No field tracking whether BVN/NIN/photo/address proof have been collected. Regulators require KYC status to be tracked per client |
| **BVN (Bank Verification Number) capture** | ❌ | NIN is present; BVN is a separate CBN-mandated identity field for MFBs |

---

### 2. LOAN MANAGEMENT

| Feature | Status | Notes |
|---------|--------|-------|
| Loan products (flat / reducing-balance / compound interest) | ✅ | `LoanProduct` model with `interest_method` field |
| Insurance rate on loan product | ✅ | `LoanProduct.insurance_rate` + `calculate_insurance()` |
| Loan application / account creation | ✅ | `LoanAccount` model; frontend pages in `pages/loans/` |
| Repayment schedule generation | ✅ | `LoanRepaymentSchedule` model + schedule generator |
| Collateral capture | ✅ | `LoanCollateral` model |
| Guarantor capture | ✅ | `LoanGuarantor` model |
| Loan verification system (auto-score + BM override) | ✅ | `LoanVerificationRequest` + `LoanVerifier` class |
| Loan approval workflow (maker-checker) | ✅ | `MakerCheckerMixin`, PermissionResolver on `approve()` |
| Disbursement (approve → execute → reject) | ✅ | `LoanDisbursement` model + `LoanDisbursementPage.tsx` |
| Charges transparency on approval | ✅ | `charges_summary` property + `LoanChargesSummaryModal.tsx` |
| Payment recording + arrears recalculation on payment | ✅ | `record_payment()` + `_calculate_arrears()` |
| Daily penalty task (Celery) | ✅ | `loans/tasks.py` — `apply_daily_loan_penalties` at 01:00 WAT |
| **Nightly arrears classification batch** | ❌ | `days_in_arrears` field exists but is only updated on `record_payment()`. A borrower with zero payments has `days_in_arrears = 0`. Designed as Java App 1 (not yet built) |
| **CBN 5-tier risk classification** | 🔶 | `risk_classification` field exists (`performing / watch / substandard / doubtful / loss`) but is never automatically updated — requires the Java batch (App 1) |
| **Loan provisioning entries** | ❌ | No automatic GL entries for CBN-mandated provisioning percentages (1% performing → 100% loss). Required for CBN examination |
| **Portfolio at Risk (PAR) calculation** | ❌ | Analytics module is completely empty (`analytics/models.py` has no models). No PAR 1, PAR 30, PAR 90 metrics computed anywhere |
| **Loan write-off workflow** | ❌ | No `LoanWriteOff` model, no write-off approval workflow, no GL entry to move from loan receivable to written-off account. Required for NPL management |
| **Loan restructuring / rescheduling** | ❌ | No model or workflow to modify repayment terms after disbursement (extend tenor, capitalise arrears, change interest rate). Common microfinance practice for stressed borrowers |
| **Group / solidarity lending** | ❌ | No Group Loan model. Group lending (joint-liability loans to solidarity groups) is one of the defining features of microfinance. `ClientGroup` exists structurally but is not linked to a loan |
| **Top-up loan (refinancing)** | ❌ | No way to link a new loan to an existing one or compute a top-up offer based on repayment history |
| **Loan insurance claim processing** | ❌ | Insurance premium is calculated and posted; no claim workflow when a borrower dies or defaults and insurance is triggered |
| **Credit bureau enquiry** | ❌ | No integration with CRC Credit Bureau or FirstCentral. CBN requires MFBs to query credit bureaus before disbursement above a threshold |
| **Seasonal / agricultural payment schedules** | ❌ | Repayment schedules are uniform (weekly/monthly). No balloon or harvest-cycle schedule for agricultural clients |
| **EFT / direct debit mandate** | ❌ | No NIBSS direct debit mandate management for automatic loan repayment deduction |

---

### 3. SAVINGS MANAGEMENT

| Feature | Status | Notes |
|---------|--------|-------|
| Savings accounts (voluntary) | ✅ | `SavingsAccount` model |
| Compulsory savings policy | ✅ | `CompulsorySavingsPolicy` model |
| Daily / weekly / monthly contribution cycles | ✅ | `ContributionSchedule` + `contribution_cycle` on Product |
| Smart savings (3-month cycle) | ✅ | `SmartSavingsAccount` model |
| Savings goals | ✅ | `SavingsGoal` model |
| Interest accrual model | ✅ | `InterestAccrual` model |
| Transaction holds | ✅ | `TransactionHold` model |
| Withdrawal GL posting (model method) | ✅ | `SavingsAccount.withdraw()` method |
| Daily collection sheet | ✅ | `DailyCollectionSheet` + `DailyCollectionSheetPage.tsx` |
| **Savings interest auto-posting batch** | ❌ | `InterestAccrual` model exists but no Celery task or batch to calculate and post daily/monthly interest credits to savings accounts. Interest accruals are never automatically generated |
| **Fixed Deposit (FD) / Term Deposit product** | ❌ | No `FixedDeposit` model with maturity date, lock period, premature-withdrawal penalty, and auto-rollover logic. FDs are a standard MFB product |
| **Savings withdrawal request → approval workflow** | ❌ | Withdrawal is a direct model method call (`SavingsAccount.withdraw()`). There is no `WithdrawalRequest` model to support the approval step required when a member wants to break compulsory savings |
| **Dormancy detection and management** | ❌ | No `is_dormant` flag, no `last_transaction_date` tracking, no Celery task to flag accounts inactive for 12+ months. NDIC guidelines require dormant account management |
| **Savings product configurator** | 🔶 | Contribution cycle is set at the Product level but the full product setup UI (interest rate, minimum balance, withdrawal restrictions) is not visible in the frontend pages list |
| **Savings account statement (PDF)** | 🔶 | Client ledger page exists; a formal printed savings statement PDF is not generated |

---

### 4. COLLECTIONS & CASH MANAGEMENT

| Feature | Status | Notes |
|---------|--------|-------|
| Daily collection sheet (CO level) | ✅ | `DailyCollectionSheet` + `CollectionSheetItem` models |
| Mark collection paid + GL posting | ✅ | `CollectionSheetItem.mark_paid()` |
| Aggregate cash → Branch Bank GL on EOD reconcile | ✅ | `DailyCollectionSheet.reconcile()` |
| CO must-be-zero enforcement | ✅ | `CanPostTodayPermission` blocks new collections with unreconciled prior-day sheet |
| Cashier accounts | ✅ | `CashierAccount` model |
| Cash transfers | ✅ | `CashTransfer` model + pages |
| Cash reconciliation | ✅ | `CashReconciliation` model |
| Bank reconciliation | ✅ | `BankReconciliation` model + `BankReconciliationPage.tsx` |
| Petty cash (fund, voucher, replenishment) | ✅ | Full petty cash module — 3 models, 9 pages |
| Bank statement upload + line matching | ✅ | `BankStatementUpload` + `BankStatementLine` models |
| **Automated bank feed (nightly pull from bank APIs)** | ❌ | Designed as Java App 3 (not yet built). Reconciliation items are currently entered manually |
| **NIBSS NIP outbound payment integration** | ❌ | No integration with NIBSS Instant Payment for interbank transfers. All outbound bank payments are recorded manually |
| **Mobile money / USSD payment collection** | ❌ | No connector to MTN MoMo, Opay, PalmPay, or USSD gateway. CO collection is cash-only or bank-transfer |
| **Intraday cash position dashboard** | ❌ | Analytics module is empty. No live view of tills vs bank vs outstanding collections across branches |

---

### 5. TREASURY & BANK MANAGEMENT

| Feature | Status | Notes |
|---------|--------|-------|
| Bank & bank account registry | ✅ | `Bank` + `BankAccount` models |
| Bank transfers (internal) | ✅ | `BankTransfer` model |
| Bank payments | ✅ | `BankPayment` model |
| Daily reconciliation | ✅ | `DailyReconciliation` + `ReconciliationException` models |
| Bank feed consent | ✅ | `BankFeedConsent` model (framework only) |
| **Inter-branch settlement / Head Office GL consolidation** | ❌ | `BranchScopedModel` enforces data isolation per branch but there is no inter-branch transaction model, no due-to/due-from accounts, and no HO consolidation view |
| **Foreign currency accounts** | ❌ | All amounts are in a single (implied NGN) currency. No `currency` field on `BankAccount`, no FX rate table, no multi-currency GL |

---

### 6. ACCOUNTING & GENERAL LEDGER

| Feature | Status | Notes |
|---------|--------|-------|
| Chart of accounts (5-tier hierarchy) | ✅ | `Account` + `AccountCategory` models |
| Standard chart of accounts (CBN format) | ✅ | `STANDARD_CHART_OF_ACCOUNTS.md` — pre-seeded data |
| Double-entry transactions | ✅ | `Transaction` + `TransactionEntry` (DR/CR pairs) |
| Accounting periods (open/close) | ✅ | `Period` model + `PeriodManagementPage.tsx` |
| Journal vouchers (manual entry) | ✅ | `JournalVoucher` model + 3 frontend pages |
| Trial Balance | ✅ | `TrialBalancePage.tsx` |
| Profit & Loss | ✅ | `ProfitLossPage.tsx` |
| Balance Sheet | ✅ | `BalanceSheetPage.tsx` |
| Cash Flow Statement | ✅ | `CashFlowStatementPage.tsx` |
| Balance sheet snapshots | ✅ | `BalanceSheetSnapshot` model |
| Account transaction patterns | ✅ | `AccountTransactionPattern` model |
| **Year-end close (rollover retained earnings)** | ❌ | `Period` model supports monthly close; no year-end procedure to zero income/expense accounts and credit retained earnings |
| **Tax computation and posting** | 🔶 | `TaxLiability` model in liabilities app. Actual VAT / WHT computation on invoices is not automated |
| **Intercompany / multi-entity consolidation** | ❌ | System is single-entity per tenant. No multi-company chart of accounts or elimination entries |

---

### 7. HR & PAYROLL

| Feature | Status | Notes |
|---------|--------|-------|
| Staff management | ✅ | `Staff` model + full CRUD pages |
| Salary components (earnings/deductions) | ✅ | `SalaryComponent` model |
| Payroll processing + payslips | ✅ | `Payroll` + `Payslip` models; frontend pages |
| PAYE calculation | ✅ | Calculated in `payroll_service.py` |
| Pension calculation (employee 8%, employer 10%) | ✅ | Calculated in `payroll_service.py` |
| Development Levy | ✅ | ₦1,000/year — configurable in `HRConfig` |
| Leave management (types, balances, requests) | ✅ | `LeaveType` + `LeaveBalance` + `LeaveRequest` models |
| Attendance + clock-in/out | ✅ | `Attendance` model + `ClockInOutPage.tsx` |
| Bonus / deduction requests | ✅ | `BonusDeductionRequest` model |
| Staff IOU | ✅ | `StaffIOU` model |
| Employee documents | ✅ | `EmployeeDocument` model |
| Pension remittance (internal record) | ✅ | `PensionRemittance` model + page |
| Payroll statutory filing record | ✅ | `PayrollStatutoryFiling` model |
| Bulk staff debit | ✅ | `BulkStaffDebitPage.tsx` |
| **NHF (National Housing Fund) calculation** | ❌ | Acknowledged in App 2 spec — not yet in `payroll_service.py`. Mandatory 2.5% employee contribution under the NHF Act |
| **NSITF (Nigeria Social Insurance Trust Fund)** | ❌ | Acknowledged in App 2 spec — not yet calculated. 1% of gross salary, employer-only |
| **PAYE schedule file generation (FIRS/state format)** | ❌ | Designed as Java App 2 (not yet built). Finance team must compile PAYE schedules manually |
| **Pension e-remittance file (PenCom format)** | ❌ | Designed as Java App 2. PFA remittance files in PenCom standard format not yet generated |
| **NHF remittance file (FMBN format)** | ❌ | Not designed anywhere yet |
| **NSITF remittance (NSITF portal format)** | ❌ | Not designed anywhere yet |
| **Performance management / appraisal** | ❌ | No staff appraisal, KPI, or performance review workflow |
| **Training records** | ❌ | No staff training log or certification tracking |
| **Disciplinary records** | ❌ | No disciplinary query / sanction model |

---

### 8. PROCUREMENT

| Feature | Status | Notes |
|---------|--------|-------|
| Supplier management (+ documents) | ✅ | `Supplier` + `SupplierDocument` models |
| Purchase requisition | ✅ | `PurchaseRequisition` model |
| Supplier quotes + comparison | ✅ | `SupplierQuote` model + `QuoteComparisonPage.tsx` |
| Purchase orders | ✅ | `PurchaseOrder` model |
| Goods Received Note + quality check | ✅ | `GoodsReceivedNote` model + `GRNQualityCheckPage.tsx` |
| 3-way matching (PR → PO → GRN) | ✅ | `ThreeWayMatchingDashboard.tsx` |
| Purchase returns | ✅ | `PurchaseReturn` model |
| **PO approval limit enforcement (PermissionResolver)** | 🔶 | Identified as MEDIUM-5 in existing gap analysis — `approval_limit` not enforced on PO approval actions |
| **Supplier performance rating** | ❌ | No supplier scorecard, on-time delivery rate, or quality rejection rate tracking |
| **Contract management** | ❌ | No supplier contract model with expiry alerts, renewal workflows, or SLA terms |
| **E-procurement / tender management** | ❌ | No competitive tender process for large procurement above board-defined thresholds |

---

### 9. INVENTORY MANAGEMENT

| Feature | Status | Notes |
|---------|--------|-------|
| Inventory categories and items | ✅ | `InventoryCategory` + `InventoryItem` models |
| Stock locations | ✅ | `Location` model |
| Stock movements | ✅ | `StockMovement` model + `StockMovementTracker.tsx` |
| Stock adjustments / write-off | ✅ | `StockAdjustmentRequest` + `WriteOffRequest` models |
| Stock transfers between locations | ✅ | `StockTransferRequest` model |
| Physical stock count | ✅ | `PhysicalCount` + `PhysicalCountLine` models |
| Cost layers (FIFO / AVCO) | ✅ | `InventoryCostLayer` + `CostLayerConsumption` models |
| Sales orders + invoicing | ✅ | `SalesOrder` + `Invoice` models (within inventory) |
| Inventory allocations | ✅ | `InventoryAllocation` + `AllocationRedemption` models |
| Inventory variance report | ✅ | `InventoryVarianceReport.tsx` |
| **Minimum stock level / reorder alerts** | ❌ | `InventoryItem` model likely has fields but no automatic reorder alert or Celery task to notify when stock falls below minimum |
| **Batch / expiry tracking** | ❌ | No batch number or expiry date tracking on inventory items. Relevant for MFBs that stock stationery, loan files, and any perishable collateral items |

---

### 10. FIXED ASSETS

| Feature | Status | Notes |
|---------|--------|-------|
| Asset categories | ✅ | `AssetCategory` model |
| Fixed asset register | ✅ | `FixedAsset` model |
| Depreciation (model + method) | ✅ | `AssetDepreciation` model |
| Asset maintenance | ✅ | `AssetMaintenance` model |
| Asset acquisition | ✅ | `AssetAcquisition` + `AssetAcquisitionLine` models |
| Asset requisition | ✅ | `AssetRequisition` + `AssetRequisitionLine` models |
| Asset transfers between branches | ✅ | `AssetTransfer` model |
| Asset assignment (to staff) | ✅ | `AssetAssignment` model |
| **Automated depreciation batch** | ❌ | `AssetDepreciation` model exists but no Celery task to automatically post monthly depreciation entries to the GL |
| **Asset disposal / sale workflow** | ❌ | No `AssetDisposal` model to record sale proceeds, calculate gain/loss, and derecognise the asset from the GL |
| **Asset insurance tracking** | ❌ | No insurance policy record on assets (insurer, policy number, premium, renewal date) |

---

### 11. BUDGETING

| Feature | Status | Notes |
|---------|--------|-------|
| Budget periods | ✅ | `BudgetPeriod` model |
| Budget lines | ✅ | `BudgetLine` model |
| **Budget vs actuals report** | ❌ | No report or view that compares `BudgetLine.amount` against actual GL expenditure for the same period and account |
| **Budget approval workflow** | ❌ | No maker-checker or board-approval workflow for budget creation |
| **Expenditure control (block posting over budget)** | ❌ | No enforcement that prevents posting an expense that exceeds the approved budget line |

---

### 12. RECEIVABLES

| Feature | Status | Notes |
|---------|--------|-------|
| Customer receivables | ✅ | `CustomerReceivable` model |
| Receivable activity log | ✅ | `ReceivableActivityLog` model |
| Customer statement | ✅ | `CustomerStatement` model |
| **Aging analysis report** | ❌ | No receivables aging report (0–30, 31–60, 61–90, 90+ days) |
| **Dunning / collections follow-up** | ❌ | No automated reminder or escalation for overdue receivables |

---

### 13. LIABILITIES

| Feature | Status | Notes |
|---------|--------|-------|
| Accounts payable | ✅ | `AccountsPayable` model |
| Accrued liabilities | ✅ | `AccruedLiability` model |
| Tax liabilities | ✅ | `TaxLiability` model |
| **AP aging report** | ❌ | No payables aging or overdue supplier invoice alerts |
| **Payment run / batch vendor payment** | ❌ | No ability to select multiple AP items and generate a single bank payment batch |

---

### 14. INCOME / FEE MANAGEMENT

| Feature | Status | Notes |
|---------|--------|-------|
| Income categories | ✅ | `IncomeCategory` model |
| Service items | ✅ | `ServiceItem` model |
| Fee structures (multi-component) | ✅ | `FeeStructure` + `FeeStructureComponent` models |
| Invoicing | ✅ | `Invoice` + `InvoiceItem` models (in incomes app) |
| Fee entitlements | ✅ | `FeeEntitlement` model + entitlement pages |
| Payment plans | ✅ | `PaymentPlan` + `PaymentPlanInstallment` models |
| Payment reversal requests | ✅ | `PaymentReversalRequest` model |
| Bulk invoice wizard | ✅ | `BulkInvoiceWizardDemo.tsx` |
| **VAT / WHT computation** | 🔶 | `TaxLiability` model exists; automatic tax computation on invoice line items is not confirmed |
| **Invoice PDF generation** | 🔶 | Invoice model exists; no confirmed PDF generation endpoint or print-ready template |

---

### 15. REPORTING & ANALYTICS

| Feature | Status | Notes |
|---------|--------|-------|
| Report builder (custom report templates) | ✅ | `ReportTemplate` + `ReportCategory` + `ReportExecution` models; `ReportBuilder.tsx` |
| Scheduled report delivery | ✅ | `ReportSchedule` model |
| Trial Balance / P&L / BS / Cash Flow | ✅ | 4 dedicated frontend pages |
| Inventory variance report | ✅ | Confirmed |
| **Portfolio Quality Reports (PAR 1/30/90)** | ❌ | Analytics module is empty. No PAR report, no portfolio summary by product/branch/officer |
| **CBN MFB returns (monthly/quarterly/annual)** | ❌ | No CBN-prescribed return format (MPR001, MPR002, etc.). Licensed MFBs must file these returns electronically via CBN's portal |
| **Loan officer performance report** | ❌ | No report tracking disbursements, collections, PAR by officer |
| **Branch performance dashboard** | ❌ | No cross-branch comparison view of key metrics |
| **MIS dashboard (executive)** | ❌ | Dashboard builder exists but no pre-configured executive MIS with loan book, deposits, PAR, income summary |
| **Cohort analysis (vintage analysis)** | ❌ | No loan cohort / vintage tracking for portfolio risk monitoring |

---

### 16. NOTIFICATIONS

| Feature | Status | Notes |
|---------|--------|-------|
| Notification channels | ✅ | `NotificationChannel` model |
| Notification templates | ✅ | `NotificationTemplate` model |
| Notification batches | ✅ | `NotificationBatch` model |
| User notification preferences | ✅ | `NotificationPreference` model |
| **SMS gateway integration (MTN/Airtel/Africa's Talking)** | ❌ | Channel model exists but no gateway connector. SMS is the primary communication channel for rural MFB clients |
| **Email delivery integration** | 🔶 | No confirmed SMTP/SendGrid integration in the notification dispatch layer |
| **Push notifications (mobile app)** | ❌ | No mobile app; push notification infrastructure not present |
| **Automated loan repayment reminders** | ❌ | No Celery task to send "your repayment of ₦X is due on [date]" SMS/email to borrowers |

---

### 17. COMPLIANCE & REGULATORY (CRITICAL GAPS)

| Feature | Status | Notes |
|---------|--------|-------|
| Business day management / day lock | ✅ | `BusinessDay` + `BackdateRequest` models |
| Audit trail (user/IP/timestamp on client actions) | ✅ | `CustomerAuditLog` |
| Maker-checker on loans + disbursements | ✅ | `MakerCheckerMixin` |
| Role-based permissions (6-phase system) | ✅ | `RolePermissionPolicy` + `PermissionResolver` |
| Permission elevation log | ✅ | `PermissionElevationLog` model |
| **AML / CFT module** | ❌ | No transaction monitoring rules, no suspicious transaction report (STR) workflow, no threshold-based alerts (e.g. cash > ₦5M). Mandatory under NFIU/CBN AML/CFT guidelines for all financial institutions |
| **NFIU STR / SAR filing** | ❌ | No Suspicious Transaction Report or Suspicious Activity Report generation in NFIU-prescribed format |
| **Customer risk scoring (AML)** | ❌ | No `aml_risk_score` on Client. No Politically Exposed Person (PEP) flag. Required by FATF guidelines |
| **OFAC / EFCC watchlist screening** | ❌ | No automated name screening against OFAC SDN list or EFCC watchlist at account opening or payment processing |
| **CBN monthly prudential returns** | ❌ | No automated data aggregation for CBN AFIS returns (MPR001, MPR004, MPR009, etc.) |
| **NDIC premium computation** | ❌ | No automatic calculation of NDIC deposit insurance premium (0.3% of insured deposits annually) |
| **Annual statutory audit trail export** | ❌ | No bulk export of all transactions, user actions, and approvals in auditor-readable format |
| **Data retention policy enforcement** | ❌ | No automated archiving of records older than the regulatory retention period (7 years minimum for MFBs) |

---

### 18. SYSTEM ADMINISTRATION & INFRASTRUCTURE

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-tenant / multi-branch scoping | ✅ | `BranchScopedModel` on every model |
| Role-based access control | ✅ | Full RBAC with 6-phase permission system |
| User management | ✅ | Django users + `Users` pages |
| Dashboard builder (role-based templates) | ✅ | `DashboardBuilderPage.tsx` with permission filtering |
| Automation engine | ✅ | `automations/` module + pages |
| Form schema builder | ✅ | `FormSchemaList.tsx` + `FormSchemaDetail.tsx` |
| Workflow engine | ✅ | Workflow pages in admin |
| **Two-factor authentication (2FA)** | ❌ | No TOTP/OTP or 2FA on login. CBN requires strong authentication for financial system access |
| **Session timeout / inactivity logout** | ❌ | No confirmed frontend session timeout or backend token expiry enforcement |
| **IP whitelisting** | ❌ | No IP-based access restriction for admin or API access |
| **Disaster recovery / database backup scheduling** | ❌ | No automated backup task or backup monitoring in the system |
| **Audit log export (to CSV/PDF for regulators)** | 🔶 | `CustomerAuditLog` exists; no bulk export endpoint confirmed |
| **Multi-factor approval for large transactions** | 🔶 | Maker-checker exists for loans; not confirmed for large bank transfers or GL journal entries above a threshold |
| **System health monitoring / alerting** | ❌ | No health check endpoints, no alerting integration (PagerDuty, Slack, etc.), no Celery task failure notifications |

---

### 19. INTEGRATIONS (EXTERNAL SERVICES)

| Feature | Status | Notes |
|---------|--------|-------|
| Bank statement upload (Excel) | ✅ | `BankStatementUpload` model |
| Staff Excel import | ✅ | `StaffExcelImportPage.tsx` |
| **NIBSS NIP (Instant Payment)** | ❌ | No outbound payment via NIBSS NIP for interbank transfers |
| **NIBSS Direct Debit (NDD)** | ❌ | No mandate management for automated loan repayment collection |
| **Credit bureau (CRC / FirstCentral)** | ❌ | No integration for pre-disbursement credit checks |
| **SMS gateway (Africa's Talking / Termii)** | ❌ | No confirmed gateway connector |
| **BVN validation API (NIN/BVN NIBSS endpoint)** | ❌ | NIN is stored but not validated against the NIMC central database |
| **Bank feed API (Mono / Okra)** | ❌ | Designed as Java App 3 (not yet built) |
| **PAYE/pension compliance file generation** | ❌ | Designed as Java App 2 (not yet built) |
| **E-signature / digital consent** | ❌ | No document signing workflow for loan agreements, mandate forms |
| **WhatsApp Business API** | ❌ | No WhatsApp notification channel (increasingly standard for Nigerian MFBs) |

---

## Summary Heat Map

| Domain | Coverage | Critical Gaps |
|--------|----------|---------------|
| Client KYC | 🟡 Good | Blacklist, BVN, corporate client, KYC score |
| Loan Management | 🟡 Good | Write-off, restructuring, group loans, PAR batch, provisioning |
| Savings | 🟡 Good | FD product, withdrawal workflow, interest batch, dormancy |
| Collections / Cash | 🟢 Strong | Bank feed automation, mobile money |
| Treasury | 🟢 Strong | Inter-branch GL, FX |
| Accounting / GL | 🟢 Strong | Year-end close, multi-entity |
| HR / Payroll | 🟡 Good | NHF/NSITF, statutory file generators |
| Procurement | 🟢 Strong | Contract mgmt, supplier scorecard |
| Fixed Assets | 🟡 Good | Depreciation batch, disposal |
| Reporting | 🔴 Weak | PAR, CBN returns, MIS dashboard |
| **Compliance / Regulatory** | 🔴 **Critical** | AML/CFT, CBN returns, 2FA, watchlist screening |
| Integrations | 🔴 Weak | NIBSS, credit bureaus, SMS, bank feed |

---

## Priority Remediation Roadmap

### P0 — Legal / Regulatory Exposure (Build before going live with any client)

1. **AML/CFT Transaction Monitoring** — Add threshold-based STR alerts (cash transactions > ₦5M, structuring patterns). Minimum: a `SuspiciousTransactionFlag` model + alert email to compliance officer.
2. **CBN 5-tier Risk Classification Batch** — Build Java App 1 (Loan Portfolio Batch Processor) before the first client exceeds 50 active loans.
3. **2FA on Login** — Add TOTP-based 2FA to the Django auth endpoint. High-risk without it.
4. **BVN Capture Field** — Add `bvn` field to `Client` model (mask in display). Required for CBN account opening rules.
5. **KYC Completeness Flag** — Add a `kyc_status` field (`incomplete / pending_verification / verified`) to `Client` and block loan disbursement to unverified clients.

### P1 — Operational Completeness (Build within first 3 months of live operations)

6. **Savings Interest Auto-posting** — Add a Celery Beat task to calculate and post monthly interest credits to savings accounts using `InterestAccrual` model.
7. **Loan Write-off Workflow** — Add `LoanWriteOff` model + approval workflow + GL entry (DR Provision for Loan Losses / CR Loan Receivable).
8. **Fixed Deposit Product** — Add `FixedDeposit` model with maturity handling and auto-rollover.
9. **Savings Withdrawal Request Workflow** — Add `WithdrawalRequest` model so compulsory savings withdrawals go through an approval step.
10. **Asset Depreciation Batch** — Add Celery Beat task to post monthly straight-line / reducing-balance depreciation to GL.

### P2 — Statutory Filing (Build as first payroll is processed)

11. **NHF + NSITF Calculations** — Add to `payroll_service.py` as prerequisite for Java App 2.
12. **Statutory Compliance Service (Java App 2)** — Build PAYE schedule generator and PenCom e-remittance file generator.
13. **PAYE Filing Status on Payroll List** — Add `filing_status` column as per App 2 spec.

### P3 — Reporting & Analytics (Build when portfolio > 100 loans)

14. **PAR Report (PAR 1 / 30 / 90)** — Implement analytics views using data from the Java batch after App 1 is live.
15. **CBN MFB Returns Template** — Build a data-aggregation endpoint that produces CBN-prescribed return figures (total loans, deposits, NPL ratio, capital adequacy).
16. **Budget vs Actuals Report** — Add a view comparing `BudgetLine` amounts against actual GL spend.

### P4 — Integration Layer (Build when volumes justify cost)

17. **SMS Gateway (Africa's Talking or Termii)** — Connect notification dispatch to an SMS API.
18. **Credit Bureau Integration (CRC)** — Add pre-disbursement credit check step to the loan verification flow.
19. **NIBSS NIP Integration** — Enable outbound bank payments via NIBSS Instant Payment.
20. **Bank Feed Service (Java App 3)** — Build when client has 3+ bank accounts being reconciled monthly.

---

*Generated: May 26, 2026 — Phoenix ERP Implementation Team*
