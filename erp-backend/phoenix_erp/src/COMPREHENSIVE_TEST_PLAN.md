# Phoenix ERP - Comprehensive Test Plan

## Overview

This document outlines the comprehensive testing strategy for Phoenix ERP backend. Tests ensure all features work correctly, handle edge cases, and maintain data integrity.

## Test Organization

Tests are organized by Django app, with each app having:
- `test_models.py` - Model tests (creation, validation, methods, constraints)
- `test_services.py` - Business logic tests (complex operations, calculations)
- `test_views.py` - View tests (permissions, responses, filtering)
- `test_api.py` - API endpoint tests (REST API, serialization)
- `test_integration.py` - Integration tests (cross-app functionality)

---

## 1. Accounts App Tests

### Models (`accounts/tests/test_models.py`)
- [x] **Period Model**
  - Create monthly/yearly periods
  - Unique constraint (owner, branch, year, month)
  - Close/reopen functionality
  - Month reopenable, year not reopenable
  - Ordering (descending by year, month)

- [x] **AccountCategory Model**
  - Create all 5 categories (Assets, Liabilities, Equity, Revenue, Expenses)
  - Auto-generate code_prefix from section
  - Unique section constraint
  - String representation

- [x] **Account Model - Basic**
  - Create parent and child accounts
  - Code validation (100-599 for parent, XXX-YYY for child)
  - All account types (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE, LOAN, SAVINGS)
  - Hierarchy (parent.children relationship)
  - Balance initialization (balance, balance_bf)
  - Version field for optimistic locking
  - System account flag
  - Manual entries flag
  - Smart forms enablement

- [ ] **Account Model - Balance Management**
  - Update balance atomically
  - Concurrent balance updates (thread safety)
  - Optimistic locking with version field
  - Balance calculations

- [ ] **BalanceSheetSnapshot Model**
  - Create snapshots
  - Multiple snapshots per account
  - Track balance changes over time
  - Snapshot date ordering

- [ ] **Soft Delete**
  - All models support soft delete
  - deleted_at timestamp
  - Filtering active vs deleted records

### Services (`accounts/tests/test_services.py`)
- [ ] **close_month()**
  - Close month creates Period record
  - Prevent transactions in closed month
  - Reopenable month periods

- [ ] **year_end_close()**
  - Create year-end Period (non-reopenable)
  - Calculate net income (revenue - expenses)
  - Transfer to retained earnings
  - Create opening balances for next year
  - Handle all account types correctly

- [ ] **create_balance_snapshots()**
  - Create snapshots for all accounts
  - Snapshot date validation
  - Bulk creation performance

- [ ] **reopen_period_and_invalidate()**
  - Reopen period if allowed
  - Invalidate dependent snapshots
  - Prevent reopening year-end

- [ ] **reclose_periods()**
  - Recalculate balances
  - Update snapshots
  - Maintain data integrity

### Views/API (`accounts/tests/test_api.py`)
- [ ] **Account API**
  - List accounts (filtered by owner/branch)
  - Create account
  - Retrieve account details
  - Update account
  - Delete account (soft delete)
  - children_summary endpoint for parent accounts
  - Permission checks

- [ ] **Period API**
  - List periods
  - Close period endpoint
  - Reopen period endpoint
  - Year-end close endpoint

- [ ] **BalanceSheetSnapshot API**
  - List snapshots
  - Filter by date range
  - Filter by account

---

## 2. Transactions App Tests

### Models (`transactions/tests/test_models.py`)
- [ ] **TransactionSeries Model**
  - Create series with code
  - Auto-generate sequence name
  - Create Postgres sequence
  - Unique code constraint

- [ ] **Transaction Model**
  - Create transaction
  - Auto-generate reference_number from series
  - Approval workflow (approved, approved_by, approved_at)
  - Reversal tracking (is_reversed, reversal_transaction)
  - Prevent posting to closed periods
  - Balance validation (debits = credits)

- [ ] **Transaction Methods**
  - post() - Post transaction and update balances
  - validate_entries() - Ensure debits = credits
  - reverse() - Create reversing transaction
  - get_total_amount() - Calculate total

- [ ] **TransactionEntry Model**
  - Create debit/credit entries
  - Link to account and transaction
  - Amount validation (positive)
  - Side choices (DEBIT, CREDIT)

- [ ] **TransactionEntry Methods**
  - post() - Update account balance with SELECT FOR UPDATE
  - signed_amount() - Return signed amount based on side

### Services (`transactions/tests/test_services.py`)
- [ ] **create_transaction()**
  - Create transaction with entries
  - Validate balance
  - Auto-generate reference number

- [ ] **post_transaction()**
  - Validate all entries
  - Update all account balances atomically
  - Mark as approved
  - Handle concurrency

