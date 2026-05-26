# Bank Management System - Quick API Reference

## Base URL
```
/api/banks/
```

---

## 🏦 Banks

### List Banks
```http
GET /api/banks/
```

**Query Parameters:**
- `is_active` - Filter by active status (true/false)
- `search` - Search in bank name, code, or branch

**Response:**
```json
[
  {
    "id": 1,
    "bank_name": "First Bank Nigeria",
    "bank_code": "011",
    "branch_name": "Ikeja Branch",
    "address": "123 Main Street, Ikeja",
    "phone": "+234-123-456-7890",
    "email": "ikeja@firstbanknigeria.com",
    "account_manager_name": "John Doe",
    "account_manager_phone": "+234-987-654-3210",
    "account_manager_email": "john.doe@firstbanknigeria.com",
    "is_active": true,
    "notes": "",
    "accounts_count": 3,
    "total_balance": 5000000.00,
    "created_at": "2026-01-15T10:30:00Z",
    "updated_at": "2026-01-15T10:30:00Z"
  }
]
```

### Create Bank
```http
POST /api/banks/
Content-Type: application/json

{
  "bank_name": "First Bank Nigeria",
  "bank_code": "011",
  "branch_name": "Ikeja Branch",
  "address": "123 Main Street, Ikeja",
  "phone": "+234-123-456-7890",
  "email": "ikeja@firstbanknigeria.com",
  "account_manager_name": "John Doe",
  "account_manager_phone": "+234-987-654-3210",
  "account_manager_email": "john.doe@firstbanknigeria.com",
  "is_active": true,
  "notes": "Main banking partner"
}
```

### Get Bank Details
```http
GET /api/banks/{id}/
```

### Update Bank
```http
PATCH /api/banks/{id}/
Content-Type: application/json

{
  "is_active": false,
  "notes": "Account closed"
}
```

### Delete Bank
```http
DELETE /api/banks/{id}/
```
*Note: Soft delete - bank is marked as deleted but not removed from database*

### Get Bank Accounts
```http
GET /api/banks/{id}/accounts/
```

**Query Parameters:**
- `is_active` - Filter by active status

### Get Bank Summary
```http
GET /api/banks/{id}/summary/
```

**Response:**
```json
{
  "bank_id": 1,
  "bank_name": "First Bank Nigeria",
  "branch_name": "Ikeja Branch",
  "total_accounts": 3,
  "active_accounts": 3,
  "suspended_accounts": 0,
  "total_balance": 5000000.00,
  "accounts_by_type": {
    "current": 2,
    "savings": 1
  }
}
```

---

## 💳 Bank Accounts

### List Bank Accounts
```http
GET /api/banks/bank-accounts/
```

**Query Parameters:**
- `bank` - Filter by bank ID
- `is_active` - Filter by active status (true/false)
- `is_suspended` - Filter by suspended status (true/false)
- `account_type` - Filter by type (savings, current, fixed_deposit, domiciliary)
- `is_cashier_collection_account` - Filter cashier collection accounts (true/false)
- `account_manager` - Filter by account manager user ID
- `search` - Search in account number, name, or bank name

**Response:**
```json
[
  {
    "id": 1,
    "bank": 1,
    "bank_name": "First Bank Nigeria",
    "bank_branch": "Ikeja Branch",
    "account_number": "0123456789",
    "account_name": "ACME Corporation Operating Account",
    "account_type": "current",
    "currency": "NGN",
    "gl_account": 45,
    "gl_account_code": "101-001",
    "gl_account_name": "First Bank Current Account",
    "account_manager": 5,
    "account_manager_name": "Jane Smith",
    "current_balance": 1500000.00,
    "available_balance": 1450000.00,
    "daily_withdrawal_limit": 1000000.00,
    "monthly_transaction_limit": 50000000.00,
    "requires_dual_approval": true,
    "dual_approval_threshold": 500000.00,
    "is_active": true,
    "is_suspended": false,
    "is_cashier_collection_account": true,
    "iban": "",
    "swift_code": "FBNINGLA",
    "date_opened": "2025-01-01",
    "notes": "",
    "created_at": "2026-01-15T10:30:00Z",
    "updated_at": "2026-02-28T14:20:00Z"
  }
]
```

### Create Bank Account
```http
POST /api/banks/bank-accounts/
Content-Type: application/json

{
  "bank": 1,
  "account_number": "0123456789",
  "account_name": "ACME Corporation Operating Account",
  "account_type": "current",
  "currency": "NGN",
  "gl_account": 45,
  "account_manager": 5,
  "daily_withdrawal_limit": 1000000.00,
  "monthly_transaction_limit": 50000000.00,
  "requires_dual_approval": true,
  "dual_approval_threshold": 500000.00,
  "is_cashier_collection_account": true,
  "is_active": true,
  "iban": "",
  "swift_code": "FBNINGLA",
  "date_opened": "2025-01-01",
  "notes": ""
}
```

**Important:**
- `gl_account` must be an ASSET type, CHILD level account
- `account_manager` is required for approvals
- Set `is_cashier_collection_account=true` to allow cashier deposits

