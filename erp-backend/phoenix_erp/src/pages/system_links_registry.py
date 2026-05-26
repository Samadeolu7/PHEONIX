# pages/system_links_registry.py
"""
Centralized system for managing all hardcoded application links
Provides categorized links for dashboard builder and homepage navigation
"""

from dataclasses import dataclass
from typing import List, Optional
from enum import Enum


class LinkCategory(Enum):
    """Categories for organizing system links"""
    DASHBOARD = "dashboard"
    ACCOUNTING = "accounting"
    TRANSACTIONS = "transactions"
    FINANCIAL_OPERATIONS = "financial_operations"
    PRODUCTS = "products"
    CLIENTS = "clients"
    STUDENT_MANAGEMENT = "student_management"
    FORMS = "forms"
    WORKFLOWS = "workflows"
    REPORTS = "reports"
    AUTOMATION = "automation"
    APPROVALS = "approvals"
    OPERATIONS = "operations"
    HR = "hr"
    PROCUREMENT = "procurement"
    INVENTORY = "inventory"
    ASSETS = "assets"
    ADMIN = "admin"
    SETTINGS = "settings"
    USER_MANAGEMENT = "user_management"
    SYSTEM = "system"


@dataclass
class SystemLink:
    """Represents a system link with metadata"""
    code: str
    title: str
    description: str
    url_path: str
    icon: str
    category: LinkCategory
    requires_auth: bool = True
    required_roles: Optional[List[str]] = None
    is_admin_only: bool = False
    parent_code: Optional[str] = None


