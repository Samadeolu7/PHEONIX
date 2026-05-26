# Role-Based Permissions System - Backend Setup Complete

## What Was Created

### 1. **New Models** (`pages/action_models.py`)

#### `PageAction` Model
Defines actions that can be performed on pages:
- Fields: module, page, code, name, action_type (view/create/edit/delete/approve/etc.)
- Example: "View Requisitions", "Create Requisition", "Approve Requisition"

#### `RoleActionPermission` Model
Maps which roles can perform which actions:
- Fields: role, action, permission_level, can_view, can_create, can_edit, can_delete, can_approve, can_export
- Tracks who granted permissions and when

### 2. **API Endpoints**

All endpoints require authentication. Base URL: `/api/`

#### Module & Page Endpoints:
- `GET /api/modules/` - List all modules
- `GET /api/modules/navigation/` - Get complete navigation structure
- `GET /api/module-pages/` - List all pages
- `GET /api/module-pages/by-path/?path=/finance/cash-reconciliation/` - Get page by URL path

#### Page Actions Endpoints:
- `GET /api/page-actions/` - List all page actions
- `GET /api/page-actions/?module=procurement` - Filter by module
- `GET /api/page-actions/?page=1` - Filter by page
- `GET /api/page-actions/by-module/` - Get actions grouped by module
- `POST /api/page-actions/` - Create new action
- `PUT /api/page-actions/{id}/` - Update action
- `DELETE /api/page-actions/{id}/` - Delete action

#### Role Permission Endpoints:
- `GET /api/role-action-permissions/` - List all permissions
- `GET /api/role-action-permissions/?role=1` - Filter by role
- `GET /api/role-action-permissions/?module=procurement` - Filter by module
- `GET /api/role-action-permissions/matrix/` - **Get complete permission matrix** (recommended)
- `GET /api/role-action-permissions/by-role/1/` - Get all permissions for a specific role
- `POST /api/role-action-permissions/` - Create new permission
- `PUT /api/role-action-permissions/{id}/` - Update permission
- `POST /api/role-action-permissions/bulk-update/` - **Bulk update multiple permissions**

### 3. **Permission Matrix Endpoint** (Most Important)

`GET /api/role-action-permissions/matrix/`

Returns a complete permission matrix with:
```json
{
  "success": true,
  "data": {
    "modules": [
      {
        "id": 1,
        "code": "procurement",
        "name": "Procurement",
        "icon": "shopping-cart",
        "color": "#8b5cf6",
        "pages": [
          {
            "id": 1,
            "title": "Purchase Requisitions",
            "actions": [
              {
                "id": 1,
                "code": "pr-view",
                "name": "View Requisitions",
                "action_type": "view",
                "icon": "eye",
                "color": "#3b82f6"
              },
              {
                "id": 2,
                "code": "pr-create",
                "name": "Create Requisition",
                "action_type": "create",
                "icon": "plus",
                "color": "#10b981"
              }
            ]
          }
        ]
      }
    ],
    "roles": [
      {
        "id": 1,
        "name": "Director",
        "description": "Full system access"
      },
      {
        "id": 2,
        "name": "Principal",
        "description": "School administration"
      }
    ],
    "permissions": {
      "1-1": {
        "id": 1,
        "permission_level": "full",
        "can_view": true,
        "can_create": true,
        "can_edit": true,
        "can_delete": true,
        "can_approve": true,
        "can_export": true
      },
      "2-1": {
        "id": 2,
        "permission_level": "read",
        "can_view": true,
        "can_create": false,
        "can_edit": false,
        "can_delete": false,
        "can_approve": false,
        "can_export": true
      }
    }
  }
}
```

### 4. **Bulk Update Endpoint**

`POST /api/role-action-permissions/bulk-update/`

Update multiple permissions at once:
```json
{
  "updates": [
    {
      "role_id": 1,
      "action_id": 1,
      "can_view": true,
      "can_create": true,
      "can_edit": false,
      "can_delete": false
    },
    {
      "role_id": 2,
      "action_id": 1,
      "can_view": true,
      "can_create": false
    }
  ]
}
```

## Next Steps to Complete Setup

### Step 1: Seed Page Actions
Run the management command to create actions for your modules:
```bash
python manage.py seed_page_actions --owner-email samadeolu7@gmail.com
```

This will create:
- Procurement module
- Purchase Requisitions page with actions (view, create, edit, delete, approve, reject, convert to PO, submit)
- Purchase Orders page with actions (view, create, edit, approve)

### Step 2: Verify Database Tables
Check that tables were created:
```sql
SELECT * FROM page_actions;
SELECT * FROM role_action_permissions;
```

### Step 3: Frontend Integration

Your frontend should:

1. **Fetch the permission matrix:**
```typescript
const response = await api.get('/api/role-action-permissions/matrix/');
const { modules, roles, permissions } = response.data.data;
```

