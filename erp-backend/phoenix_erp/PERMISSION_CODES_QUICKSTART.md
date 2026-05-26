# Permission Codes System - Quick Start Guide

## 📋 Overview

The Phoenix ERP permission system provides **186 fine-grained permission codes** across all modules, allowing precise control over what users can see and do.

## 🚀 Quick Start

### 1. Run Migration
```bash
cd erp-backend/phoenix_erp/src
python manage.py migrate users
```

### 2. Create Default Roles
```bash
python manage.py create_roles --all
```

### 3. Setup Role Permissions
```bash
# In Django shell
python manage.py shell
exec(open('setup_procurement_permissions.py').read())
```

This creates 9 pre-configured roles:
- **Director** (30 permissions)
- **Principal** (47 permissions)
- **Administrator** (ALL - wildcard `*`)
- **Registrar** (24 permissions)
- **Officer** (18 permissions)
- **Procurement Manager** (48 permissions)
- **Finance Manager** (38 permissions)
- **HR Manager** (37 permissions)
- **Warehouse Manager** (31 permissions)

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| [PERMISSION_CODES_SYSTEM.md](PERMISSION_CODES_SYSTEM.md) | Complete guide with examples |
| [PERMISSION_CODES_REFERENCE.md](PERMISSION_CODES_REFERENCE.md) | All 186 permission codes organized by module |
| [permission_codes.json](permission_codes.json) | JSON format for frontend/API use |
| [setup_procurement_permissions.py](setup_procurement_permissions.py) | Role setup script |

## 🎯 Usage Examples

### Backend - Check Permission
```python
# In a Django view or API endpoint
if not request.user.has_action_permission('po-approve'):
    return Response({'error': 'Permission denied'}, status=403)

# Get all user permissions
permissions = request.user.get_all_action_permissions()
# Returns: ['pr-list', 'pr-create', 'po-view-detail', ...]
```

### Frontend - Control UI Elements
```javascript
// In React/Vue component
const { user } = useAuth();

// Check single permission
const canApprove = user.action_permissions.includes('po-approve') ||
                   user.action_permissions.includes('*');

// Conditional rendering
{canApprove && (
  <button onClick={handleApprove}>Approve PO</button>
)}

// Disable button
<button 
  disabled={!user.action_permissions.includes('po-edit')}
  onClick={handleEdit}
>
  Edit
</button>
```

### API Response - Login/Profile
```json
{
  "id": 123,
  "username": "john.doe",
  "email": "john@example.com",
  "roles": [2, 5],
  "role_names": ["Registrar", "Finance Manager"],
  "action_permissions": [
    "client-list",
    "client-create",
    "client-view-detail",
    "invoice-list",
    "invoice-create",
    "receivables-list",
    "..."
  ]
}
```

## 🔧 Assign Roles to Users

### Via Django Admin
1. Go to **Users** section
2. Edit user
3. Select roles in **Roles** field
4. Save

### Via Django Shell
```python
from users.models import User, Role

user = User.objects.get(username='john.doe')
role = Role.objects.get(name='Procurement Manager', tenant=user.tenant)

user.roles.add(role)

# Verify
print(user.get_all_action_permissions())
```

### Via API (if endpoint exists)
```bash
POST /api/users/123/update_roles/
{
  "role_ids": [2, 5]
}
```

## 📖 Permission Code Format

Format: `{module}-{action}`

### Common Actions
- `-list` - View list
- `-create` - Create new
- `-view-detail` - View single record
- `-edit` - Update record
- `-delete` - Delete record
- `-approve` - Approve record
- `-reject` - Reject record
- `-export` - Export data
- `-submit-approval` - Submit for approval

### Example Codes
```
pr-list                 # View requisition list
pr-create               # Create requisition
pr-view-detail          # View requisition details
pr-approve              # Approve requisition
pr-convert-to-po        # Convert requisition to PO

po-list                 # View purchase order list
po-bulk-approve         # Bulk approve POs
po-generate-pdf         # Generate PO PDF

invoice-record-payment  # Record payment on invoice
client-bulk-import      # Bulk import clients
```

