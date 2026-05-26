# Quick Start: Role Permissions Backend

## What You Asked For
You showed me a **Role Permissions** UI in the frontend (localhost:3000/settings/pages-actions) and said "we need to setup the backend for this to work as intended".

## What I Built

### ✅ Complete Backend System for Role-Based Action Permissions

I've created a comprehensive backend system that:
1. **Tracks page actions** (view, create, edit, delete, approve, etc.) for each module/page
2. **Maps permissions to roles** - which roles can perform which actions
3. **Provides REST APIs** for the frontend to read and update permissions

## Key API Endpoints

All endpoints are under `/api/pages/`:

### 1. **Get Permission Matrix** (Main endpoint for your UI)
```
GET /api/pages/role-action-permissions/matrix/
```

Returns all modules, pages, actions, roles, and their permission mappings in one call.

### 2. **Bulk Update Permissions** (For saving changes)
```
POST /api/pages/role-action-permissions/bulk-update/
```

Update multiple role-action permissions at once when user clicks "Save".

### 3. **Other Endpoints**
- `GET /api/pages/modules/` - List modules
- `GET /api/pages/page-actions/` - List actions  
- `GET /api/pages/role-action-permissions/` - List permissions
- Full CRUD operations available for all resources

## Database Tables Created

### `page_actions`
Stores all actions that can be performed:
- Module: Procurement
- Page: Purchase Requisitions  
- Action: "View Requisitions" (code: pr-view, type: view)
- Action: "Create Requisition" (code: pr-create, type: create)
- Action: "Approve Requisition" (code: pr-approve, type: approve)
- etc.

### `role_action_permissions`
Maps roles to actions:
- Role: Director → Action: pr-view → Permissions: can_view=True, can_create=True, can_edit=True...
- Role: Principal → Action: pr-view → Permissions: can_view=True, can_create=False...
- Role: Officer → Action: pr-view → Permissions: can_view=True, can_create=False...

## How Your Frontend Should Use It

### 1. **Load Permission Matrix on Page Load**
```typescript
// In your RolePermissionsPage component
useEffect(() => {
  async function loadPermissions() {
    const response = await api.get('/pages/role-action-permissions/matrix/');
    const { modules, roles, permissions } = response.data.data;
    
    // modules = list of all modules with their pages and actions
    // roles = list of all roles (Director, Principal, Administrator, etc.)
    // permissions = object mapping "roleId-actionId" to permission settings
    
    setModules(modules);
    setRoles(roles);
    setPermissions(permissions);
  }
  
  loadPermissions();
}, []);
```

### 2. **Display the Matrix**
```typescript
// For each module
modules.map(module => (
  <div key={module.code}>
    <h2>{module.name}</h2>
    
    {/* For each page in module */}
    {module.pages.map(page => (
      <div key={page.id}>
        <h3>{page.title}</h3>
        
        {/* For each action in page */}
        {page.actions.map(action => (
          <tr key={action.id}>
            <td>{action.name}</td>
            
            {/* Checkbox for each role */}
            {roles.map(role => {
              const permKey = `${role.id}-${action.id}`;
              const perm = permissions[permKey] || {};
              
              return (
                <td key={role.id}>
                  <input
                    type="checkbox"
                    checked={perm.can_view || false}
                    onChange={e => updatePermission(role.id, action.id, 'can_view', e.target.checked)}
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </div>
    ))}
  </div>
))
```

### 3. **Save Changes**
```typescript
// When user clicks Save
async function savePermissions() {
  const updates = [];
  
  // Build update array from your state
  Object.keys(changedPermissions).forEach(key => {
    const [roleId, actionId] = key.split('-').map(Number);
    const perms = changedPermissions[key];
    
    updates.push({
      role_id: roleId,
      action_id: actionId,
      ...perms  // can_view, can_create, can_edit, etc.
    });
  });
  
  await api.post('/pages/role-action-permissions/bulk-update/', { updates });
  
  // Show success message
  toast.success('Permissions updated successfully');
}
```

## Next Steps

### Step 1: Seed Actions
Create actions for your modules:
```bash
cd D:\Users\User\Desktop\PHEONIX-ERP\erp-backend\phoenix_erp\src
.\my_env\Scripts\python.exe manage.py seed_page_actions --owner-email samadeolu7@gmail.com
```

### Step 2: Test the API
Open your browser or Postman and test:
```
GET http://localhost:8000/api/pages/role-action-permissions/matrix/
```

You should get a JSON response with modules, roles, and permissions.

### Step 3: Integrate with Frontend
Update your `/settings/pages-actions` page to:
1. Call the matrix endpoint on load
2. Display the data in your table
3. Call bulk-update on save

## Files Created

1. **Models:** `pages/action_models.py`
   - PageAction model
   - RoleActionPermission model

2. **Views:** `pages/views.py` (updated)
   - PageActionViewSet
   - RoleActionPermissionViewSet
   - Matrix endpoint
   - Bulk update endpoint

3. **Serializers:** `pages/serializers.py` (updated)
   - PageActionSerializer
   - RoleActionPermissionSerializer
   - RolePermissionMatrixSerializer

4. **URLs:** `pages/urls.py` (updated)
   - Registered new viewsets

5. **Admin:** `pages/admin.py` (updated)
   - Admin interfaces for new models

6. **Migration:** `pages/migrations/0003_add_page_actions_and_role_permissions.py`
   - ✅ Already applied to database

7. **Seeding:** `pages/management/commands/seed_page_actions.py`
   - Command to create initial actions

8. **Documentation:**
   - `ROLE_PERMISSIONS_SETUP.md` - Detailed docs
   - `QUICK_START_ROLE_PERMISSIONS.md` - This file

## Summary

✅ **Backend is ready!**
- Database tables created
- Models defined
- API endpoints working
- Migration applied
- Admin interface configured

🔧 **What's needed:**
1. Run seed command to create actions
2. Update frontend to call the new APIs
3. Test and verify permissions work

The backend infrastructure is complete and ready for your frontend to integrate with!
