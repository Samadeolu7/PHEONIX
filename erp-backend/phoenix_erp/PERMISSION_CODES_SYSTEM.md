# Permission Codes System

## Overview
A lightweight, frontend-friendly permission system that allows fine-grained control over user actions using simple permission codes.

## Design

### Permission Codes
Permission codes are simple strings that represent specific actions a user can perform. For example:
- `pr-list` - Can view procurement requisition list
- `pr-create` - Can create new procurement requisitions
- `pr-approve` - Can approve procurement requisitions
- `po-delete` - Can delete purchase orders

### Storage
Permission codes are stored at two levels:

1. **Role Level** (`Role.permission_codes`): JSONField containing a list of permission codes granted to all users with that role
2. **User Level** (`User.permission_codes`): JSONField containing user-specific permission codes that extend role permissions

### Permission Aggregation
When a user's permissions are calculated:
1. All permission codes from active roles are collected
2. User-specific permission codes are added
3. Duplicates are removed
4. The final list is sorted and returned

### Special Permissions
- `*` (wildcard): System admins and tenant owners automatically get this, granting all permissions

## API Usage

### Getting User Permissions
When a user logs in, their permission codes are included in the response:

```json
{
  "id": 1,
  "username": "john.doe",
  "email": "john@example.com",
  "roles": [1, 2],
  "role_names": ["Administrator", "Procurement Manager"],
  "action_permissions": [
    "pr-list",
    "pr-create",
    "pr-view-detail",
    "pr-edit",
    "pr-delete",
    "pr-approve",
    "pr-reject",
    "pr-convert-to-po",
    "po-list",
    "po-view-detail"
  ]
}
```

### Frontend Usage
The frontend can check permissions before showing UI elements or enabling actions:

```javascript
// Check if user can perform an action
function hasPermission(permissionCode) {
  const user = getCurrentUser();
  return user.action_permissions.includes('*') || 
         user.action_permissions.includes(permissionCode);
}

// Example: Show approve button only if user has permission
if (hasPermission('pr-approve')) {
  showApproveButton();
}

// Example: Enable create button
<button 
  disabled={!hasPermission('pr-create')}
  onClick={createRequisition}
>
  Create Requisition
</button>
```

### Backend Usage

#### Check if user has a permission
```python
from users.models import User

user = User.objects.get(username='john.doe')

# Get all permissions
permissions = user.get_all_action_permissions()
# Returns: ['pr-create', 'pr-list', 'po-view-detail', ...]

# Check specific permission
if user.has_action_permission('pr-approve'):
    # User can approve requisitions
    approve_requisition(requisition)
```

#### Assign permissions to a role
```python
from users.models import Role

role = Role.objects.get(name='Procurement Manager', tenant=tenant)
role.permission_codes = [
    'pr-list',
    'pr-create',
    'pr-view-detail',
    'pr-edit',
    'pr-delete',
    'pr-approve',
    'pr-reject',
    'pr-convert-to-po',
]
role.save()
```

#### Add user-specific permissions
```python
from users.models import User

user = User.objects.get(username='john.doe')

# Give this specific user additional permissions
user.permission_codes = ['po-approve', 'po-convert-to-invoice']
user.save()
```

## Management Command

### Create Default Roles
```bash
# Create roles for a specific tenant
python manage.py create_roles --tenant phoenix-erp

# Create roles for all tenants
python manage.py create_roles --all
```

This creates the following default roles:
- Director
- Principal
- Administrator
- Registrar
- Officer

## Permission Naming Convention

Recommended format: `{module}-{action}`

### Common Modules
- `pr` - Procurement Requisition
- `po` - Purchase Order
- `inv` - Invoice
- `client` - Client/Student
- `fee` - Fee Management
- `acc` - Accounting
- `user` - User Management
- `report` - Reports

### Common Actions
- `list` - View list
- `create` - Create new record
- `view-detail` - View single record details
- `edit` - Update record
- `delete` - Delete record
- `approve` - Approve record
- `reject` - Reject record
- `submit` - Submit for approval
- `export` - Export data
- `import` - Import data
- `print` - Print document

