"""
Management command: create_director_dashboard

Creates (or updates) the canonical 8-module director dashboard with a
pre-configured sidebar navigation widget covering:

  HR · Accounts · Student Service · Procurement · Inventory
  Asset Management · Bank · Petty Cash

Each module has a MASTER group (setup / config items) and a
TRANSACTION group (day-to-day entries).

Usage
-----
# Minimal — uses first superuser as owner, first branch
python manage.py create_director_dashboard

# Explicit
python manage.py create_director_dashboard \\
    --user admin@example.com \\
    --branch 1 \\
    --name "Director Dashboard" \\
    --default

# Overwrite an existing dashboard with the same slug
python manage.py create_director_dashboard --force

# Dry-run — prints what would be created, touches nothing
python manage.py create_director_dashboard --dry-run

File location
-------------
Place this file at:
  <your_app>/management/commands/create_director_dashboard.py

The app must be in INSTALLED_APPS.  If your dashboard models live in
an app called 'dashboards', put the file there:
  dashboards/management/__init__.py          (empty)
  dashboards/management/commands/__init__.py (empty)
  dashboards/management/commands/create_director_dashboard.py  ← this file
"""

import time
import json
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from django.db import transaction

User = get_user_model()


# ── Sidebar config builder ────────────────────────────────────────────────────

def _btn(label: str, icon: str, children: list, url: str = "") -> dict:
    """Build a sidebar button dict."""
    node = {
        "id": f"btn-{label.lower().replace(' ', '-').replace('/', '-')}-{int(time.time() * 1000) % 999999}",
        "icon": icon,
        "label": label,
        "children": children,
    }
    if url:
        node["url"] = url
        node["frontendUrl"] = url
    return node


def _leaf(label: str, path: str) -> dict:
    """Build a leaf node (no children, has url)."""
    return _btn(label, "file-text", [], path)


def _group(label: str, icon: str, children: list) -> dict:
    """Build a group node (has children, no url)."""
    return _btn(label, icon, children)


