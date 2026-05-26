# Role-Based Module Pages Implementation Plan

## 🎯 **Objective**

Replicate the successful Director module page pattern for all other user roles (Principal, Administrator, Registrar, Officer) by creating individual module pages for each role, filtering the available pages based on the Phoenix Software Access Table permissions.

## 📋 **Current State - Director Modules (Reference Implementation)**

We have successfully implemented 4 Director module pages:

```
src/pages/director/
├── FinancialManagementModule.tsx    ✅ Complete - Shows 20+ financial pages
├── StudentServicesModule.tsx        ✅ Complete - Shows student-related pages  
├── OperationsModule.tsx             ✅ Complete - Shows procurement/inventory pages
└── AdministrationModule.tsx         ✅ Complete - Shows admin/system pages
```

**Each Director module page:**
- ✅ Shows pages as cards (NewPagesIndex pattern)
- ✅ Groups pages by categories (e.g., "Receivables & Invoicing", "Financial Reports")
- ✅ Has working links to real, functional pages
- ✅ Shows "Director Module" in the header
- ✅ Has consistent UI/UX with hover effects and badges

## 🎯 **Implementation Strategy**

### **Approach: Copy → Filter → Customize**

For each role, we will:

1. **Copy** the relevant Director module files
2. **Filter** the pages based on Phoenix Software Access Table permissions  
3. **Customize** the header and role-specific content
4. **Test** that all links work and unauthorized pages are hidden

### **File Structure to Create:**

```
src/pages/
├── director/           # ✅ Already complete (reference)
│   ├── FinancialManagementModule.tsx
│   ├── StudentServicesModule.tsx
│   ├── OperationsModule.tsx
│   └── AdministrationModule.tsx
├── principal/          # 🔄 To be created
│   ├── FinancialManagementModule.tsx
│   ├── StudentServicesModule.tsx
│   └── OperationsModule.tsx
├── administrator/      # 🔄 To be created
│   ├── AdministrationModule.tsx
│   ├── FinancialManagementModule.tsx
│   └── StudentServicesModule.tsx
├── registrar/          # 🔄 To be created
│   ├── StudentServicesModule.tsx
│   └── FinancialManagementModule.tsx
└── officer/            # 🔄 To be created
    ├── FinancialManagementModule.tsx
    ├── StudentServicesModule.tsx
    └── OperationsModule.tsx
```

## 📊 **Role-Based Module Matrix**

Based on the Phoenix Software Access Table, here's what modules each role should have:

| Role | Financial Management | Student Services | Operations | Administration |
|------|---------------------|------------------|------------|----------------|
| **Director** | ✅ Complete | ✅ Complete | ✅ Complete | ✅ Complete |
| **Principal** | 🔄 Create | 🔄 Create | 🔄 Create | ❌ No Access |
| **Administrator** | 🔄 Create | 🔄 Create | ❌ No Access | 🔄 Create |
| **Registrar** | 🔄 Create | 🔄 Create | ❌ No Access | ❌ No Access |
| **Officer** | 🔄 Create | 🔄 Create | 🔄 Create | ❌ No Access |

## 🛠 **Implementation Process**

### **Step 1: Principal Role Modules**

**Create 3 module pages for Principal:**

1. **`src/pages/principal/FinancialManagementModule.tsx`**
   - Copy from `director/FinancialManagementModule.tsx`
   - Remove pages where Principal has ❌ in Phoenix table
   - Keep pages where Principal has ✓ (Invoice generation, P&L reports, etc.)
   - Change header to "Principal Module"

2. **`src/pages/principal/StudentServicesModule.tsx`**
   - Copy from `director/StudentServicesModule.tsx`
   - Filter to student management pages Principal can access
   - Keep registration, entitlements, basic student operations

3. **`src/pages/principal/OperationsModule.tsx`**
   - Copy from `director/OperationsModule.tsx`
   - Filter to operational tasks Principal can perform
   - Keep daily operations, payment requests, basic procurement

### **Step 2: Administrator Role Modules**

**Create 3 module pages for Administrator:**

1. **`src/pages/administrator/AdministrationModule.tsx`**
   - Copy from `director/AdministrationModule.tsx`
   - Keep all admin functions (user management, system settings, etc.)
   - Administrator has full admin access

2. **`src/pages/administrator/FinancialManagementModule.tsx`**
   - Copy from `director/FinancialManagementModule.tsx`
   - Remove P&L viewing (Administrator has ❌ for this)
   - Keep invoice generation, reports, payroll functions

3. **`src/pages/administrator/StudentServicesModule.tsx`**
   - Copy from `director/StudentServicesModule.tsx`
   - Focus on administrative aspects of student management
   - Keep user management, registration, system functions

### **Step 3: Registrar Role Modules**

**Create 2 module pages for Registrar:**

1. **`src/pages/registrar/StudentServicesModule.tsx`**
   - Copy from `director/StudentServicesModule.tsx`
   - Filter to student registration and records functions
   - Keep entitlements, registration, student data management

2. **`src/pages/registrar/FinancialManagementModule.tsx`**
   - Copy from `director/FinancialManagementModule.tsx`
   - Filter to only student fee-related financial functions
   - Keep invoice generation, basic financial operations

### **Step 4: Officer Role Modules**

**Create 3 module pages for Officer:**

1. **`src/pages/officer/FinancialManagementModule.tsx`**
   - Copy from `director/FinancialManagementModule.tsx`
   - Filter to basic financial operations only
   - Keep daily posting, payment requests, basic data entry

2. **`src/pages/officer/StudentServicesModule.tsx`**
   - Copy from `director/StudentServicesModule.tsx`
   - Filter to basic student data entry functions
   - Keep basic operations, data entry, simple lookups

3. **`src/pages/officer/OperationsModule.tsx`**
   - Copy from `director/OperationsModule.tsx`
   - Filter to basic operational tasks
   - Keep daily operations, basic inventory, simple tasks

## 🔗 **URL Structure**

Each role will have their own module URLs:

```
/director/finance              ✅ Already working
/director/student-services     ✅ Already working  
/director/operations           ✅ Already working
/director/administration       ✅ Already working

/principal/finance             🔄 To be created
/principal/student-services    🔄 To be created
/principal/operations          🔄 To be created

/administrator/administration  🔄 To be created
/administrator/finance         🔄 To be created
/administrator/student-services 🔄 To be created

/registrar/student-services    🔄 To be created
/registrar/finance             🔄 To be created

/officer/finance               🔄 To be created
/officer/student-services      🔄 To be created
/officer/operations            🔄 To be created
```

## ✅ **Success Criteria**

When complete, we will have:

- ✅ **14 total module pages** across all 5 roles
- ✅ **Role-appropriate content** - each role sees only authorized pages
- ✅ **Consistent UI/UX** - same card layout and design patterns
- ✅ **Working navigation** - all dashboard module links function properly
- ✅ **Security compliance** - no unauthorized access to restricted pages

## 🚀 **Implementation Order**

1. **Start with Principal** (most similar to Director permissions)
2. **Then Administrator** (clear admin focus)
3. **Then Registrar** (student-focused, simpler)
4. **Finally Officer** (most restricted, basic operations)

This approach ensures we maintain the successful Director pattern while creating role-specific access across all user types, making the dashboard fully functional for everyone!