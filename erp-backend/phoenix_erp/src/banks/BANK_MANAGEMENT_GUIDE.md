# Bank Management System - Complete Implementation Guide

## Overview

A comprehensive bank management system has been implemented for the Phoenix ERP. This system enables organizations to:

1. **Manage Multiple Banks** - Track relationships with different banks
2. **Manage Bank Accounts** - Create and manage organization's bank accounts with GL integration
3. **Handle Cashier Transfers** - Allow cashiers to transfer collections to designated bank accounts
4. **Inter-bank Transfers** - Move money between bank accounts with approval workflows
5. **Approval Workflows** - Single or dual approval based on transaction amounts
6. **Ledger Integration** - All transactions properly posted to general ledger
7. **Audit Trail** - Complete tracking of all actions and balance changes

---

## System Architecture

### Core Models

#### 1. **Bank**
Represents a physical banking institution.

**Key Fields:**
- `bank_name` - Official name (e.g., "First Bank Nigeria")
- `bank_code` - Bank code (CBN, SWIFT)
- `branch_name` - Branch location
- Contact information
- Account manager details

#### 2. **BankAccount**
Organization's account at a specific bank.

**Key Fields:**
- `bank` - Foreign key to Bank
- `account_number` - Unique account number
- `account_name` - Name on account
- `account_type` - savings, current, fixed_deposit, domiciliary
- `gl_account` - **CRITICAL**: Linked GL Account (ASSET, CHILD level)
- `account_manager` - User who approves transactions
- `current_balance` - Synced with GL account balance
- `is_cashier_collection_account` - Flag for cashier deposits
- `requires_dual_approval` - Enable dual approval
- `dual_approval_threshold` - Amount requiring second approval

#### 3. **BankTransfer**
Transfer between accounts with approval workflow.

**Key Fields:**
- `transfer_number` - Auto-generated (e.g., TRF-20260228-0001)
- `source_type` - 'cashier' or 'bank'
- `source_cashier_account` - If transferring from cashier
- `source_bank_account` - If transferring from bank
- `destination_bank_account` - Always a bank account
- `amount` - Transfer amount
- `status` - draft, pending, approved, rejected, completed
- Workflow fields: initiated_by, approved_by, second_approved_by, etc.
- `journal_entry` - GL transaction created on completion

---

## Business Rules

### 1. **Cashier to Bank Transfers**
- Cashiers can ONLY transfer to accounts marked `is_cashier_collection_account=True`
- This creates an approval layer - cashiers can't directly deposit to main bank accounts
- Requires approval from the destination account's manager
- On approval, creates journal entry:
  ```
  DR: Bank Account (ASSET)
  CR: Cashier Account (ASSET)
  ```

### 2. **Bank to Bank Transfers**
- Can transfer between any two bank accounts
- Requires approval from destination account manager
- May require second approval if amount >= `dual_approval_threshold`
- Creates journal entry:
  ```
  DR: Destination Bank (ASSET)
  CR: Source Bank (ASSET)
  ```

### 3. **Approval Workflow**

**Single Approval (Default):**
1. User creates transfer (draft)
2. User submits for approval (pending)
3. Account manager approves (completed)
4. System creates journal entry and updates balances

**Dual Approval (Large Amounts):**
1. User creates transfer (draft)
2. User submits for approval (pending)
3. First approver approves (approved - waiting)
4. Second approver approves (completed)
5. System creates journal entry and updates balances

---

## API Endpoints

### Banks

```bash
# List all banks
GET /api/banks/

# Create new bank
POST /api/banks/
{
  "bank_name": "First Bank Nigeria",
  "bank_code": "011",
  "branch_name": "Ikeja Branch",
  "address": "123 Main Street, Ikeja",
  "phone": "+234-123-456-7890",
  "is_active": true
}

# Get bank details
GET /api/banks/{id}/

# Update bank
PATCH /api/banks/{id}/

# Delete bank (soft delete)
DELETE /api/banks/{id}/

# Get all accounts at this bank
GET /api/banks/{id}/accounts/

# Get bank summary
GET /api/banks/{id}/summary/
```