class SystemLinksRegistry:
    """Registry of all system links for easy access"""
    
    _links = [
        # ── Dashboard ──────────────────────────────────────────────────────────
        SystemLink(code="dashboard-home", title="Dashboard", description="Main dashboard view",
                   url_path="/dashboard", icon="dashboard", category=LinkCategory.DASHBOARD),
        SystemLink(code="dashboard-select", title="Dashboard Selection",
                   description="Browse and select a dashboard",
                   url_path="/dashboard/select", icon="view_quilt", category=LinkCategory.DASHBOARD),
        SystemLink(code="dashboard-setup", title="Dashboard Builder",
                   description="Create and edit custom dashboards",
                   url_path="/dashboard/new/edit", icon="settings", category=LinkCategory.DASHBOARD,
                   required_roles=["admin", "sys_admin"]),

        # ── Accounting ─────────────────────────────────────────────────────────
        SystemLink(code="accounts-list", title="Chart of Accounts",
                   description="View and manage all accounts",
                   url_path="/accounts", icon="account-balance", category=LinkCategory.ACCOUNTING),
        SystemLink(code="accounts-new", title="Create Account",
                   description="Add a new account to the chart of accounts",
                   url_path="/accounts/new", icon="add-circle", category=LinkCategory.ACCOUNTING,
                   required_roles=["admin", "sys_admin"]),
        SystemLink(code="account-categories", title="Account Categories",
                   description="Manage account categories and workflows",
                   url_path="/accounts/categories", icon="category", category=LinkCategory.ACCOUNTING,
                   required_roles=["admin", "sys_admin"]),
        SystemLink(code="accounts-hierarchy", title="Account Hierarchy",
                   description="View the chart of accounts hierarchy",
                   url_path="/accounts/hierarchy", icon="account_tree", category=LinkCategory.ACCOUNTING),
        SystemLink(code="accounts-ledger-search", title="Ledger Search",
                   description="Search across all account ledgers",
                   url_path="/accounts/ledger-search", icon="search", category=LinkCategory.ACCOUNTING),

        # ── Transactions / Journal ──────────────────────────────────────────────
        SystemLink(code="transactions-list", title="Journal Entries",
                   description="View and create journal entries",
                   url_path="/transactions", icon="receipt", category=LinkCategory.TRANSACTIONS),
        SystemLink(code="transactions-new", title="New Journal Entry",
                   description="Record a new journal entry",
                   url_path="/transactions/new", icon="add", category=LinkCategory.TRANSACTIONS),

        # ── Financial Operations ────────────────────────────────────────────────
        SystemLink(code="invoices-list", title="Invoice Management",
                   description="Create and manage invoices",
                   url_path="/sales/invoices", icon="file-text", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="invoices-create", title="Create Invoice",
                   description="Create a new invoice",
                   url_path="/sales/invoices/create", icon="file-plus", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="invoices-bulk", title="Bulk Invoice Creation",
                   description="Create multiple invoices at once",
                   url_path="/sales/invoices/bulk", icon="file-stack", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="receivables-dashboard", title="Receivables Dashboard",
                   description="Monitor accounts receivable",
                   url_path="/receivables/dashboard", icon="trending-up", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="receivables-list", title="Receivables List",
                   description="View all receivables",
                   url_path="/receivables/list", icon="list", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="receivables-aging", title="Aging Report",
                   description="View receivables aging analysis",
                   url_path="/receivables/aging-report", icon="clock", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="receivables-collections", title="Collections Management",
                   description="Manage collection tasks",
                   url_path="/receivables/collections", icon="alert-triangle", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="receivables-statements", title="Customer Statements",
                   description="Generate customer/student statements",
                   url_path="/receivables/statements", icon="receipt", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="receivables-payment-record", title="Record Payment",
                   description="Record a customer payment",
                   url_path="/receivables/payments/record", icon="credit-card", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="receivables-advanced-reporting", title="Advanced Receivables Reporting",
                   description="Advanced receivables analytics",
                   url_path="/receivables/advanced-reporting", icon="bar-chart", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="receivables-payment-trends", title="Payment Trends",
                   description="Analyse payment trends over time",
                   url_path="/receivables/payment-trends", icon="line-chart", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="treasury-dashboard", title="Treasury Dashboard",
                   description="Treasury management overview",
                   url_path="/treasury/dashboard", icon="wallet", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="treasury-bank-reconciliation", title="Bank Reconciliation",
                   description="Reconcile bank statements",
                   url_path="/treasury/bank-reconciliation", icon="credit-card", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="treasury-petty-cash", title="Petty Cash",
                   description="Manage petty cash funds and vouchers",
                   url_path="/treasury/petty-cash", icon="wallet", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="treasury-petty-cash-vouchers", title="Petty Cash Vouchers",
                   description="Manage petty cash vouchers",
                   url_path="/treasury/petty-cash/vouchers", icon="receipt", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="expenses-list", title="Expenses",
                   description="Manage general expenses",
                   url_path="/expenses", icon="dollar-sign", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="expenses-prepaid", title="Prepaid Expenses",
                   description="Manage prepaid expense amortization",
                   url_path="/expenses/prepaid", icon="calendar-days", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="expenses-vouchers", title="Expense Vouchers",
                   description="Manage expense vouchers",
                   url_path="/expenses/vouchers", icon="ticket", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="liabilities-payables", title="Accounts Payable",
                   description="Manage accounts payable",
                   url_path="/liabilities/payables", icon="receipt", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="banks-list", title="Banks",
                   description="Manage banks",
                   url_path="/banks", icon="building-2", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="banks-accounts", title="Bank Accounts",
                   description="Manage bank accounts and GL links",
                   url_path="/banks/accounts", icon="credit-card", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="banks-transfers", title="Inter-bank Transfers",
                   description="Manage bank-to-bank transfers",
                   url_path="/banks/transfers", icon="arrow-left-right", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="banks-payments", title="Bank Payments",
                   description="Track supplier and expense bank payments",
                   url_path="/banks/payments", icon="receipt", category=LinkCategory.FINANCIAL_OPERATIONS),
        SystemLink(code="banks-transfers-approvals", title="Transfer Approvals",
                   description="Approve or reject inter-bank transfers",
                   url_path="/banks/transfers/approvals", icon="check-circle", category=LinkCategory.FINANCIAL_OPERATIONS),

        # ── Student / Client Management ─────────────────────────────────────────
        SystemLink(code="clients-list", title="Client Management",
                   description="Manage student/client records",
                   url_path="/clients", icon="people", category=LinkCategory.STUDENT_MANAGEMENT),
        SystemLink(code="clients-create", title="Client Registration",
                   description="Register new clients/students",
                   url_path="/clients/create", icon="person-add", category=LinkCategory.STUDENT_MANAGEMENT),
        SystemLink(code="clients-classifications", title="Client Classifications",
                   description="Manage client classifications",
                   url_path="/clients/classifications", icon="tags", category=LinkCategory.STUDENT_MANAGEMENT),
        SystemLink(code="entitlements-list", title="Student Entitlements",
                   description="Manage student entitlements",
                   url_path="/incomes/entitlements", icon="award", category=LinkCategory.STUDENT_MANAGEMENT),
        SystemLink(code="entitlements-dashboard", title="Entitlements Dashboard",
                   description="Entitlements overview dashboard",
                   url_path="/incomes/entitlements/dashboard", icon="bar-chart-3", category=LinkCategory.STUDENT_MANAGEMENT),
        SystemLink(code="fee-structures", title="Fee Structures",
                   description="Manage fee structures",
                   url_path="/incomes/fee-structures", icon="dollar-sign", category=LinkCategory.STUDENT_MANAGEMENT),
        SystemLink(code="discount-programs", title="Discount Programs",
                   description="Manage discount/scholarship programs",
                   url_path="/discounts/programs", icon="percent", category=LinkCategory.STUDENT_MANAGEMENT),

        # ── Reports & Analytics ─────────────────────────────────────────────────
        SystemLink(code="reports-center", title="Reports Center",
                   description="Access all system reports",
                   url_path="/reports", icon="assessment", category=LinkCategory.REPORTS),
        SystemLink(code="reports-builder", title="Report Builder",
                   description="Create custom reports",
                   url_path="/reports/new/edit", icon="bar-chart", category=LinkCategory.REPORTS),
        SystemLink(code="report-trial-balance", title="Trial Balance",
                   description="Generate trial balance reports",
                   url_path="/reports/financial/trial-balance", icon="calculator", category=LinkCategory.REPORTS),
        SystemLink(code="report-profit-loss", title="Profit & Loss Statement",
                   description="Statement of Profit or Loss",
                   url_path="/reports/financial/profit-loss", icon="bar-chart-3", category=LinkCategory.REPORTS),
        SystemLink(code="report-balance-sheet", title="Balance Sheet",
                   description="Statement of Financial Position",
                   url_path="/reports/financial/balance-sheet", icon="scale", category=LinkCategory.REPORTS),
        SystemLink(code="report-inventory-valuation", title="Inventory Reports",
                   description="Generate inventory reports",
                   url_path="/inventory/reports/valuation", icon="package", category=LinkCategory.REPORTS),

        # ── Products ────────────────────────────────────────────────────────────
        SystemLink(code="products-list", title="Products & Services",
                   description="View and manage products",
                   url_path="/products", icon="shopping-bag", category=LinkCategory.PRODUCTS),
        SystemLink(code="products-new", title="Add Product",
                   description="Create a new product or service",
                   url_path="/products/new", icon="add-box", category=LinkCategory.PRODUCTS),

        # ── Procurement ─────────────────────────────────────────────────────────
        SystemLink(code="procurement-dashboard", title="Procurement Dashboard",
                   description="Procurement management overview",
                   url_path="/procurement", icon="shopping-cart", category=LinkCategory.PROCUREMENT),
        SystemLink(code="purchase-orders", title="Purchase Orders",
                   description="Manage purchase orders",
                   url_path="/procurement/orders", icon="shopping-bag", category=LinkCategory.PROCUREMENT),
        SystemLink(code="requisitions", title="Purchase Requisitions",
                   description="Manage purchase requisitions",
                   url_path="/procurement/requisitions", icon="file-text", category=LinkCategory.PROCUREMENT),
        SystemLink(code="suppliers", title="Supplier Management",
                   description="Manage suppliers",
                   url_path="/procurement/suppliers", icon="truck", category=LinkCategory.PROCUREMENT),
        SystemLink(code="grn-list", title="Goods Receipt Notes",
                   description="Manage goods receipt notes",
                   url_path="/procurement/grn", icon="package-check", category=LinkCategory.PROCUREMENT),
        SystemLink(code="supplier-quotes", title="Supplier Quotes",
                   description="Manage supplier quotes",
                   url_path="/procurement/quotes", icon="file-search", category=LinkCategory.PROCUREMENT),

        # ── Inventory ───────────────────────────────────────────────────────────
        SystemLink(code="inventory-dashboard", title="Inventory Management",
                   description="Inventory management dashboard",
                   url_path="/inventory", icon="warehouse", category=LinkCategory.INVENTORY),
        SystemLink(code="inventory-items", title="Inventory Items",
                   description="Manage inventory items",
                   url_path="/inventory/items", icon="package", category=LinkCategory.INVENTORY),
        SystemLink(code="stock-movements", title="Stock Movements",
                   description="Track stock movements",
                   url_path="/inventory/movements", icon="arrow-right-left", category=LinkCategory.INVENTORY),
        SystemLink(code="stock-locations", title="Stock Locations",
                   description="Manage stock locations",
                   url_path="/inventory/locations", icon="map-pin", category=LinkCategory.INVENTORY),
        SystemLink(code="stock-adjustments", title="Stock Adjustments",
                   description="Manage stock adjustments",
                   url_path="/inventory/adjustments", icon="settings", category=LinkCategory.INVENTORY),
        SystemLink(code="office-use-requests", title="Office Use Requests",
                   description="Request inventory items for internal office use with automatic expense posting",
                   url_path="/inventory/office-use-requests", icon="clipboard-list", category=LinkCategory.INVENTORY),
        SystemLink(code="office-use-request-create", title="New Office Use Request",
                   description="Create a new office use request",
                   url_path="/inventory/office-use-requests/create", icon="clipboard-plus", category=LinkCategory.INVENTORY),

        # ── HR ──────────────────────────────────────────────────────────────────
        SystemLink(code="hr-dashboard", title="Human Resources",
                   description="HR management dashboard",
                   url_path="/hr", icon="users", category=LinkCategory.HR),
        SystemLink(code="hr-staff", title="Staff Management",
                   description="Manage staff records",
                   url_path="/hr/staff", icon="user-check", category=LinkCategory.HR),
        SystemLink(code="hr-attendance", title="Attendance Management",
                   description="Manage staff attendance",
                   url_path="/hr/attendance", icon="clock", category=LinkCategory.HR),
        SystemLink(code="hr-leave-requests", title="Leave Management",
                   description="Manage leave requests",
                   url_path="/hr/leave-requests", icon="calendar", category=LinkCategory.HR),
        SystemLink(code="hr-payroll", title="Payroll",
                   description="Manage payroll",
                   url_path="/hr/payroll", icon="wallet", category=LinkCategory.HR),

        # ── Assets ──────────────────────────────────────────────────────────────
        SystemLink(code="assets-list", title="Asset Management",
                   description="Manage fixed assets",
                   url_path="/assets", icon="hard-drive", category=LinkCategory.ASSETS),
        SystemLink(code="resource-consumption", title="Resource Consumption",
                   description="Manage resource consumption",
                   url_path="/expenses/resource-consumption", icon="zap", category=LinkCategory.ASSETS),
        SystemLink(code="resources-list", title="Resource Management",
                   description="Manage resources",
                   url_path="/expenses/resources", icon="layers", category=LinkCategory.ASSETS),

        # ── Forms ───────────────────────────────────────────────────────────────
        SystemLink(code="forms-list", title="Forms",
                   description="Browse available forms",
                   url_path="/forms", icon="description", category=LinkCategory.FORMS),
        SystemLink(code="forms-submissions", title="My Submissions",
                   description="View your form submissions",
                   url_path="/forms/submissions", icon="assignment-turned-in", category=LinkCategory.FORMS),
        SystemLink(code="admin-forms", title="Form Management",
                   description="Create and manage forms",
                   url_path="/admin/forms", icon="edit-note", category=LinkCategory.FORMS,
                   required_roles=["admin", "sys_admin"], is_admin_only=True),
        SystemLink(code="admin-submissions", title="All Submissions",
                   description="View all form submissions",
                   url_path="/admin/submissions", icon="inbox", category=LinkCategory.FORMS,
                   required_roles=["admin", "sys_admin"], is_admin_only=True),

        # ── Approvals ───────────────────────────────────────────────────────────
        SystemLink(code="approvals-pending", title="Pending Approvals",
                   description="Items awaiting your approval",
                   url_path="/approvals/pending", icon="pending-actions", category=LinkCategory.APPROVALS),
        SystemLink(code="approvals-all", title="All Approvals",
                   description="View all approval requests",
                   url_path="/approvals", icon="fact-check", category=LinkCategory.APPROVALS),

        # ── Automation / Workflows ──────────────────────────────────────────────
        SystemLink(code="workflows-list", title="Workflow Management",
                   description="Configure system workflows",
                   url_path="/admin/workflows", icon="account-tree", category=LinkCategory.WORKFLOWS,
                   required_roles=["admin", "sys_admin"], is_admin_only=True),
        SystemLink(code="workflows-new", title="Create Workflow",
                   description="Build a new workflow",
                   url_path="/admin/workflows/new", icon="add-chart", category=LinkCategory.WORKFLOWS,
                   required_roles=["admin", "sys_admin"], is_admin_only=True),
        SystemLink(code="automation-templates", title="Automation Templates",
                   description="Manage automation templates",
                   url_path="/automations/templates", icon="smart-toy", category=LinkCategory.AUTOMATION,
                   required_roles=["admin", "sys_admin"], is_admin_only=True),
        SystemLink(code="automation-runs", title="Automation History",
                   description="View automation run history",
                   url_path="/automations/runs", icon="history", category=LinkCategory.AUTOMATION),

        # ── User Management ─────────────────────────────────────────────────────
        SystemLink(code="user-management", title="User Management",
                   description="Manage system users and their access",
                   url_path="/settings", icon="users", category=LinkCategory.USER_MANAGEMENT,
                   required_roles=["admin", "sys_admin"]),
        SystemLink(code="admin-users", title="Add / Edit Users",
                   description="Create and edit user accounts",
                   url_path="/admin/users", icon="user-plus", category=LinkCategory.USER_MANAGEMENT,
                   required_roles=["admin", "sys_admin"]),
        SystemLink(code="roles-matrix", title="Roles & Permissions",
                   description="Configure role-based permissions",
                   url_path="/admin/roles-matrix", icon="shield", category=LinkCategory.USER_MANAGEMENT,
                   required_roles=["sys_admin"]),
        SystemLink(code="branches", title="Branch Management",
                   description="Manage organisational branches",
                   url_path="/admin/branches", icon="building", category=LinkCategory.USER_MANAGEMENT,
                   required_roles=["admin", "sys_admin"]),
        SystemLink(code="access-control", title="Access Control",
                   description="Configure system access controls",
                   url_path="/admin/access-control", icon="lock", category=LinkCategory.USER_MANAGEMENT,
                   required_roles=["admin", "sys_admin"]),
    ]
    
    @classmethod
    def get_all_links(cls) -> List[SystemLink]:
        """Get all registered system links"""
        return cls._links
    
    @classmethod
    def get_links_by_category(cls, category: LinkCategory) -> List[SystemLink]:
        """Get all links in a specific category"""
        return [link for link in cls._links if link.category == category]
    
    @classmethod
    def get_link_by_code(cls, code: str) -> Optional[SystemLink]:
        """Get a specific link by its code"""
        for link in cls._links:
            if link.code == code:
                return link
        return None
    
    @classmethod
    def get_links_for_user(cls, user_roles: List[str], include_admin_only: bool = False) -> List[SystemLink]:
        """Get links accessible to a user based on their roles"""
        accessible_links = []
        
        for link in cls._links:
            # Check if admin-only and if should include
            if link.is_admin_only and not include_admin_only:
                continue
            
            # Check role requirements
            if link.required_roles:
                if not any(role in user_roles for role in link.required_roles):
                    continue
            
            accessible_links.append(link)
        
        return accessible_links
    
    @classmethod
    def get_categories(cls) -> List[str]:
        """Get all unique categories"""
        return [cat.value for cat in LinkCategory]
    
    @classmethod
    def get_links_grouped_by_category(cls, user_roles: List[str] = None) -> dict:
        """Get links organized by category"""
        if user_roles:
            links = cls.get_links_for_user(user_roles, include_admin_only=True)
        else:
            links = cls._links
        
        grouped = {}
        for link in links:
            category = link.category.value
            if category not in grouped:
                grouped[category] = []
            grouped[category].append(link)
        
        return grouped
    
    @classmethod
    def serialize_link(cls, link: SystemLink) -> dict:
        """Convert SystemLink to dictionary for API responses"""
        return {
            'code': link.code,
            'title': link.title,
            'description': link.description,
            'url_path': link.url_path,
            'icon': link.icon,
            'category': link.category.value,
            'requires_auth': link.requires_auth,
            'required_roles': link.required_roles or [],
            'is_admin_only': link.is_admin_only,
            'parent_code': link.parent_code
        }
    
    @classmethod
    def serialize_all(cls, user_roles: List[str] = None) -> List[dict]:
        """Serialize all accessible links for a user"""
        if user_roles:
            links = cls.get_links_for_user(user_roles, include_admin_only=True)
        else:
            links = cls._links
        
        return [cls.serialize_link(link) for link in links]


