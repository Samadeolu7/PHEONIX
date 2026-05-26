# Account Replacement Dry-Run Report

⚠️ **IMPORTANT**: This file contains SUGGESTIONS only. Each replacement must be manually reviewed and tested.

## Summary

- Total Account.objects calls found: 95
- Warnings/issues: 0

## Key Considerations

1. **Tenant Parameter**: The utility derives `tenant` from `owner.tenant`. Ensure your `owner` object has a `tenant` attribute.
2. **Variable Scope**: Suggestions assume `owner`, `branch` are in scope. Verify this before applying.
3. **Account Level**: Parent accounts should use `get_or_create_system_account()`. Child accounts should use `get_or_create_child_account()`.
4. **Code Validation**: All codes must be in range 100-599 for parents, and XXX-YYY format for children.

---

## Detailed Findings

### Match 1

**File**: `src\accounts\subscription_accounting.py`  
**Line**: 113  

**Original Call**:
```python
Account.objects.get_or_create(
            code='101',
            owner=subscription.income_account.owner,
            branch=subscription.income_account.branch,
            defaults={
              ...
```

**Context**:
```python
                'allow_manual_entries': True,
                'is_system_account': True
            }
        )
        
        admin_payment_tx = Transaction.objects.create(
            owner=subscription.income_account.owner,
```

**Extracted Parameters**:
- Code: `101`
- Name: `Cash on Hand`
- Account Type: `ASSET`
- Account Level: `PARENT`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='101',
    name='Cash on Hand',
    account_type='ASSET',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 2

**File**: `src\accounts\subscription_accounting.py`  
**Line**: 155  

**Original Call**:
```python
Account.objects.get_or_create(
            code='101',
            owner=subscription.tenant_owner,
            branch=subscription.tenant_owner.branch,
            defaults={
                'name': ...
```

**Context**:
```python
                'allow_manual_entries': True,
                'is_system_account': True
            }
        )
        
        tenant_payment_tx = Transaction.objects.create(
            owner=subscription.tenant_owner,
```

**Extracted Parameters**:
- Code: `101`
- Name: `Cash on Hand`
- Account Type: `ASSET`
- Account Level: `PARENT`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='101',
    name='Cash on Hand',
    account_type='ASSET',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 3

**File**: `src\expenses\models.py`  
**Line**: 1488  

**Original Call**:
```python
Account.objects.get_or_create(
            code='210',
            owner=self.owner,
            branch=self.branch,
            defaults={
                'name': 'General Payables',
                ...
```

**Context**:
```python
                'allow_manual_entries': True,
                'is_system_account': True
            }
        )
        
        # Get or create transaction series for resource consumption
        from transactions.models import TransactionSeries
```

**Extracted Parameters**:
- Code: `210`
- Name: `General Payables`
- Account Type: `LIABILITY`
- Account Level: `PARENT`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='210',
    name='General Payables',
    account_type='LIABILITY',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 4

**File**: `src\expenses\models.py`  
**Line**: 1544  

**Original Call**:
```python
Account.objects.get_or_create(
            code='210',
            owner=self.owner,
            branch=self.branch,
            defaults={
                'name': 'General Payables',
                ...
```

**Context**:
```python
                'allow_manual_entries': True,
                'is_system_account': True
            }
        )
        
        accounts_payable = AccountsPayable.create_for_vendor(
            vendor=self.supplier,
```

**Extracted Parameters**:
- Code: `210`
- Name: `General Payables`
- Account Type: `LIABILITY`
- Account Level: `PARENT`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='210',
    name='General Payables',
    account_type='LIABILITY',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 5

**File**: `src\inventory\stock_service.py`  
**Line**: 647  

**Original Call**:
```python
Account.objects.get_or_create(
            code='200',
            owner=user,
            branch=grn.branch if hasattr(grn, 'branch') else None,
            defaults={
                'name': 'Accoun...
```

**Context**:
```python
                'allow_manual_entries': False,
                'is_system_account': True
            }
        )
        parent_ap_account_code = parent_ap_account.code
        # Get or create child accounts payable account
        liability_account, created = Account.objects.get_or_create(
```

**Extracted Parameters**:
- Code: `200`
- Name: `Accounts Payable`
- Account Type: `LIABILITY`
- Account Level: `PARENT`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='200',
    name='Accounts Payable',
    account_type='LIABILITY',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 6

**File**: `src\inventory\stock_service.py`  
**Line**: 661  

**Original Call**:
```python
Account.objects.get_or_create(
            code=f"{parent_ap_account_code}-001",
            owner=user,
            branch=grn.branch if hasattr(grn, 'branch') else None,
            defaults={
     ...
```