### Bank Accounts

```bash
# List all bank accounts
GET /api/bank-accounts/
# Filters: ?bank=1&is_active=true&is_cashier_collection_account=true

# Create new bank account
POST /api/bank-accounts/
{
  "bank": 1,
  "account_number": "0123456789",
  "account_name": "ACME Corporation Operating Account",
  "account_type": "current",
  "currency": "NGN",
  "gl_account": 45,  # Must be ASSET type, CHILD level
  "account_manager": 5,  # User ID
  "daily_withdrawal_limit": 1000000.00,
  "requires_dual_approval": true,
  "dual_approval_threshold": 500000.00,
  "is_cashier_collection_account": true,
  "is_active": true
}

# Get account details (includes recent transactions)
GET /api/bank-accounts/{id}/

# Update account
PATCH /api/bank-accounts/{id}/

# Get account ledger
GET /api/bank-accounts/{id}/ledger/
# Params: ?date_from=2026-01-01&date_to=2026-01-31

# Get account summary
GET /api/bank-accounts/{id}/summary/

# Suspend account
POST /api/bank-accounts/{id}/suspend/

# Activate suspended account
POST /api/bank-accounts/{id}/activate/
```

### Bank Transfers

```bash
# List all transfers
GET /api/bank-transfers/
# Filters: ?status=pending&source_type=cashier&date_from=2026-01-01

# Create transfer (draft)
POST /api/bank-transfers/
{
  "transfer_date": "2026-02-28",
  "source_type": "cashier",
  "source_cashier_account": 10,
  "destination_bank_account": 5,
  "amount": 50000.00,
  "description": "Daily collections deposit",
  "reference_number": "CASH-2026-001"
}

# Get transfer details
GET /api/bank-transfers/{id}/

# Update transfer (draft only)
PATCH /api/bank-transfers/{id}/

# Delete transfer (draft only)
DELETE /api/bank-transfers/{id}/

# Submit for approval
POST /api/bank-transfers/{id}/submit/

# Approve transfer
POST /api/bank-transfers/{id}/approve/
{
  "notes": "Approved for processing"
}

# Second approval (dual approval)
POST /api/bank-transfers/{id}/second_approve/
{
  "notes": "Second approval granted"
}

# Reject transfer
POST /api/bank-transfers/{id}/reject/
{
  "reason": "Insufficient documentation"
}

# Get pending approvals for current user
GET /api/bank-transfers/pending_approvals/
# Filters: ?needs_second_approval=true

# Get my initiated transfers
GET /api/bank-transfers/my_transfers/
```

---

## Integration with GL Accounts

### Account Structure Required

For proper accounting, you need this hierarchy:

```
101 - Bank Accounts (PARENT, ASSET)
  ├─ 101-001 - First Bank Current Account (CHILD, ASSET) ← Bank Account 1
  ├─ 101-002 - GT Bank Current Account (CHILD, ASSET) ← Bank Account 2
  └─ 101-003 - Cashier Collection Account (CHILD, ASSET) ← Bank Account 3

150 - Cashier Accounts (PARENT, ASSET)
  ├─ 150-001 - Cashier John Doe (CHILD, ASSET) ← Cashier Account 1
  └─ 150-002 - Cashier Jane Smith (CHILD, ASSET) ← Cashier Account 2
```

### Journal Entries Created

**When Cashier Transfers to Bank:**
```
DR: Bank Account (101-003) - Cashier Collection    ₦50,000
CR: Cashier Account (150-001) - John Doe          ₦50,000
```

**When Transferring Between Banks:**
```
DR: Main Bank (101-001) - First Bank Current      ₦100,000
CR: Collection Bank (101-003) - Cashier Collection ₦100,000
```

All journal entries are automatically posted, updating account balances in real-time.

---

## Setup Guide

### 1. **Add App to Settings**

Update `settings.py`:
```python
INSTALLED_APPS = [
    # ... existing apps
    'banks',
]
```

### 2. **Include URLs**

Update main `urls.py`:
```python
urlpatterns = [
    # ... existing patterns
    path('api/', include('banks.urls')),
]
```