## 🎨 Module Categories (186 Codes)

| Module | Codes | Example |
|--------|-------|---------|
| Purchase Orders | 14 | `po-list`, `po-approve`, `po-bulk-approve` |
| Procurement Requisitions | 14 | `pr-create`, `pr-approve`, `pr-convert-to-po` |
| GRN | 8 | `grn-create`, `grn-quality-check`, `grn-post` |
| Returns | 7 | `return-approve`, `return-process-refund` |
| Suppliers | 5 | `supplier-list`, `supplier-create` |
| Inventory | 14 | `item-create`, `adjustment-create`, `transfer-create` |
| Invoicing | 10 | `invoice-create`, `invoice-record-payment` |
| Fee Management | 11 | `entitlement-create`, `fee-structure-edit` |
| HR | 37 | `staff-create`, `attendance-approve`, `payroll-process` |
| Prepaid | 3 | `prepaid-amortize`, `prepaid-create` |
| Consumption | 6 | `consumption-record`, `consumption-post` |
| Vouchers | 4 | `voucher-create`, `voucher-cancel` |
| Financial Reports | 3 | `trial-balance-view`, `pl-view`, `balance-sheet-view` |
| Clients | 10 | `client-create`, `client-bulk-import` |
| Branches | 4 | `branch-list`, `branch-create` |

## ⚙️ Customize Permissions

### Add Single Permission to User
```python
from users.models import User

user = User.objects.get(username='john.doe')

# Add user-specific permission (extends role permissions)
user.permission_codes = ['po-approve', 'pr-approve']
user.save()
```

### Update Role Permissions
```python
from users.models import Role

role = Role.objects.get(name='Officer', tenant=tenant)

# Add new permissions
current = role.permission_codes or []
current.extend(['invoice-list', 'invoice-view-detail'])
role.permission_codes = list(set(current))  # Remove duplicates
role.save()
```

### Create Custom Role
```python
from users.models import Role, Tenant

tenant = Tenant.objects.get(slug='phoenix-erp')

custom_role = Role.objects.create(
    tenant=tenant,
    name='Audit Manager',
    description='Read-only access for auditing',
    is_active=True,
    permission_codes=[
        'po-list', 'po-view-detail', 'po-export',
        'pr-list', 'pr-view-detail',
        'invoice-list', 'invoice-view-detail', 'invoice-export-pdf',
        'trial-balance-view', 'pl-view', 'balance-sheet-view',
        'irregularities-view',
    ]
)
```

## 🔒 Security Best Practices

1. **Always validate on backend** - Never trust frontend checks alone
2. **Use principle of least privilege** - Grant minimum necessary permissions
3. **Regular audits** - Review who has which permissions periodically
4. **Log sensitive actions** - Track usage of high-privilege permissions
5. **Test thoroughly** - Verify permission checks work correctly

## 🐛 Troubleshooting

### Permissions not showing up
```python
# Check user's roles are active
user.roles.filter(is_active=True)

# Verify permission_codes is a list
role.permission_codes  # Should be a list, not string

# Get all permissions
user.get_all_action_permissions()
```

### User has wrong permissions
```python
# Check all assigned roles
print([role.name for role in user.roles.all()])

# Check user-specific permissions
print(user.permission_codes)

# Check aggregated permissions
print(user.get_all_action_permissions())
```

### Permission check not working
```python
# Test permission
user.has_action_permission('po-approve')  # Returns True/False

# Check if wildcard
if '*' in user.get_all_action_permissions():
    print("User has all permissions")
```

## 📞 Support

For more details:
- Full documentation: [PERMISSION_CODES_SYSTEM.md](PERMISSION_CODES_SYSTEM.md)
- Complete reference: [PERMISSION_CODES_REFERENCE.md](PERMISSION_CODES_REFERENCE.md)
- JSON format: [permission_codes.json](permission_codes.json)

---

**Total Permission Codes: 186**  
**Pre-configured Roles: 9**  
**Ready to use!** ✅
