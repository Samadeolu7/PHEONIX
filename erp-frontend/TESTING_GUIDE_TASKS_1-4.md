# Testing Guide: Modern ERP Frontend Redesign Tasks 1-4

This guide provides comprehensive testing instructions for the implemented role-based access control and navigation system.

## Prerequisites

1. **Start the development server:**
   ```bash
   cd erp-frontend
   npm run dev
   ```

2. **Access the application:**
   - Open your browser to `http://localhost:5173`
   - Ensure you have a clean browser session (clear localStorage if needed)

## Task 1: Role Selection on Login Page ✅

### Test Scenarios

#### 1.1 Role Selection Dropdown
- **Navigate to:** `/login`
- **Expected:** Login form should display a role selection dropdown
- **Test Steps:**
  1. Click on the role dropdown
  2. Verify all 5 roles are available:
     - Director
     - Principal  
     - Administrator
     - Registrar
     - Officer
  3. Select each role and verify the selection is reflected

#### 1.2 Role Persistence
- **Test Steps:**
  1. Select a role (e.g., "Director")
  2. Enter login credentials and submit
  3. After login, check browser localStorage:
     ```javascript
     // Open browser console and run:
     console.log(localStorage.getItem('selectedRole'));
     ```
  4. **Expected:** Should show the selected role

#### 1.3 Role Switching (Testing Feature)
- **Navigate to:** Any protected page after login
- **Test Steps:**
  1. Look for role switcher component (if implemented)
  2. Switch between different roles
  3. Verify navigation and page access changes accordingly

## Task 2: Role-Based Permission System ✅

### Test Scenarios

#### 2.1 Permission Checking Utilities
- **Test in Browser Console:**
  ```javascript
  // After login, test permission utilities
  import { usePermissions } from './src/hooks/usePermissions';
  
  // Check if current role has access to specific pages
  // This should be tested within React components
  ```

#### 2.2 Route Protection
- **Test Steps:**
  1. Login as "Officer" role
  2. Try to access restricted pages:
     - `/admin/roles-matrix` (Director only)
     - `/admin/users` (Director/Administrator only)
  3. **Expected:** Should redirect to 403/404 error page

#### 2.3 Error Pages
- **Test 403 Forbidden:**
  1. Login as non-Director role
  2. Navigate to `/admin/roles-matrix`
  3. **Expected:** Should show 403 error page with options:
     - Reload button
     - Re-login button  
     - Go to home page button

- **Test 404 Not Found:**
  1. Navigate to `/non-existent-page`
  2. **Expected:** Should show 404 error page

## Task 3: Roles and Permissions Management Interface (In Progress)

### Test Scenarios

#### 3.1 Access Control
- **Test Steps:**
  1. Login as "Director" role
  2. Navigate to `/admin/roles-matrix`
  3. **Expected:** Should access the permissions matrix page

- **Test Non-Director Access:**
  1. Login as any other role (Principal, Administrator, etc.)
  2. Try to access `/admin/roles-matrix`
  3. **Expected:** Should show access restricted message

#### 3.2 Permissions Matrix Display
- **Test Steps:**
  1. As Director, access `/admin/roles-matrix`
  2. **Expected:** Should see:
     - Visual matrix showing all roles and page permissions
     - Pages grouped by functional categories:
       - User Management
       - Financial Operations
       - Student Management
       - Reports & Analytics
       - Operations
       - System Administration
     - Role statistics showing permission percentages

#### 3.3 Permission Editing (If Implemented)
- **Test Steps:**
  1. Click on permission checkboxes in the matrix
  2. **Expected:** Should toggle permissions with visual feedback
  3. Make changes and click "Save Changes"
  4. **Expected:** Should save and update the permission system

## Task 4: Function-Based Page Organization ✅

### Test Scenarios

#### 4.1 Navigation Structure
- **Test Steps:**
  1. Login with different roles
  2. Check main navigation menu
  3. **Expected:** Menu items should be organized by functional categories:
     - User Management (Director/Administrator only)
     - Financial Operations
     - Student Management
     - Reports & Analytics
     - Operations

#### 4.2 Conditional Menu Rendering
- **Test with Different Roles:**

**As Director:**
- Should see all menu categories
- Should have access to all pages

**As Officer:**
- Should NOT see User Management category
- Should see limited Financial Operations
- Should see limited Reports & Analytics