### 3. **Run Migrations**

```bash
python manage.py makemigrations banks
python manage.py migrate banks
```

### 4. **Create GL Accounts**

Create parent and child accounts for banks:

```python
# Parent: Bank Accounts
bank_parent = Account.objects.create(
    code='101',
    name='Bank Accounts',
    account_type='ASSET',
    account_level='PARENT',
    owner=user,
    branch=branch
)

# Child: Specific bank account
bank_child = Account.objects.create(
    code='101-001',
    name='First Bank - Main Account',
    account_type='ASSET',
    account_level='CHILD',
    parent=bank_parent,
    owner=user,
    branch=branch
)
```

### 5. **Create Bank & Bank Account**

```python
# Create bank
bank = Bank.objects.create(
    bank_name='First Bank Nigeria',
    bank_code='011',
    branch_name='Ikeja Branch',
    owner=user,
    branch=branch
)

# Create bank account
bank_account = BankAccount.objects.create(
    bank=bank,
    account_number='0123456789',
    account_name='ACME Corporation',
    account_type='current',
    gl_account=bank_child,  # Link to GL account
    account_manager=manager_user,
    is_cashier_collection_account=True,
    owner=user,
    branch=branch
)
```

---

## Workflow Examples

### Example 1: Cashier Daily Deposit

**Scenario:** Cashier has collected ₦50,000 and needs to deposit to bank.

**Steps:**
1. Cashier creates transfer:
   ```json
   POST /api/bank-transfers/
   {
     "source_type": "cashier",
     "source_cashier_account": 1,
     "destination_bank_account": 3,  // Cashier collection account
     "amount": 50000.00,
     "description": "Daily collections - Feb 28, 2026"
   }
   ```

2. Cashier submits for approval:
   ```json
   POST /api/bank-transfers/1/submit/
   ```

3. Account manager approves:
   ```json
   POST /api/bank-transfers/1/approve/
   {
     "notes": "Verified and approved"
   }
   ```

4. System automatically:
   - Creates journal entry
   - Debits bank account
   - Credits cashier account
   - Updates both balances
   - Marks transfer as completed

### Example 2: Large Inter-Bank Transfer (Dual Approval)

**Scenario:** Transfer ₦1,000,000 from cashier collection to main bank (requires dual approval).

**Steps:**
1. Finance officer creates transfer:
   ```json
   POST /api/bank-transfers/
   {
     "source_type": "bank",
     "source_bank_account": 3,  // Cashier collection
     "destination_bank_account": 1,  // Main bank (requires dual approval)
     "amount": 1000000.00,
     "description": "Weekly collections to main bank"
   }
   ```

2. Submit for approval:
   ```json
   POST /api/bank-transfers/2/submit/
   ```

3. First approver (account manager) approves:
   ```json
   POST /api/bank-transfers/2/approve/
   {
     "notes": "First approval - verified source balance"
   }
   ```
   Status changes to 'approved' (waiting for second approval)

4. Second approver (e.g., finance director) approves:
   ```json
   POST /api/bank-transfers/2/second_approve/
   {
     "notes": "Final approval granted"
   }
   ```

5. System completes transfer with journal entry

---

## Security Features

1. **Role-Based Access**
   - Only account managers can approve transfers to their accounts
   - Second approver must be different from first approver
   
2. **Balance Validation**
   - System validates sufficient balance before allowing transfer
   - Prevents overdrafts
   
3. **Cashier Restrictions**
   - Cashiers can only transfer to designated collection accounts
   - Prevents unauthorized transfers to main bank accounts
   
4. **Audit Trail**
   - All actions logged with user and timestamp
   - Balance changes tracked in BankAccountBalanceLog
   - Journal entries provide permanent accounting record

5. **Status Protection**
   - Can only edit/delete draft transfers
   - Completed transfers are immutable
   - Rejected transfers cannot be resubmitted (must create new)

---

## Ledger Reports

### View Bank Account Ledger

```bash
GET /api/bank-accounts/1/ledger/?date_from=2026-01-01&date_to=2026-01-31
```

