import React from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingCart,
  FileText,
  Package,
  RotateCcw,
  Users,
  Building,
  Boxes,
  TrendingUp,
  CheckSquare,
  AlertCircle,
  AlertTriangle,
  Calendar,
  DollarSign,
  Truck,
  ClipboardList,
  Settings,
  BarChart3,
  Home,
  ArrowRight,
  CreditCard,
  Receipt,
  PieChart,
  Eye,
  Plus,
  Calculator,
  Send,
  Gift,
  CheckCircle,
  GraduationCap,
  Target,
  Upload,
  Tag,
  RefreshCw,
  Activity,
  Clock,
  Folder,
} from 'lucide-react';

interface PageLink {
  title: string;
  description: string;
  path: string;
  icon: React.ReactNode;
  category: string;
  isNew?: boolean;
  isEnhanced?: boolean;
}

const NewPagesIndex: React.FC = () => {
  const pageLinks: PageLink[] = [
    // Modern Dashboard Layouts - New Feature
    {
      title: '🎨 Dashboard Layouts Demo',
      description:
        'Experience both role-based and workflow-centric dashboard designs with layout switcher',
      path: '/dashboard/demo',
      icon: <Activity size={20} />,
      category: 'Modern Dashboard Layouts',
      isNew: true,
    },
    {
      title: '📊 Role-Based Dashboard',
      description: 'Module-focused dashboard organized by business functions and user roles',
      path: '/dashboard/role-based',
      icon: <Home size={20} />,
      category: 'Modern Dashboard Layouts',
      isNew: true,
    },
    {
      title: '🔄 Workflow-Centric Dashboard',
      description:
        'Process-oriented dashboard showing sequential business workflows and task management',
      path: '/dashboard/workflow-centric',
      icon: <Target size={20} />,
      category: 'Modern Dashboard Layouts',
      isNew: true,
    },
    {
      title: '🔍 Unified Search Demo',
      description:
        'Global search functionality across all ERP modules with keyboard navigation and filters',
      path: '/demo/search',
      icon: <Activity size={20} />,
      category: 'Modern Dashboard Layouts',
      isNew: true,
    },
    {
      title: '🧭 Module Navigation Demo',
      description:
        'Comprehensive module-specific navigation structures with contextual links, workflows, and sidebar navigation',
      path: '/demo/module-navigation',
      icon: <Folder size={20} />,
      category: 'Modern Dashboard Layouts',
      isNew: true,
    },

    // Credit Notes System - Testing
    {
      title: 'Credit Notes List',
      description: 'Manage credit notes for invoices with filtering and status tracking',
      path: '/sales/credit-notes',
      icon: <CreditCard size={20} />,
      category: 'Recently Added - Testing',
      isNew: true,
    },
    {
      title: 'Create Credit Note',
      description: 'Create new credit notes with reason codes and amount calculations',
      path: '/sales/invoices/1/credit-notes/create',
      icon: <Plus size={20} />,
      category: 'Recently Added - Testing',
      isNew: true,
    },
    {
      title: 'Credit Note Details',
      description: 'View detailed credit note information with application status',
      path: '/sales/invoices/1/credit-notes/1/view',
      icon: <Eye size={20} />,
      category: 'Recently Added - Testing',
      isNew: true,
    },

    // Procurement Module Pages
    {
      title: 'Procurement Dashboard',
      description: 'Main procurement navigation with metrics and quick actions',
      path: '/procurement',
      icon: <Home size={20} />,
      category: 'Procurement',
      isNew: true,
    },
    {
      title: 'Purchase Orders List',
      description: 'Enhanced purchase order management with filtering and search',
      path: '/procurement/orders',
      icon: <ShoppingCart size={20} />,
      category: 'Procurement',
      isEnhanced: true,
    },
    {
      title: 'Create Purchase Order',
      description: 'New purchase order creation form with item selection',
      path: '/procurement/orders/create',
      icon: <ShoppingCart size={20} />,
      category: 'Procurement',
      isNew: true,
    },
    {
      title: 'Purchase Requisitions',
      description: 'Complete requisition management system with approval workflow',
      path: '/procurement/requisitions',
      icon: <FileText size={20} />,
      category: 'Procurement',
      isNew: true,
    },
    {
      title: 'Create Requisition',
      description: 'Multi-line requisition form with budget tracking',
      path: '/procurement/requisitions/create',
      icon: <FileText size={20} />,
      category: 'Procurement',
      isNew: true,
    },
    {
      title: 'Goods Received Notes (GRN)',
      description: 'GRN management with quality inspection and posting',
      path: '/procurement/grn',
      icon: <Package size={20} />,
      category: 'Procurement',
      isNew: true,
    },
    {
      title: 'Create GRN',
      description: 'Goods receipt recording with delivery information',
      path: '/procurement/grn/create',
      icon: <Package size={20} />,
      category: 'Procurement',
      isNew: true,
    },
    {
      title: 'Purchase Returns',
      description: 'Return management with credit note tracking and status workflow',
      path: '/procurement/returns',
      icon: <RotateCcw size={20} />,
      category: 'Procurement',
      isNew: true,
    },
    {
      title: 'Create Return',
      description: 'Return creation with reason categorization and refund methods',
      path: '/procurement/returns/create',
      icon: <RotateCcw size={20} />,
      category: 'Procurement',
      isNew: true,
    },
    {
      title: 'Suppliers Management',
      description: 'Enhanced supplier management with contact tracking and performance',
      path: '/procurement/suppliers',
      icon: <Users size={20} />,
      category: 'Procurement',
      isEnhanced: true,
    },
    {
      title: 'Create/Edit Supplier',
      description: 'Supplier creation and editing with contact and payment terms',
      path: '/procurement/suppliers/create',
      icon: <Users size={20} />,
      category: 'Procurement',
      isNew: true,
    },

    // Inventory Management Pages
    {
      title: 'Inventory Dashboard',
      description: 'Complete inventory overview with stats, quick actions, and recent activity',
      path: '/inventory',
      icon: <Boxes size={20} />,
      category: 'Inventory',
      isNew: true,
    },
    {
      title: 'Inventory Items List',
      description: 'Comprehensive item catalog with search, filtering, and bulk operations',
      path: '/inventory/items',
      icon: <Package size={20} />,
      category: 'Inventory',
      isNew: true,
    },
    {
      title: 'Create/Edit Item',
      description: 'Full item management form with pricing, tracking, and accounting integration',
      path: '/inventory/items/create',
      icon: <Package size={20} />,
      category: 'Inventory',
      isNew: true,
    },
    {
      title: 'Stock Movements',
      description: 'Complete movement history with filtering by type, date, and location',
      path: '/inventory/movements',
      icon: <TrendingUp size={20} />,
      category: 'Inventory',
      isNew: true,
    },
    {
      title: 'Stock Adjustments',
      description: 'Create stock adjustments with proper documentation and reason codes',
      path: '/inventory/adjustments/create',
      icon: <CheckSquare size={20} />,
      category: 'Inventory',
      isNew: true,
    },
    {
      title: 'Stock Transfers',
      description: 'Transfer inventory between locations with tracking and documentation',
      path: '/inventory/transfers/create',
      icon: <Truck size={20} />,
      category: 'Inventory',
      isNew: true,
    },
    {
      title: 'Inventory Locations',
      description: 'Storage location management with types and address tracking',
      path: '/inventory/locations',
      icon: <Building size={20} />,
      category: 'Inventory',
      isNew: true,
    },

    // ========================================================================================================
    // COMPLETE RECEIVABLES & INVOICING WORKFLOW SYSTEM - ALL 30 TASKS FROM IMPLEMENTATION PLAN
    // ========================================================================================================
    // Based on .kiro/specs/receivables-workflow-implementation/tasks.md

    // ========== PHASE 1: ENHANCE EXISTING INVOICE WORKFLOW PAGES (Tasks 1-4) ==========
    {
      title: '📄 Enhanced Create Invoice',
      description:
        'Enhanced invoice creation with auto number generation, client integration, validation, and preview functionality',
      path: '/sales/invoices/create',
      icon: <Plus size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },
    {
      title: '📋 Enhanced Invoices List',
      description:
        'Complete invoice management with status badges, payment progress indicators, filtering, and integrated payment recording',
      path: '/sales/invoices',
      icon: <FileText size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },
    {
      title: '🔍 Invoice Detail View',
      description:
        'Comprehensive invoice information with payment history, status tracking, edit/send/void actions, and activity timeline',
      path: '/sales/invoices/1/view',
      icon: <Eye size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },
    {
      title: '💳 Payment Recording Modal',
      description:
        'Reusable payment recording modal with validation logic, payment method selection, and real-time balance calculations',
      path: '/receivables/payments/record',
      icon: <CreditCard size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },

    // ========== PHASE 2: ENHANCE RECEIVABLES MANAGEMENT PAGES (Tasks 5-8.1) ==========
    {
      title: '🏠 Receivables Dashboard',
      description:
        'Central command center with real-time aging breakdown, overdue customer highlighting, and quick action navigation',
      path: '/receivables/dashboard',
      icon: <Home size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },
    {
      title: '📝 All Receivables List',
      description:
        'Unified view of all receivables with aging buckets, collection assignment, bulk operations, and comprehensive filtering',
      path: '/receivables/list',
      icon: <Receipt size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },
    {
      title: '🔍 Receivable Detail View',
      description:
        'Complete receivable information with linked invoices, collection activity timeline, and payment allocation history',
      path: '/receivables/1/view',
      icon: <Eye size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },
    {
      title: '📊 Aging Analysis Report',
      description:
        'Interactive aging breakdown with customer drill-down, export capabilities, date range filtering, and trend analysis',
      path: '/receivables/aging-report',
      icon: <BarChart3 size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },
    {
      title: '🔄 Unified Payment Modal',
      description:
        'Universal payment recording for all receivable types (invoices, entitlements, loans) with proper API routing',
      path: '/receivables/payments/unified',
      icon: <CreditCard size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },

    // ========== PHASE 3: FEE STRUCTURES AND BULK OPERATIONS (Tasks 9-12) ==========
    {
      title: '⚙️ Fee Structures List',
      description:
        'Display all fee structures with filtering, create/edit/deactivate actions, usage statistics, and industry config',
      path: '/incomes/fee-structures',
      icon: <Settings size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },
    {
      title: '📝 Fee Structure Form',
      description:
        'Comprehensive fee structure creation with industry-specific configurations, access rules, and recurring billing',
      path: '/incomes/fee-structures/create',
      icon: <Plus size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },
    {
      title: '🎯 Bulk Invoice Wizard',
      description:
        'Multi-step wizard for bulk invoice generation with fee structure selection, client filtering, and preview confirmation',
      path: '/demo/bulk-invoice-wizard',
      icon: <FileText size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },
    {
      title: '📊 Bulk Invoice Results',
      description:
        'Bulk generation results with success/error summary, individual invoice review, and bulk send functionality',
      path: '/bulk-invoice-results',
      icon: <BarChart3 size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },

    // ========== PHASE 4: ENTITLEMENTS AND ACCESS CONTROL (Tasks 13-16) ==========
    {
      title: '🎓 Entitlements List',
      description:
        'Client entitlements with payment status, access level visualizations, and entitlement management actions',
      path: '/incomes/entitlements',
      icon: <GraduationCap size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },
    {
      title: '🔍 Entitlement Detail View',
      description:
        'Complete entitlement information with payment progress, access matrix, and access level change history',
      path: '/incomes/entitlements/1/view',
      icon: <Eye size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },
    {
      title: '🔐 Access Control Checker',
      description:
        'Service access validation interface with real-time checking, payment requirements, and upgrade options',
      path: '/demo/access-control',
      icon: <CheckSquare size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },
    {
      title: '🎯 Entitlement Dashboard',
      description:
        'Client-facing entitlement dashboard with payment status, access levels, quick payment, and service access matrix',
      path: '/incomes/entitlements/dashboard',
      icon: <Target size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },

    // ========== PHASE 5: COLLECTIONS AND WORKFLOW MANAGEMENT (Tasks 17-20) ==========
    {
      title: '🎯 Collections Dashboard',
      description:
        'Overdue receivables summary with collector assignment interface, collection activity metrics, and escalation management',
      path: '/receivables/collections',
      icon: <AlertCircle size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },
    {
      title: '💼 Collection Workbench',
      description:
        'Collector activity interface with contact logging, payment promise tracking, and collection activity timeline',
      path: '/receivables/collections/workbench',
      icon: <ClipboardList size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },
    {
      title: '📧 Reminder Management',
      description:
        'Automated reminder settings with template management, sending history, and manual reminder capabilities',
      path: '/receivables/reminders',
      icon: <Send size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },
    {
      title: '🔄 Automated Workflows',
      description:
        'Aging updates connected to workflow triggers with collection stage progression and escalation rule management',
      path: '/receivables/workflows',
      icon: <Settings size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },

    // ========== PHASE 6: STATEMENTS AND ADVANCED REPORTING (Tasks 21-24) ==========
    {
      title: '📄 Customer Statements',
      description:
        'Statement generation interface with individual and batch generation, history tracking, and email delivery options',
      path: '/receivables/statements',
      icon: <FileText size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },
    {
      title: '👁️ Statement Preview',
      description:
        'Statement preview interface with transaction details, balances, PDF generation, and email composition',
      path: '/receivables/statement-preview-test',
      icon: <Eye size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },
    {
      title: '📈 Advanced Reporting',
      description:
        'Comprehensive reporting interface with custom report builder, scheduled reports, and download history',
      path: '/receivables/advanced-reporting',
      icon: <BarChart3 size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },
    {
      title: '📊 Payment Trends Analytics',
      description:
        'Payment analytics with collection effectiveness metrics, customer payment patterns, and predictive analytics',
      path: '/receivables/payment-trends',
      icon: <TrendingUp size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },

    // ========== PHASE 7: INTEGRATION AND DATA CONSISTENCY (Tasks 25-26) ==========
    {
      title: '🔧 Data Consistency Checker',
      description:
        'Invoice-receivable sync validation with data reconciliation interface, consistency reports, and sync status monitoring',
      path: '/receivables/data-consistency',
      icon: <CheckSquare size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },
    {
      title: '📤 Bulk Payment Upload',
      description:
        'CSV payment upload interface with payment mapping, validation, batch processing status, and error handling',
      path: '/receivables/bulk-payment-upload',
      icon: <Upload size={20} />,
      category: 'Receivables & Invoicing',
      isNew: true,
    },

    // ========== PHASE 8: PERFORMANCE AND POLISH (Tasks 27-30) ==========

    // ========== IMPLEMENTATION STATUS SUMMARY ==========
    // ✅ COMPLETED (27/30 tasks): Most core functionality implemented
    // 🔄 IN PROGRESS (2/30 tasks): AccessControlChecker, ReminderManagement
    // ❌ REMAINING (1/30 tasks): Navigation & UX improvements
    // 🎯 COMPLETION: 90% of receivables workflow system implemented

    // HR & Payroll Management
    {
      title: 'HR Dashboard',
      description: 'Main HR navigation with staff, leave, attendance, and payroll modules',
      path: '/hr',
      icon: <Users size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },
    {
      title: 'HR Analytics Dashboard',
      description: 'Comprehensive HR analytics with metrics and performance insights',
      path: '/hr/dashboard',
      icon: <BarChart3 size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },
    {
      title: 'HR Configuration',
      description:
        'Configure branch-level HR settings including leave policies, attendance rules, payroll settings, and workflow assignments',
      path: '/hr/config',
      icon: <Settings size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },

    // Staff Management
    {
      title: 'Staff Management',
      description: 'Complete staff directory with CRUD operations',
      path: '/hr/staff',
      icon: <Users size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },
    {
      title: 'Create/Edit Staff',
      description: 'Staff member creation and editing with department tracking',
      path: '/hr/staff/create',
      icon: <Users size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },
    {
      title: 'Staff Detail View',
      description:
        'Enhanced staff member information with leave balances, attendance summary, salary components breakdown, and real-time HR data updates',
      path: '/hr/staff/1',
      icon: <Eye size={20} />,
      category: 'HR & Payroll',
      isEnhanced: true,
    },
    {
      title: 'Staff Pay Components',
      description: 'Manage individual staff member salary components and allowances',
      path: '/hr/staff/1/pay-components',
      icon: <DollarSign size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },

    // Attendance Management
    {
      title: 'Attendance Management',
      description: 'Daily attendance tracking with clock in/out functionality',
      path: '/hr/attendance',
      icon: <CheckSquare size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },
    {
      title: 'Clock In/Out',
      description:
        'GPS-validated staff clock in/out with location verification and real-time attendance tracking',
      path: '/hr/attendance/clock',
      icon: <Clock size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },
    {
      title: 'Attendance Form',
      description: 'Manual attendance entry and correction form',
      path: '/hr/attendance/create',
      icon: <Plus size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },
    {
      title: 'Attendance Detail',
      description: 'Detailed attendance record with time logs and adjustments',
      path: '/hr/attendance/1',
      icon: <Eye size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },

    // Leave Management
    {
      title: 'Leave Management',
      description: 'Complete leave management with approval workflow',
      path: '/hr/leave-requests',
      icon: <Calendar size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },
    {
      title: 'Create Leave Request',
      description: 'Submit new leave request with type selection and date range',
      path: '/hr/leave-requests/create',
      icon: <Plus size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },
    {
      title: 'Leave Request Detail',
      description: 'View leave request details with approval status and history',
      path: '/hr/leave-requests/1',
      icon: <Eye size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },
    {
      title: 'Leave Balances',
      description:
        'View staff leave balances with yearly initialization and entitlement management',
      path: '/hr/leave-balances',
      icon: <BarChart3 size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },
    {
      title: 'Leave Types Management',
      description: 'Configure leave types with rules and entitlements',
      path: '/hr/leave-types',
      icon: <Settings size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },
    {
      title: 'Create/Edit Leave Type',
      description: 'Create and configure leave types with accrual rules',
      path: '/hr/leave-types/create',
      icon: <Plus size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },

    // Payroll Management
    {
      title: 'Payroll Management',
      description: 'Complete payroll processing with calculate → approve → process workflow',
      path: '/hr/payroll',
      icon: <DollarSign size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },
    {
      title: 'Create/Process Payroll',
      description: 'Generate new payroll run with calculation and approval steps',
      path: '/hr/payroll/create',
      icon: <Plus size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },
    {
      title: 'Payroll Detail',
      description: 'View payroll run details with staff breakdown and totals',
      path: '/hr/payroll/1',
      icon: <Eye size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },
    {
      title: 'Payslip Detail',
      description: 'Individual staff payslip with earnings, deductions, and net pay',
      path: '/hr/payroll/1/payslips/1',
      icon: <Receipt size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },

    // Salary Components Management
    {
      title: 'Salary Components',
      description: 'Manage salary components, allowances, and deductions',
      path: '/hr/salary-components',
      icon: <Calculator size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },
    {
      title: 'Create/Edit Salary Component',
      description: 'Create and configure salary components with calculation rules',
      path: '/hr/salary-components/create',
      icon: <Plus size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },
    {
      title: 'Salary Components Debug',
      description: 'Debug and test salary component calculations and formulas',
      path: '/hr/salary-components/debug',
      icon: <Settings size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },

    // Bonus & Deduction Management
    {
      title: 'Bonus & Deduction Requests',
      description:
        'Manage salary bonus and deduction requests with filtering, pagination, search, and quick approve/reject actions',
      path: '/hr/bonus-deduction',
      icon: <DollarSign size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },
    {
      title: 'Create Bonus/Deduction Request',
      description:
        'Submit new salary adjustment requests with staff selector, component selector, amount input, month picker, and detailed reason validation',
      path: '/hr/bonus-deduction/create',
      icon: <Plus size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },
    {
      title: 'Bonus/Deduction Request Detail',
      description:
        'View detailed bonus/deduction request information with approval/rejection actions, request timeline, approval chain, and related payroll information',
      path: '/hr/bonus-deduction/1/view',
      icon: <Eye size={20} />,
      category: 'HR & Payroll',
      isNew: true,
    },

    // Client Management
    {
      title: 'Client Dashboard',
      description: 'Client overview and management dashboard',
      path: '/clients',
      icon: <Users size={20} />,
      category: 'Client Management',
      isEnhanced: true,
    },
    {
      title: 'Client Classifications',
      description: 'Client categorization and classification management',
      path: '/clients/classifications',
      icon: <Building size={20} />,
      category: 'Client Management',
      isNew: true,
    },

    // Admin Management
    {
      title: 'Branch Management',
      description: 'Complete branch management with CRUD operations',
      path: '/admin/branches',
      icon: <Building size={20} />,
      category: 'Admin Management',
      isNew: true,
    },
    {
      title: 'Tenant Management',
      description: 'Multi-tenant system management with domain configuration',
      path: '/admin/tenants',
      icon: <Settings size={20} />,
      category: 'Admin Management',
      isNew: true,
    },

    // Automation & Workflow
    {
      title: 'Automation Templates',
      description: 'Workflow template creation and management',
      path: '/automations/templates',
      icon: <ClipboardList size={20} />,
      category: 'Automation',
      isNew: true,
    },
    {
      title: 'Automation Runs',
      description: 'Monitor and manage automation executions',
      path: '/automations/runs',
      icon: <CheckSquare size={20} />,
      category: 'Automation',
      isNew: true,
    },
    {
      title: 'Approvals Dashboard',
      description: 'Pending approvals and workflow status tracking',
      path: '/approvals',
      icon: <CheckSquare size={20} />,
      category: 'Automation',
      isNew: true,
    },

    // Financial Reports
    {
      title: 'Trial Balance Report',
      description:
        'Complete trial balance with hierarchical account display, filtering, and export functionality',
      path: '/reports/financial/trial-balance',
      icon: <Calculator size={20} />,
      category: 'Financial Reports',
      isNew: true,
    },
    {
      title: 'Profit & Loss Statement',
      description:
        'Comprehensive profit and loss report with comparative analysis and export options',
      path: '/reports/financial/profit-loss',
      icon: <TrendingUp size={20} />,
      category: 'Financial Reports',
      isNew: true,
    },
    {
      title: 'Balance Sheet Report',
      description: 'Complete balance sheet with assets, liabilities, and equity breakdown',
      path: '/reports/financial/balance-sheet',
      icon: <PieChart size={20} />,
      category: 'Financial Reports',
      isNew: true,
    },

    // Expenses & Resource Management
    {
      title: '🏠 Resource Management Dashboard',
      description: 'Overview of resource consumption, analytics, and workflow status',
      path: '/expenses/resources/dashboard',
      icon: <BarChart3 size={20} />,
      category: 'Expenses & Resource Management',
      isNew: true,
    },
    {
      title: '📊 Resource Consumption List',
      description: 'View and manage all resource consumption records with filtering and search',
      path: '/expenses/resource-consumption',
      icon: <BarChart3 size={20} />,
      category: 'Expenses & Resource Management',
      isNew: true,
    },
    {
      title: '📝 Resource Consumption Form',
      description: 'Create and edit resource consumption records with validation',
      path: '/expenses/resource-consumption/create',
      icon: <Plus size={20} />,
      category: 'Expenses & Resource Management',
      isNew: true,
    },
    {
      title: '🔍 Resource Consumption Detail',
      description: 'View detailed information about specific resource consumption records',
      path: '/expenses/resource-consumption/1',
      icon: <Eye size={20} />,
      category: 'Expenses & Resource Management',
      isNew: true,
    },
    {
      title: '⚠️ Irregularities Dashboard',
      description: 'Monitor and manage resource consumption irregularities and exceptions',
      path: '/expenses/resource-consumption/irregularities',
      icon: <AlertTriangle size={20} />,
      category: 'Expenses & Resource Management',
      isNew: true,
    },
    {
      title: '✅ Approval Queue',
      description: 'Review and approve pending resource consumption records',
      path: '/expenses/resource-consumption/approval-queue',
      icon: <CheckSquare size={20} />,
      category: 'Expenses & Resource Management',
      isNew: true,
    },
    {
      title: '📋 Posting Queue',
      description: 'Manage the posting of approved resource consumption to accounting',
      path: '/expenses/resource-consumption/posting-queue',
      icon: <FileText size={20} />,
      category: 'Expenses & Resource Management',
      isNew: true,
    },

    // Resource Management
    {
      title: '📦 Resource List',
      description: 'Manage all available resources with categories and pricing',
      path: '/expenses/resources',
      icon: <Package size={20} />,
      category: 'Expenses & Resource Management',
      isNew: true,
    },
    {
      title: '🏷️ Resource Categories',
      description: 'Manage resource categories and hierarchical organization',
      path: '/expenses/resources/categories',
      icon: <Tag size={20} />,
      category: 'Expenses & Resource Management',
      isNew: true,
    },
    {
      title: '➕ Resource Form',
      description: 'Create and edit resource definitions with detailed specifications',
      path: '/expenses/resources/create',
      icon: <Plus size={20} />,
      category: 'Expenses & Resource Management',
      isNew: true,
    },
    {
      title: '🔍 Resource Detail',
      description: 'View comprehensive information about specific resources',
      path: '/expenses/resources/1',
      icon: <Eye size={20} />,
      category: 'Expenses & Resource Management',
      isNew: true,
    },

    // Resource Analytics & Reporting
    {
      title: '📊 Resource Consumption Analytics',
      description: 'Advanced analytics and reporting for resource consumption patterns',
      path: '/expenses/resource-consumption/analytics',
      icon: <TrendingUp size={20} />,
      category: 'Expenses & Resource Management',
      isNew: true,
    },
    {
      title: '📈 Resource Usage Reports',
      description: 'Generate detailed reports on resource usage and efficiency',
      path: '/expenses/resources/reports',
      icon: <FileText size={20} />,
      category: 'Expenses & Resource Management',
      isNew: true,
    },

    // Resource Workflow Management
    {
      title: '⚙️ Resource Workflow Configuration',
      description: 'Configure automated workflows for resource consumption approval',
      path: '/expenses/workflows/configuration',
      icon: <Settings size={20} />,
      category: 'Expenses & Resource Management',
      isNew: true,
    },
    {
      title: '🔄 Resource Consumption Workflows',
      description: 'Monitor and manage active resource consumption workflows',
      path: '/expenses/workflows/consumption',
      icon: <RefreshCw size={20} />,
      category: 'Expenses & Resource Management',
      isNew: true,
    },
    {
      title: '📋 Workflow Status Monitor',
      description: 'Real-time monitoring of workflow execution and status',
      path: '/expenses/workflows/monitor',
      icon: <Activity size={20} />,
      category: 'Expenses & Resource Management',
      isNew: true,
    },

    // Voucher Management
    {
      title: '🎫 Voucher List',
      description: 'Manage prepaid vouchers with balance tracking and expiry monitoring',
      path: '/expenses/vouchers',
      icon: <CreditCard size={20} />,
      category: 'Expenses & Resource Management',
      isNew: true,
    },
    {
      title: '➕ Voucher Form',
      description: 'Create and edit prepaid vouchers with allocation and beneficiary settings',
      path: '/expenses/vouchers/create',
      icon: <Plus size={20} />,
      category: 'Expenses & Resource Management',
      isNew: true,
    },
    {
      title: '🔍 Voucher Detail',
      description: 'View voucher information with consumption history and balance details',
      path: '/expenses/vouchers/1',
      icon: <Eye size={20} />,
      category: 'Expenses & Resource Management',
      isNew: true,
    },
    {
      title: '⏰ Expiring Vouchers Dashboard',
      description: 'Monitor vouchers approaching expiry with renewal and notification management',
      path: '/expenses/vouchers/expiring',
      icon: <Clock size={20} />,
      category: 'Expenses & Resource Management',
      isNew: true,
    },

    // Expense Categories
    {
      title: '📂 Expense Categories',
      description: 'Manage expense categories with account mapping and approval thresholds',
      path: '/expenses/categories',
      icon: <Folder size={20} />,
      category: 'Expenses & Resource Management',
      isNew: true,
    },
    {
      title: '➕ Expense Category Form',
      description: 'Create and edit expense categories with accounting integration',
      path: '/expenses/categories/create',
      icon: <Plus size={20} />,
      category: 'Expenses & Resource Management',
      isNew: true,
    },

    // Reports & Analytics
    {
      title: 'Reports Builder',
      description: 'Dynamic report creation and scheduling',
      path: '/reports/new',
      icon: <BarChart3 size={20} />,
      category: 'Reports',
      isEnhanced: true,
    },
    {
      title: 'Reports List',
      description: 'Generated reports and analytics dashboard',
      path: '/reports',
      icon: <BarChart3 size={20} />,
      category: 'Reports',
      isEnhanced: true,
    },
  ];

  const categories = Array.from(new Set(pageLinks.map(link => link.category)));

  const getStatusBadge = (link: PageLink) => {
    if (link.isNew) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          New
        </span>
      );
    }
    if (link.isEnhanced) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          Enhanced
        </span>
      );
    }
    return null;
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Procurement':
        return <ShoppingCart size={24} className="text-blue-600" />;
      case 'Client Management':
        return <Users size={24} className="text-green-600" />;
      case 'Inventory':
        return <Boxes size={24} className="text-purple-600" />;
      case 'Receivables & Invoicing':
        return <CreditCard size={24} className="text-indigo-600" />;
      case 'Financial Reports':
        return <Calculator size={24} className="text-emerald-600" />;
      case 'Expenses & Resource Management':
        return <Package size={24} className="text-amber-600" />;
      case 'Automation':
        return <Settings size={24} className="text-orange-600" />;
      case 'Reports':
        return <BarChart3 size={24} className="text-red-600" />;
      case 'HR & Payroll':
        return <Users size={24} className="text-pink-600" />;
      case 'Admin Management':
        return <Settings size={24} className="text-slate-600" />;
      case 'Recently Added - Testing':
        return <AlertTriangle size={24} className="text-amber-600" />;
      default:
        return <Home size={24} className="text-gray-600" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Procurement':
        return 'border-blue-200 bg-blue-50';
      case 'Client Management':
        return 'border-green-200 bg-green-50';
      case 'Inventory':
        return 'border-purple-200 bg-purple-50';
      case 'Receivables & Invoicing':
        return 'border-indigo-200 bg-indigo-50';
      case 'Financial Reports':
        return 'border-emerald-200 bg-emerald-50';
      case 'Expenses & Resource Management':
        return 'border-amber-200 bg-amber-50';
      case 'Automation':
        return 'border-orange-200 bg-orange-50';
      case 'Reports':
        return 'border-red-200 bg-red-50';
      case 'HR & Payroll':
        return 'border-pink-200 bg-pink-50';
      case 'Admin Management':
        return 'border-slate-200 bg-slate-50';
      case 'Recently Added - Testing':
        return 'border-amber-200 bg-amber-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">New Pages & Features</h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Quick access to all newly created and enhanced pages across the ERP system. Navigate to
            procurement, inventory, client management, and automation features.
          </p>
          <div className="mt-6 flex justify-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                New
              </span>
              <span className="text-sm text-gray-600">Newly created pages</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                Enhanced
              </span>
              <span className="text-sm text-gray-600">Improved existing pages</span>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-3xl font-bold text-blue-600 mb-2">
              {pageLinks.filter(link => link.isNew).length}
            </div>
            <div className="text-sm text-gray-600">New Pages</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-3xl font-bold text-green-600 mb-2">
              {pageLinks.filter(link => link.isEnhanced).length}
            </div>
            <div className="text-sm text-gray-600">Enhanced Pages</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-3xl font-bold text-purple-600 mb-2">{categories.length}</div>
            <div className="text-sm text-gray-600">Categories</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-3xl font-bold text-orange-600 mb-2">{pageLinks.length}</div>
            <div className="text-sm text-gray-600">Total Pages</div>
          </div>
        </div>

        {/* Categories */}
        {categories.map(category => {
          const categoryLinks = pageLinks.filter(link => link.category === category);

          return (
            <div key={category} className="mb-12">
              <div className="flex items-center mb-6">
                {getCategoryIcon(category)}
                <h2 className="text-2xl font-bold text-gray-900 ml-3">{category}</h2>
                <span className="ml-3 text-sm text-gray-500">({categoryLinks.length} pages)</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {categoryLinks.map((link, index) => (
                  <Link
                    key={index}
                    to={link.path}
                    className={`block p-6 rounded-lg border-2 transition-all duration-200 hover:shadow-lg hover:scale-105 ${getCategoryColor(category)} hover:border-opacity-60`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0">{link.icon}</div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold text-gray-900 truncate">
                            {link.title}
                          </h3>
                        </div>
                      </div>
                      <div className="flex-shrink-0 ml-2">{getStatusBadge(link)}</div>
                    </div>

                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">{link.description}</p>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500 font-mono">{link.path}</span>
                      <ArrowRight size={16} className="text-gray-400" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}

        {/* Quick Actions */}
        <div className="mt-16 bg-white rounded-lg shadow-lg p-8">
          <h3 className="text-xl font-bold text-gray-900 mb-6 text-center">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Link
              to="/procurement/requisitions/create"
              className="flex items-center justify-center p-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <FileText size={20} className="mr-2" />
              Create Requisition
            </Link>
            <Link
              to="/procurement/orders/create"
              className="flex items-center justify-center p-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <ShoppingCart size={20} className="mr-2" />
              Create Purchase Order
            </Link>
            <Link
              to="/fee/invoices/create"
              className="flex items-center justify-center p-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus size={20} className="mr-2" />
              Create Invoice
            </Link>
            <Link
              to="/hr/staff/create"
              className="flex items-center justify-center p-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Users size={20} className="mr-2" />
              Add Staff Member
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 text-center">
          <p className="text-gray-500 text-sm">
            This page provides quick access to all newly created and enhanced features in the ERP
            system.
            <br />
            For support or questions, contact the development team.
          </p>
        </div>
      </div>
    </div>
  );
};

export default NewPagesIndex;