**As Registrar:**
- Should see Student Management prominently
- Should have limited Financial Operations access

#### 4.3 Route Access Enforcement
- **Test Steps:**
  1. Login as "Officer"
  2. Try direct URL access to restricted pages:
     - `/admin/users` (should be blocked)
     - `/admin/roles-matrix` (should be blocked)
     - `/reports/profit-loss` (should be blocked)
  3. **Expected:** Should redirect to error pages

## Comprehensive Role Testing Matrix

### Director Role Testing
```bash
# Test these URLs as Director - should have access to ALL
/admin/roles-matrix ✓
/admin/users ✓
/admin/branches ✓
/financial/invoices ✓
/financial/payments/approval ✓
/students/registration ✓
/reports/profit-loss ✓
/operations/procurement ✓
```

### Principal Role Testing
```bash
# Test these URLs as Principal
/admin/roles-matrix ✗ (should be blocked)
/admin/users ✗ (should be blocked)
/financial/invoices ✓
/financial/payments/approval ✓
/students/registration ✓
/reports/profit-loss ✓
/operations/procurement ✓
```

### Administrator Role Testing
```bash
# Test these URLs as Administrator
/admin/users ✓
/admin/branches ✓
/admin/roles-matrix ✗ (should be blocked)
/financial/accounts ✓
/students/registration ✓
/reports/profit-loss ✓
/operations/procurement ✗ (should be blocked)
```

### Registrar Role Testing
```bash
# Test these URLs as Registrar
/admin/users ✗ (should be blocked)
/financial/invoices ✗ (should be blocked)
/students/registration ✓
/students/entitlements ✓
/students/fee-structures ✓
/reports/aging ✗ (should be blocked)
```

### Officer Role Testing
```bash
# Test these URLs as Officer
/admin/users ✗ (should be blocked)
/financial/invoices ✓
/financial/payments/approval ✗ (should be blocked)
/students/entitlements ✓
/reports/aging ✓
/operations/procurement ✓
```

## Automated Testing Commands

### Run Permission Tests
```bash
# Run the permission verification script
cd erp-frontend
node verify-permissions.cjs
```

### Run Component Tests
```bash
# Run tests for navigation and auth components
npm test -- --run src/components/navigation/__tests__/
npm test -- --run src/pages/admin/__tests__/
```

## Browser Console Testing

### Check Current Role
```javascript
// In browser console after login
console.log('Current Role:', localStorage.getItem('selectedRole'));
```

### Test Permission Utilities
```javascript
// Test permission checking (in React DevTools console)
// This requires accessing the component context
```

## Expected Behaviors Summary

### ✅ Working Features (Tasks 1, 2, 4)
- Role selection on login page
- Role persistence in localStorage
- Route protection based on roles
- 403/404 error pages with navigation options
- Conditional navigation menu rendering
- Function-based page organization

### 🚧 In Progress (Task 3)
- Visual permissions matrix interface
- Permission editing for Directors
- Real-time permission updates

## Troubleshooting

### Common Issues
1. **Role not persisting:** Clear localStorage and re-login
2. **Navigation not updating:** Check if role is properly set in context
3. **403 errors not showing:** Verify error page components are imported
4. **Menu items not hiding:** Check permission checking logic

### Debug Commands
```bash
# Clear browser storage
localStorage.clear();

# Check current authentication state
console.log('Auth State:', JSON.parse(localStorage.getItem('authState') || '{}'));

# Check current role
console.log('Selected Role:', localStorage.getItem('selectedRole'));
```

## Success Criteria

### Task 1 ✅
- [ ] Role dropdown appears on login page
- [ ] All 5 roles are selectable
- [ ] Selected role persists after login
- [ ] Role switching works (if implemented)

### Task 2 ✅
- [ ] Permission checking utilities work correctly
- [ ] Route protection blocks unauthorized access
- [ ] 403/404 pages display with proper navigation options
- [ ] Error handling works gracefully

### Task 3 🚧
- [ ] Permissions matrix page accessible to Directors only
- [ ] Visual matrix displays all roles and permissions
- [ ] Pages grouped by functional categories
- [ ] Permission editing works (if implemented)

### Task 4 ✅
- [ ] Navigation organized by functional categories
- [ ] Menu items conditionally rendered based on role
- [ ] All routes properly mapped to categories
- [ ] Page access enforcement works across all routes

Run through these tests systematically to verify the implementation meets all requirements!