### Get Bank Account Details
```http
GET /api/banks/bank-accounts/{id}/
```

**Response includes:**
- All account information
- Recent transactions (last 10)
- Pending transfers (incoming and outgoing)

### Update Bank Account
```http
PATCH /api/banks/bank-accounts/{id}/
Content-Type: application/json

{
  "daily_withdrawal_limit": 2000000.00,
  "notes": "Limit increased"
}
```

### Get Account Ledger
```http
GET /api/banks/bank-accounts/{id}/ledger/
```

**Query Parameters:**
- `date_from` - Start date (YYYY-MM-DD)
- `date_to` - End date (YYYY-MM-DD)
- `include_unapproved` - Include unapproved transactions (true/false, default: false)

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
  ],
  "entry_count": 45
}
```

### Get Account Summary
```http
GET /api/banks/bank-accounts/{id}/summary/
```

**Response:**
```json
{
  "account_id": 1,
  "account_number": "0123456789",
  "account_name": "Main Operating Account",
  "bank_name": "First Bank Nigeria",
  "current_balance": 1500000.00,
  "available_balance": 1450000.00,
  "incoming_pending": 100000.00,
  "outgoing_pending": 50000.00,
  "recent_transactions_count": 45,
  "is_active": true,
  "is_suspended": false
}
```

### Suspend Account
```http
POST /api/banks/bank-accounts/{id}/suspend/
```

*Temporarily suspends all transactions on the account*

### Activate Account
```http
POST /api/banks/bank-accounts/{id}/activate/
```

*Reactivates a suspended account*

---

## 💸 Bank Transfers

### List Transfers
```http
GET /api/banks/bank-transfers/
```

**Query Parameters:**
- `status` - Filter by status (draft, pending, approved, rejected, completed, failed)
- `source_type` - Filter by source type (cashier, bank)
- `date_from` - Start date (YYYY-MM-DD)
- `date_to` - End date (YYYY-MM-DD)
- `source_bank_account` - Source bank account ID
- `destination_bank_account` - Destination bank account ID
- `initiated_by` - User ID who initiated
- `search` - Search in transfer number, description, or reference

**Response:**
```json
[
  {
    "id": 1,
    "transfer_number": "TRF-20260228-0001",
    "transfer_date": "2026-02-28",
    "source_type": "cashier",
    "source_cashier_account": 10,
    "source_bank_account": null,
    "source_display": "Cashier: John Doe",
    "destination_bank_account": 5,
    "destination_display": "First Bank Nigeria - 0123456789",
    "amount": 50000.00,
    "description": "Daily collections deposit",
    "reference_number": "CASH-2026-001",
    "status": "completed",
    "status_display": "Completed",
    "initiated_by": 1,
    "initiated_by_name": "John Doe",
    "initiated_at": "2026-02-28T14:30:00Z",
    "approved_by": 5,
    "approved_by_name": "Jane Smith",
    "approved_at": "2026-02-28T14:35:00Z",
    "approval_notes": "Verified and approved",
    "second_approved_by": null,
    "second_approved_by_name": null,
    "second_approved_at": null,
    "second_approval_notes": "",
    "rejected_by": null,
    "rejected_by_name": null,
    "rejected_at": null,
    "rejection_reason": "",
    "completed_by": 5,
    "completed_by_name": "Jane Smith",
    "completed_at": "2026-02-28T14:35:00Z",
    "journal_entry": 123,
    "attachment": null,
    "created_at": "2026-02-28T14:30:00Z",
    "updated_at": "2026-02-28T14:35:00Z"
  }
]
```

### Create Transfer (Draft)
```http
POST /api/banks/bank-transfers/
Content-Type: application/json

{
  "transfer_date": "2026-02-28",
  "source_type": "cashier",
  "source_cashier_account": 10,
  "destination_bank_account": 5,
  "amount": 50000.00,
  "description": "Daily collections deposit",
  "reference_number": "CASH-2026-001"
}
```

**For bank-to-bank transfer:**
```json
{
  "transfer_date": "2026-02-28",
  "source_type": "bank",
  "source_bank_account": 3,
  "destination_bank_account": 1,
  "amount": 1000000.00,
  "description": "Weekly collections to main bank",
  "reference_number": ""
}
```

**Validation Rules:**
- Source account must have sufficient balance
- Cashiers can only transfer to `is_cashier_collection_account=true` accounts
- Amount must be greater than zero

### Get Transfer Details
```http
GET /api/banks/bank-transfers/{id}/
```

### Update Transfer (Draft Only)
```http
PATCH /api/banks/bank-transfers/{id}/
Content-Type: application/json

{
  "amount": 55000.00,
  "description": "Daily collections deposit (updated)"
}
```

*Note: Can only update transfers in 'draft' status*

### Delete Transfer (Draft Only)
```http
DELETE /api/banks/bank-transfers/{id}/
```

*Note: Can only delete transfers in 'draft' status*

### Submit for Approval
```http
POST /api/banks/bank-transfers/{id}/submit/
```

*Changes status from 'draft' to 'pending'*

### Approve Transfer
```http
POST /api/banks/bank-transfers/{id}/approve/
Content-Type: application/json