# Category metadata for display
CATEGORY_METADATA = {
    "dashboard": {
        "label": "Dashboard",
        "icon": "dashboard",
        "color": "#1a73e8",
        "description": "Dashboard views and customisation"
    },
    "accounting": {
        "label": "Accounting",
        "icon": "account-balance",
        "color": "#34a853",
        "description": "Chart of accounts and accounting setup"
    },
    "transactions": {
        "label": "Transactions",
        "icon": "receipt",
        "color": "#fbbc04",
        "description": "Financial transactions and journal entries"
    },
    "financial_operations": {
        "label": "Financial Operations",
        "icon": "dollar-sign",
        "color": "#0f9d58",
        "description": "Invoicing, receivables, payables, treasury and banking"
    },
    "student_management": {
        "label": "Student / Client Management",
        "icon": "graduation-cap",
        "color": "#4285f4",
        "description": "Client registration, fee structures and entitlements"
    },
    "products": {
        "label": "Products & Services",
        "icon": "shopping-bag",
        "color": "#ea4335",
        "description": "Product and service management"
    },
    "procurement": {
        "label": "Procurement",
        "icon": "shopping-cart",
        "color": "#ff6d00",
        "description": "Purchase orders, suppliers and goods receipt"
    },
    "inventory": {
        "label": "Inventory",
        "icon": "warehouse",
        "color": "#6d4c41",
        "description": "Stock items, movements and adjustments"
    },
    "hr": {
        "label": "Human Resources",
        "icon": "users",
        "color": "#7b1fa2",
        "description": "Staff, attendance, leave and payroll"
    },
    "assets": {
        "label": "Assets & Resources",
        "icon": "hard-drive",
        "color": "#00838f",
        "description": "Fixed assets and resource management"
    },
    "forms": {
        "label": "Forms",
        "icon": "description",
        "color": "#9334e6",
        "description": "Form creation and submissions"
    },
    "approvals": {
        "label": "Approvals",
        "icon": "fact-check",
        "color": "#00897b",
        "description": "Approval workflows and pending items"
    },
    "workflows": {
        "label": "Workflows",
        "icon": "account-tree",
        "color": "#0f9d58",
        "description": "Workflow automation and management"
    },
    "reports": {
        "label": "Reports & Analytics",
        "icon": "bar-chart",
        "color": "#f4b400",
        "description": "Custom reports and analytics"
    },
    "automation": {
        "label": "Automation",
        "icon": "smart-toy",
        "color": "#ab47bc",
        "description": "Automation templates and history"
    },
    "user_management": {
        "label": "User Management",
        "icon": "admin-panel-settings",
        "color": "#d32f2f",
        "description": "Users, roles and access control"
    },
    "admin": {
        "label": "Administration",
        "icon": "admin-panel-settings",
        "color": "#d32f2f",
        "description": "System administration"
    },
    "settings": {
        "label": "Settings",
        "icon": "settings",
        "color": "#616161",
        "description": "Application settings and configuration"
    }
}
