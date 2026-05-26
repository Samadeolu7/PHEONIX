# Permissions Compliance Gap Analysis Report

**Date**: 2025  
**Scope**: Full-stack permissions enforcement audit — Frontend (React/TypeScript) + Backend (Django/DRF)  
**Methodology**: Static code review of all ViewSets, ProtectedRoute usages, DashboardBuilder, and permission classes

---

## Executive Summary

The permissions system (Phases 1–6) built a complete infrastructure: `RolePermissionPolicy` → `UserPermissionOverride` → `PermissionElevationLog` → `PermissionResolver`. This audit found **5 critical/high security gaps** where that infrastructure was not enforced at runtime. All 5 have been remediated. Additionally, 6 medium/low gaps remain tracked below.

---

## Remediated Gaps

### [CRITICAL-1] `DashboardViewSet` — No Authentication Required
| Field | Detail |
|---|---|
| **File** | `erp-backend/phoenix_erp/src/dashboards/views.py` |
| **Risk** | Unauthenticated users could read and write ALL dashboard templates for the tenant |
| **Root Cause** | `permission_classes = [AllowAny]` — likely left from scaffolding |
| **Fix** | Changed to `[IsAuthenticated, IsTenantUser]` |
| **Verified** | Django `check` passes (0 issues) |

### [CRITICAL-2] Loan `approve()` / `reject()` — No Permission or Limit Check
| Field | Detail |
|---|---|
| **File** | `erp-backend/phoenix_erp/src/loans/views.py` — `LoanAccountViewSet` |
| **Risk** | Any authenticated tenant user could approve loans of any amount, bypassing approval_limit controls |
| **Root Cause** | Custom DRF `@action` methods only had `IsAuthenticated`; no `PermissionResolver` call |
| **Fix** | Explicit `PermissionResolver.resolve(user, module='loans', page='loan-accounts', action='approve')` check added; also checks `loan.principal_amount <= effective.approval_limit` |
| **Verified** | Returns `HTTP 403` when caller lacks `can_approve` or amount exceeds limit |

### [HIGH-1] `ScopedModelViewSet` — No Action-Level Enforcement
| Field | Detail |
|---|---|
| **File** | `erp-backend/phoenix_erp/src/common/views.py` |
| **Risk** | All 20+ ViewSets extending `ScopedModelViewSet` had no `can_create` / `can_edit` / `can_delete` checks — only authentication was enforced |
| **Root Cause** | `HasActionPermission` class did not exist; `ScopedModelViewSet` only handled queryset scoping |
| **Fix** | Created `permissions/permission_classes.py` with `HasActionPermission(BasePermission)`; added dynamic `get_permissions()` override to `ScopedModelViewSet` that appends `HasActionPermission` at runtime |
| **Rollout Safety** | Fail-open: `except Exception` logs WARNING but returns `True` during transition period |

### [HIGH-2] `ProtectedRoute` — Hardcoded Superuser Bypass
| Field | Detail |
|---|---|
| **File** | `erp-frontend/src/components/auth/ProtectedRoute.tsx` |
| **Risk** | Role names `'Director'` and `'Principal'` were hardcoded to bypass ALL `requiredPermission` checks, regardless of actual permission policies |
| **Root Cause** | `const SUPERUSER_ROLES = ['Director', 'Principal']` — static string matching |
| **Fix** | Replaced with dynamic `permissionService.hasGlobalScope() && permissionService.isSuperUser()`, which reads the runtime permission state from the backend-sourced permission service |

### [HIGH-3] `DashboardBuilderPage` — No Module Filtering by Role Permissions
| Field | Detail |
|---|---|
| **File** | `erp-frontend/src/pages/admin/DashboardBuilderPage.tsx` |
| **Risk** | Admin could add any module/widget to a role's dashboard template, even modules that role has no `can_view` permission for — resulting in widgets that render empty/error at runtime |
| **Root Cause** | Templates used hardcoded `sampleTemplates` array with no permission policy lookup |
| **Fix** | Full rewrite: `fetchRolePermissions(roleName)` calls `rolePermissionService.getRolePolicies()`, extracts `permittedModuleCodes` and `permittedPageCodes` where `can_view = true`. `validateTemplateModules()` checks all template modules against permitted list before save. Builder UI shows amber warning banner listing permitted modules. API-backed CRUD replaces hardcoded data. |

---

## Remaining Gaps

### [MEDIUM-1] `/admin/dashboard-builder` Route — Not in App.tsx
| Field | Detail |
|---|---|
| **File** | `erp-frontend/src/App.tsx` |
| **Status** | **FIXED** in this session — route added with `requiredPermission="user-list"` and optional `/:templateId?` param |
| **Note** | Route previously existed only in documentation (DASHBOARD_TESTING_URLS.md) but was not registered in the router |

### [MEDIUM-2] Admin Form/Workflow Routes — No `requiredPermission`
| Field | Detail |
|---|---|
| **File** | `erp-frontend/src/App.tsx` lines ~2529–2580 |
| **Status** | **FIXED** in this session |
| **Routes Fixed** | `/admin/forms` → `form-list`, `/admin/workflows` → `workflow-list`, `/admin/submissions` → `form-list`, `/admin/workflows/new` → `workflow-create`, `/admin/workflows/:workflowId` → `workflow-edit` |