def build_sidebar_config() -> dict:
    """
    Build the complete 8-module sidebar config dict.
    Mirrors dashboardSidebarConfig.ts exactly.
    """

    # ── 1. HUMAN RESOURCES ──────────────────────────────────────────────────
    hr = _group("HUMAN RESOURCES", "users", [
        _group("MASTER", "file-text", [
            _leaf("Staff Directory",       "/hr/staff"),
            _leaf("Salary Components",     "/hr/salary-components"),
            _leaf("Leave Types",           "/hr/leave-types"),
            _leaf("Payroll Schedules",     "/hr/payroll-schedules"),
            _leaf("HR Configuration",      "/hr/config"),
            _leaf("Pension Remittances",   "/hr/pension-remittances"),
        ]),
        _group("TRANSACTION", "file-text", [
            _leaf("Payroll List",          "/hr/payroll"),
            _leaf("New Payroll Run",       "/hr/payroll/create"),
            _leaf("Attendance",            "/hr/attendance"),
            _leaf("Clock In / Out",        "/hr/attendance/clock"),
            _leaf("Leave Requests",        "/hr/leave-requests"),
            _leaf("New Leave Request",     "/hr/leave-requests/create"),
            _leaf("Leave Balances",        "/hr/leave-balances"),
            _leaf("Bonus & Deduction",     "/hr/bonus-deduction"),
            _leaf("New Bonus/Deduction",   "/hr/bonus-deduction/create"),
            _leaf("Payslips",              "/hr/payslips"),
            _leaf("Staff Import (Excel)",  "/hr/staff/import"),
        ]),
    ])

    # ── 2. ACCOUNT ──────────────────────────────────────────────────────────
    accounts = _group("ACCOUNT", "bar-chart", [
        _group("MASTER", "file-text", [
            _leaf("Chart of Accounts",     "/accounts"),
            _leaf("Account Hierarchy",     "/accounts/hierarchy"),
            _leaf("Accounting Periods",    "/accounting/periods"),
            _leaf("Budget Periods",        "/budgets/periods"),
        ]),
        _group("TRANSACTION", "file-text", [
            _leaf("Ledger Search",         "/accounts/ledger-search"),
            _leaf("Journal Vouchers",      "/accounting/journal-vouchers"),
            _leaf("New Journal Voucher",   "/accounting/journal-vouchers/create"),
            _leaf("New Budget Period",     "/budgets/periods/new"),
            _leaf("Trial Balance",         "/reports/financial/trial-balance"),
            _leaf("Profit & Loss",         "/reports/financial/profit-loss"),
            _leaf("Balance Sheet",         "/reports/financial/balance-sheet"),
            _leaf("Cash Flow Statement",   "/reports/financial/cash-flow"),
        ]),
    ])

    # ── 3. STUDENT SERVICE ───────────────────────────────────────────────────
    student = _group("STUDENT SERVICE", "graduation-cap", [
        _group("MASTER", "file-text", [
            _leaf("Student Classifications", "/clients/classifications"),
            _leaf("Fee Structures",          "/incomes/fee-structures"),
            _leaf("Discount Programs",       "/discounts/programs"),
            _leaf("Academic Sessions",       "/incomes/academic-sessions"),
            _leaf("Service Items",           "/incomes/service-items"),
            _leaf("Income Categories",       "/incomes/categories"),
        ]),
        _group("TRANSACTION", "file-text", [
            _leaf("Student Management",      "/clients"),
            _leaf("Add New Student",         "/clients/create"),
            _leaf("Student Entitlements",    "/incomes/entitlements"),
            _leaf("Entitlements Dashboard",  "/incomes/entitlements/dashboard"),
            _leaf("Create Invoice",          "/invoices/create"),
            _leaf("Invoices List",           "/sales/invoices"),
            _leaf("Credit Notes",            "/sales/credit-notes"),
            _leaf("Bulk Invoice Wizard",     "/demo/bulk-invoice-wizard"),
            _leaf("Customer Statements",     "/receivables/statements"),
            _leaf("Discount Applications",   "/discounts/applications"),
            _leaf("Access Control Checker",  "/demo/access-control"),
        ]),
    ])

    # ── 4. PROCUREMENT ───────────────────────────────────────────────────────
    procurement = _group("PROCUREMENT", "shopping-cart", [
        _group("MASTER", "file-text", [
            _leaf("Suppliers",               "/procurement/suppliers"),
            _leaf("Add Supplier",            "/procurement/suppliers/create"),
            _leaf("Procurement Settings",    "/procurement/settings"),
        ]),
        _group("TRANSACTION", "file-text", [
            _leaf("Purchase Requisitions",   "/procurement/requisitions"),
            _leaf("New Requisition",         "/procurement/requisitions/create"),
            _leaf("Purchase Orders",         "/procurement/orders"),
            _leaf("New Purchase Order",      "/procurement/orders/create"),
            _leaf("Goods Received Notes",    "/procurement/grn"),
            _leaf("New GRN",                 "/procurement/grn/create"),
            _leaf("Purchase Returns",        "/procurement/returns"),
            _leaf("New Return",              "/procurement/returns/create"),
            _leaf("Supplier Quotes",         "/procurement/quotes"),
            _leaf("3-Way Matching",          "/liabilities/matching"),
            _leaf("Accounts Payable",        "/liabilities/payables"),
            _leaf("New Payable",             "/liabilities/payables/new"),
            _leaf("AP Aging Report",         "/liabilities/vendors"),
        ]),
    ])

    # ── 5. INVENTORY ─────────────────────────────────────────────────────────
    inventory = _group("INVENTORY", "package", [
        _group("MASTER", "file-text", [
            _leaf("Inventory Items",         "/inventory/items"),
            _leaf("Stock Locations",         "/inventory/locations"),
            _leaf("Expense Categories",      "/expenses/categories"),
        ]),
        _group("TRANSACTION", "file-text", [
            _leaf("Stock Movements",         "/inventory/movements"),
            _leaf("Stock Adjustments",       "/inventory/adjustments"),
            _leaf("New Adjustment",          "/inventory/adjustments/create"),
            _leaf("Stock Transfers",         "/inventory/transfers"),
            _leaf("New Transfer",            "/inventory/transfers/create"),
            _leaf("Stock Valuation Report",  "/inventory/reports/valuation"),
            _leaf("Material Requests",       "/inventory/material-requests"),
            _leaf("New Material Request",    "/inventory/material-requests/create"),
            _leaf("Office Use Requests",     "/inventory/office-use-requests"),
            _leaf("New Office Use Request",  "/inventory/office-use-requests/create"),
            _leaf("Write-offs",              "/inventory/write-offs"),
            _leaf("New Write-off",           "/inventory/write-offs/new"),
            _leaf("Physical Counts",         "/inventory/physical-counts"),
            _leaf("New Physical Count",      "/inventory/physical-counts/new"),
            _leaf("Resource Consumption",    "/expenses/resource-consumption"),
            _leaf("Voucher Management",      "/expenses/vouchers"),
            _leaf("Expiring Vouchers",       "/expenses/vouchers/expiring"),
            _leaf("Prepaid Expenses",        "/expenses/prepaid"),
        ]),
    ])

    # ── 6. ASSET MANAGEMENT ──────────────────────────────────────────────────
    assets = _group("ASSET MANAGEMENT", "home", [
        _group("MASTER", "file-text", [
            _leaf("Asset Categories",        "/assets/categories"),
        ]),
        _group("TRANSACTION", "file-text", [
            _leaf("Fixed Asset Register",    "/assets"),
            _leaf("Register Single Asset",   "/assets/register"),
            _leaf("Asset Requisitions",      "/assets/requisitions"),
            _leaf("New Asset Requisition",   "/assets/requisitions/new"),
            _leaf("Asset Acquisitions",      "/assets/acquisitions"),
            _leaf("Bulk Asset Acquisition",  "/assets/acquisitions/new"),
            _leaf("Asset Maintenance",       "/assets/maintenance"),
            _leaf("Log Maintenance Event",   "/assets/maintenance/new"),
            _leaf("Depreciation Ledger",     "/assets/depreciation"),
            _leaf("Fleet Fuel Monitor",      "/assets/fuel-monitor"),
            _leaf("Log Fuel Receipt",        "/expenses/fuel-log/create"),
            _leaf("Fuel Anomaly Dashboard",  "/expenses/resource-consumption/irregularities"),
        ]),
    ])

    # ── 7. BANK ──────────────────────────────────────────────────────────────
    bank = _group("BANK", "credit-card", [
        _group("MASTER", "file-text", [
            _leaf("Banks",                   "/banks"),
            _leaf("Bank Accounts",           "/banks/accounts"),
            _leaf("New Bank Account",        "/banks/accounts/new"),
        ]),
        _group("TRANSACTION", "file-text", [
            _leaf("Receivables",             "/receivables/list"),
            _leaf("Record Payment",          "/receivables/payments/record"),
            _leaf("Aging Report",            "/receivables/aging-report"),
            _leaf("Bulk Payment Upload",     "/receivables/bulk-payment-upload"),
            _leaf("Collections Dashboard",   "/receivables/collections"),
            _leaf("Collection Workbench",    "/receivables/collections/workbench"),
            _leaf("Reminder Management",     "/receivables/reminders"),
            _leaf("Bank Payments",           "/banks/payments"),
            _leaf("New Bank Payment",        "/banks/payments/new"),
            _leaf("Inter-bank Transfers",    "/banks/transfers"),
            _leaf("New Transfer",            "/banks/transfers/new"),
            _leaf("Transfer Approvals",      "/banks/transfers/approvals"),
            _leaf("Bank Reconciliation",     "/treasury/bank-reconciliation"),
            _leaf("Cash Reconciliation",     "/treasury/cash-reconciliation"),
            _leaf("Cashier Accounts",        "/treasury/cashier-accounts"),
            _leaf("Cash Transfers",          "/treasury/cash-transfers"),
        ]),
    ])

    # ── 8. PETTY CASH ────────────────────────────────────────────────────────
    petty_cash = _group("PETTY CASH", "wallet", [
        _group("MASTER", "file-text", [
            _leaf("Petty Cash Funds",        "/treasury/petty-cash"),
            _leaf("New Fund",                "/treasury/petty-cash/funds/new"),
        ]),
        _group("TRANSACTION", "file-text", [
            _leaf("Petty Cash Vouchers",     "/treasury/petty-cash/vouchers"),
            _leaf("New Voucher",             "/treasury/petty-cash/vouchers/new"),
            _leaf("Replenishments",          "/treasury/petty-cash/replenishments"),
            _leaf("New Replenishment",       "/treasury/petty-cash/replenishments/new"),
            _leaf("Expiring Vouchers",       "/expenses/vouchers/expiring"),
        ]),
    ])

    return {
        "hierarchyLevels": 3,
        "logoUrl": "",
        "logoSize": "medium",
        "buttons": [hr, accounts, student, procurement, inventory, assets, bank, petty_cash],
    }


