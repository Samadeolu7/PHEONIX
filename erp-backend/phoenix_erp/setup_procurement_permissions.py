"""
Setup comprehensive role permissions for Phoenix ERP
Run this in Django shell: exec(open('setup_procurement_permissions.py').read())
Or create as management command
"""

from users.models import Tenant, Role

# Get your tenant
tenant = Tenant.objects.get(slug='phoenix-erp')  # Change to your tenant slug

print("\n" + "="*70)
print("PHOENIX ERP - ROLE PERMISSIONS SETUP")
print("="*70 + "\n")

# ============================================================================
# Director Role - Strategic oversight with approval authority
# ============================================================================
director_role, created = Role.objects.get_or_create(
    tenant=tenant,
    name='Director',
    defaults={
        'description': 'Executive leadership with strategic oversight and approval authority',
        'is_active': True,
    }
)

director_role.permission_codes = [
    # Purchase Orders - Approval & oversight
    'po-list', 'po-view-detail', 'po-bulk-approve', 'po-approve', 'po-export',
    
    # Procurement Requisitions - Approval
    'pr-list', 'pr-view-detail', 'pr-approve', 'pr-reject',
    
    # Financial Reports - Full access
    'trial-balance-view', 'pl-view', 'balance-sheet-view',
    
    # HR Summary - Overview
    'hr-dashboard-view', 'hr-staff-summary', 'hr-attendance-summary',
    'hr-leave-summary', 'hr-payroll-summary',
    
    # Payroll - Approval
    'payroll-list', 'payroll-approve',
    
    # Invoicing - Overview
    'invoice-list', 'invoice-view-detail',
    
    # Receivables
    'receivables-list',
    
    # Client management
    'client-list', 'client-view-detail',
    
    # Irregularities
    'irregularities-view',
    
    # Branches
    'branch-list', 'branch-view-detail',
]
director_role.save()
status = "Created" if created else "Updated"
print(f"✓ {status} Director role: {len(director_role.permission_codes)} permissions")

# ============================================================================
# Principal Role - Academic & operational management
# ============================================================================
principal_role, created = Role.objects.get_or_create(
    tenant=tenant,
    name='Principal',
    defaults={
        'description': 'Academic leadership with operational management authority',
        'is_active': True,
    }
)

principal_role.permission_codes = [
    # Client/Student Management - Full access
    'client-list', 'client-create', 'client-view-detail', 'client-edit',
    'client-bulk-import', 'client-export',
    'classification-list', 'classification-create', 'classification-edit',
    
    # Fee Management - Full access
    'fee-structure-list', 'fee-structure-create', 'fee-structure-view-detail',
    'fee-structure-edit',
    'entitlement-list', 'entitlement-create', 'entitlement-view-detail',
    'entitlement-edit',
    'receivables-list',
    
    # HR Management - Full access
    'hr-dashboard-view', 'hr-staff-summary', 'hr-attendance-summary',
    'hr-leave-summary',
    'staff-list', 'staff-create', 'staff-view-detail', 'staff-edit',
    'attendance-list', 'attendance-approve', 'attendance-export',
    'leave-list', 'leave-view-detail', 'leave-approve', 'leave-reject',
    'leave-balances', 'leave-types',
    
    # Procurement - Approval authority
    'pr-list', 'pr-view-detail', 'pr-approve', 'pr-reject',
    'po-list', 'po-view-detail', 'po-approve',
    
    # Invoicing
    'invoice-list', 'invoice-view-detail', 'invoice-export-pdf',
    
    # Reports
    'trial-balance-view', 'pl-view',
    
    # Branches
    'branch-list', 'branch-view-detail',
]
principal_role.save()
status = "Created" if created else "Updated"
print(f"✓ {status} Principal role: {len(principal_role.permission_codes)} permissions")


# ============================================================================
# Administrator Role - System-wide management
# ============================================================================
admin_role, created = Role.objects.get_or_create(
    tenant=tenant,
    name='Administrator',
    defaults={
        'description': 'Full system access across all modules',
        'is_active': True,
    }
)

# Administrator gets wildcard (all permissions)
admin_role.permission_codes = ['*']
admin_role.save()
status = "Created" if created else "Updated"
print(f"✓ {status} Administrator role: ALL permissions (*)")


# ============================================================================
# Registrar Role - Student records and academic administration
# ============================================================================
registrar_role, created = Role.objects.get_or_create(
    tenant=tenant,
    name='Registrar',
    defaults={
        'description': 'Student records, enrollment, and academic administration',
        'is_active': True,
    }
)

registrar_role.permission_codes = [
    # Client/Student Management - Full access
    'client-list', 'client-create', 'client-view-detail', 'client-edit',
    'client-bulk-import', 'client-export',
    'classification-list', 'classification-create', 'classification-edit',
    
    # Fee Management
    'fee-structure-list', 'fee-structure-view-detail',
    'entitlement-list', 'entitlement-create', 'entitlement-view-detail',
    'entitlement-edit', 'entitlement-delete',
    'receivables-list',
    
    # Invoicing
    'invoice-list', 'invoice-create', 'invoice-view-detail', 'invoice-edit',
    'invoice-record-payment', 'invoice-export-pdf',
    
    # Branch access
    'branch-list', 'branch-view-detail',
]
registrar_role.save()
status = "Created" if created else "Updated"
print(f"✓ {status} Registrar role: {len(registrar_role.permission_codes)} permissions")


