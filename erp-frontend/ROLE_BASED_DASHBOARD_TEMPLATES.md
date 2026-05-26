# Role-Based Dashboard Templates Implementation

## Overview

This document describes the implementation of Task 11: Role-Based Dashboard Templates for the Phoenix ERP system. The implementation provides predefined dashboard templates for each user role with role-specific module visibility, stats calculation, and template inheritance.

## Architecture

### Core Components

1. **Dashboard Template Types** (`src/types/dashboardTemplates.ts`)
   - Defines interfaces for dashboard templates, stats cards, quick actions, and widgets
   - Provides type safety for template configuration and inheritance

2. **Dashboard Template Data** (`src/data/dashboardTemplates.ts`)
   - Contains predefined templates for all 5 user roles
   - Includes role permission mappings and module visibility configurations
   - Implements template inheritance from base template

3. **Dashboard Template Engine** (`src/services/dashboardTemplateEngine.ts`)
   - Generates role-specific templates with permission filtering
   - Calculates dynamic stats based on module access
   - Handles template inheritance and customization

4. **Role-Based Dashboard Components**
   - `RoleBasedDashboardTemplate.tsx` - Main template renderer
   - `RoleBasedDashboardSelector.tsx` - Template selector for demo/testing
   - Updated `RoleBasedDashboard.tsx` - Uses new template system

## User Roles and Templates