- [ ] **reverse_transaction()**
  - Create opposite entries
  - Link reversal to original
  - Mark original as reversed
  - Post reversal

- [ ] **validate_period_not_closed()**
  - Check month period
  - Check year period
  - Raise error if closed

### API (`transactions/tests/test_api.py`)
- [ ] **Transaction API**
  - List transactions
  - Create transaction with entries
  - Retrieve transaction
  - Post transaction endpoint
  - Reverse transaction endpoint
  - Filter by date range
  - Filter by approved status
  - Permission checks

---

## 3. Automations/Workflows App Tests

### Models (`automations/tests/test_models.py`)
- [ ] **FormSchema Model**
  - Create form with schema
  - Field validation rules
  - Trigger event name
  - Active/inactive forms
  - validate_data() method

- [ ] **FormSubmission Model**
  - Create submission
  - Auto-generate reference
  - Status workflow (PENDING, PROCESSING, COMPLETED, FAILED)
  - Link to WorkflowExecution

- [ ] **WorkflowTemplate Model**
  - Create workflow with steps
  - Triggers (events, schedules)
  - Active/inactive workflows
  - Version tracking

- [ ] **WorkflowStep Model**
  - Step ordering
  - Step types (action, condition, sub-workflow)
  - Configuration validation

- [ ] **WorkflowExecution Model**
  - Create execution from template
  - Status tracking
  - Error handling
  - Context data

- [ ] **WorkflowStepExecution Model**
  - Execute steps in order
  - Handle conditions
  - Execute sub-workflows
  - Record results

### Services (`automations/tests/test_services.py`)
- [ ] **trigger_workflow()**
  - Match event to workflows
  - Create execution
  - Pass context data

- [ ] **execute_workflow()**
  - Execute all steps in order
  - Handle conditions (skip/execute)
  - Execute sub-workflows
  - Update status

- [ ] **execute_step()**
  - Execute action based on type
  - Apply conditions
  - Handle errors
  - Return result

- [ ] **validate_form_submission()**
  - Validate against schema
  - Check required fields
  - Type validation
  - Return errors

### API (`automations/tests/test_api.py`)
- [ ] **FormSchema API**
  - List forms
  - Create form
  - Update form schema
  - Activate/deactivate

- [ ] **FormSubmission API**
  - Submit form data
  - List submissions
  - Retrieve submission with workflow status

- [ ] **WorkflowTemplate API**
  - List workflows
  - Create workflow with steps
  - Update workflow
  - Activate/deactivate
  - Test workflow with sample data

---

## 4. Loans App Tests

### Models (`loans/tests/test_models.py`)
- [ ] **LoanProduct Model**
  - Create loan product
  - Interest calculation methods (flat, reducing balance)
  - Processing fee calculation
  - Late penalty calculation
  - Grace period handling

- [ ] **LoanAccount Model**
  - Create loan application
  - Approval workflow
  - Disbursement process
  - Repayment schedule generation
  - Payment recording
  - Arrears calculation
  - Status workflow (PENDING, APPROVED, ACTIVE, COMPLETED, DEFAULTED)

- [ ] **LoanAccount Methods**
  - approve() - Approve loan and set approved amount
  - disburse() - Create disbursement transaction, generate schedule
  - record_payment() - Record payment, update schedule
  - _generate_repayment_schedule() - Generate schedule based on method
  - _calculate_installment_amounts() - Calculate payment amounts
  - _update_schedule_with_payment() - Apply payment to schedule
  - _calculate_arrears() - Calculate overdue amounts
  - total_outstanding() - Calculate remaining balance
  - is_in_arrears() - Check if any payments overdue

- [ ] **LoanRepaymentSchedule Model**
  - Create schedule entry
  - Track principal and interest
  - Payment status
  - is_overdue() method

### Services (`loans/tests/test_services.py`)
- [ ] **create_loan_application()**
- [ ] **approve_loan()**
- [ ] **disburse_loan()**
- [ ] **record_loan_payment()**
- [ ] **calculate_loan_schedule()**
- [ ] **check_overdue_loans()**
- [ ] **apply_late_penalties()**

### API (`loans/tests/test_api.py`)
- [ ] **LoanProduct API**
- [ ] **LoanAccount API**
- [ ] **Repayment Schedule API**

---

## 5. Savings App Tests

### Models (`savings/tests/test_models.py`)
- [ ] **SavingsAccount Model**
  - Create savings account
  - deposit() method
  - withdraw() method
  - current_balance property
  - available_balance property (minus holds)
  - Interest accrual

- [ ] **SavingsGoal Model**
  - Create goal
  - Track progress
  - progress_percentage() method

- [ ] **TransactionHold Model**
  - Create hold
  - Reduce available balance
  - release() method
  - Expiry handling

- [ ] **InterestAccrual Model**
  - Calculate interest
  - Track accrual periods
  - Post interest to account