{
  "notes": "Verified and approved for processing"
}
```

**Authorization:**
- Only the destination account's `account_manager` can approve
- If transfer amount >= `dual_approval_threshold`, requires second approval
- If transfer amount < threshold, immediately completes and posts journal entry

### Second Approval
```http
POST /api/banks/bank-transfers/{id}/second_approve/
Content-Type: application/json

{
  "notes": "Second approval granted - authorized for completion"
}
```

**Authorization:**
- Required when amount >= `dual_approval_threshold`
- Second approver must be different from first approver
- Completes transfer and posts journal entry

### Reject Transfer
```http
POST /api/banks/bank-transfers/{id}/reject/
Content-Type: application/json

{
  "reason": "Insufficient documentation provided"
}
```

*Changes status to 'rejected'. Reason is required.*

### Get Pending Approvals
```http
GET /api/banks/bank-transfers/pending_approvals/
```

**Query Parameters:**
- `needs_second_approval` - Filter for second approval needed (true/false)

*Returns transfers pending approval for bank accounts managed by current user*

### Get My Transfers
```http
GET /api/banks/bank-transfers/my_transfers/
```

*Returns transfers initiated by current user*

---

## 🔐 Authorization

All endpoints require authentication:

```http
Authorization: Bearer <jwt_token>
```

**Permissions:**
- **Banks & Accounts**: Authenticated users (filtered by branch)
- **Transfers**: 
  - Create: Any authenticated user
  - Approve: Only account manager of destination account
  - Second Approve: Any user except first approver

---

## 📊 Status Flow

### Bank Transfer Status Flow

```
draft
  ↓ (submit)
pending
  ↓ (approve - if no dual approval OR amount < threshold)
completed
```

**With Dual Approval:**
```
draft
  ↓ (submit)
pending
  ↓ (approve - first approval)
approved (waiting for second approval)
  ↓ (second_approve)
completed
```

**Rejection:**
```
pending/approved
  ↓ (reject)
rejected
```

---

## ⚠️ Error Responses

### 400 Bad Request
```json
{
  "error": "Transfer amount must be greater than zero."
}
```

### 403 Forbidden
```json
{
  "error": "Only the account manager can approve this transfer"
}
```

### 404 Not Found
```json
{
  "detail": "Not found."
}
```

### Validation Errors
```json
{
  "gl_account": [
    "Bank accounts must use ASSET type GL accounts. Selected account is type \"LIABILITY\"."
  ],
  "amount": [
    "Insufficient balance in cashier account. Available: 45000.00"
  ]
}
```

---

## 💡 Common Use Cases

### 1. Cashier Daily Deposit

```bash
# 1. Create transfer
POST /api/banks/bank-transfers/
{
  "source_type": "cashier",
  "source_cashier_account": 10,
  "destination_bank_account": 5,
  "amount": 50000.00,
  "description": "Daily collections"
}

# 2. Submit for approval
POST /api/banks/bank-transfers/1/submit/

# 3. Account manager approves
POST /api/banks/bank-transfers/1/approve/
{
  "notes": "Approved"
}
```

### 2. Large Inter-Bank Transfer (Dual Approval)

```bash
# 1. Create transfer
POST /api/banks/bank-transfers/
{
  "source_type": "bank",
  "source_bank_account": 3,
  "destination_bank_account": 1,
  "amount": 1000000.00,
  "description": "Weekly collections"
}

# 2. Submit
POST /api/banks/bank-transfers/2/submit/

# 3. First approval
POST /api/banks/bank-transfers/2/approve/
{
  "notes": "First approval"
}

# 4. Second approval
POST /api/banks/bank-transfers/2/second_approve/
{
  "notes": "Final approval"
}
```

### 3. View Account Ledger

```bash
GET /api/banks/bank-accounts/1/ledger/?date_from=2026-01-01&date_to=2026-01-31
```

---

## 🎯 Best Practices

1. **Always link bank accounts to GL accounts** during creation
2. **Set appropriate dual approval thresholds** based on risk
3. **Mark cashier collection accounts** with `is_cashier_collection_account=true`
4. **Use descriptive transfer descriptions** for audit trail
5. **Review pending approvals regularly** to avoid delays
6. **Check account ledgers** for reconciliation
7. **Upload attachments** for supporting documents

---

## 🆘 Troubleshooting

| Error | Solution |
|-------|----------|
| "Bank accounts must use ASSET type GL accounts" | Ensure GL account is ASSET type, not LIABILITY |
| "Cashiers can only transfer to designated cashier collection accounts" | Set `is_cashier_collection_account=true` on destination |
| "Insufficient balance in cashier account" | Check current balance, ensure sufficient funds |
| "Only the account manager can approve" | Use the account designated as `account_manager` |
| "Second approver must be different from first approver" | Use a different user for second approval |
| "Dual approval required but second approval not received" | Complete second approval step |

---

**Need Help?** Check the full implementation guide: [BANK_MANAGEMENT_GUIDE.md](./BANK_MANAGEMENT_GUIDE.md)