# ── Command ───────────────────────────────────────────────────────────────────

class Command(BaseCommand):
    help = (
        "Create (or update) the canonical 8-module director dashboard "
        "with HR, Accounts, Student Service, Procurement, Inventory, "
        "Asset Management, Bank, and Petty Cash navigation."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--user",
            dest="user",
            default=None,
            help=(
                "Email or username of the owner user. "
                "Defaults to the first active superuser found."
            ),
        )
        parser.add_argument(
            "--branch",
            dest="branch",
            default=None,
            help=(
                "Branch ID or name to assign the dashboard to. "
                "Defaults to the first branch found."
            ),
        )
        parser.add_argument(
            "--name",
            dest="name",
            default="Director Dashboard",
            help="Dashboard display name (default: 'Director Dashboard').",
        )
        parser.add_argument(
            "--slug",
            dest="slug",
            default=None,
            help=(
                "Explicit slug. Auto-generated from --name + timestamp if omitted. "
                "Used to detect existing dashboards for idempotency."
            ),
        )
        parser.add_argument(
            "--default",
            dest="is_default",
            action="store_true",
            default=False,
            help="Mark this dashboard as the default for the owner.",
        )
        parser.add_argument(
            "--dry-run",
            dest="dry_run",
            action="store_true",
            default=False,
            help="Print what would be created without touching the database.",
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _resolve_user(self, user_arg):
        """Return a User instance from email, username, or first superuser."""
        if user_arg:
            try:
                return User.objects.get(email=user_arg)
            except User.DoesNotExist:
                pass
            try:
                return User.objects.get(username=user_arg)
            except User.DoesNotExist:
                raise CommandError(
                    f"No user found with email or username '{user_arg}'."
                )

        # Fall back to first active superuser
        user = User.objects.filter(is_superuser=True, is_active=True).first()
        if not user:
            user = User.objects.filter(is_active=True).first()
        if not user:
            raise CommandError(
                "No active users found. Create a user first, or pass --user."
            )
        return user

    def _resolve_branch(self, branch_arg):
        """Return a Branch instance or None if the model doesn't use branches."""
        try:
            from common.models import Branch  # adjust import path if needed
        except ImportError:
            try:
                from branches.models import Branch
            except ImportError:
                self.stdout.write(
                    self.style.WARNING(
                        "  Branch model not found — creating dashboard without branch."
                    )
                )
                return None

        if branch_arg:
            # Try as PK first, then name
            try:
                return Branch.objects.get(pk=int(branch_arg))
            except (ValueError, Branch.DoesNotExist):
                pass
            try:
                return Branch.objects.get(name=branch_arg)
            except Branch.DoesNotExist:
                raise CommandError(f"No branch found with id or name '{branch_arg}'.")

        branch = Branch.objects.filter(is_active=True).first()
        if not branch:
            branch = Branch.objects.first()
        if not branch:
            self.stdout.write(
                self.style.WARNING("  No branches found — creating dashboard without branch.")
            )
        return branch

    def _make_slug(self, name: str, explicit: str | None) -> str:
        if explicit:
            return explicit
        from django.utils.text import slugify
        base = slugify(name)
        return f"{base}-{int(time.time() * 1000)}"

    def _common_kwargs(self, user, branch: object | None) -> dict:
        """Fields required by BranchScopedModel / TimeStampedModel."""
        kwargs = {"owner": user}
        if branch is not None:
            kwargs["branch"] = branch
        # Tenant is required so OwnerBranchManager's thread-local tenant filter
        # (applied automatically on every API request via TenantMiddleware) can
        # match this record. Without it the dashboard is created with tenant=NULL
        # and becomes invisible to all API clients.
        tenant = getattr(user, "tenant", None)
        if tenant is not None:
            kwargs["tenant"] = tenant
        return kwargs

    # ── Main ──────────────────────────────────────────────────────────────────

    @transaction.atomic
    def handle(self, *args, **options):
        from dashboards.models import Dashboard, Widget  # adjust if app name differs

        dry_run    = options["dry_run"]
        name       = options["name"]
        is_default = options["is_default"]

        # ── Resolve owner + branch ────────────────────────────────────────────
        self.stdout.write("Resolving user and branch…")
        user   = self._resolve_user(options["user"])
        branch = self._resolve_branch(options["branch"])

        self.stdout.write(f"  Owner  : {user} (pk={user.pk})")
        self.stdout.write(f"  Branch : {branch}")

        slug = self._make_slug(name, options["slug"])
        self.stdout.write(f"  Slug   : {slug}")

        # ── Build sidebar config ──────────────────────────────────────────────
        self.stdout.write("\nBuilding sidebar config…")
        sidebar_config = build_sidebar_config()

        total_modules = len(sidebar_config["buttons"])
        total_links   = sum(
            len(sub["children"])
            for mod in sidebar_config["buttons"]
            for sub in mod.get("children", [])
        )
        self.stdout.write(f"  Modules : {total_modules}")
        self.stdout.write(f"  Links   : {total_links}")

        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(
                    "\n[DRY RUN] Would create:\n"
                    f"  Dashboard  : '{name}' (slug={slug})\n"
                    f"  Owner      : {user}\n"
                    f"  Branch     : {branch}\n"
                    f"  is_default : {is_default}\n"
                    f"  Widgets    : 1 × sidebar\n"
                    f"  Modules    : {total_modules}\n"
                    f"  Nav links  : {total_links}\n"
                    "\nRun without --dry-run to apply."
                )
            )
            return

        # ── Create dashboard ──────────────────────────────────────────────────
        self.stdout.write(f"\nCreating dashboard '{name}'…")

        common = self._common_kwargs(user, branch)

        dashboard = Dashboard.objects.create(
            name=name,
            slug=slug,
            description=(
                "Canonical 8-module director dashboard: HR, Accounts, "
                "Student Service, Procurement, Inventory, Asset Management, "
                "Bank, Petty Cash."
            ),
            is_default=is_default,
            is_active=True,
            is_public=False,
            grid_columns=12,
            layout_mode="grid",
            show_navigation=True,
            navigation_config={},
            auto_refresh=False,
            refresh_interval=60,
            **common,
        )

        self.stdout.write(f"  ✓ Dashboard created (pk={dashboard.pk})")

        # ── Create sidebar widget ─────────────────────────────────────────────
        widget = self._create_sidebar_widget(dashboard, user, branch, sidebar_config)

        # ── Create income report widgets ──────────────────────────────────────
        income_widgets = self._create_income_report_widgets(dashboard, user, branch)

        # ── Summary ───────────────────────────────────────────────────────────
        self.stdout.write(
            self.style.SUCCESS(
                f"\n✓ Done.\n"
                f"  Dashboard       : '{dashboard.name}' (pk={dashboard.pk})\n"
                f"  Slug            : {dashboard.slug}\n"
                f"  Widget (sidebar): pk={widget.pk}\n"
                f"  Income widgets  : {len(income_widgets)} created\n"
                f"  Modules         : {total_modules}\n"
                f"  Nav links       : {total_links}\n"
                f"\n  View at   : /dashboard/{dashboard.pk}/edit"
            )
        )

    def _create_sidebar_widget(self, dashboard, user, branch, sidebar_config: dict):
        """Create the sidebar widget on a given dashboard."""
        from dashboards.models import Widget

        common = self._common_kwargs(user, branch)

        instance_key = f"widget-sidebar-{int(time.time() * 1000)}"

        widget = Widget.objects.create(
            dashboard=dashboard,
            instance_key=instance_key,
            widget_type="sidebar",
            title="Sidebar Navigation",
            description="",
            icon="",
            data_source=None,
            config=sidebar_config,
            click_action={},
            # Layout: occupies left 3 columns, full height
            layout_x=0,
            layout_y=0,
            layout_w=3,
            layout_h=12,
            layout_min_w=2,
            layout_min_h=2,
            layout_max_w=None,
            layout_max_h=None,
            background_color="",
            border_color="",
            text_color="",
            custom_style={},
            is_visible=True,
            visibility_conditions={},
            display_order=0,
            **common,
        )

        self.stdout.write(f"  ✓ Sidebar widget created (pk={widget.pk}, key={instance_key})")
        return widget

    def _create_income_report_widgets(self, dashboard, user, branch, start_order: int = 10) -> list:
        """
        Add 7 income-report widgets to *dashboard*:
          1. Navigation card-links to all 5 income report pages
          2-5. Four KPI cards  (invoiced, collected, outstanding, collection rate)
          6.   Bar chart — income trend YTD by month
          7.   Table     — income by category YTD

        Layout (12-column grid, sidebar occupies x=0..2):
          Row 0 (h=3): KPI Invoiced (x=3), Collected (x=6), Outstanding (x=9)
          Row 3 (h=3): KPI Collection Rate (x=3), Nav links (x=6,w=6)
          Row 6 (h=6): Bar chart (x=3,w=6), Category table (x=9,w=3)
        """
        from dashboards.models import Widget

        common = self._common_kwargs(user, branch)
        ts     = int(time.time() * 1000)
        created = []

        def _make(widget_type, title, config, x, y, w, h, order):
            key = f"income-{widget_type}-{title.lower().replace(' ', '-')}-{ts + order}"
            wgt = Widget.objects.create(
                dashboard=dashboard,
                instance_key=key,
                widget_type=widget_type,
                title=title,
                description="",
                icon="",
                data_source=None,
                config=config,
                click_action={},
                layout_x=x,
                layout_y=y,
                layout_w=w,
                layout_h=h,
                layout_min_w=1,
                layout_min_h=1,
                layout_max_w=None,
                layout_max_h=None,
                background_color="",
                border_color="",
                text_color="",
                custom_style={},
                is_visible=True,
                visibility_conditions={},
                display_order=order,
                **common,
            )
            self.stdout.write(f"  ✓ Income widget '{title}' created (pk={wgt.pk})")
            return wgt

        # 1. KPI — Total Invoiced (YTD)
        created.append(_make(
            "kpi", "Total Invoiced (YTD)",
            {
                "metric": "income_invoiced",
                "format": "currency",
                "color":  "#6366f1",
                "icon":   "dollar-sign",
            },
            x=3, y=0, w=3, h=3, order=start_order + 1,
        ))

        # 2. KPI — Collected (YTD)
        created.append(_make(
            "kpi", "Collected (YTD)",
            {
                "metric": "income_collected",
                "format": "currency",
                "color":  "#10b981",
                "icon":   "check-circle",
            },
            x=6, y=0, w=3, h=3, order=start_order + 2,
        ))

        # 3. KPI — Outstanding
        created.append(_make(
            "kpi", "Outstanding Balance",
            {
                "metric": "income_outstanding",
                "format": "currency",
                "color":  "#f59e0b",
                "icon":   "clock",
            },
            x=9, y=0, w=3, h=3, order=start_order + 3,
        ))

        # 4. KPI — Collection Rate
        created.append(_make(
            "kpi", "Collection Rate",
            {
                "metric": "income_collection_rate",
                "format": "percentage",
                "color":  "#3b82f6",
                "icon":   "trending-up",
            },
            x=3, y=3, w=3, h=3, order=start_order + 4,
        ))

        # 5. Navigation — Income Report links
        created.append(_make(
            "quick_links", "Income Reports",
            {
                "layout": "grid",
                "show_icons": True,
                "show_descriptions": True,
                "links": [
                    {
                        "label": "Income Overview",
                        "url": "/incomes/reports",
                        "frontendUrl": "/incomes/reports",
                        "icon": "bar-chart",
                        "color": "#6366f1",
                        "description": "KPI summary & collection status",
                    },
                    {
                        "label": "By Category",
                        "url": "/incomes/reports/by-category",
                        "frontendUrl": "/incomes/reports/by-category",
                        "icon": "folder",
                        "color": "#10b981",
                        "description": "Revenue by income category",
                    },
                    {
                        "label": "By Service Item",
                        "url": "/incomes/reports/by-service-item",
                        "frontendUrl": "/incomes/reports/by-service-item",
                        "icon": "file-text",
                        "color": "#3b82f6",
                        "description": "Revenue by service / fee item",
                    },
                    {
                        "label": "Trend by Period",
                        "url": "/incomes/reports/by-period",
                        "frontendUrl": "/incomes/reports/by-period",
                        "icon": "trending-up",
                        "color": "#f59e0b",
                        "description": "Monthly / quarterly income trend",
                    },
                    {
                        "label": "By Client",
                        "url": "/incomes/reports/by-client",
                        "frontendUrl": "/incomes/reports/by-client",
                        "icon": "users",
                        "color": "#ef4444",
                        "description": "Top clients by revenue",
                    },
                ],
            },
            x=6, y=3, w=6, h=3, order=start_order + 5,
        ))

        # 6. Bar chart — Income Trend YTD
        created.append(_make(
            "bar_chart", "Income Trend (YTD)",
            {
                "metric":  "income_trend",
                "x_axis":  "name",
                "y_axis":  "value",
                "color":   "#6366f1",
            },
            x=3, y=6, w=6, h=6, order=start_order + 6,
        ))

        # 7. Table — Income by Category
        created.append(_make(
            "table", "Income by Category (YTD)",
            {
                "metric": "income_by_category",
            },
            x=9, y=6, w=3, h=6, order=start_order + 7,
        ))

        return created