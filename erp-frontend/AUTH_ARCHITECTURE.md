# Authentication Architecture

## Active Authentication Files

### Core Authentication System
1. **`components/auth/LoginPageStyled.tsx`** ✅ ACTIVE
   - Main login page used in App.tsx
   - Uses `authService` directly for login
   - Handles redirect logic with `getRedirectPathForUser()`

2. **`services/authService.ts`** ✅ ACTIVE
   - Authentication service layer
   - Manages tokens and user data in localStorage
   - Keys: `'accessToken'`, `'refreshToken'`, `'user'`
   - Provides: login(), logout(), getCurrentUser(), etc.

3. **`contexts/AuthContext.tsx`** ✅ ACTIVE
   - Global authentication state provider
   - Loads user from localStorage on app init
   - Provides: { user, loading, login, logout, isAdmin }
   - Uses same localStorage keys as authService

4. **`utils/roleBasedRedirect.ts`** ✅ ACTIVE
   - Determines redirect paths based on user role
   - Functions:
     - `getRedirectPathForUser()` - Where to redirect after login
     - `canAccessHomepage()` - Check homepage access
     - `isAdmin()` - Check admin privileges

### Admin Access Logic
Users with ANY of these flags can access homepage (not redirected to dashboards):
- `is_owner: true` - Tenant owner
- `is_staff: true` - Staff/admin user  
- `is_system_admin: true` - System-wide administrator

Regular users are redirected to:
1. Their assigned dashboard (if `assigned_dashboard_slug` exists)
2. Dashboard selection page (`/dashboards/select`) as fallback

## Deprecated Files (NOT IN USE)

### ❌ DEPRECATED - Do Not Use
1. **`pages/LoginPage.tsx`**
   - Old styled-components version
   - Uses AuthContext.login() directly
   - NOT imported anywhere

2. **`pages/auth/LoginPage.tsx`**
   - Uses react-hook-form
   - Uses AuthContext.login() directly
   - NOT imported anywhere

3. **`components/auth/LoginPage.tsx`**
   - Basic version without styling
   - NOT imported anywhere

**Note:** These files have been marked with deprecation warnings at the top. Consider deleting them to reduce confusion.

## Authentication Flow

### 1. Login Flow
```
User submits credentials
  ↓
LoginPageStyled → authService.login()
  ↓
authService stores in localStorage:
  - accessToken
  - refreshToken  
  - user (JSON)
  ↓
getRedirectPathForUser(user)
  ↓
Navigate to appropriate path
  ↓
AuthContext loads user from localStorage
  ↓
App renders with authenticated user
```

### 2. Protected Route Flow
```
User navigates to protected route
  ↓
AuthContext checks localStorage for tokens/user
  ↓
If authenticated: render route
If not: redirect to /login
```

### 3. Homepage Access Flow
```
User navigates to /
  ↓
HomePageWithNavigation checks:
  1. authLoading? → Wait
  2. !user? → Redirect to /login
  3. !canAccessHomepage(user)? → Redirect per role
  4. else → Show homepage
```

## Common Issues & Solutions

### Issue: User redirected after successful login
**Cause:** AuthContext not loaded when HomePageWithNavigation checks access  
**Solution:** Check `authLoading` before making redirect decisions

### Issue: Multiple User types causing confusion
**Cause:** Old mock User interface vs real backend User interface  
**Solution:** AuthContext now uses real User type from authService

### Issue: User data not persisting across page reloads
**Cause:** Different localStorage keys between authService and AuthContext  
**Solution:** Both now use same keys: `'accessToken'`, `'refreshToken'`, `'user'`

## Best Practices

1. **Always use `authService` for authentication operations**
   - Don't call API directly
   - Let authService handle token/user storage

2. **Use `useAuth()` hook for accessing user state**
   - Don't read localStorage directly
   - Respect the `loading` state

3. **Check admin access using utility functions**
   - Use `isAdmin()` or check `is_owner || is_staff || is_system_admin`
   - Don't create custom role checks

4. **For redirects, use `getRedirectPathForUser()`**
   - Centralized redirect logic
   - Handles all user types consistently

## File Cleanup Recommendations

Consider deleting these deprecated files:
- `pages/LoginPage.tsx`
- `pages/auth/LoginPage.tsx`
- `components/auth/LoginPage.tsx`

They are marked with deprecation warnings but not used anywhere in the codebase.