### Services (`savings/tests/test_services.py`)
- [ ] **create_savings_account()**
- [ ] **deposit_to_savings()**
- [ ] **withdraw_from_savings()**
- [ ] **calculate_interest()**
- [ ] **post_interest_accruals()**

---

## 6. Products App Tests

### Models (`products/tests/test_models.py`)
- [ ] **ProductCategory Model**
- [ ] **Product Model**
  - All product types (LOAN, SAVINGS, INVESTMENT, etc.)
  - Form schema association
  - Workflow template association
  - Requirements and validation

- [ ] **ProductRequirement Model**
- [ ] **Fee Model**
  - Fee types (FIXED, PERCENTAGE, TIERED)
  - calculate_fee() method

---

## 7. Other Apps Tests

### Assets
- Asset registration
- Depreciation calculation
- Disposal tracking

### HR
- Employee management
- Payroll processing
- Leave management

### Branches
- Branch hierarchy
- Branch-scoped data

### Clients
- Client onboarding
- KYC verification
- Client accounts

### Expenses
- Expense recording
- Approval workflow
- Category tracking

### Incomes
- Income recording
- Revenue recognition

### Inventory
- Stock management
- Reorder levels
- Stock movements

### Liabilities
- Liability tracking
- Payment schedules

### Notifications
- Notification creation
- Delivery tracking
- User preferences

### Reports
- Report generation
- Template management
- Scheduled reports

### Tickets
- Ticket creation
- Assignment workflow
- Resolution tracking

### Users
- User registration
- Authentication
- Permissions

### Widgets
- Dashboard widgets
- Widget configuration
- Data aggregation

---

## 8. Integration Tests

### Cross-App Workflows
- [ ] **Loan Disbursement Flow**
  - Create loan
  - Approve loan
  - Disburse (creates transaction, updates accounts)
  - Verify account balances
  - Verify transaction recorded

- [ ] **Savings Deposit Flow**
  - Deposit to savings
  - Creates transaction
  - Updates savings balance
  - Updates bank account balance

- [ ] **Period Close with Transactions**
  - Create transactions
  - Close period
  - Verify no new transactions allowed
  - Verify balances frozen

- [ ] **Workflow Trigger from Form**
  - Submit form
  - Workflow triggered
  - Actions executed
  - Transaction created
  - Accounts updated

- [ ] **Year-End Close Full Flow**
  - Multiple transactions across accounts
  - Close all months
  - Close year
  - Verify retained earnings
  - Verify opening balances next year

### Permission Tests
- [ ] User can only access own data (owner filter)
- [ ] Branch-scoped data filtering
- [ ] Admin vs regular user permissions
- [ ] API authentication required

### Performance Tests
- [ ] Concurrent transaction posting
- [ ] Large dataset queries
- [ ] Bulk operations (snapshots, interest accrual)

---

## Test Execution Strategy

### Priority Levels

**Priority 1 (Critical):**
- Account balance management
- Transaction posting
- Period closing
- Loan disbursement and repayment
- Workflow execution

**Priority 2 (High):**
- All model CRUD operations
- API endpoints
- Form submissions
- Interest calculations

**Priority 3 (Medium):**
- Soft delete functionality
- Reporting
- Notifications
- Integration tests

**Priority 4 (Low):**
- Performance tests
- Edge cases
- UI-related tests

### Coverage Goals
- Minimum 80% code coverage
- 100% coverage on critical paths (transactions, balances)
- All models tested
- All API endpoints tested
- All services tested

### Test Data Management
- Use factories (factory_boy) for test data generation
- Fixtures for reference data (account categories, transaction series)
- Isolation between tests (Django TestCase transaction rollback)

---

## Running Tests

```bash
# Run all tests
python manage.py test

# Run specific app tests
python manage.py test accounts
python manage.py test transactions
python manage.py test automations

# Run specific test file
python manage.py test accounts.tests.test_models

# Run specific test class
python manage.py test accounts.tests.test_models.AccountModelTest

# Run specific test method
python manage.py test accounts.tests.test_models.AccountModelTest.test_create_parent_account

# Run with coverage
coverage run --source='.' manage.py test
coverage report
coverage html

# Run parallel tests (faster)
python manage.py test --parallel
```

---

## Next Steps

1. ✅ Create test file structure
2. ⏳ Implement Priority 1 tests (accounts, transactions)
3. ⏳ Implement Priority 2 tests (loans, savings, automations)
4. ⏳ Implement Priority 3 tests (other apps)
5. ⏳ Implement integration tests
6. ⏳ Achieve 80%+ coverage
7. ⏳ Set up CI/CD to run tests automatically
8. ⏳ Add performance benchmarks

---

**Status:** In Progress  
**Last Updated:** December 20, 2025  
**Coverage Target:** 80%  
**Current Coverage:** TBD (run coverage report)