**Response:**
```json
{
  "account": {
    "id": 1,
    "account_number": "0123456789",
    "account_name": "Main Operating Account",
    "bank_name": "First Bank Nigeria",
    "current_balance": 1500000.00
  },
  "period": {
    "date_from": "2026-01-01",
    "date_to": "2026-01-31"
  },
  "opening_balance": 1000000.00,
  "closing_balance": 1500000.00,
  "total_debits": 2500000.00,
  "total_credits": 2000000.00,
  "entries": [
    {
      "date": "2026-01-15",
      "transaction_id": 123,
      "reference_number": "TRF-20260115-0001",
      "description": "Daily collections deposit",
      "debit": 50000.00,
      "credit": 0,
      "balance": 1050000.00,
      "created_by": "John Doe",
      "approved": true
    }
    // ... more entries
  ],
  "entry_count": 45
}
```

---

## Frontend Integration

### Bank Management Page

Should display:
1. List of banks with account count and total balances
2. List of bank accounts with current balances
3. Filter by active/suspended status
4. Quick actions: Create bank, Create account

### Bank Account Detail Page

Should display:
1. Account information
2. Current balance and available balance
3. Recent transactions (ledger entries)
4. Pending transfers (incoming and outgoing)
5. Actions: View ledger, Initiate transfer, Suspend/Activate

### Transfer Management Page

Should display:
1. List of transfers with status badges
2. Filter by status, date, source type
3. For account managers: Pending approvals section
4. Actions: Create transfer, Approve/Reject

### Cashier Interface

Should display:
1. Current cashier balance
2. Available collection accounts (is_cashier_collection_account=True)
3. Quick deposit form
4. Transfer history

---

## Testing Checklist

- [ ] Create bank
- [ ] Create bank account with GL account linkage
- [ ] Verify balance syncs with GL account
- [ ] Create cashier to bank transfer
- [ ] Submit transfer for approval
- [ ] Approve transfer and verify journal entry
- [ ] Verify balances updated correctly
- [ ] Create large bank transfer requiring dual approval
- [ ] Test first approval
- [ ] Test second approval
- [ ] Verify rejection workflow
- [ ] Test transfer restrictions (cashier to non-collection account)
- [ ] View bank account ledger
- [ ] Test suspend/activate account
- [ ] Verify audit logs created

---

## Best Practices

1. **Always link bank accounts to GL accounts** - This ensures proper accounting
2. **Use cashier collection accounts** - Creates approval layer for cashier deposits
3. **Set appropriate dual approval thresholds** - Based on organization's risk tolerance
4. **Review ledgers regularly** - Reconcile with bank statements
5. **Monitor pending approvals** - Don't let transfers sit unapproved
6. **Use descriptive transfer descriptions** - Helps with auditing
7. **Attach supporting documents** - Upload bank slips, receipts

---

## Troubleshooting

### Issue: "Bank accounts must use ASSET type GL accounts"
**Solution:** Ensure linked GL account is ASSET type, not LIABILITY or other types.

### Issue: "Cashiers can only transfer to designated cashier collection accounts"
**Solution:** Mark destination bank account with `is_cashier_collection_account=True`.

### Issue: "Dual approval required but second approval not received"
**Solution:** Ensure second approver is different from first approver and has submitted approval.

### Issue: "Balance mismatch between bank account and GL account"
**Solution:** Bank account balance is synced from GL account on save. Check journal entries posted correctly.

---

## Future Enhancements

Potential additions:
1. **Bank statement import** - Automatic reconciliation from CSV/Excel
2. **Scheduled transfers** - Recurring transfers (e.g., monthly rent)
3. **Multi-currency support** - Foreign exchange handling
4. **Check management** - Track issued checks
5. **Mobile money integration** - Transfer to mobile wallets
6. **Bank fees tracking** - Automatic recording of bank charges
7. **Interest calculation** - Auto-calculate interest on savings

---

## Support

For issues or questions:
- Check this documentation
- Review journal entries for accounting issues
- Check approval workflow status
- Verify GL account setup
- Contact system administrator