**Context**:
```python
                'allow_manual_entries': True,
                'is_system_account': True
            }
        )
        
        # Calculate payment due date based on supplier payment terms
        payment_terms_days = 30  # Default
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `General Payables`
- Account Type: `LIABILITY`
- Account Level: `CHILD`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 7

**File**: `src\inventory\views_invoice.py`  
**Line**: 284  

**Original Call**:
```python
Account.objects.get_or_create(
                code=code,
                owner=request.user,
                branch=invoice.branch,
                defaults={
                    'name': 'Cash on Han...
```

**Context**:
```python
                    'allow_manual_entries': True,
                    'is_system_account': True
                }
            )
            
            # Get or create AR account (use child account)
            ar_account, created = Account.objects.get_or_create(
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `Cash on Hand`
- Account Type: `ASSET`
- Account Level: `PARENT`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 8

**File**: `src\inventory\views_invoice.py`  
**Line**: 298  

**Original Call**:
```python
Account.objects.get_or_create(
                code='140-001',
                owner=request.user,
                branch=invoice.branch,
                defaults={
                    'name': 'Genera...
```

**Context**:
```python
                    'allow_manual_entries': True,
                    'is_system_account': True
                }
            )
            
            if not cash_account or not ar_account:
                raise Exception("Cash or AR account not configured")
```

**Extracted Parameters**:
- Code: `140-001`
- Name: `General Receivables`
- Account Type: `ASSET`
- Account Level: `CHILD`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_child_account

# Replace with:
account = get_or_create_child_account(
    parent_code='140',
    child_suffix='001',
    name='General Receivables',
    account_type='ASSET',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    parent_name='<PARENT_NAME>'  # ⚠️ Provide meaningful parent name
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Update `<PARENT_NAME>` with a meaningful description
- Verify `owner` and `branch` variables are in scope

---

### Match 9

**File**: `src\transactions\utils.py`  
**Line**: 150  

**Original Call**:
```python
Account.objects.get_or_create(
        code='GEN_BUF',
        type=Account.BANK,
        defaults={'name': 'General Savings Buffer'}
    )
```

**Context**:
```python
        code='GEN_BUF',
        type=Account.BANK,
        defaults={'name': 'General Savings Buffer'}
    )[0]
    TransactionEntry.objects.create(account=general_buffer_account,
                                    side=TransactionEntry.DEBIT,
                                    amount=abs(diff))
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `General Savings Buffer`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 10

**File**: `src\accounts\utils\v2.py`  
**Line**: 140  

**Original Call**:
```python
Account.objects.get_or_create(
                    tenant=tenant,
                    owner=owner,
                    branch=branch,
                    code=parent_code,
                    defaults...
```

**Context**:
```python
                        'balance': Decimal('0.00'),
                        'description': description or '',
                    }
                )
                _cache_set(parent_code, parent_account)

        # Now ensure child exists; if requested child code is taken by different parent, find next suffix
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `PARENT`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 11

**File**: `src\accounts\utils\v2.py`  
**Line**: 181  

**Original Call**:
```python
Account.objects.get_or_create(
            tenant=tenant,
            owner=owner,
            branch=branch,
            code=child_code,
            defaults={
                'name': name,
        ...
```

**Context**:
```python
                'balance': Decimal('0.00'),
                'description': description or '',
            }
        )

        # Safety: ensure child.parent is set
        if not child_account.parent:
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `CHILD`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 12

**File**: `src\accounts\utils\v2.py`  
**Line**: 290  

**Original Call**:
```python
Account.objects.get_or_create(
        code=code,
        owner=owner,
        branch=branch,
        tenant=tenant,
        defaults={
            'name': name,
            'account_type': account_ty...
```

**Context**:
```python
            'balance': Decimal('0.00'),
            'description': description,
        }
    )
    
    return account

```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 13

**File**: `src\accounts\management\commands\setup_sample_data.py`  
**Line**: 235  

**Original Call**:
```python
Account.objects.get_or_create(
                code=code,
                branch=branch,
                defaults={
                    'name': name,
                    'account_type': account_type,
...
```

**Context**:
```python
                    'owner': owner,
                    'created_by': owner
                }
            )
            
            if created:
                self.stdout.write(f'  ✓ Created account: {code} - {name}')
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 14

**File**: `src\accounts\management\commands\setup_school.py`  
**Line**: 63  

**Original Call**:
```python
Account.objects.get_or_create(
            tenant=tenant,
            code='401',
            defaults={
                'name': 'Tuition Income',
                'account_level': Account.LEVEL_PARENT...
```

**Context**:
```python
                'account_type': Account.INCOME,
                'category': income_category,
            }
        )
        
        for code, name, usage_context in fee_types:
            IncomeCategory.objects.get_or_create(
```

**Extracted Parameters**:
- Code: `401`
- Name: `Tuition Income`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='401',
    name='Tuition Income',
    account_type='<TYPE_REQUIRED>',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 15

**File**: `src\accounts\management\commands\setup_user_accounts.py`  
**Line**: 60  

**Original Call**:
```python
Account.objects.get_or_create(
            owner=user,
            code='100',
            defaults={
                'name': 'Assets',
                'account_level': Account.LEVEL_PARENT,
         ...
```

**Context**:
```python
                'created_by': user,
                'allow_manual_entries': False
            }
        )[0]
        
        # Liabilities Parent
        parent_accounts['liabilities'] = Account.objects.get_or_create(
```

**Extracted Parameters**:
- Code: `100`
- Name: `Assets`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='100',
    name='Assets',
    account_type='<TYPE_REQUIRED>',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 16

**File**: `src\accounts\management\commands\setup_user_accounts.py`  
**Line**: 75  

**Original Call**:
```python
Account.objects.get_or_create(
            owner=user,
            code='200',
            defaults={
                'name': 'Liabilities',
                'account_level': Account.LEVEL_PARENT,
    ...
```

**Context**:
```python
                'created_by': user,
                'allow_manual_entries': False
            }
        )[0]
        
        # Income Parent
        parent_accounts['income'] = Account.objects.get_or_create(
```

**Extracted Parameters**:
- Code: `200`
- Name: `Liabilities`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='200',
    name='Liabilities',
    account_type='<TYPE_REQUIRED>',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 17

**File**: `src\accounts\management\commands\setup_user_accounts.py`  
**Line**: 90  

**Original Call**:
```python
Account.objects.get_or_create(
            owner=user,
            code='300',
            defaults={
                'name': 'Income',
                'account_level': Account.LEVEL_PARENT,
         ...
```

**Context**:
```python
                'created_by': user,
                'allow_manual_entries': False
            }
        )[0]
        
        # Expenses Parent
        parent_accounts['expenses'] = Account.objects.get_or_create(
```

**Extracted Parameters**:
- Code: `300`
- Name: `Income`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='300',
    name='Income',
    account_type='<TYPE_REQUIRED>',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 18

**File**: `src\accounts\management\commands\setup_user_accounts.py`  
**Line**: 105  

**Original Call**:
```python
Account.objects.get_or_create(
            owner=user,
            code='500',
            defaults={
                'name': 'Expenses',
                'account_level': Account.LEVEL_PARENT,
       ...
```

**Context**:
```python
                'created_by': user,
                'allow_manual_entries': False
            }
        )[0]
        
        self.stdout.write(self.style.SUCCESS(f'✓ Created {len(parent_accounts)} parent accounts'))
        return parent_accounts
```

**Extracted Parameters**:
- Code: `500`
- Name: `Expenses`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='500',
    name='Expenses',
    account_type='<TYPE_REQUIRED>',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 19

**File**: `src\accounts\management\commands\setup_user_accounts.py`  
**Line**: 186  

**Original Call**:
```python
Account.objects.get_or_create(
                owner=user,
                code=acc_data['code'],
                defaults={
                    'name': acc_data['name'],
                    'parent':...
```

**Context**:
```python
                    'created_by': user,
                    'allow_manual_entries': True
                }
            )
        
        self.stdout.write(self.style.SUCCESS(f'✓ Created {len(child_accounts)} child accounts'))

```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 20

**File**: `src\automations\management\commands\expense_import_helpers_new.py`  
**Line**: 66  

**Original Call**:
```python
Account.objects.get_or_create(
                branch=branch,
                code=f"5{details['code']}",
                defaults={
                    'name': name.replace('_', ' ').title(),
       ...
```

**Context**:
```python
                    'owner': owner,
                    'created_by': owner
                }
            )[0]
            
            # Create expense category
            cat, created = ExpenseCategory.objects.get_or_create(
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 21

**File**: `src\automations\management\commands\fee_import_helpers_new.py`  
**Line**: 46  

**Original Call**:
```python
Account.objects.get_or_create(
                branch=branch,
                code=f"4{details['code']}",
                defaults={
                    'name': name.replace('_', ' ').title(),
       ...
```

**Context**:
```python
                    'owner': owner,
                    'created_by': owner
                }
            )[0]
            
            # Create income type
            rev_type, created = IncomeCategory.objects.get_or_create(
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 22

**File**: `src\automations\management\commands\import_legacy_financials.py`  
**Line**: 286  

**Original Call**:
```python
Account.objects.get_or_create(
            branch=self.branch,
            code=code,
            defaults={
                'category': asset_cat,
                'name': f"Bank - {self._norm_str(ban...
```

**Context**:
```python
                'owner': self.owner,
                'created_by': self.owner
            }
        )
        self.import_map['banks'][key] = acct.pk
        return acct

```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 23

**File**: `src\automations\management\commands\import_legacy_financials.py`  
**Line**: 307  

**Original Call**:
```python
Account.objects.get_or_create(
            branch=self.branch, code=code,
            defaults={
                'category': income_cat, 'name': f"{name} (Legacy)",
                'owner': self.owner...
```

**Context**:
```python
                'owner': self.owner, 'created_by': self.owner,
                'classification': self.classification,
            }
        )
        return acc

    def process_savings_payments(self):
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 24

**File**: `src\automations\management\commands\import_legacy_financials.py`  
**Line**: 972  

**Original Call**:
```python
Account.objects.get_or_create(
                branch=self.branch,
                code=code,
                defaults={
                    'category': income_cat,
                    'name': name,
 ...
```

**Context**:
```python
                    'created_by': self.owner,
                    'classification': self.classification
                }
            )
            cr_acct = fee_acc

        elif tx_type == 'expense_payment':
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 25

**File**: `src\automations\management\commands\import_legacy_financials.py`  
**Line**: 995  

**Original Call**:
```python
Account.objects.get_or_create(
                branch=self.branch,
                code=expense_code,
                defaults={
                    'category': expense_cat,
                    'name'...
```

**Context**:
```python
                    'created_by': self.owner,
                    'classification': self.classification
                }
            )
            cr_acct = expense_acc

        elif tx_type == 'loan_disbursement':
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 26

**File**: `src\automations\management\commands\import_legacy_financials.py`  
**Line**: 1065  

**Original Call**:
```python
Account.objects.get_or_create(
                        branch=self.branch,
                        code='B01',
                        defaults={
                            'category': asset_cat,
   ...
```

**Context**:
```python
                            'created_by': self.owner,
                            'classification': self.classification
                        }
                    )
                    cr_acct = cash_acc
                else:
                    is_reconciliation = True
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `Cash in Hand`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 27

**File**: `src\automations\management\commands\import_legacy_financials.py`  
**Line**: 1084  

**Original Call**:
```python
Account.objects.get_or_create(
                    branch=self.branch,
                    code='U01',
                    defaults={
                        'category': liability_cat,
               ...
```

**Context**:
```python
                        'created_by': self.owner,
                        'classification': self.classification
                    }
                )
                cr_acct = union_acc
            else:
                is_reconciliation = True
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `Union Contributions`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 28

**File**: `src\automations\management\commands\import_legacy_financials.py`  
**Line**: 1179  

**Original Call**:
```python
Account.objects.get_or_create(
            branch=self.branch, code=code,
            defaults={
                'category': expense_cat, 'name': f"{name} (Legacy)",
                'owner': self.owne...
```

**Context**:
```python
                'owner': self.owner, 'created_by': self.owner,
                'classification': self.classification,
            }
        )
        return acc
    
    def process_transfer_group(self, group, tx_id):
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 29

**File**: `src\automations\management\commands\import_legacy_financials.py`  
**Line**: 1469  

**Original Call**:
```python
Account.objects.get_or_create(
                branch=self.branch, code=code,
                defaults={
                    'category': liability_cat,
                    'name': self._norm_str(self....
```

**Context**:
```python
                    'owner': self.owner, 'created_by': self.owner,
                    'classification': self.classification
                }
            )

            bank_id = f.get('bank')
            bank_acct = self.get_or_create_bank_account(bank_id,
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 30

**File**: `src\automations\management\commands\import_legacy_financials.py`  
**Line**: 1570  

**Original Call**:
```python
Account.objects.get_or_create(
            branch=self.branch,
            code=code,
            defaults=defaults
        )
```

**Context**:
```python
            branch=self.branch,
            code=code,
            defaults=defaults
        )

        # Ensure parent is set even if account existed
        if not acct.parent_id:
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 31

**File**: `src\automations\management\commands\import_legacy_financials.py`  
**Line**: 1651  

**Original Call**:
```python
Account.objects.get_or_create(
            branch=self.branch,
            code='290',
            defaults={
                'category': liability_cat,
                'name': suspense_name,
        ...
```

**Context**:
```python
                'created_by': self.owner,
                'classification': self.classification,
            }
        )

        # Cash in Hand (asset)
        self.cash_acc, _ = Account.objects.get_or_create(
```

**Extracted Parameters**:
- Code: `290`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='290',
    name='<NAME_REQUIRED>',
    account_type='<TYPE_REQUIRED>',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 32

**File**: `src\automations\management\commands\import_legacy_financials.py`  
**Line**: 1664  

**Original Call**:
```python
Account.objects.get_or_create(
            branch=self.branch,
            code='101',
            defaults={
                'category': asset_cat,
                'name': 'Cash in Hand',
           ...
```

**Context**:
```python
                'created_by': self.owner,
                'classification': self.classification,
            }
        )

        # Savings Pool (liability)
        self.savings_pool_acc, _ = Account.objects.get_or_create(
```

**Extracted Parameters**:
- Code: `101`
- Name: `Cash in Hand`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='101',
    name='Cash in Hand',
    account_type='<TYPE_REQUIRED>',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 33

**File**: `src\automations\management\commands\import_legacy_financials.py`  
**Line**: 1677  

**Original Call**:
```python
Account.objects.get_or_create(
            branch=self.branch,
            code='201',
            defaults={
                'category': liability_cat,
                'name': 'Client Savings (Pool)'...
```

**Context**:
```python
                'created_by': self.owner,
                'classification': self.classification,
            }
        )

        # Canonical GLs you'll likely need later
        self.loans_receivable_acc, _ = Account.objects.get_or_create(
```

**Extracted Parameters**:
- Code: `201`
- Name: `Client Savings (Pool)`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='201',
    name='Client Savings (Pool)',
    account_type='<TYPE_REQUIRED>',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 34

**File**: `src\automations\management\commands\import_legacy_financials.py`  
**Line**: 1690  

**Original Call**:
```python
Account.objects.get_or_create(
            branch=self.branch, code='102',
            defaults={
                'category': asset_cat, 'name': 'Loans Receivable',
                'owner': self.owner...
```

**Context**:
```python
                'owner': self.owner, 'created_by': self.owner,
                'classification': self.classification,
            }
        )
        self.interest_income_acc, _ = Account.objects.get_or_create(
            branch=self.branch, code='401',
            defaults={
```

**Extracted Parameters**:
- Code: `102`
- Name: `Loans Receivable`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='102',
    name='Loans Receivable',
    account_type='<TYPE_REQUIRED>',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 35

**File**: `src\automations\management\commands\import_legacy_financials.py`  
**Line**: 1698  

**Original Call**:
```python
Account.objects.get_or_create(
            branch=self.branch, code='401',
            defaults={
                'category': income_cat, 'name': 'Interest Income',
                'owner': self.owner...
```

**Context**:
```python
                'owner': self.owner, 'created_by': self.owner,
                'classification': self.classification,
            }
        )
        self.inventory_acc, _ = Account.objects.get_or_create(
            branch=self.branch, code='103',
            defaults={
```

**Extracted Parameters**:
- Code: `401`
- Name: `Interest Income`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='401',
    name='Interest Income',
    account_type='<TYPE_REQUIRED>',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 36

**File**: `src\automations\management\commands\import_legacy_financials.py`  
**Line**: 1706  

**Original Call**:
```python
Account.objects.get_or_create(
            branch=self.branch, code='103',
            defaults={
                'category': asset_cat, 'name': 'Inventory',
                'owner': self.owner, 'crea...
```

**Context**:
```python
                'owner': self.owner, 'created_by': self.owner,
                'classification': self.classification,
            }
        )
        self.fixed_asset_acc, _ = Account.objects.get_or_create(
            branch=self.branch, code='104',
            defaults={
```

**Extracted Parameters**:
- Code: `103`
- Name: `Inventory`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='103',
    name='Inventory',
    account_type='<TYPE_REQUIRED>',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 37

**File**: `src\automations\management\commands\import_legacy_financials.py`  
**Line**: 1714  

**Original Call**:
```python
Account.objects.get_or_create(
            branch=self.branch, code='104',
            defaults={
                'category': asset_cat, 'name': 'Fixed Assets',
                'owner': self.owner, 'c...
```

**Context**:
```python
                'owner': self.owner, 'created_by': self.owner,
                'classification': self.classification,
            }
        )

    def process_clients(self):
        """Process client records"""
```

**Extracted Parameters**:
- Code: `104`
- Name: `Fixed Assets`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='104',
    name='Fixed Assets',
    account_type='<TYPE_REQUIRED>',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 38

**File**: `src\automations\management\commands\transaction_processors\bank_payments.py`  
**Line**: 1199  

**Original Call**:
```python
Account.objects.get_or_create(branch=self.ctx.branch, code=code, defaults={'category': income_cat, 'name': name, 'owner': self.ctx.owner, 'created_by': self.ctx.owner, 'classification': self.ctx.class...
```

**Context**:
```python
            income_cat, _ = self._branch_category(4, "Income")
            code = 'F01' if tx_type == 'fee_income' else 'F02'
            name = 'Fee Income' if tx_type == 'fee_income' else 'Risk Premium'
            fee_acc, _ = Account.objects.get_or_create(branch=self.ctx.branch, code=code, defaults={'category': income_cat, 'name': name, 'owner': self.ctx.owner, 'created_by': self.ctx.owner, 'classification': self.ctx.classification})
            cr_acc = fee_acc

        elif tx_type == 'expense_payment':
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 39

**File**: `src\automations\management\commands\transaction_processors\bank_payments.py`  
**Line**: 1209  

**Original Call**:
```python
Account.objects.get_or_create(branch=self.ctx.branch, code=expense_code, defaults={'category': expense_cat, 'name': expense_name, 'owner': self.ctx.owner, 'created_by': self.ctx.owner, 'classification...
```

**Context**:
```python
                expense_code = 'E01'; expense_name = 'Payroll Expenses'
            elif 'transport' in desc_lower:
                expense_code = 'E02'; expense_name = 'Transport Expenses'
            expense_acc, _ = Account.objects.get_or_create(branch=self.ctx.branch, code=expense_code, defaults={'category': expense_cat, 'name': expense_name, 'owner': self.ctx.owner, 'created_by': self.ctx.owner, 'classification': self.ctx.classification})
            cr_acc = expense_acc

        elif tx_type in ('matched_transfer', 'cash_transfer', 'internal_transfer', 'bank_transfer'):
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 40

**File**: `src\automations\management\commands\transaction_processors\bank_payments.py`  
**Line**: 1231  

**Original Call**:
```python
Account.objects.get_or_create(branch=self.ctx.branch, code='B01', defaults={'category': asset_cat, 'name': 'Cash in Hand', 'owner': self.ctx.owner, 'created_by': self.ctx.owner, 'classification': self...
```

**Context**:
```python
            # fallback: keep in suspense for manual recon
            if tx_type == 'cash_transfer':
                asset_cat, _ = self._branch_category(1, "Assets")
                cash_acc, _ = Account.objects.get_or_create(branch=self.ctx.branch, code='B01', defaults={'category': asset_cat, 'name': 'Cash in Hand', 'owner': self.ctx.owner, 'created_by': self.ctx.owner, 'classification': self.ctx.classification})
                cr_acc = cash_acc
            else:
                is_reconciliation = True
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `Cash in Hand`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 41

**File**: `src\automations\management\commands\transaction_processors\bank_payments.py`  
**Line**: 1575  

**Original Call**:
```python
Account.objects.get_or_create(
            branch=self.context.branch,
            code=control_code,
            defaults={
                'category': asset_cat,
                'name': control_name...
```

**Context**:
```python
                'created_by': self.context.owner,
                'classification': self.context.classification
            }
        )
        if created:
            # optionally log creation
            logger.info("Created control bank account: %s (%s)", control_acc, control_code)
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 42

**File**: `src\automations\management\commands\transaction_processors\base_processor.py`  
**Line**: 65  

**Original Call**:
```python
Account.objects.get_or_create(
            branch=self.context.branch, code=code,
            defaults={
                'category': income_cat, 'name': f"{name} (Legacy)",
                'owner': se...
```

**Context**:
```python
                'owner': self.context.owner, 'created_by': self.context.owner,
                'classification': classification,
            }
        )
        return acc
        
    def _expense_gl(self, legacy_expense_id, fallback_name="Expense"):
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 43

**File**: `src\automations\management\commands\transaction_processors\base_processor.py`  
**Line**: 92  

**Original Call**:
```python
Account.objects.get_or_create(
            branch=self.context.branch, code=code,
            defaults={
                'category': expense_cat, 'name': f"{name} (Legacy)",
                'owner': s...
```

**Context**:
```python
                'owner': self.context.owner, 'created_by': self.context.owner,
                'classification': classification,
            }
        )
        return acc
        
    def _branch_category(self, section, name, code_prefix=None):
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 44

**File**: `src\automations\management\commands\transaction_processors\liability_payments.py`  
**Line**: 121  

**Original Call**:
```python
Account.objects.get_or_create(
            branch=self.context.branch,
            code=code,
            defaults={
                'category': liability_cat,
                'name': liab_name,
     ...
```

**Context**:
```python
                'created_by': self.context.owner,
                'classification': self.context.classification
            }
        )

        # Bank account
        bank_id = f.get('bank')
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 45

**File**: `src\automations\management\commands\transaction_processors\liability_payments.py`  
**Line**: 210  

**Original Call**:
```python
Account.objects.get_or_create(
                branch=self.context.branch, code=code,
                defaults={
                    'category': liability_cat,
                    'name': liab_name,
 ...
```

**Context**:
```python
                    'created_by': self.context.owner,
                    'classification': self.context.classification
                }
            )

            # Bank account (if provided on the liability payment)
            bank_id = f.get('bank')
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 46

**File**: `src\automations\management\commands\transaction_processors\liability_payments.py`  
**Line**: 338  

**Original Call**:
```python
Account.objects.get_or_create(
            branch=self.context.branch,
            code=code,
            defaults={
                'category': liability_cat,
                'name': liab_name,
     ...
```

**Context**:
```python
                'created_by': self.context.owner,
                'classification': self.context.classification
            }
        )

        # Build entries: standard behaviour for bank inflow = debit bank, credit liability
        if amount >= 0:
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 47

**File**: `src\core\management\commands\initialize_erp_system.py`  
**Line**: 414  

**Original Call**:
```python
Account.objects.get_or_create(
                        owner=owner,
                        branch=branch,
                        code=code,
                        defaults={
                       ...
```

**Context**:
```python
                            'currency': self.currency,
                            'is_contra_account': is_contra
                        }
                    )
                    
                    if acc_created:
                        created_count += 1
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 48

**File**: `src\core\management\commands\initialize_production_erp.py`  
**Line**: 554  

**Original Call**:
```python
Account.objects.get_or_create(
                    code=acc_def['code'],
                    owner=owner,
                    branch=branch,
                    defaults={
                        'nam...
```

**Context**:
```python
                        'parent': parent_account,
                        'balance': Decimal('0.00')
                    }
                )
                
                account_objects[acc_def['code']] = account
                accounts_created.append(account)
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 49

**File**: `src\hr\services\payroll_accounting.py`  
**Line**: 171  

**Original Call**:
```python
Account.objects.get_or_create(
            code='580-001',
            branch=self.payroll.branch,
            defaults={
                'name': 'General Salary Expense',
                'account_typ...
```

**Context**:
```python
                'owner': self.payroll.owner,
                'is_active': True
            }
        )
        return account
    
    def _get_tax_payable_account(self):
```

**Extracted Parameters**:
- Code: `580-001`
- Name: `General Salary Expense`
- Account Type: `NOT FOUND`
- Account Level: `CHILD`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_child_account

# Replace with:
account = get_or_create_child_account(
    parent_code='580',
    child_suffix='001',
    name='General Salary Expense',
    account_type='<TYPE_REQUIRED>',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    parent_name='<PARENT_NAME>'  # ⚠️ Provide meaningful parent name
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Update `<PARENT_NAME>` with a meaningful description
- Verify `owner` and `branch` variables are in scope

---

### Match 50

**File**: `src\hr\services\payroll_accounting.py`  
**Line**: 189  

**Original Call**:
```python
Account.objects.get_or_create(
            code='250-001',
            branch=self.payroll.branch,
            defaults={
                'name': 'General Tax Payable',
                'account_type':...
```

**Context**:
```python
                'owner': self.payroll.owner,
                'is_active': True
            }
        )
        return account
    
    def _get_other_payables_account(self):
```

**Extracted Parameters**:
- Code: `250-001`
- Name: `General Tax Payable`
- Account Type: `NOT FOUND`
- Account Level: `CHILD`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_child_account

# Replace with:
account = get_or_create_child_account(
    parent_code='250',
    child_suffix='001',
    name='General Tax Payable',
    account_type='<TYPE_REQUIRED>',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    parent_name='<PARENT_NAME>'  # ⚠️ Provide meaningful parent name
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Update `<PARENT_NAME>` with a meaningful description
- Verify `owner` and `branch` variables are in scope

---

### Match 51

**File**: `src\hr\services\payroll_accounting.py`  
**Line**: 207  

**Original Call**:
```python
Account.objects.get_or_create(
            code='260-001',
            branch=self.payroll.branch,
            defaults={
                'name': 'General Other Payables',
                'account_typ...
```

**Context**:
```python
                'owner': self.payroll.owner,
                'is_active': True
            }
        )
        return account
    
    def _get_default_payment_account(self):
```

**Extracted Parameters**:
- Code: `260-001`
- Name: `General Other Payables`
- Account Type: `NOT FOUND`
- Account Level: `CHILD`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_child_account

# Replace with:
account = get_or_create_child_account(
    parent_code='260',
    child_suffix='001',
    name='General Other Payables',
    account_type='<TYPE_REQUIRED>',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    parent_name='<PARENT_NAME>'  # ⚠️ Provide meaningful parent name
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Update `<PARENT_NAME>` with a meaningful description
- Verify `owner` and `branch` variables are in scope

---

### Match 52

**File**: `src\hr\services\payroll_accounting.py`  
**Line**: 235  

**Original Call**:
```python
Account.objects.get_or_create(
                code='101',
                branch=self.payroll.branch,
                defaults={
                    'name': 'Cash',
                    'account_type'...
```

**Context**:
```python
                    'owner': self.payroll.owner,
                    'is_active': True
                }
            )
        
        return account

```

**Extracted Parameters**:
- Code: `101`
- Name: `Cash`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='101',
    name='Cash',
    account_type='<TYPE_REQUIRED>',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 53

**File**: `src\incomes\services\accounting_integration.py`  
**Line**: 132  

**Original Call**:
```python
Account.objects.get_or_create(
            code='140-001',
            owner=income.owner,
            branch=income.branch,
            defaults={
                'name': 'General Receivables',
     ...
```

**Context**:
```python
                'allow_manual_entries': True,
                'is_system_account': True
            }
        )
        
        # Determine if this is first time or payment
        is_first_record = income.amount_paid == 0
```

**Extracted Parameters**:
- Code: `140-001`
- Name: `General Receivables`
- Account Type: `ASSET`
- Account Level: `CHILD`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_child_account

# Replace with:
account = get_or_create_child_account(
    parent_code='140',
    child_suffix='001',
    name='General Receivables',
    account_type='ASSET',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    parent_name='<PARENT_NAME>'  # ⚠️ Provide meaningful parent name
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Update `<PARENT_NAME>` with a meaningful description
- Verify `owner` and `branch` variables are in scope

---

### Match 54

**File**: `src\incomes\services\accounting_integration.py`  
**Line**: 411  

**Original Call**:
```python
Account.objects.get_or_create(
            code='140-001',
            owner=entitlement.owner,
            branch=entitlement.branch,
            defaults={
                'name': 'General Receivabl...
```

**Context**:
```python
                'allow_manual_entries': True,
                'is_system_account': True
            }
        )
        
        # Get transaction series
        series, _ = TransactionSeries.objects.get_or_create(
```

**Extracted Parameters**:
- Code: `140-001`
- Name: `General Receivables`
- Account Type: `ASSET`
- Account Level: `CHILD`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_child_account

# Replace with:
account = get_or_create_child_account(
    parent_code='140',
    child_suffix='001',
    name='General Receivables',
    account_type='ASSET',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    parent_name='<PARENT_NAME>'  # ⚠️ Provide meaningful parent name
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Update `<PARENT_NAME>` with a meaningful description
- Verify `owner` and `branch` variables are in scope

---

### Match 55

**File**: `src\incomes\services\accounting_integration.py`  
**Line**: 508  

**Original Call**:
```python
Account.objects.get_or_create(
            code='101',
            owner=owner,
            branch=branch,
            defaults={
                'name': 'Cash on Hand',
                'account_type'...
```

**Context**:
```python
                'allow_manual_entries': True,
                'is_system_account': True
            }
        )
        
        return cash_account

```

**Extracted Parameters**:
- Code: `101`
- Name: `Cash on Hand`
- Account Type: `ASSET`
- Account Level: `PARENT`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='101',
    name='Cash on Hand',
    account_type='ASSET',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 56

**File**: `src\incomes\services\discount_service.py`  
**Line**: 169  

**Original Call**:
```python
Account.objects.get_or_create(
            code='140',
            owner=applied_discount.owner,
            branch=applied_discount.branch,
            defaults={
                'name': 'Accounts Re...
```

**Context**:
```python
                'allow_manual_entries': True,
                'is_system_account': True
            }
        )
        
        # Get discount account from program
        discount_account = program.discount_account
```

**Extracted Parameters**:
- Code: `140`
- Name: `Accounts Receivable`
- Account Type: `ASSET`
- Account Level: `PARENT`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='140',
    name='Accounts Receivable',
    account_type='ASSET',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 57

**File**: `src\incomes\services\discount_service.py`  
**Line**: 252  

**Original Call**:
```python
Account.objects.get_or_create(
            code='140',
            owner=applied_discount.owner,
            branch=applied_discount.branch,
            defaults={
                'name': 'Accounts Re...
```

**Context**:
```python
                'allow_manual_entries': True,
                'is_system_account': True
            }
        )
        
        discount_account = program.discount_account
        
```

**Extracted Parameters**:
- Code: `140`
- Name: `Accounts Receivable`
- Account Type: `ASSET`
- Account Level: `PARENT`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='140',
    name='Accounts Receivable',
    account_type='ASSET',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 58

**File**: `src\incomes\management\commands\setup_discount_programs.py`  
**Line**: 258  

**Original Call**:
```python
Account.objects.get_or_create(
            code=code,
            owner_id=owner_id,
            branch_id=branch_id,
            defaults={
                'name': name,
                'account_type...
```

**Context**:
```python
                'description': description,
                'is_active': True
            }
        )
        if created:
            self.stdout.write(f'  Created account: {code} - {name}')
        return account
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 59

**File**: `src\inventory\services\accounting_service.py`  
**Line**: 70  

**Original Call**:
```python
Account.objects.get_or_create(
                    code='101',
                    owner=item.owner,
                    branch=item.branch,
                    defaults={
                        'nam...
```

**Context**:
```python
                        'allow_manual_entries': True,
                        'is_system_account': True
                    }
                )
            
            credit_account = cash_account
            entry_description = f"Cash purchase - {item.name} from {supplier_name}"
```

**Extracted Parameters**:
- Code: `101`
- Name: `Cash on Hand`
- Account Type: `ASSET`
- Account Level: `PARENT`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='101',
    name='Cash on Hand',
    account_type='ASSET',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 60

**File**: `src\inventory\services\accounting_service.py`  
**Line**: 88  

**Original Call**:
```python
Account.objects.get_or_create(
                    code='210-001',
                    owner=item.owner,
                    branch=item.branch,
                    defaults={
                        ...
```

**Context**:
```python
                        'allow_manual_entries': True,
                        'is_system_account': True
                    }
                )
            
            credit_account = ap_account
            entry_description = f"Credit purchase - {item.name} from {supplier_name}"
```

**Extracted Parameters**:
- Code: `210-001`
- Name: `General Payables`
- Account Type: `LIABILITY`
- Account Level: `CHILD`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_child_account

# Replace with:
account = get_or_create_child_account(
    parent_code='210',
    child_suffix='001',
    name='General Payables',
    account_type='LIABILITY',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    parent_name='<PARENT_NAME>'  # ⚠️ Provide meaningful parent name
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Update `<PARENT_NAME>` with a meaningful description
- Verify `owner` and `branch` variables are in scope

---

### Match 61

**File**: `src\inventory\services\accounting_service.py`  
**Line**: 218  

**Original Call**:
```python
Account.objects.get_or_create(
                code='400-001',
                owner=owner,
                branch=branch,
                defaults={
                    'name': 'General Sales Revenue...
```

**Context**:
```python
                    'allow_manual_entries': True,
                    'is_system_account': True
                }
            )
        
        if payment_method == 'cash':
            if not cash_account:
```

**Extracted Parameters**:
- Code: `400-001`
- Name: `General Sales Revenue`
- Account Type: `INCOME`
- Account Level: `CHILD`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_child_account

# Replace with:
account = get_or_create_child_account(
    parent_code='400',
    child_suffix='001',
    name='General Sales Revenue',
    account_type='INCOME',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    parent_name='<PARENT_NAME>'  # ⚠️ Provide meaningful parent name
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Update `<PARENT_NAME>` with a meaningful description
- Verify `owner` and `branch` variables are in scope

---

### Match 62

**File**: `src\inventory\services\accounting_service.py`  
**Line**: 233  

**Original Call**:
```python
Account.objects.get_or_create(
                    code='101',
                    owner=owner,
                    branch=branch,
                    defaults={
                        'name': 'Cash ...
```

**Context**:
```python
                        'allow_manual_entries': True,
                        'is_system_account': True
                    }
                )
            
            debit_account = cash_account
            entry_description = f"Cash sale - {customer_name}"
```

**Extracted Parameters**:
- Code: `101`
- Name: `Cash on Hand`
- Account Type: `ASSET`
- Account Level: `PARENT`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='101',
    name='Cash on Hand',
    account_type='ASSET',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 63

**File**: `src\inventory\services\accounting_service.py`  
**Line**: 250  

**Original Call**:
```python
Account.objects.get_or_create(
                    code='140-001',
                    owner=owner,
                    branch=branch,
                    defaults={
                        'name': 'G...
```

**Context**:
```python
                        'allow_manual_entries': True,
                        'is_system_account': True
                    }
                )
            
            debit_account = ar_account
            entry_description = f"Credit sale - {customer_name}"
```

**Extracted Parameters**:
- Code: `140-001`
- Name: `General Receivables`
- Account Type: `ASSET`
- Account Level: `CHILD`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_child_account

# Replace with:
account = get_or_create_child_account(
    parent_code='140',
    child_suffix='001',
    name='General Receivables',
    account_type='ASSET',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    parent_name='<PARENT_NAME>'  # ⚠️ Provide meaningful parent name
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Update `<PARENT_NAME>` with a meaningful description
- Verify `owner` and `branch` variables are in scope

---

### Match 64

**File**: `src\inventory\services\accounting_service.py`  
**Line**: 323  

**Original Call**:
```python
Account.objects.get_or_create(
            code='180-001',
            owner=item.owner,
            branch=item.branch,
            defaults={
                'name': 'General Inventory Adjustment',
...
```

**Context**:
```python
                'allow_manual_entries': True,
                'is_system_account': True
            }
        )
        
        journal_entry = JournalEntry.objects.create(
            entry_date=timezone.now().date(),
```

**Extracted Parameters**:
- Code: `180-001`
- Name: `General Inventory Adjustment`
- Account Type: `EXPENSE`
- Account Level: `CHILD`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_child_account

# Replace with:
account = get_or_create_child_account(
    parent_code='180',
    child_suffix='001',
    name='General Inventory Adjustment',
    account_type='EXPENSE',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    parent_name='<PARENT_NAME>'  # ⚠️ Provide meaningful parent name
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Update `<PARENT_NAME>` with a meaningful description
- Verify `owner` and `branch` variables are in scope

---

### Match 65

**File**: `src\inventory\services\credit_note_accounting.py`  
**Line**: 246  

**Original Call**:
```python
Account.objects.get_or_create(
            code='440-001',
            owner=self.credit_note.owner,
            branch=self.credit_note.branch,
            defaults={
                'name': 'General...
```

**Context**:
```python
                'allow_manual_entries': True,
                'is_system_account': True
            }
        )
        return account
    
    def _get_accounts_receivable(self):
```

**Extracted Parameters**:
- Code: `440-001`
- Name: `General Sales Returns`
- Account Type: `INCOME`
- Account Level: `CHILD`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_child_account

# Replace with:
account = get_or_create_child_account(
    parent_code='440',
    child_suffix='001',
    name='General Sales Returns',
    account_type='INCOME',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    parent_name='<PARENT_NAME>'  # ⚠️ Provide meaningful parent name
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Update `<PARENT_NAME>` with a meaningful description
- Verify `owner` and `branch` variables are in scope

---

### Match 66

**File**: `src\inventory\services\credit_note_accounting.py`  
**Line**: 262  

**Original Call**:
```python
Account.objects.get_or_create(
            code='140-001',
            owner=self.credit_note.owner,
            branch=self.credit_note.branch,
            defaults={
                'name': 'General...
```

**Context**:
```python
                'allow_manual_entries': True,
                'is_system_account': True
            }
        )
        return account
    
    def _get_revenue_parent_account(self):
```

**Extracted Parameters**:
- Code: `140-001`
- Name: `General Receivables`
- Account Type: `ASSET`
- Account Level: `CHILD`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_child_account

# Replace with:
account = get_or_create_child_account(
    parent_code='140',
    child_suffix='001',
    name='General Receivables',
    account_type='ASSET',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    parent_name='<PARENT_NAME>'  # ⚠️ Provide meaningful parent name
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Update `<PARENT_NAME>` with a meaningful description
- Verify `owner` and `branch` variables are in scope

---

### Match 67

**File**: `src\procurement\tests\test_three_way_matching.py`  
**Line**: 113  

**Original Call**:
```python
Account.objects.get_or_create(
            code="120",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': asset_cat,
                'name'...
```

**Context**:
```python
                'account_level': Account.LEVEL_PARENT,
                'created_by': self.user
            }
        )
        cogs_parent, _ = Account.objects.get_or_create(
            code="500",
            owner=self.user,
```

**Extracted Parameters**:
- Code: `120`
- Name: `Inventory - Parent`
- Account Type: `ASSET`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='120',
    name='Inventory - Parent',
    account_type='ASSET',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 68

**File**: `src\procurement\tests\test_three_way_matching.py`  
**Line**: 125  

**Original Call**:
```python
Account.objects.get_or_create(
            code="500",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': expense_cat,
                'nam...
```

**Context**:
```python
                'account_level': Account.LEVEL_PARENT,
                'created_by': self.user
            }
        )
        sales_parent, _ = Account.objects.get_or_create(
            code="400",
            owner=self.user,
```

**Extracted Parameters**:
- Code: `500`
- Name: `COGS - Parent`
- Account Type: `EXPENSE`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='500',
    name='COGS - Parent',
    account_type='EXPENSE',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 69

**File**: `src\procurement\tests\test_three_way_matching.py`  
**Line**: 137  

**Original Call**:
```python
Account.objects.get_or_create(
            code="400",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': income_cat,
                'name...
```

**Context**:
```python
                'account_level': Account.LEVEL_PARENT,
                'created_by': self.user
            }
        )
        
        # Create child accounts
        self.inventory_account, _ = Account.objects.get_or_create(
```

**Extracted Parameters**:
- Code: `400`
- Name: `Sales - Parent`
- Account Type: `INCOME`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='400',
    name='Sales - Parent',
    account_type='INCOME',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 70

**File**: `src\procurement\tests\test_three_way_matching.py`  
**Line**: 151  

**Original Call**:
```python
Account.objects.get_or_create(
            code="120-001",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': asset_cat,
                'n...
```

**Context**:
```python
                'parent': inventory_parent,
                'created_by': self.user
            }
        )
        self.cogs_account, _ = Account.objects.get_or_create(
            code="500-001",
            owner=self.user,
```

**Extracted Parameters**:
- Code: `120-001`
- Name: `Inventory`
- Account Type: `ASSET`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_child_account

# Replace with:
account = get_or_create_child_account(
    parent_code='120',
    child_suffix='001',
    name='Inventory',
    account_type='ASSET',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    parent_name='<PARENT_NAME>'  # ⚠️ Provide meaningful parent name
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Update `<PARENT_NAME>` with a meaningful description
- Verify `owner` and `branch` variables are in scope

---

### Match 71

**File**: `src\procurement\tests\test_three_way_matching.py`  
**Line**: 164  

**Original Call**:
```python
Account.objects.get_or_create(
            code="500-001",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': expense_cat,
                ...
```

**Context**:
```python
                'parent': cogs_parent,
                'created_by': self.user
            }
        )
        self.sales_account, _ = Account.objects.get_or_create(
            code="400-001",
            owner=self.user,
```

**Extracted Parameters**:
- Code: `500-001`
- Name: `Cost of Goods Sold`
- Account Type: `EXPENSE`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_child_account

# Replace with:
account = get_or_create_child_account(
    parent_code='500',
    child_suffix='001',
    name='Cost of Goods Sold',
    account_type='EXPENSE',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    parent_name='<PARENT_NAME>'  # ⚠️ Provide meaningful parent name
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Update `<PARENT_NAME>` with a meaningful description
- Verify `owner` and `branch` variables are in scope

---

### Match 72

**File**: `src\procurement\tests\test_three_way_matching.py`  
**Line**: 177  

**Original Call**:
```python
Account.objects.get_or_create(
            code="400-001",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': income_cat,
                '...
```

**Context**:
```python
                'parent': sales_parent,
                'created_by': self.user
            }
        )
        
        # Create inventory category
        self.category = InventoryCategory.objects.create(
```

**Extracted Parameters**:
- Code: `400-001`
- Name: `Sales Revenue`
- Account Type: `INCOME`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_child_account

# Replace with:
account = get_or_create_child_account(
    parent_code='400',
    child_suffix='001',
    name='Sales Revenue',
    account_type='INCOME',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    parent_name='<PARENT_NAME>'  # ⚠️ Provide meaningful parent name
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Update `<PARENT_NAME>` with a meaningful description
- Verify `owner` and `branch` variables are in scope

---

### Match 73

**File**: `src\procurement\tests\test_workflow_handlers.py`  
**Line**: 113  

**Original Call**:
```python
Account.objects.get_or_create(
            code="120",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': asset_cat,
                'name'...
```

**Context**:
```python
                'account_level': Account.LEVEL_PARENT,
                'created_by': self.user
            }
        )
        cogs_parent, _ = Account.objects.get_or_create(
            code="500",
            owner=self.user,
```

**Extracted Parameters**:
- Code: `120`
- Name: `Inventory - Parent`
- Account Type: `ASSET`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='120',
    name='Inventory - Parent',
    account_type='ASSET',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 74

**File**: `src\procurement\tests\test_workflow_handlers.py`  
**Line**: 125  

**Original Call**:
```python
Account.objects.get_or_create(
            code="500",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': expense_cat,
                'nam...
```

**Context**:
```python
                'account_level': Account.LEVEL_PARENT,
                'created_by': self.user
            }
        )
        sales_parent, _ = Account.objects.get_or_create(
            code="400",
            owner=self.user,
```

**Extracted Parameters**:
- Code: `500`
- Name: `COGS - Parent`
- Account Type: `EXPENSE`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='500',
    name='COGS - Parent',
    account_type='EXPENSE',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 75

**File**: `src\procurement\tests\test_workflow_handlers.py`  
**Line**: 137  

**Original Call**:
```python
Account.objects.get_or_create(
            code="400",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': income_cat,
                'name...
```

**Context**:
```python
                'account_level': Account.LEVEL_PARENT,
                'created_by': self.user
            }
        )
        
        # Create child accounts
        inventory_account, _ = Account.objects.get_or_create(
```

**Extracted Parameters**:
- Code: `400`
- Name: `Sales - Parent`
- Account Type: `INCOME`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='400',
    name='Sales - Parent',
    account_type='INCOME',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 76

**File**: `src\procurement\tests\test_workflow_handlers.py`  
**Line**: 151  

**Original Call**:
```python
Account.objects.get_or_create(
            code="120-001",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': asset_cat,
                'n...
```

**Context**:
```python
                'parent': inventory_parent,
                'created_by': self.user
            }
        )
        cogs_account, _ = Account.objects.get_or_create(
            code="500-001",
            owner=self.user,
```

**Extracted Parameters**:
- Code: `120-001`
- Name: `Inventory`
- Account Type: `ASSET`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_child_account

# Replace with:
account = get_or_create_child_account(
    parent_code='120',
    child_suffix='001',
    name='Inventory',
    account_type='ASSET',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    parent_name='<PARENT_NAME>'  # ⚠️ Provide meaningful parent name
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Update `<PARENT_NAME>` with a meaningful description
- Verify `owner` and `branch` variables are in scope

---

### Match 77

**File**: `src\procurement\tests\test_workflow_handlers.py`  
**Line**: 164  

**Original Call**:
```python
Account.objects.get_or_create(
            code="500-001",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': expense_cat,
                ...
```

**Context**:
```python
                'parent': cogs_parent,
                'created_by': self.user
            }
        )
        sales_account, _ = Account.objects.get_or_create(
            code="400-001",
            owner=self.user,
```

**Extracted Parameters**:
- Code: `500-001`
- Name: `Cost of Goods Sold`
- Account Type: `EXPENSE`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_child_account

# Replace with:
account = get_or_create_child_account(
    parent_code='500',
    child_suffix='001',
    name='Cost of Goods Sold',
    account_type='EXPENSE',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    parent_name='<PARENT_NAME>'  # ⚠️ Provide meaningful parent name
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Update `<PARENT_NAME>` with a meaningful description
- Verify `owner` and `branch` variables are in scope

---

### Match 78

**File**: `src\procurement\tests\test_workflow_handlers.py`  
**Line**: 177  

**Original Call**:
```python
Account.objects.get_or_create(
            code="400-001",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': income_cat,
                '...
```

**Context**:
```python
                'parent': sales_parent,
                'created_by': self.user
            }
        )
        
        # Create category
        self.category = InventoryCategory.objects.create(
```

**Extracted Parameters**:
- Code: `400-001`
- Name: `Sales Revenue`
- Account Type: `INCOME`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_child_account

# Replace with:
account = get_or_create_child_account(
    parent_code='400',
    child_suffix='001',
    name='Sales Revenue',
    account_type='INCOME',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    parent_name='<PARENT_NAME>'  # ⚠️ Provide meaningful parent name
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Update `<PARENT_NAME>` with a meaningful description
- Verify `owner` and `branch` variables are in scope

---

### Match 79

**File**: `src\procurement\tests\test_workflow_handlers.py`  
**Line**: 612  

**Original Call**:
```python
Account.objects.get_or_create(
            code="121",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': asset_cat,
                'name'...
```

**Context**:
```python
                'account_level': Account.LEVEL_PARENT,
                'created_by': self.user
            }
        )
        cogs_parent, _ = Account.objects.get_or_create(
            code="501",
            owner=self.user,
```

**Extracted Parameters**:
- Code: `121`
- Name: `Inventory - Parent`
- Account Type: `ASSET`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='121',
    name='Inventory - Parent',
    account_type='ASSET',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 80

**File**: `src\procurement\tests\test_workflow_handlers.py`  
**Line**: 624  

**Original Call**:
```python
Account.objects.get_or_create(
            code="501",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': expense_cat,
                'nam...
```

**Context**:
```python
                'account_level': Account.LEVEL_PARENT,
                'created_by': self.user
            }
        )
        sales_parent, _ = Account.objects.get_or_create(
            code="401",
            owner=self.user,
```

**Extracted Parameters**:
- Code: `501`
- Name: `COGS - Parent`
- Account Type: `EXPENSE`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='501',
    name='COGS - Parent',
    account_type='EXPENSE',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 81

**File**: `src\procurement\tests\test_workflow_handlers.py`  
**Line**: 636  

**Original Call**:
```python
Account.objects.get_or_create(
            code="401",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': income_cat,
                'name...
```

**Context**:
```python
                'account_level': Account.LEVEL_PARENT,
                'created_by': self.user
            }
        )
        
        # Create child accounts
        inventory_account, _ = Account.objects.get_or_create(
```

**Extracted Parameters**:
- Code: `401`
- Name: `Sales - Parent`
- Account Type: `INCOME`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_system_account

# Replace with:
account = get_or_create_system_account(
    code='401',
    name='Sales - Parent',
    account_type='INCOME',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    account_level='PARENT'
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Verify `owner` and `branch` variables are in scope
- Parent accounts typically have `allow_manual_entries=False` (enforced by child account requirement)

---

### Match 82

**File**: `src\procurement\tests\test_workflow_handlers.py`  
**Line**: 650  

**Original Call**:
```python
Account.objects.get_or_create(
            code="121-001",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': asset_cat,
                'n...
```

**Context**:
```python
                'parent': inventory_parent,
                'created_by': self.user
            }
        )
        cogs_account, _ = Account.objects.get_or_create(
            code="501-001",
            owner=self.user,
```

**Extracted Parameters**:
- Code: `121-001`
- Name: `Inventory`
- Account Type: `ASSET`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_child_account

# Replace with:
account = get_or_create_child_account(
    parent_code='121',
    child_suffix='001',
    name='Inventory',
    account_type='ASSET',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    parent_name='<PARENT_NAME>'  # ⚠️ Provide meaningful parent name
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Update `<PARENT_NAME>` with a meaningful description
- Verify `owner` and `branch` variables are in scope

---

### Match 83

**File**: `src\procurement\tests\test_workflow_handlers.py`  
**Line**: 663  

**Original Call**:
```python
Account.objects.get_or_create(
            code="501-001",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': expense_cat,
                ...
```

**Context**:
```python
                'parent': cogs_parent,
                'created_by': self.user
            }
        )
        sales_account, _ = Account.objects.get_or_create(
            code="401-001",
            owner=self.user,
```

**Extracted Parameters**:
- Code: `501-001`
- Name: `Cost of Goods Sold`
- Account Type: `EXPENSE`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_child_account

# Replace with:
account = get_or_create_child_account(
    parent_code='501',
    child_suffix='001',
    name='Cost of Goods Sold',
    account_type='EXPENSE',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    parent_name='<PARENT_NAME>'  # ⚠️ Provide meaningful parent name
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Update `<PARENT_NAME>` with a meaningful description
- Verify `owner` and `branch` variables are in scope

---

### Match 84

**File**: `src\procurement\tests\test_workflow_handlers.py`  
**Line**: 676  

**Original Call**:
```python
Account.objects.get_or_create(
            code="401-001",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': income_cat,
                '...
```

**Context**:
```python
                'parent': sales_parent,
                'created_by': self.user
            }
        )
        
        self.category = InventoryCategory.objects.create(
            branch=self.branch,
```

**Extracted Parameters**:
- Code: `401-001`
- Name: `Sales Revenue`
- Account Type: `INCOME`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

```python
from accounts.utils.account_creation import get_or_create_child_account

# Replace with:
account = get_or_create_child_account(
    parent_code='401',
    child_suffix='001',
    name='Sales Revenue',
    account_type='INCOME',
    owner=owner,  # ⚠️ Verify this variable exists in scope
    branch=branch,  # ⚠️ Verify this variable exists in scope
    parent_name='<PARENT_NAME>'  # ⚠️ Provide meaningful parent name
)
```

**Notes**:
- `tenant` is automatically derived from `owner.tenant`
- Update `<PARENT_NAME>` with a meaningful description
- Verify `owner` and `branch` variables are in scope

---

### Match 85

**File**: `src\reports\management\commands\test_pdf_data.py`  
**Line**: 205  

**Original Call**:
```python
Account.objects.get_or_create(
                code=f"A{timestamp_suffix}",
                owner=user,
                branch=branch,
                defaults={
                    'category': asset_...
```

**Context**:
```python
                    'account_level': Account.LEVEL_PARENT,
                    'created_by': user
                }
            )
            expense_parent, _ = Account.objects.get_or_create(
                code=f"E{timestamp_suffix}",
                owner=user,
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `Inventory Parent`
- Account Type: `asset`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 86

**File**: `src\reports\management\commands\test_pdf_data.py`  
**Line**: 217  

**Original Call**:
```python
Account.objects.get_or_create(
                code=f"E{timestamp_suffix}",
                owner=user,
                branch=branch,
                defaults={
                    'category': expens...
```

**Context**:
```python
                    'account_level': Account.LEVEL_PARENT,
                    'created_by': user
                }
            )
            income_parent, _ = Account.objects.get_or_create(
                code=f"I{timestamp_suffix}",
                owner=user,
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `Expense Parent`
- Account Type: `expense`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 87

**File**: `src\reports\management\commands\test_pdf_data.py`  
**Line**: 229  

**Original Call**:
```python
Account.objects.get_or_create(
                code=f"I{timestamp_suffix}",
                owner=user,
                branch=branch,
                defaults={
                    'category': income...
```

**Context**:
```python
                    'account_level': Account.LEVEL_PARENT,
                    'created_by': user
                }
            )
            
            # Create child accounts
            if not inventory_account:
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `Income Parent`
- Account Type: `income`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 88

**File**: `src\reports\management\commands\test_pdf_data.py`  
**Line**: 244  

**Original Call**:
```python
Account.objects.get_or_create(
                    code=f"A{timestamp_suffix}01",
                    owner=user,
                    branch=branch,
                    defaults={
                    ...
```

**Context**:
```python
                        'parent': inventory_parent,
                        'created_by': user
                    }
                )
            
            if not cogs_account:
                cogs_account, _ = Account.objects.get_or_create(
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `Inventory`
- Account Type: `asset`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 89

**File**: `src\reports\management\commands\test_pdf_data.py`  
**Line**: 259  

**Original Call**:
```python
Account.objects.get_or_create(
                    code=f"E{timestamp_suffix}01",
                    owner=user,
                    branch=branch,
                    defaults={
                    ...
```

**Context**:
```python
                        'parent': expense_parent,
                        'created_by': user
                    }
                )
            
            if not sales_account:
                sales_account, _ = Account.objects.get_or_create(
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `Cost of Goods Sold`
- Account Type: `expense`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 90

**File**: `src\reports\management\commands\test_pdf_data.py`  
**Line**: 274  

**Original Call**:
```python
Account.objects.get_or_create(
                    code=f"I{timestamp_suffix}01",
                    owner=user,
                    branch=branch,
                    defaults={
                    ...
```

**Context**:
```python
                        'parent': income_parent,
                        'created_by': user
                    }
                )
            
            if not expense_account:
                expense_account, _ = Account.objects.get_or_create(
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `Product Sales`
- Account Type: `income`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 91

**File**: `src\reports\management\commands\test_pdf_data.py`  
**Line**: 289  

**Original Call**:
```python
Account.objects.get_or_create(
                    code=f"E{timestamp_suffix}02",
                    owner=user,
                    branch=branch,
                    defaults={
                    ...
```

**Context**:
```python
                        'parent': expense_parent,
                        'created_by': user
                    }
                )
            
            self.stdout.write('  Created/verified GL accounts')

```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `Fuel Expense`
- Account Type: `expense`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 92

**File**: `src\reports\management\commands\test_pdf_data.py`  
**Line**: 458  

**Original Call**:
```python
Account.objects.get_or_create(
            code=f"A{timestamp_suffix}02",
            owner=user,
            branch=branch,
            defaults={
                'category': asset_cat,
             ...
```

**Context**:
```python
                'parent': asset_parent,
                'created_by': user
            }
        )
        depreciation_account, _ = Account.objects.get_or_create(
            code=f"E{timestamp_suffix}03",
            owner=user,
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `Fixed Assets`
- Account Type: `asset`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 93

**File**: `src\reports\management\commands\test_pdf_data.py`  
**Line**: 471  

**Original Call**:
```python
Account.objects.get_or_create(
            code=f"E{timestamp_suffix}03",
            owner=user,
            branch=branch,
            defaults={
                'category': expense_cat,
           ...
```

**Context**:
```python
                'parent': expense_parent,
                'created_by': user
            }
        )
        accumulated_depreciation_account, _ = Account.objects.get_or_create(
            code=f"A{timestamp_suffix}03",
            owner=user,
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `Depreciation Expense`
- Account Type: `expense`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 94

**File**: `src\reports\management\commands\test_pdf_data.py`  
**Line**: 484  

**Original Call**:
```python
Account.objects.get_or_create(
            code=f"A{timestamp_suffix}03",
            owner=user,
            branch=branch,
            defaults={
                'category': asset_cat,
             ...
```

**Context**:
```python
                'parent': asset_parent,
                'created_by': user
            }
        )
        
        asset_category, _ = AssetCategory.objects.get_or_create(
            name='Vehicles',
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `Accumulated Depreciation`
- Account Type: `asset`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

### Match 95

**File**: `src\users\management\commands\initialize_school_erp.py`  
**Line**: 243  

**Original Call**:
```python
Account.objects.get_or_create(
                    code=code,
                    owner=owner,
                    branch=branch,
                    defaults={
                        'name': name,
 ...
```

**Context**:
```python
                        'currency': 'NGN',
                        'is_active': True,
                    }
                )
                if created:
                    created_accounts.append(account)
        
```

**Extracted Parameters**:
- Code: `NOT FOUND`
- Name: `NOT FOUND`
- Account Type: `NOT FOUND`
- Account Level: `NOT FOUND`
- Description: `NOT FOUND`

**Suggested Replacement**:

❌ **Cannot generate suggestion**: Code is not a literal value. Manual review required.

---

## Next Steps

1. **Review each suggestion** in the context of its file
2. **Verify variable scope** - ensure `owner`, `branch` exist
3. **Test changes** in a development environment
4. **Update imports** at the top of modified files
5. **Run tests** after each batch of changes

## End of Report
