# Role-Based Module Implementation Specification

## 🎯 **What We Accomplished with Director Role**

We successfully created **role-specific module landing pages** that solve the broken dashboard module links. Here's what we built:

### **✅ Director Modules Created:**
1. **FinancialManagementModule.tsx** - `/director/finance`
2. **StudentServicesModule.tsx** - `/director/student-services` 
3. **OperationsModule.tsx** - `/director/operations`
4. **AdministrationModule.tsx** - `/director/administration`

### **🎨 Pattern We Established:**

Each module page follows the **NewPagesIndex card pattern**:

```typescript
// Example: FinancialManagementModule.tsx
const pageLinks: PageLink[] = [
  {
    title: '📄 Enhanced Create Invoice',
    description: 'Enhanced invoice creation with auto number generation...',
    path: '/sales/invoices/create',
    icon: <Plus size={20} />,
    isNew: true
  },
  // ... more pages
];

// Grouped by categories
const groupedLinks = pageLinks.reduce((acc, link) => {
  const category = /* logic to categorize */;
  // Group pages by category
}, {});

// Render as cards with categories
```

### **🔗 URL Structure:**
```
/{role}/{module}           → Module landing page (shows available pages as cards)
/{role}/{module}/{page}    → Direct link to specific functionality (for Quick Actions)
```

**Examples:**
- `/director/finance` → Shows Financial Management module pages
- `/principal/student-services` → Shows Student Services module pages  
- `/registrar/student-services` → Shows Student Services module pages (filtered for Registrar)

---

## 🚀 **Implementation Strategy for All Roles**

### **Option 1: Shared Module Pages with Role-Based Filtering (RECOMMENDED)**

Instead of creating separate module pages for each role, we create **shared module pages** that filter content based on the current user's role.

#### **Benefits:**
- ✅ **Less code duplication** - One module page serves all roles
- ✅ **Easier maintenance** - Update one file, affects all roles
- ✅ **Consistent experience** - Same UI across all roles
- ✅ **Role-based security** - Hide pages users shouldn't access

#### **Implementation:**

```typescript
// Example: SharedFinancialModule.tsx
import { useAuth } from '../../hooks/useAuth';
import { hasPermission } from '../../utils/permissions';

const SharedFinancialModule: React.FC = () => {
  const { user } = useAuth();
  
  const allPageLinks: PageLink[] = [
    {
      title: 'Create Invoice',
      path: '/sales/invoices/create',
      permissions: ['financial.invoice_generation'], // Required permissions
      roles: ['Director', 'Principal', 'Officer'], // Allowed roles
    },
    {
      title: 'User Management', 
      path: '/admin/users',
      permissions: ['admin.system_settings'],
      roles: ['Director', 'Administrator'], // Only Director and Admin
    },
    // ... all possible pages
  ];

  // Filter pages based on user's role and permissions
  const filteredPages = allPageLinks.filter(page => {
    const hasRoleAccess = page.roles.includes(user.role);
    const hasPermissions = page.permissions.every(perm => 
      hasPermission(user.permissions, perm)
    );
    return hasRoleAccess && hasPermissions;
  });

  return (
    <div>
      <h1>Financial Management - {user.role}</h1>
      {/* Render filtered pages as cards */}
    </div>
  );
};
```

#### **URL Structure:**
```
/modules/finance           → Shared Financial module (filtered by role)
/modules/student-services  → Shared Student Services module (filtered by role)  
/modules/operations        → Shared Operations module (filtered by role)
/modules/administration    → Shared Administration module (filtered by role)
```

#### **Dashboard Links Update:**
```typescript
// In dashboard templates, all roles link to same modules
primaryModules: ['finance', 'student-services', 'operations', 'administration']

// But the module pages show different content based on role
```

---

## 📋 **Implementation Tasks**

### **Phase 1: Create Shared Module Components**

1. **Create `/modules/` directory structure:**
   ```
   src/pages/modules/
   ├── FinancialModule.tsx
   ├── StudentServicesModule.tsx  
   ├── OperationsModule.tsx
   ├── AdministrationModule.tsx
   └── index.ts
   ```

2. **Define permission/role mappings** for each page
3. **Create filtering logic** based on user role and permissions
4. **Migrate existing Director modules** to shared modules

### **Phase 2: Update Dashboard Templates**

1. **Update module links** in `dashboardTemplates.ts`:
   ```typescript
   // Change from:
   primaryModules: ['financial', 'student-services', 'operations', 'administration']
   
   // To use shared module URLs:
   moduleLinks: {
     'financial': '/modules/finance',
     'student-services': '/modules/student-services', 
     'operations': '/modules/operations',
     'administration': '/modules/administration'
   }
   ```

2. **Update routing** in `App.tsx` to handle `/modules/*` routes

### **Phase 3: Permission-Based Page Filtering**

1. **Create page permission mappings:**
   ```typescript
   const PAGE_PERMISSIONS = {
     '/sales/invoices/create': ['financial.invoice_generation'],
     '/admin/users': ['admin.system_settings'],
     '/receivables/dashboard': ['financial.receivables_dashboard'],
     // ... all pages
   };
   ```

2. **Implement filtering logic** in each shared module
3. **Test role-based access** for each role

---

## 🎯 **Expected Outcome**

### **Before (Broken):**
- ❌ Clicking "Financial Management" → 404 error
- ❌ Different broken links for each role
- ❌ No module landing pages exist

### **After (Fixed):**
- ✅ **Director** clicks "Financial Management" → Shows 25+ financial pages
- ✅ **Principal** clicks "Financial Management" → Shows 15+ relevant financial pages  
- ✅ **Officer** clicks "Financial Management" → Shows 8+ basic financial pages
- ✅ **Registrar** clicks "Student Services" → Shows 12+ student-focused pages
- ✅ **Administrator** clicks "Administration" → Shows 10+ admin pages

### **Role-Based Filtering Examples:**

**Financial Module Access:**
- **Director**: All 25+ pages (full access)
- **Principal**: 15+ pages (no admin functions)
- **Officer**: 8+ pages (basic operations only)
- **Registrar**: 6+ pages (student fee related only)
- **Administrator**: 12+ pages (reports + admin functions)

**Student Services Module Access:**
- **Director**: All student service pages
- **Principal**: Student management + academic functions
- **Registrar**: Entitlements + records + statements
- **Officer**: Basic student lookup + data entry
- **Administrator**: Student data + system functions

---

## 🚀 **Ready to Implement?**

This approach will:
1. **Fix all broken module links** across all 5 roles
2. **Provide role-appropriate content** for each user
3. **Maintain security** by hiding unauthorized pages
4. **Reduce code duplication** with shared components
5. **Make maintenance easier** with centralized module definitions

**Next Steps:**
1. Create the shared module components
2. Define permission mappings for all pages
3. Update dashboard templates to use shared modules
4. Test with different user roles

This will make the dashboard fully functional for all user roles while maintaining proper access control! 🎯