# ============================================================================
# Officer Role - Operational staff
# ============================================================================
officer_role, created = Role.objects.get_or_create(
    tenant=tenant,
    name='Officer',
    defaults={
        'description': 'Operational staff with limited access',
        'is_active': True,
    }
)

officer_role.permission_codes = [
    # Procurement - Create and manage
    'pr-list', 'pr-create', 'pr-view-detail', 'pr-edit',
    'pr-submit-approval', 'pr-request-quotes', 'pr-view-quotes',
    'po-list', 'po-view-detail', 'po-save-draft',
    
    # Inventory - Basic access
    'inv-dashboard-view', 'item-list',
    'grn-list', 'grn-view-detail',
    
    # Suppliers - Read access
    'supplier-list', 'supplier-view-detail',
    
    # Clients - Read and basic edit
    'client-list', 'client-view-detail', 'client-edit',
    
    # Invoicing - Basic
    'invoice-list', 'invoice-view-detail',
    
    # Own attendance
    'attendance-clock',
]
officer_role.save()
status = "Created" if created else "Updated"
print(f"✓ {status} Officer role: {len(officer_role.permission_codes)} permissions")


# ============================================================================
# Specialized Department Roles
# ============================================================================

# Procurement Manager
procurement_mgr_role, created = Role.objects.get_or_create(
    tenant=tenant,
    name='Procurement Manager',
    defaults={
        'description': 'Full procurement management with approval authority',
        'is_active': True,
    }
)

procurement_mgr_role.permission_codes = [
    # Purchase Orders - Full access
    'po-list', 'po-bulk-approve', 'po-export', 'po-create', 'po-view-detail',
    'po-edit', 'po-save-draft', 'po-submit-approval', 'po-approve',
    'po-send', 'po-acknowledge', 'po-generate-pdf', 'po-cancel', 'po-delete',
    
    # Procurement Requisitions - Full access
    'pr-list', 'pr-create', 'pr-view-detail', 'pr-edit', 'pr-delete',
    'pr-approve', 'pr-reject', 'pr-convert-to-po', 'pr-submit-approval',
    'pr-request-quotes', 'pr-view-quotes', 'pr-compare-quotes',
    'pr-select-quote', 'pr-convert-quote-to-po',
    
    # GRN - Full access
    'grn-list', 'grn-create', 'grn-view-detail', 'grn-quality-check',
    'grn-post', 'grn-create-return', 'grn-print', 'grn-edit',
    
    # Returns
    'return-list', 'return-create', 'return-view-detail', 'return-approve',
    'return-process-refund', 'return-complete', 'return-cancel',
    
    # Suppliers - Full access
    'supplier-list', 'supplier-create', 'supplier-view-detail',
    'supplier-edit', 'supplier-deactivate',
]
procurement_mgr_role.save()
status = "Created" if created else "Updated"
print(f"✓ {status} Procurement Manager role: {len(procurement_mgr_role.permission_codes)} permissions")


# Finance Manager
finance_mgr_role, created = Role.objects.get_or_create(
    tenant=tenant,
    name='Finance Manager',
    defaults={
        'description': 'Financial management and reporting',
        'is_active': True,
    }
)

finance_mgr_role.permission_codes = [
    # Invoicing - Full access
    'invoice-list', 'invoice-create', 'invoice-preview',
    'invoice-record-payment', 'invoice-view-detail', 'invoice-edit',
    'invoice-mark-sent', 'invoice-export-pdf', 'invoice-send', 'invoice-void',
    
    # Fee Management
    'entitlement-list', 'entitlement-view-detail',
    'fee-structure-list', 'fee-structure-view-detail',
    'receivables-list',
    
    # Vouchers
    'voucher-list', 'voucher-create', 'voucher-view-detail', 'voucher-cancel',
    
    # Financial Reports
    'trial-balance-view', 'pl-view', 'balance-sheet-view',
    
    # Prepaid
    'prepaid-list', 'prepaid-amortize', 'prepaid-create',
    
    # Consumption
    'consumption-list', 'consumption-post-list', 'consumption-approval-list',
    'consumption-record', 'consumption-post', 'consumption-submit-approval',
    
    # Irregularities
    'irregularities-view',
    
    # PO Approval (for financial control)
    'po-list', 'po-view-detail', 'po-approve',
]
finance_mgr_role.save()
status = "Created" if created else "Updated"
print(f"✓ {status} Finance Manager role: {len(finance_mgr_role.permission_codes)} permissions")


# HR Manager
hr_mgr_role, created = Role.objects.get_or_create(
    tenant=tenant,
    name='HR Manager',
    defaults={
        'description': 'Human resources management',
        'is_active': True,
    }
)

