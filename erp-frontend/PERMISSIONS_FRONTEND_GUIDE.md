# Frontend Permission System Guide

Complete guide for implementing Phoenix ERP's permission system in your frontend application.

## 📋 Table of Contents

1. [Overview](#overview)
2. [API Integration](#api-integration)
3. [Setup](#setup)
4. [Usage Examples](#usage-examples)
5. [TypeScript Types](#typescript-types)
6. [Common Patterns](#common-patterns)
7. [Best Practices](#best-practices)

---

## Overview

### What You Get
After user login/authentication, the API returns:
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
    "receivables-list"
  ]
}
```

### Key Fields
- **`action_permissions`**: Array of permission codes the user has
- **Wildcard `*`**: If present in array, user has ALL permissions (admin)

---

## API Integration

### Authentication Endpoints

#### Login
```http
POST /api/auth/login/
Content-Type: application/json

{
  "username": "john.doe",
  "password": "password123"
}
```

**Response:**
```json
{
  "user": {
    "id": 123,
    "username": "john.doe",
    "email": "john@example.com",
    "action_permissions": ["pr-list", "pr-create", "..."]
  },
  "token": "your-auth-token"
}
```

#### Get Current User Profile
```http
GET /api/users/me/
Authorization: Bearer {token}
```

**Response:** Same user object with `action_permissions`

---

## Setup

### 1. Create Permission Service

```javascript
// services/permissionService.js

class PermissionService {
  /**
   * Check if user has a specific permission
   * @param {Array<string>} userPermissions - User's permission codes
   * @param {string} permissionCode - Permission to check
   * @returns {boolean}
   */
  hasPermission(userPermissions, permissionCode) {
    if (!Array.isArray(userPermissions)) {
      return false;
    }
    
    // Check for wildcard (admin)
    if (userPermissions.includes('*')) {
      return true;
    }
    
    // Check for specific permission
    return userPermissions.includes(permissionCode);
  }

  /**
   * Check if user has ANY of the specified permissions
   * @param {Array<string>} userPermissions - User's permission codes
   * @param {Array<string>} permissionCodes - Permissions to check
   * @returns {boolean}
   */
  hasAnyPermission(userPermissions, permissionCodes) {
    if (!Array.isArray(userPermissions) || !Array.isArray(permissionCodes)) {
      return false;
    }
    
    if (userPermissions.includes('*')) {
      return true;
    }
    
    return permissionCodes.some(code => userPermissions.includes(code));
  }

  /**
   * Check if user has ALL of the specified permissions
   * @param {Array<string>} userPermissions - User's permission codes
   * @param {Array<string>} permissionCodes - Permissions to check
   * @returns {boolean}
   */
  hasAllPermissions(userPermissions, permissionCodes) {
    if (!Array.isArray(userPermissions) || !Array.isArray(permissionCodes)) {
      return false;
    }
    
    if (userPermissions.includes('*')) {
      return true;
    }
    
    return permissionCodes.every(code => userPermissions.includes(code));
  }

  /**
   * Get permissions by module
   * @param {Array<string>} userPermissions - User's permission codes
   * @param {string} module - Module prefix (e.g., 'po', 'pr', 'invoice')
   * @returns {Array<string>}
   */
  getModulePermissions(userPermissions, module) {
    if (userPermissions.includes('*')) {
      return ['*'];
    }
    
    return userPermissions.filter(perm => perm.startsWith(`${module}-`));
  }
}

export default new PermissionService();
```

### 2. Create React Hook (React/Next.js)

```javascript
// hooks/usePermissions.js
import { useAuth } from './useAuth'; // Your auth hook

export function usePermissions() {
  const { user } = useAuth();
  
  const hasPermission = (permissionCode) => {
    const permissions = user?.action_permissions || [];
    return permissions.includes('*') || permissions.includes(permissionCode);
  };

  const hasAnyPermission = (permissionCodes) => {
    const permissions = user?.action_permissions || [];
    if (permissions.includes('*')) return true;
    return permissionCodes.some(code => permissions.includes(code));
  };

  const hasAllPermissions = (permissionCodes) => {
    const permissions = user?.action_permissions || [];
    if (permissions.includes('*')) return true;
    return permissionCodes.every(code => permissions.includes(code));
  };

  const canAccessModule = (module) => {
    const permissions = user?.action_permissions || [];
    if (permissions.includes('*')) return true;
    return permissions.some(perm => perm.startsWith(`${module}-`));
  };

  return {
    permissions: user?.action_permissions || [],
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canAccessModule,
  };
}
```

### 3. Create Vue Composable (Vue 3)

```javascript
// composables/usePermissions.js
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth'; // Your auth store

export function usePermissions() {
  const authStore = useAuthStore();
  
  const permissions = computed(() => authStore.user?.action_permissions || []);
  
  const hasPermission = (permissionCode) => {
    return permissions.value.includes('*') || 
           permissions.value.includes(permissionCode);
  };

  const hasAnyPermission = (permissionCodes) => {
    if (permissions.value.includes('*')) return true;
    return permissionCodes.some(code => permissions.value.includes(code));
  };

  const hasAllPermissions = (permissionCodes) => {
    if (permissions.value.includes('*')) return true;
    return permissionCodes.every(code => permissions.value.includes(code));
  };

  const canAccessModule = (module) => {
    if (permissions.value.includes('*')) return true;
    return permissions.value.some(perm => perm.startsWith(`${module}-`));
  };

  return {
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canAccessModule,
  };
}
```

---

## Usage Examples

### React Components

#### Conditional Rendering
```jsx
import { usePermissions } from '@/hooks/usePermissions';

function PurchaseOrderDetail({ order }) {
  const { hasPermission } = usePermissions();

  return (
    <div>
      <h1>Purchase Order #{order.number}</h1>
      
      {/* Show edit button only if user can edit */}
      {hasPermission('po-edit') && (
        <button onClick={handleEdit}>Edit</button>
      )}
      
      {/* Show approve button only if user can approve */}
      {hasPermission('po-approve') && order.status === 'pending' && (
        <button onClick={handleApprove}>Approve</button>
      )}
      
      {/* Show delete button only if user can delete */}
      {hasPermission('po-delete') && (
        <button onClick={handleDelete} className="danger">
          Delete
        </button>
      )}
    </div>
  );
}
```

#### Disabled Buttons
```jsx
function ProcurementActions({ requisition }) {
  const { hasPermission } = usePermissions();

  return (
    <div className="actions">
      <button
        disabled={!hasPermission('pr-edit')}
        onClick={handleEdit}
        title={!hasPermission('pr-edit') ? 'No permission to edit' : ''}
      >
        Edit
      </button>
      
      <button
        disabled={!hasPermission('pr-submit-approval')}
        onClick={handleSubmit}
      >
        Submit for Approval
      </button>
      
      <button
        disabled={!hasPermission('pr-delete')}
        onClick={handleDelete}
        className="danger"
      >
        Delete
      </button>
    </div>
  );
}
```

#### Permission Guard Component
```jsx
// components/PermissionGuard.jsx
import { usePermissions } from '@/hooks/usePermissions';

export function PermissionGuard({ 
  permission, 
  permissions, 
  requireAll = false,
  fallback = null,
  children 
}) {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions();

  // Single permission check
  if (permission && !hasPermission(permission)) {
    return fallback;
  }

  // Multiple permissions check
  if (permissions) {
    const hasAccess = requireAll 
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);
    
    if (!hasAccess) {
      return fallback;
    }
  }

  return <>{children}</>;
}

// Usage
<PermissionGuard permission="po-approve">
  <button onClick={handleApprove}>Approve</button>
</PermissionGuard>

<PermissionGuard 
  permissions={['po-edit', 'po-delete']} 
  requireAll={false}
  fallback={<p>No access</p>}
>
  <EditDeleteButtons />
</PermissionGuard>
```

#### Route Protection
```jsx
// components/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';

export function ProtectedRoute({ 
  permission, 
  permissions,
  requireAll = false,
  redirectTo = '/unauthorized',
  children 
}) {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions();

  let hasAccess = true;

  if (permission) {
    hasAccess = hasPermission(permission);
  } else if (permissions) {
    hasAccess = requireAll 
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);
  }

  if (!hasAccess) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}

// In router
<Route
  path="/procurement/requisitions"
  element={
    <ProtectedRoute permission="pr-list">
      <RequisitionsList />
    </ProtectedRoute>
  }
/>

<Route
  path="/procurement/requisitions/create"
  element={
    <ProtectedRoute 
      permissions={['pr-list', 'pr-create']}
      requireAll={true}
    >
      <CreateRequisition />
    </ProtectedRoute>
  }
/>
```

### Vue Components

#### Template Usage
```vue
<template>
  <div class="purchase-order">
    <h1>Purchase Order #{{ order.number }}</h1>
    
    <!-- Conditional rendering -->
    <button 
      v-if="hasPermission('po-edit')"
      @click="handleEdit"
    >
      Edit
    </button>
    
    <button 
      v-if="hasPermission('po-approve')"
      @click="handleApprove"
    >
      Approve
    </button>
    
    <!-- Disabled button -->
    <button 
      :disabled="!hasPermission('po-send')"
      @click="handleSend"
    >
      Send to Supplier
    </button>
  </div>
</template>

<script setup>
import { usePermissions } from '@/composables/usePermissions';

const props = defineProps({
  order: Object
});

const { hasPermission } = usePermissions();

const handleEdit = () => {
  if (hasPermission('po-edit')) {
    // Edit logic
  }
};
</script>
```

#### Global Permission Directive
```javascript
// plugins/permissions.js
export default {
  install(app) {
    app.directive('permission', {
      mounted(el, binding) {
        const { value } = binding;
        const permissions = app.config.globalProperties.$permissions || [];
        
        const hasPermission = permissions.includes('*') || 
                            permissions.includes(value);
        
        if (!hasPermission) {
          el.style.display = 'none';
          // Or remove element entirely: el.remove();
        }
      }
    });
  }
};

// In main.js
import permissionsPlugin from './plugins/permissions';
app.use(permissionsPlugin);

// Usage in components
<button v-permission="'po-approve'">Approve</button>
<div v-permission="'pr-create'">Create New</div>
```

### Vanilla JavaScript

```javascript
// utils/permissions.js
const PermissionChecker = {
  permissions: [],

  init(userPermissions) {
    this.permissions = userPermissions || [];
  },

  hasPermission(code) {
    return this.permissions.includes('*') || this.permissions.includes(code);
  },

  hasAnyPermission(codes) {
    if (this.permissions.includes('*')) return true;
    return codes.some(code => this.permissions.includes(code));
  },

  showElement(elementId, permissionCode) {
    const element = document.getElementById(elementId);
    if (element) {
      element.style.display = this.hasPermission(permissionCode) ? '' : 'none';
    }
  },

  disableElement(elementId, permissionCode) {
    const element = document.getElementById(elementId);
    if (element) {
      element.disabled = !this.hasPermission(permissionCode);
    }
  }
};

// Initialize after login
PermissionChecker.init(user.action_permissions);

// Usage
PermissionChecker.showElement('approveButton', 'po-approve');
PermissionChecker.disableElement('editButton', 'po-edit');

// Or inline
if (PermissionChecker.hasPermission('pr-create')) {
  document.getElementById('createBtn').addEventListener('click', handleCreate);
}
```

---

## TypeScript Types

```typescript
// types/permissions.ts

// All available permission codes
export type PermissionCode = 
  // Purchase Orders
  | 'po-list'
  | 'po-bulk-approve'
  | 'po-export'
  | 'po-create'
  | 'po-view-detail'
  | 'po-edit'
  | 'po-save-draft'
  | 'po-submit-approval'
  | 'po-approve'
  | 'po-send'
  | 'po-acknowledge'
  | 'po-generate-pdf'
  | 'po-cancel'
  | 'po-delete'
  // Procurement Requisitions
  | 'pr-list'
  | 'pr-create'
  | 'pr-view-detail'
  | 'pr-edit'
  | 'pr-delete'
  | 'pr-approve'
  | 'pr-reject'
  | 'pr-convert-to-po'
  | 'pr-submit-approval'
  | 'pr-request-quotes'
  | 'pr-view-quotes'
  | 'pr-compare-quotes'
  | 'pr-select-quote'
  | 'pr-convert-quote-to-po'
  // ... (add all 186 codes or import from JSON)
  | '*'; // Wildcard for admins

// User type
export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  roles: number[];
  role_names: string[];
  action_permissions: PermissionCode[];
  is_active: boolean;
  is_staff: boolean;
}

// Permission check function type
export type PermissionChecker = (code: PermissionCode) => boolean;

// Permission guard props
export interface PermissionGuardProps {
  permission?: PermissionCode;
  permissions?: PermissionCode[];
  requireAll?: boolean;
  fallback?: React.ReactNode | null;
  children: React.ReactNode;
}
```

```typescript
// hooks/usePermissions.ts (TypeScript version)
import { useAuth } from './useAuth';
import type { PermissionCode } from '@/types/permissions';

export function usePermissions() {
  const { user } = useAuth();
  
  const hasPermission = (code: PermissionCode): boolean => {
    const permissions = user?.action_permissions || [];
    return permissions.includes('*' as PermissionCode) || permissions.includes(code);
  };

  const hasAnyPermission = (codes: PermissionCode[]): boolean => {
    const permissions = user?.action_permissions || [];
    if (permissions.includes('*' as PermissionCode)) return true;
    return codes.some(code => permissions.includes(code));
  };

  const hasAllPermissions = (codes: PermissionCode[]): boolean => {
    const permissions = user?.action_permissions || [];
    if (permissions.includes('*' as PermissionCode)) return true;
    return codes.every(code => permissions.includes(code));
  };

  return {
    permissions: user?.action_permissions || [],
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  };
}
```

---

## Common Patterns

### Navigation Menu Items

```jsx
// Navigation.jsx
import { usePermissions } from '@/hooks/usePermissions';

function Navigation() {
  const { hasPermission, canAccessModule } = usePermissions();

  const menuItems = [
    {
      label: 'Dashboard',
      path: '/dashboard',
      visible: true // Always visible
    },
    {
      label: 'Procurement',
      path: '/procurement',
      visible: canAccessModule('pr') || canAccessModule('po'),
      children: [
        {
          label: 'Requisitions',
          path: '/procurement/requisitions',
          visible: hasPermission('pr-list')
        },
        {
          label: 'Purchase Orders',
          path: '/procurement/purchase-orders',
          visible: hasPermission('po-list')
        },
      ]
    },
    {
      label: 'Inventory',
      path: '/inventory',
      visible: canAccessModule('inv'),
      children: [
        {
          label: 'Items',
          path: '/inventory/items',
          visible: hasPermission('item-list')
        },
        {
          label: 'Adjustments',
          path: '/inventory/adjustments',
          visible: hasPermission('adjustment-create')
        },
      ]
    },
    {
      label: 'Finance',
      path: '/finance',
      visible: canAccessModule('invoice') || canAccessModule('voucher'),
      children: [
        {
          label: 'Invoices',
          path: '/finance/invoices',
          visible: hasPermission('invoice-list')
        },
        {
          label: 'Vouchers',
          path: '/finance/vouchers',
          visible: hasPermission('voucher-list')
        },
      ]
    },
  ];

  const visibleItems = menuItems.filter(item => item.visible);

  return (
    <nav>
      {visibleItems.map(item => (
        <MenuItem key={item.path} {...item} />
      ))}
    </nav>
  );
}
```

### Action Menu/Dropdown

```jsx
// ActionsMenu.jsx
import { usePermissions } from '@/hooks/usePermissions';

function PurchaseOrderActionsMenu({ order }) {
  const { hasPermission } = usePermissions();

  const actions = [
    {
      label: 'Edit',
      icon: 'edit',
      onClick: handleEdit,
      visible: hasPermission('po-edit'),
      disabled: order.status === 'approved'
    },
    {
      label: 'Approve',
      icon: 'check',
      onClick: handleApprove,
      visible: hasPermission('po-approve'),
      disabled: order.status !== 'pending'
    },
    {
      label: 'Send to Supplier',
      icon: 'send',
      onClick: handleSend,
      visible: hasPermission('po-send'),
      disabled: order.status !== 'approved'
    },
    {
      label: 'Generate PDF',
      icon: 'pdf',
      onClick: handleGeneratePDF,
      visible: hasPermission('po-generate-pdf'),
    },
    {
      label: 'Cancel',
      icon: 'x',
      onClick: handleCancel,
      visible: hasPermission('po-cancel'),
      className: 'danger'
    },
    {
      label: 'Delete',
      icon: 'trash',
      onClick: handleDelete,
      visible: hasPermission('po-delete'),
      className: 'danger'
    },
  ];

  const visibleActions = actions.filter(action => action.visible);

  if (visibleActions.length === 0) {
    return null; // No actions available
  }

  return (
    <DropdownMenu>
      {visibleActions.map((action, index) => (
        <MenuItem
          key={index}
          label={action.label}
          icon={action.icon}
          onClick={action.onClick}
          disabled={action.disabled}
          className={action.className}
        />
      ))}
    </DropdownMenu>
  );
}
```

### Table Actions Column

```jsx
// DataTable.jsx
function PurchaseOrdersTable({ orders }) {
  const { hasPermission } = usePermissions();

  return (
    <table>
      <thead>
        <tr>
          <th>PO Number</th>
          <th>Supplier</th>
          <th>Amount</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {orders.map(order => (
          <tr key={order.id}>
            <td>{order.number}</td>
            <td>{order.supplier_name}</td>
            <td>{order.total_amount}</td>
            <td>{order.status}</td>
            <td className="actions">
              {hasPermission('po-view-detail') && (
                <button onClick={() => viewOrder(order.id)}>
                  <Icon name="eye" />
                </button>
              )}
              
              {hasPermission('po-edit') && order.status === 'draft' && (
                <button onClick={() => editOrder(order.id)}>
                  <Icon name="edit" />
                </button>
              )}
              
              {hasPermission('po-approve') && order.status === 'pending' && (
                <button onClick={() => approveOrder(order.id)}>
                  <Icon name="check" />
                </button>
              )}
              
              {hasPermission('po-delete') && order.status === 'draft' && (
                <button 
                  onClick={() => deleteOrder(order.id)}
                  className="danger"
                >
                  <Icon name="trash" />
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### Form Submit Button Logic

```jsx
function CreateRequisitionForm() {
  const { hasPermission } = usePermissions();
  const [formData, setFormData] = useState({});

  const canSaveDraft = hasPermission('pr-create');
  const canSubmit = hasPermission('pr-submit-approval');

  const handleSaveDraft = async () => {
    if (!canSaveDraft) {
      toast.error('No permission to save draft');
      return;
    }
    // Save draft logic
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error('No permission to submit for approval');
      return;
    }
    // Submit logic
  };

  return (
    <form>
      {/* Form fields */}
      
      <div className="form-actions">
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={!canSaveDraft}
        >
          Save Draft
        </button>
        
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="primary"
        >
          Submit for Approval
        </button>
      </div>
    </form>
  );
}
```

### Permission-based Feature Flags

```jsx
// features/ProcurementDashboard.jsx
function ProcurementDashboard() {
  const { hasPermission, hasAnyPermission } = usePermissions();

  const showStatistics = hasAnyPermission([
    'pr-list',
    'po-list',
    'grn-list'
  ]);

  const showQuickActions = hasAnyPermission([
    'pr-create',
    'po-create'
  ]);

  const showApprovalQueue = hasAnyPermission([
    'pr-approve',
    'po-approve'
  ]);

  return (
    <div className="dashboard">
      {showStatistics && (
        <section className="statistics">
          <StatsCards />
        </section>
      )}

      {showQuickActions && (
        <section className="quick-actions">
          {hasPermission('pr-create') && (
            <QuickActionCard
              title="New Requisition"
              icon="plus"
              onClick={handleCreateRequisition}
            />
          )}
          
          {hasPermission('po-create') && (
            <QuickActionCard
              title="New Purchase Order"
              icon="plus"
              onClick={handleCreatePO}
            />
          )}
        </section>
      )}

      {showApprovalQueue && (
        <section className="approvals">
          <ApprovalQueue />
        </section>
      )}
    </div>
  );
}
```

---

## Best Practices

### 1. ✅ Always Check Permissions Client & Server Side

```jsx
// ❌ BAD - Only frontend check
function ApproveButton({ orderId }) {
  const { hasPermission } = usePermissions();
  
  if (!hasPermission('po-approve')) return null;
  
  const handleApprove = async () => {
    // Direct API call without permission check
    await api.post(`/api/purchase-orders/${orderId}/approve/`);
  };
  
  return <button onClick={handleApprove}>Approve</button>;
}

// ✅ GOOD - Frontend + Backend validation
function ApproveButton({ orderId }) {
  const { hasPermission } = usePermissions();
  
  if (!hasPermission('po-approve')) return null;
  
  const handleApprove = async () => {
    try {
      // Backend will also validate permission
      await api.post(`/api/purchase-orders/${orderId}/approve/`);
      toast.success('Approved successfully');
    } catch (error) {
      if (error.response?.status === 403) {
        toast.error('Permission denied');
      }
    }
  };
  
  return <button onClick={handleApprove}>Approve</button>;
}
```

### 2. ✅ Cache Permissions in Context/Store

```jsx
// authContext.js
import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load user on mount
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const response = await api.get('/api/users/me/');
      setUser(response.data);
      setPermissions(response.data.action_permissions || []);
    } catch (error) {
      console.error('Failed to load user', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (credentials) => {
    const response = await api.post('/api/auth/login/', credentials);
    setUser(response.data.user);
    setPermissions(response.data.user.action_permissions || []);
    // Store token
    localStorage.setItem('token', response.data.token);
  };

  const logout = () => {
    setUser(null);
    setPermissions([]);
    localStorage.removeItem('token');
  };

  return (
    <AuthContext.Provider value={{ user, permissions, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

### 3. ✅ Provide Feedback for Missing Permissions

```jsx
function ProtectedButton({ permission, onClick, children }) {
  const { hasPermission } = usePermissions();
  const canAccess = hasPermission(permission);

  return (
    <Tooltip 
      content={canAccess ? '' : 'You do not have permission to perform this action'}
      disabled={canAccess}
    >
      <button
        onClick={canAccess ? onClick : undefined}
        disabled={!canAccess}
        className={!canAccess ? 'disabled-no-permission' : ''}
      >
        {children}
        {!canAccess && <Icon name="lock" />}
      </button>
    </Tooltip>
  );
}
```

### 4. ✅ Handle Permission Changes

```jsx
// If user permissions can change during session
function PermissionAwareComponent() {
  const { hasPermission, refreshPermissions } = usePermissions();
  
  useEffect(() => {
    // Listen for permission updates
    const interval = setInterval(() => {
      refreshPermissions();
    }, 5 * 60 * 1000); // Check every 5 minutes
    
    return () => clearInterval(interval);
  }, []);

  // Component logic
}
```

### 5. ✅ Development Mode Helpers

```jsx
// utils/devPermissions.js
export const DEV_MODE = process.env.NODE_ENV === 'development';

export function logMissingPermission(permission, action) {
  if (DEV_MODE) {
    console.warn(`[Permission Check] Missing permission: ${permission} for action: ${action}`);
  }
}

// Usage
function handleApprove() {
  if (!hasPermission('po-approve')) {
    logMissingPermission('po-approve', 'Approve Purchase Order');
    toast.error('Permission denied');
    return;
  }
  // Approve logic
}
```

### 6. ✅ Error Boundary for Permission Errors

```jsx
class PermissionErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    if (error.response?.status === 403) {
      return { hasError: true, error };
    }
    return null;
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="permission-error">
          <h2>Access Denied</h2>
          <p>You do not have permission to access this resource.</p>
          <button onClick={() => window.history.back()}>Go Back</button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

---

## Testing

### Unit Tests

```javascript
// __tests__/usePermissions.test.js
import { renderHook } from '@testing-library/react-hooks';
import { usePermissions } from '@/hooks/usePermissions';

// Mock useAuth
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      action_permissions: ['po-list', 'po-view-detail', 'po-approve']
    }
  })
}));

describe('usePermissions', () => {
  it('should return true for existing permission', () => {
    const { result } = renderHook(() => usePermissions());
    expect(result.current.hasPermission('po-approve')).toBe(true);
  });

  it('should return false for missing permission', () => {
    const { result } = renderHook(() => usePermissions());
    expect(result.current.hasPermission('po-delete')).toBe(false);
  });

  it('should handle wildcard permission', () => {
    // Override mock for this test
    jest.mock('@/hooks/useAuth', () => ({
      useAuth: () => ({
        user: { action_permissions: ['*'] }
      })
    }));
    
    const { result } = renderHook(() => usePermissions());
    expect(result.current.hasPermission('any-permission')).toBe(true);
  });
});
```

---

## Troubleshooting

### Permissions not loading
```javascript
// Debug permissions
console.log('User:', user);
console.log('Permissions:', user?.action_permissions);

// Check API response
const response = await api.get('/api/users/me/');
console.log('API Response:', response.data);
```

### Permissions not updating after role change
```javascript
// Force refresh user data
const refreshUser = async () => {
  const response = await api.get('/api/users/me/');
  setUser(response.data);
};

// Call after role assignment
await assignUserRole(userId, roleId);
await refreshUser();
```

### Check specific permission in console
```javascript
// Add to window for debugging (dev only)
if (process.env.NODE_ENV === 'development') {
  window.checkPermission = (code) => {
    const permissions = window.__user__?.action_permissions || [];
    console.log(`Permission "${code}":`, permissions.includes(code));
    console.log('All permissions:', permissions);
  };
}

// Use in console: checkPermission('po-approve')
```

---

## Complete Example: Purchase Order Management

```jsx
// pages/PurchaseOrderDetail.jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { PermissionGuard } from '@/components/PermissionGuard';
import api from '@/services/api';

function PurchaseOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission, hasAnyPermission } = usePermissions();
  
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check if user can view this page
  useEffect(() => {
    if (!hasPermission('po-view-detail')) {
      navigate('/unauthorized');
    }
  }, [hasPermission, navigate]);

  useEffect(() => {
    loadOrder();
  }, [id]);

  const loadOrder = async () => {
    try {
      const response = await api.get(`/api/purchase-orders/${id}/`);
      setOrder(response.data);
    } catch (error) {
      console.error('Failed to load order', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    navigate(`/purchase-orders/${id}/edit`);
  };

  const handleApprove = async () => {
    if (!hasPermission('po-approve')) {
      toast.error('You do not have permission to approve');
      return;
    }

    try {
      await api.post(`/api/purchase-orders/${id}/approve/`);
      toast.success('Purchase order approved');
      loadOrder(); // Refresh
    } catch (error) {
      toast.error('Failed to approve purchase order');
    }
  };

  const handleSend = async () => {
    if (!hasPermission('po-send')) {
      toast.error('You do not have permission to send');
      return;
    }

    try {
      await api.post(`/api/purchase-orders/${id}/send/`);
      toast.success('Purchase order sent to supplier');
      loadOrder();
    } catch (error) {
      toast.error('Failed to send purchase order');
    }
  };

  const handleGeneratePDF = async () => {
    if (!hasPermission('po-generate-pdf')) {
      toast.error('You do not have permission to generate PDF');
      return;
    }

    try {
      const response = await api.get(`/api/purchase-orders/${id}/pdf/`, {
        responseType: 'blob'
      });
      // Download PDF
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `PO-${order.number}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      toast.error('Failed to generate PDF');
    }
  };

  const handleDelete = async () => {
    if (!hasPermission('po-delete')) {
      toast.error('You do not have permission to delete');
      return;
    }

    if (!confirm('Are you sure you want to delete this purchase order?')) {
      return;
    }

    try {
      await api.delete(`/api/purchase-orders/${id}/`);
      toast.success('Purchase order deleted');
      navigate('/purchase-orders');
    } catch (error) {
      toast.error('Failed to delete purchase order');
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!order) return <div>Order not found</div>;

  // Check if user can perform any actions
  const canPerformActions = hasAnyPermission([
    'po-edit',
    'po-approve',
    'po-send',
    'po-generate-pdf',
    'po-delete'
  ]);

  return (
    <div className="purchase-order-detail">
      <div className="header">
        <h1>Purchase Order #{order.number}</h1>
        
        {canPerformActions && (
          <div className="actions">
            <PermissionGuard permission="po-edit">
              <button onClick={handleEdit} disabled={order.status !== 'draft'}>
                Edit
              </button>
            </PermissionGuard>

            <PermissionGuard permission="po-approve">
              <button 
                onClick={handleApprove} 
                disabled={order.status !== 'pending'}
                className="primary"
              >
                Approve
              </button>
            </PermissionGuard>

            <PermissionGuard permission="po-send">
              <button 
                onClick={handleSend}
                disabled={order.status !== 'approved'}
              >
                Send to Supplier
              </button>
            </PermissionGuard>

            <PermissionGuard permission="po-generate-pdf">
              <button onClick={handleGeneratePDF}>
                Generate PDF
              </button>
            </PermissionGuard>

            <PermissionGuard permission="po-delete">
              <button 
                onClick={handleDelete}
                disabled={order.status !== 'draft'}
                className="danger"
              >
                Delete
              </button>
            </PermissionGuard>
          </div>
        )}
      </div>

      <div className="order-details">
        {/* Order details content */}
      </div>
    </div>
  );
}

export default PurchaseOrderDetail;
```

---

## Summary Checklist

✅ **Setup**
- [ ] Create permission service/hook
- [ ] Store user permissions in auth context
- [ ] Add TypeScript types (if using TS)

✅ **Implementation**
- [ ] Implement `hasPermission()` checks
- [ ] Create PermissionGuard component
- [ ] Protect routes requiring permissions
- [ ] Filter navigation menu items
- [ ] Disable/hide buttons based on permissions

✅ **Best Practices**
- [ ] Always validate permissions on backend too
- [ ] Show appropriate feedback for missing permissions
- [ ] Handle permission errors gracefully
- [ ] Cache permissions efficiently
- [ ] Test permission checks

✅ **Testing**
- [ ] Test with different roles
- [ ] Test permission edge cases
- [ ] Test permission denied scenarios
- [ ] Verify wildcard (`*`) behavior

---

**Total Permission Codes: 186**  
**Frontend Ready!** 🚀

For complete permission code reference, see [Backend Permissions Reference](../erp-backend/phoenix_erp/PERMISSION_CODES_REFERENCE.md)