### Examples
```
pr-list               # Can view procurement requisition list
pr-create             # Can create new requisition
pr-view-detail        # Can view requisition details
pr-edit               # Can edit requisition
pr-delete             # Can delete requisition
pr-approve            # Can approve requisition
pr-reject             # Can reject requisition
pr-submit-approval    # Can submit for approval
pr-convert-to-po      # Can convert requisition to PO
pr-request-quotes     # Can request quotes
pr-view-quotes        # Can view quotes
pr-compare-quotes     # Can compare quotes
pr-select-quote       # Can select winning quote

po-list               # Can view purchase order list
po-create             # Can create new PO
po-approve            # Can approve PO
po-convert-to-invoice # Can convert PO to invoice

client-list           # Can view client list
client-create         # Can register new client
client-edit           # Can update client details
client-delete         # Can delete client
client-view-finances  # Can view client financial info

report-financial      # Can view financial reports
report-export         # Can export reports
```

## Migration

Run the migration to add the permission_codes fields:

```bash
python manage.py migrate users
```

## Example: Complete Procurement Workflow Permissions

### Procurement Officer Role
```python
permission_codes = [
    'pr-list',
    'pr-create',
    'pr-view-detail',
    'pr-edit',
    'pr-submit-approval',
    'pr-request-quotes',
    'pr-view-quotes',
    'pr-compare-quotes',
]
```

### Procurement Manager Role
```python
permission_codes = [
    'pr-list',
    'pr-view-detail',
    'pr-approve',
    'pr-reject',
    'pr-view-quotes',
    'pr-compare-quotes',
    'pr-select-quote',
    'pr-convert-to-po',
    'po-list',
    'po-view-detail',
]
```

### Admin Role
```python
permission_codes = ['*']  # All permissions
```

## Difference from Existing System

This system coexists with the existing `pages.RoleActionPermission` system:

| Feature | Permission Codes (New) | RoleActionPermission (Existing) |
|---------|------------------------|----------------------------------|
| Storage | JSONField list in Role/User | Many-to-many through PageAction |
| Granularity | Action codes | Module → Page → Action hierarchy |
| Conditions | Simple list | Complex with conditions, permission levels |
| Frontend Use | Direct check | Requires API calls |
| Use Case | Simple, fast checks | Complex workflows with conditions |

**Recommendation**: Use Permission Codes for frontend UI control and simple authorization. Use RoleActionPermission for complex workflows with conditional logic.

## Best Practices

1. **Keep codes short and descriptive**: `pr-create` not `procurement_requisition_create`
2. **Use consistent naming**: Follow the `{module}-{action}` pattern
3. **Document permissions**: Maintain a list of all permission codes and their meanings
4. **Group logically**: Assign related permissions together
5. **Test thoroughly**: Verify permission checks work correctly in both frontend and backend
6. **Use wildcards sparingly**: Only for true admin roles
7. **Audit regularly**: Review who has which permissions periodically

## Security Considerations

1. **Backend validation required**: Always validate permissions on the backend, never trust frontend checks alone
2. **Sync with API endpoints**: Ensure API endpoints check the corresponding permissions
3. **Log permission checks**: Log when sensitive permissions are used
4. **Review user permissions**: Implement a permission audit trail
5. **Principle of least privilege**: Grant only necessary permissions

## Example Implementation

### Backend View Protection
```python
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status

class ProcurementRequisitionViewSet(viewsets.ModelViewSet):
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        # Check permission
        if not request.user.has_action_permission('pr-approve'):
            return Response(
                {'error': 'You do not have permission to approve requisitions'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        requisition = self.get_object()
        requisition.approve(request.user)
        return Response({'status': 'approved'})
```

### Frontend Component
```jsx
import { useAuth } from './hooks/useAuth';

function ProcurementRequisitionDetail({ requisition }) {
  const { user, hasPermission } = useAuth();
  
  return (
    <div>
      <h1>Requisition #{requisition.id}</h1>
      
      {hasPermission('pr-edit') && (
        <button onClick={handleEdit}>Edit</button>
      )}
      
      {hasPermission('pr-approve') && requisition.status === 'pending' && (
        <button onClick={handleApprove}>Approve</button>
      )}
      
      {hasPermission('pr-delete') && (
        <button onClick={handleDelete}>Delete</button>
      )}
    </div>
  );
}
```

## Troubleshooting

### Permissions not showing up
1. Check that the role is active (`is_active=True`)
2. Verify the user is assigned to the role
3. Check that `permission_codes` is a list, not a string
4. Clear any caches

### User has wrong permissions
1. Check all roles assigned to the user
2. Check user-level `permission_codes`
3. Verify permission aggregation logic
4. Check for typos in permission code strings

### Frontend/Backend mismatch
1. Ensure frontend is using latest user data
2. Verify API response includes `action_permissions`
3. Check that serializer includes `get_action_permissions`