hr_mgr_role.permission_codes = [
    # HR Dashboard & Summaries
    'hr-dashboard-view', 'hr-staff-summary', 'hr-attendance-summary',
    'hr-leave-summary', 'hr-payroll-summary',
    
    # Staff Management - Full access
    'staff-list', 'staff-create', 'staff-view-detail', 'staff-edit', 'staff-delete',
    
    # Attendance - Full access
    'attendance-list', 'attendance-clock', 'attendance-manual',
    'attendance-approve', 'attendance-export',
    
    # Leave Management - Full access
    'leave-list', 'leave-create', 'leave-view-detail', 'leave-approve',
    'leave-reject', 'leave-balances', 'leave-types', 'leave-type-create',
    
    # Payroll - Full access
    'payroll-list', 'payroll-create', 'payroll-calculate', 'payroll-approve',
    'payroll-process', 'payroll-generate-payslips',
    
    # Salary Components
    'salary-component-list', 'salary-component-create',
    'salary-component-edit', 'salary-component-delete',
    
    # Bonus & Deductions
    'bonus-deduction-list', 'bonus-deduction-create',
    'bonus-deduction-view-detail', 'bonus-deduction-approve',
    'bonus-deduction-reject',
]
hr_mgr_role.save()
status = "Created" if created else "Updated"
print(f"✓ {status} HR Manager role: {len(hr_mgr_role.permission_codes)} permissions")


# Warehouse Manager
warehouse_mgr_role, created = Role.objects.get_or_create(
    tenant=tenant,
    name='Warehouse Manager',
    defaults={
        'description': 'Inventory and warehouse management',
        'is_active': True,
    }
)

warehouse_mgr_role.permission_codes = [
    # Inventory Dashboard
    'inv-dashboard-view',
    
    # Items - Full access
    'item-list', 'item-create', 'item-edit',
    
    # Movements & Adjustments
    'movement-list', 'adjustment-create', 'transfer-create',
    
    # Categories & Locations - Full access
    'category-list', 'category-create', 'category-edit', 'category-delete',
    'location-list', 'location-create', 'location-edit',
    
    # GRN - Full access
    'grn-list', 'grn-create', 'grn-view-detail', 'grn-quality-check',
    'grn-post', 'grn-create-return', 'grn-print', 'grn-edit',
    
    # Returns - Full access
    'return-list', 'return-create', 'return-view-detail', 'return-approve',
    'return-process-refund', 'return-complete', 'return-cancel',
    
    # View related procurement
    'po-list', 'po-view-detail',
    'pr-list', 'pr-view-detail',
]
warehouse_mgr_role.save()
status = "Created" if created else "Updated"
print(f"✓ {status} Warehouse Manager role: {len(warehouse_mgr_role.permission_codes)} permissions")



from users.models import User

# Get or create a user
user = User.objects.filter(username='procurement.officer').first()
if user:
    # Clear existing roles
    user.roles.clear()
    
    # Assign Procurement Officer role
    user.roles.add(officer_role)
    
    # Optionally add user-specific permissions
    # user.permission_codes = ['pr-delete']  # Give this specific user delete permission
    # user.save()
    
    # Check their permissions
    permissions = user.get_all_action_permissions()
    print(f"\n✓ User '{user.username}' has {len(permissions)} action permissions:")
    for perm in permissions[:10]:  # Show first 10
        print(f"  - {perm}")
    if len(permissions) > 10:
        print(f"  ... and {len(permissions) - 10} more")


# ============================================================================
# Test permission checking
# ============================================================================
print("\n" + "="*60)
print("PERMISSION CHECKS")
print("="*60)

if user:
    test_permissions = [
        'pr-list',
        'pr-create',
        'pr-approve',
        'pr-delete',
        'po-create',
    ]
    
    for perm in test_permissions:
        has_perm = user.has_action_permission(perm)
        status = "✓ ALLOWED" if has_perm else "✗ DENIED"
        print(f"{status}: {user.username} -> {perm}")

print("\n" + "="*70)
print("SETUP COMPLETE!")
print("="*70)
print("\nRoles configured:")
print(f"  • Director: {len(director_role.permission_codes)} permissions")
print(f"  • Principal: {len(principal_role.permission_codes)} permissions")
print(f"  • Administrator: ALL permissions (*)")
print(f"  • Registrar: {len(registrar_role.permission_codes)} permissions")
print(f"  • Officer: {len(officer_role.permission_codes)} permissions")
print(f"  • Procurement Manager: {len(procurement_mgr_role.permission_codes)} permissions")
print(f"  • Finance Manager: {len(finance_mgr_role.permission_codes)} permissions")
print(f"  • HR Manager: {len(hr_mgr_role.permission_codes)} permissions")
print(f"  • Warehouse Manager: {len(warehouse_mgr_role.permission_codes)} permissions")

print("\nNext steps:")
print("1. Assign users to roles via Django admin or API")
print("2. Test permissions in frontend: user.action_permissions array")
print("3. Validate backend: request.user.has_action_permission('code')")

print("\n" + "="*70)