2. **Display in your UI** (like the screenshot shows):
- Columns for each role (Director, Principal, Administrator, Registrar, Officer)
- Rows for each action within each module/page
- Checkboxes to enable/disable permissions

3. **Save changes:**
```typescript
const updates = [
  {
    role_id: 1,
    action_id: 1,
    can_view: true,
    can_create: true,
    can_edit: true,
    can_delete: true,
    can_approve: true,
    can_export: true
  },
  // ... more updates
];

await api.post('/api/role-action-permissions/bulk-update/', { updates });
```

### Step 4: Check Permissions in Views
In your backend views, check permissions:
```python
from pages.action_models import PageAction, RoleActionPermission

# Check if user's role has permission
user_roles = request.user.roles.all()
action = PageAction.objects.get(code='pr-view', module__code='procurement')

has_permission = RoleActionPermission.objects.filter(
    role__in=user_roles,
    action=action,
    can_view=True,
    is_active=True
).exists()

if not has_permission:
    return Response({'error': 'Permission denied'}, status=403)
```

### Step 5: Create More Actions for Other Modules
Edit `pages/management/commands/seed_page_actions.py` to add actions for:
- Finance module
- Student Services module
- Operations module
- Administration module

## Database Schema

### `page_actions` table:
- id (PK)
- module_id (FK to modules)
- page_id (FK to module_pages, nullable)
- code (unique per module/page)
- name
- description
- action_type (view/create/edit/delete/approve/reject/submit/process/export/import/custom)
- permission_codename
- icon, color, order
- is_active, show_in_list
- owner_id, tenant_id, branch_id (for multi-tenancy)
- timestamps

### `role_action_permissions` table:
- id (PK)
- role_id (FK to users_role)
- action_id (FK to page_actions)
- permission_level (none/read/write/full)
- can_view, can_create, can_edit, can_delete, can_approve, can_export (booleans)
- conditions (JSON field for advanced rules)
- is_active
- granted_by_id (FK to users)
- granted_at, updated_at

## Migration Applied

Migration `pages/0003_add_page_actions_and_role_permissions.py` was successfully applied.

## Files Created/Modified

1. **Created:**
   - `pages/action_models.py` - New models
   - `pages/management/commands/seed_page_actions.py` - Seeding command
   - `pages/migrations/0003_add_page_actions_and_role_permissions.py` - Migration
   - `ROLE_PERMISSIONS_SETUP.md` - This documentation

2. **Modified:**
   - `pages/serializers.py` - Added new serializers
   - `pages/views.py` - Added new viewsets
   - `pages/urls.py` - Registered new endpoints
   - `pages/admin.py` - Registered new models in admin

## Testing the API

### Test 1: Get Permission Matrix
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/role-action-permissions/matrix/
```

### Test 2: Create a Permission
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "role": 1,
    "action": 1,
    "permission_level": "write",
    "can_view": true,
    "can_create": true,
    "can_edit": true,
    "can_delete": false
  }' \
  http://localhost:8000/api/role-action-permissions/
```

### Test 3: Bulk Update
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "updates": [
      {
        "role_id": 1,
        "action_id": 1,
        "can_view": true,
        "can_create": true
      }
    ]
  }' \
  http://localhost:8000/api/role-action-permissions/bulk-update/
```

## Frontend Integration Example

```typescript
// services/rolePermissionService.ts
import { api } from './api';

interface PermissionMatrix {
  modules: Array<{
    id: number;
    code: string;
    name: string;
    pages: Array<{
      id: number;
      title: string;
      actions: Array<{
        id: number;
        code: string;
        name: string;
        action_type: string;
      }>;
    }>;
  }>;
  roles: Array<{
    id: number;
    name: string;
  }>;
  permissions: {
    [key: string]: {
      id?: number;
      can_view: boolean;
      can_create: boolean;
      can_edit: boolean;
      can_delete: boolean;
      can_approve: boolean;
      can_export: boolean;
    };
  };
}

export class RolePermissionService {
  async getPermissionMatrix(): Promise<PermissionMatrix> {
    const response = await api.get('/role-action-permissions/matrix/');
    return response.data.data;
  }

  async bulkUpdatePermissions(updates: Array<{
    role_id: number;
    action_id: number;
    can_view?: boolean;
    can_create?: boolean;
    can_edit?: boolean;
    can_delete?: boolean;
    can_approve?: boolean;
    can_export?: boolean;
  }>) {
    const response = await api.post('/role-action-permissions/bulk-update/', {
      updates
    });
    return response.data;
  }
}

export const rolePermissionService = new RolePermissionService();
```

## Summary

✅ Backend models created
✅ API endpoints created
✅ Migration applied
✅ Admin interface configured
✅ Seeding command created
✅ Documentation complete

**Your backend is now ready to support the Role Permissions UI!**

The frontend just needs to:
1. Call `/api/role-action-permissions/matrix/` to get data
2. Display the permission matrix
3. Call `/api/role-action-permissions/bulk-update/` to save changes

All the necessary infrastructure is in place on the backend side.