### [MEDIUM-3] `LoanDisbursementViewSet` — Approval Actions Not Hardened
| Field | Detail |
|---|---|
| **File** | `erp-backend/phoenix_erp/src/loans/views.py` — `LoanDisbursementViewSet` |
| **Risk** | `approve`, `execute`, `reject` custom actions lack explicit `PermissionResolver` checks (unlike `LoanAccountViewSet` which was fixed) |
| **Recommendation** | Add same pattern as `LoanAccountViewSet`: explicit `PermissionResolver.resolve()` call in each action + `approval_limit` check on `execute()` |
| **Mitigation** | `HasActionPermission` (via `ScopedModelViewSet.get_permissions()`) provides baseline enforcement for non-approval verbs |

### [MEDIUM-4] Savings/Collections Approval Actions
| Field | Detail |
|---|---|
| **Files** | `erp-backend/phoenix_erp/src/savings/views.py`, `erp-backend/phoenix_erp/src/collections/views.py` |
| **Risk** | Withdrawal approval and collection processing actions likely lack explicit `can_approve` checks |
| **Recommendation** | Audit custom `@action` methods; add `PermissionResolver.resolve(..., action='approve')` where applicable |
| **Mitigation** | `HasActionPermission` covers standard CRUD; only custom `@action` endpoints with `approve_actions` semantics are unguarded |

### [MEDIUM-5] Procurement PO Approval — Approval Limit Not Enforced
| Field | Detail |
|---|---|
| **File** | `erp-backend/phoenix_erp/src/procurement/views.py` |
| **Risk** | PO approval actions may not enforce `approval_limit`; procurement involves large financial amounts |
| **Recommendation** | Add `PermissionResolver.resolve()` + `approval_limit` check, similar to `LoanAccountViewSet.approve()` |

### [LOW-1] Tenant Management Routes — No Frontend Permission Gate
| Field | Detail |
|---|---|
| **File** | `erp-frontend/src/App.tsx` — `/admin/tenants/*` routes |
| **Status** | Intentionally open by comment (`// no permission required`) |
| **Rationale** | Tenant management is a system-admin concern, not role-based. Backend `IsTenantUser` prevents cross-tenant access. |
| **Recommendation** | Add `requiredPermission="tenant-manage"` if a tenant-management permission code is defined in the future |

### [LOW-2] `PermissionResolver` Dual-System: Legacy `permission_codes` JSONField
| Field | Detail |
|---|---|
| **File** | `erp-backend/phoenix_erp/src/permissions/services.py` |
| **Risk** | `get_all_permission_codes()` still reads legacy `role.permission_codes` JSONField alongside new `RolePermissionPolicy` records — creates divergence if they disagree |
| **Recommendation** | Once all roles have been migrated to `RolePermissionPolicy`, remove the legacy JSONField fallback path |

---

## Permission Enforcement Architecture (Post-Fix)

```
HTTP Request
    │
    ▼
IsAuthenticated (DRF built-in)
    │
    ▼
IsTenantUser (common.serializers) — blocks cross-tenant access
    │
    ▼
HasActionPermission (permissions.permission_classes)
    │  ├── Wildcard check: PermissionResolver._is_wildcard(user) → pass-through for system admins
    │  ├── Method→Flag mapping: GET→can_view, POST→can_create, PUT/PATCH→can_edit, DELETE→can_delete
    │  ├── Approval action check: approve/reject/disburse/... → can_approve + approval_limit
    │  └── Reads view.permission_module + view.permission_page class attrs
    │
    ▼
ScopedModelViewSet.get_queryset() — scope filtering (own_records / own_branch / global)
    │
    ▼
Business Logic / Serializer
```

```
React Route
    │
    ▼
<ProtectedRoute requiredPermission="code">
    │  ├── Check: isAuthenticated
    │  ├── Check: isWildcard = permissionService.hasGlobalScope() && isSuperUser()
    │  └── Check: permissionService.hasPermission(requiredPermission)
    │
    ▼
Page Component
    │  └── usePermission(code) hooks for in-page button/action visibility
    │
    ▼  (for Dashboard Builder)
validateTemplateModules() — checks widget modules against rolePermissionService policy
```

---

## Permission Codes Referenced

| Code | Used In |
|---|---|
| `user-list` | `/admin/users`, `/admin/dashboard-builder`, `/admin/dashboard-assignment` |
| `branch-list` | `/admin/branches` |
| `branch-create` | `/admin/branches/create` |
| `branch-view-detail` | `/admin/branches/:id/view` |
| `form-list` | `/admin/forms`, `/admin/submissions` |
| `workflow-list` | `/admin/workflows` |
| `workflow-create` | `/admin/workflows/new` |
| `workflow-edit` | `/admin/workflows/:workflowId` |
| `client-list` | `/clients` |
| `classification-list` | `/clients/classifications` |

---

## Files Modified This Session

| File | Change |
|---|---|
| `erp-backend/phoenix_erp/src/dashboards/views.py` | `AllowAny` → `[IsAuthenticated, IsTenantUser]` |
| `erp-backend/phoenix_erp/src/permissions/permission_classes.py` | **NEW** — `HasActionPermission` DRF permission class |
| `erp-backend/phoenix_erp/src/common/views.py` | Added `HasActionPermission` dynamic append in `get_permissions()` |
| `erp-backend/phoenix_erp/src/loans/views.py` | `LoanAccountViewSet`: added `permission_module`/`permission_page`; hardened `approve()` and `reject()` |
| `erp-frontend/src/components/auth/ProtectedRoute.tsx` | Removed hardcoded `SUPERUSER_ROLES`; replaced with runtime `permissionService` check |
| `erp-frontend/src/pages/admin/DashboardBuilderPage.tsx` | Full rewrite with API-backed CRUD and role permission validation |
| `erp-frontend/src/App.tsx` | Added `/admin/dashboard-builder` route; added `requiredPermission` to 5 admin routes |