### 1. Director Template
- **Full System Access**: All modules and administrative privileges
- **Stats Cards**: 8 comprehensive metrics including system health, revenue, users
- **Theme**: Purple (#6366f1) - Executive/leadership theme
- **Quick Actions**: User management, financial reports, system settings, roles & permissions
- **Modules**: Financial, Student Services, Operations, Administration

### 2. Principal Template
- **Academic Leadership**: Student services and operations focus
- **Stats Cards**: 6 metrics focused on students, collections, approvals
- **Theme**: Blue (#3b82f6) - Academic theme
- **Quick Actions**: Student entitlements, invoice approval, payment approval, academic reports
- **Modules**: Student Services, Financial, Operations

### 3. Administrator Template
- **System Administration**: User and system management focus
- **Stats Cards**: 5 metrics focused on system health, users, revenue
- **Theme**: Gray (#6b7280) - Technical/system theme
- **Quick Actions**: User management, system settings, audit logs, branch management
- **Modules**: Administration, Financial, Student Services (secondary)

### 4. Registrar Template
- **Student Services Focus**: Entitlements and academic records
- **Stats Cards**: 4 metrics focused on students, entitlements, fee collection
- **Theme**: Green (#059669) - Academic services theme
- **Quick Actions**: Student entitlements, fee structures, bulk entitlements, statements
- **Modules**: Student Services (primary), Financial (secondary)
- **Simplified UI**: No system alerts, focused activity feed

### 5. Officer Template
- **Operational Tasks**: Daily operations and data entry
- **Stats Cards**: 4 essential operational metrics
- **Theme**: Yellow (#f59e0b) - Operational theme
- **Quick Actions**: Create invoice, record payment, daily posting, student lookup
- **Modules**: Financial, Student Services (primary), Operations (secondary)
- **Simplified UI**: No module stats, minimal alerts

## Key Features

### Template Inheritance System
- **Base Template**: Common configuration inherited by all roles
- **Role Customizations**: Role-specific overrides and additions
- **Merge Strategy**: Template-specific content takes precedence over base content

### Permission-Based Filtering
- **Stats Cards**: Filtered based on user's page permissions
- **Quick Actions**: Only show actions user has permission to perform
- **Widgets**: Hide widgets for inaccessible functionality
- **Modules**: Show only modules user has access to

### Dynamic Stats Calculation
- **Role-Specific Limits**: Different roles see different numbers of stats
  - Director: 8 stats (comprehensive view)
  - Principal: 6 stats (leadership view)
  - Administrator: 5 stats (system view)
  - Registrar: 4 stats (student-focused view)
  - Officer: 4 stats (operational view)
- **Priority-Based Sorting**: Higher priority stats shown first
- **Category-Based Grouping**: Stats grouped by functional categories

### Module Visibility Configuration
- **Primary Modules**: Main modules shown prominently
- **Secondary Modules**: Additional modules shown in secondary position
- **Hidden Modules**: Modules completely hidden from role
- **Module Ordering**: Role-specific ordering of modules

## Implementation Details

### Template Generation Process
1. **Role Validation**: Verify role exists in system
2. **Permission Loading**: Load role's permissions from Phoenix Access Table
3. **Content Filtering**: Filter stats, actions, and widgets by permissions
4. **Dynamic Stats**: Calculate role-specific stats based on module access
5. **Template Merging**: Combine base template with role customizations
6. **Final Assembly**: Return complete dashboard template

### Stats Card System
- **Base Stats Pool**: Common stats available to all roles
- **Role-Specific Stats**: Additional stats specific to certain roles
- **Permission Filtering**: Only show stats user can access
- **Priority Sorting**: Display most important stats first
- **Dynamic Values**: Real-time data integration (mock data in current implementation)

### Quick Actions System
- **Primary Actions**: Most important actions shown prominently
- **Secondary Actions**: Additional actions in compact format
- **Permission Gating**: Actions filtered by user permissions
- **Role Relevance**: Actions prioritized by role responsibilities

## Usage Examples

### Basic Usage
```typescript
import { RoleBasedDashboardTemplate } from './components/dashboard/RoleBasedDashboardTemplate';

// Use with current user's selected role
<RoleBasedDashboardTemplate />

// Use with specific role
<RoleBasedDashboardTemplate role="Director" />
```

### Template Engine Usage
```typescript
import { dashboardTemplateEngine } from './services/dashboardTemplateEngine';

// Generate template for specific role
const template = dashboardTemplateEngine.generateTemplateForRole('Registrar');

// Check module visibility
const isVisible = moduleVisibilityService.isModuleVisible('Officer', 'administration');
```

### Demo/Testing Usage
```typescript
import { RoleBasedDashboardSelector } from './components/dashboard/RoleBasedDashboardSelector';

// Interactive role selector for testing
<RoleBasedDashboardSelector 
  defaultRole="Director"
  showRoleSelector={true}
/>
```

## Testing

The implementation includes comprehensive tests covering:
- Template generation for all roles
- Permission-based filtering
- Module visibility logic
- Template inheritance
- Stats card scaling
- Role-specific customizations

Run tests with:
```bash
npm test -- --run src/components/dashboard/__tests__/RoleBasedDashboardTemplate.test.tsx
```

## Integration with Existing System

### Authentication Context
- Integrates with existing `AuthContext` for user and role information
- Uses `selectedRole` from role selection system
- Falls back to appropriate default role if none selected

### Navigation System
- Uses existing `navigationModules` data structure
- Filters modules based on role permissions
- Maintains existing navigation patterns and routing

### Permission System
- Built on Phoenix Software Access Table requirements
- Uses existing permission types and page definitions
- Integrates with role-based access control system

## Future Enhancements

### Admin Dashboard Builder
- Drag-and-drop interface for customizing templates
- Widget library for adding new dashboard components
- Template versioning and rollback functionality

### Real-Time Data Integration
- Connect stats cards to actual backend APIs
- Real-time updates for dashboard metrics
- Caching and performance optimization

### User Customization
- Allow users to customize their dashboard layout
- Save user preferences for dashboard configuration
- Personal widget arrangements and visibility settings

### Advanced Analytics
- Dashboard usage analytics for admins
- Performance metrics for dashboard components
- User engagement tracking and optimization

## Conclusion

The Role-Based Dashboard Templates system successfully implements the requirements for Task 11, providing:

1. ✅ **Predefined dashboard templates** for each user role (Director, Principal, Administrator, Registrar, Officer)
2. ✅ **Stats card system** that scales based on module permissions
3. ✅ **Role-specific module visibility** and stats calculation
4. ✅ **Template inheritance system** (base template + role customizations)

The implementation is fully tested, integrates with the existing system architecture, and provides a foundation for future dashboard customization features.