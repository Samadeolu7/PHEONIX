# dashboards/management/commands/create_director_dashboards.py
"""
Seed default dashboards tailored for the Director role.

Usage:
    python manage.py create_director_dashboards --owner-email director@example.com

Creates four dashboards:
  1. General Navigation  – sidebar + quick-links covering every module
  2. Approvals Hub       – focused on pending approvals and approval history
  3. Financial Overview  – financial KPIs and quick access to finance modules
  4. Operations Hub      – procurement, inventory, HR and assets
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils.text import slugify
import uuid

from dashboards.models import Dashboard, Widget, DashboardTheme

User = get_user_model()


# ── Colour palette ─────────────────────────────────────────────────────────────

THEMES = {
    "navy": {
        "primary_color": "#1e3a5f",
        "secondary_color": "#2563eb",
        "accent_color": "#3b82f6",
        "background_color": "#f0f4f8",
        "text_color": "#1e293b",
    },
    "forest": {
        "primary_color": "#14532d",
        "secondary_color": "#16a34a",
        "accent_color": "#22c55e",
        "background_color": "#f0fdf4",
        "text_color": "#14532d",
    },
    "amber": {
        "primary_color": "#78350f",
        "secondary_color": "#d97706",
        "accent_color": "#f59e0b",
        "background_color": "#fffbeb",
        "text_color": "#451a03",
    },
    "slate": {
        "primary_color": "#334155",
        "secondary_color": "#475569",
        "accent_color": "#64748b",
        "background_color": "#f8fafc",
        "text_color": "#0f172a",
    },
}


# ── Widget layout helpers ──────────────────────────────────────────────────────

def _sidebar_widget(dashboard, label="Navigation"):
    """Full-height sidebar at x=0."""
    return Widget(
        dashboard=dashboard,
        instance_key=f"sidebar-{uuid.uuid4()}",
        widget_type="sidebar",
        title=label,
        config={
            "hierarchyLevels": 2,
            "logoSize": "medium",
            "buttons": [],       # will be populated per dashboard below
        },
        layout_x=0, layout_y=0, layout_w=3, layout_h=12,
    )


def _quick_links_widget(dashboard, title, links, x=3, y=0, w=9, h=4):
    return Widget(
        dashboard=dashboard,
        instance_key=f"quicklinks-{uuid.uuid4()}",
        widget_type="quick_links",
        title=title,
        config={"links": links, "layout": "grid"},
        layout_x=x, layout_y=y, layout_w=w, layout_h=h,
    )


def _kpi_widget(dashboard, title, x=3, y=4, w=3, h=3, metric=None):
    cfg = {"title": title, "value": "—", "description": "Live data via data source"}
    if metric:
        cfg["metric"] = metric
    return Widget(
        dashboard=dashboard,
        instance_key=f"kpi-{uuid.uuid4()}",
        widget_type="kpi",
        title=title,
        config=cfg,
        layout_x=x, layout_y=y, layout_w=w, layout_h=h,
    )


def _chart_widget(dashboard, title, x=3, y=7, w=9, h=5, metric=None):
    cfg = {"chartType": "bar", "title": title}
    if metric:
        cfg["metric"] = metric
    return Widget(
        dashboard=dashboard,
        instance_key=f"chart-{uuid.uuid4()}",
        widget_type="chart",
        title=title,
        config=cfg,
        layout_x=x, layout_y=y, layout_w=w, layout_h=h,
    )

def _line_chart_widget(dashboard, title, x=7, y=7, w=5, h=5, metric=None):
    cfg = {"chartType": "line", "title": title}
    if metric:
        cfg["metric"] = metric
    return Widget(
        dashboard=dashboard,
        instance_key=f"linechart-{uuid.uuid4()}",
        widget_type="line_chart",
        title=title,
        config=cfg,
        layout_x=x, layout_y=y, layout_w=w, layout_h=h,
    )


def _pie_chart_widget(dashboard, title, x=3, y=12, w=3, h=5):
    return Widget(
        dashboard=dashboard,
        instance_key=f"piechart-{uuid.uuid4()}",
        widget_type="pie_chart",
        title=title,
        config={"chartType": "pie", "title": title},
        layout_x=x, layout_y=y, layout_w=w, layout_h=h,
    )


def _area_chart_widget(dashboard, title, x=6, y=12, w=3, h=5):
    return Widget(
        dashboard=dashboard,
        instance_key=f"areachart-{uuid.uuid4()}",
        widget_type="area_chart",
        title=title,
        config={"chartType": "area", "title": title},
        layout_x=x, layout_y=y, layout_w=w, layout_h=h,
    )


def _stat_grid_widget(dashboard, title, stats=None, x=3, y=4, w=4, h=4, metric=None):
    cfg = {
        "title": title,
        "stats": stats or [
            {"label": "Total",     "value": "—"},
            {"label": "Active",    "value": "—"},
            {"label": "Pending",   "value": "—"},
            {"label": "Completed", "value": "—"},
        ],
    }
    if metric:
        cfg["metric"] = metric
    return Widget(
        dashboard=dashboard,
        instance_key=f"statgrid-{uuid.uuid4()}",
        widget_type="stat_grid",
        title=title,
        config=cfg,
        layout_x=x, layout_y=y, layout_w=w, layout_h=h,
    )


def _progress_widget(dashboard, title, x=9, y=4, w=3, h=3, metric=None):
    cfg = {"title": title, "value": 0, "target": 100, "unit": "%"}
    if metric:
        cfg["metric"] = metric
    return Widget(
        dashboard=dashboard,
        instance_key=f"progress-{uuid.uuid4()}",
        widget_type="progress",
        title=title,
        config=cfg,
        layout_x=x, layout_y=y, layout_w=w, layout_h=h,
    )


def _list_widget(dashboard, title, x=9, y=7, w=3, h=5, metric=None):
    cfg = {"title": title, "items": []}
    if metric:
        cfg["metric"] = metric
    return Widget(
        dashboard=dashboard,
        instance_key=f"list-{uuid.uuid4()}",
        widget_type="list",
        title=title,
        config=cfg,
        layout_x=x, layout_y=y, layout_w=w, layout_h=h,
    )


def _text_widget(dashboard, title, content="", x=3, y=22, w=9, h=3):
    return Widget(
        dashboard=dashboard,
        instance_key=f"text-{uuid.uuid4()}",
        widget_type="text",
        title=title,
        config={"title": title, "content": content},
        layout_x=x, layout_y=y, layout_w=w, layout_h=h,
    )


def _table_widget(dashboard, title, x=3, y=17, w=9, h=5, metric=None):
    cfg = {"title": title, "columns": [], "dataSource": ""}
    if metric:
        cfg["metric"] = metric
    return Widget(
        dashboard=dashboard,
        instance_key=f"table-{uuid.uuid4()}",
        widget_type="table",
        title=title,
        config=cfg,
        layout_x=x, layout_y=y, layout_w=w, layout_h=h,
    )


def _navigation_widget(dashboard, title, links=None, x=3, y=22, w=6, h=4):
    return Widget(
        dashboard=dashboard,
        instance_key=f"navigation-{uuid.uuid4()}",
        widget_type="navigation",
        title=title,
        config={"title": title, "links": links or []},
        layout_x=x, layout_y=y, layout_w=w, layout_h=h,
    )

# ── Link helpers ───────────────────────────────────────────────────────────────

def _link(label, url, icon="link", color="#3b82f6"):
    return {"id": f"lnk-{uuid.uuid4()}", "label": label, "url": url,
            "icon": icon, "color": color}


def _btn(label, url, icon="home"):
    """Top-level sidebar button (no children)."""
    return {"id": f"btn-{uuid.uuid4()}", "label": label,
            "url": url, "icon": icon, "children": []}


def _section(label, icon, children):
    """Top-level sidebar section that expands to show child links."""
    return {
        "id": f"sec-{uuid.uuid4()}",
        "label": label,
        "icon": icon,
        "children": [
            {"id": f"child-{uuid.uuid4()}", "label": c["label"],
             "url": c["url"], "icon": c.get("icon", "file-text"), "children": []}
            for c in children
        ],
    }


# ── Command ────────────────────────────────────────────────────────────────────

class Command(BaseCommand):
    help = "Seed default Director dashboards (general navigation, approvals, financial, operations)"

    def add_arguments(self, parser):
        parser.add_argument("--owner-email", type=str, required=True,
                            help="Email address of the dashboard owner (usually a Director account)")
        parser.add_argument("--force", action="store_true",
                            help="Re-create dashboards even if they already exist")

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            owner = User.objects.get(email=options["owner_email"])
        except User.DoesNotExist:
            self.stderr.write(self.style.ERROR(
                f"No user found with email: {options['owner_email']}"
            ))
            return

        branch = getattr(owner, "branch", None) or (
            owner.branches.first() if hasattr(owner, "branches") else None
        )
        tenant = getattr(owner, "tenant", None)

        self.stdout.write(self.style.SUCCESS(
            f"\n{'='*70}\n  Creating Director Dashboards for {owner.email}\n{'='*70}\n"
        ))

        definitions = [
            ("director-general-nav",          self._build_general_navigation),
            ("director-approvals-hub",         self._build_approvals_hub),
            ("director-financial-overview",    self._build_financial_overview),
            ("director-operations-hub",        self._build_operations_hub),
            ("director-full-showcase",         self._build_full_showcase),
        ]

        for slug_base, builder in definitions:
            slug = slug_base
            if Dashboard.objects.filter(slug=slug).exists():
                if options["force"]:
                    self.stdout.write(f"  ⚠  Deleting existing dashboard: {slug}")
                    Dashboard.objects.filter(slug=slug).hard_delete()
                else:
                    self.stdout.write(f"  ✓  Already exists, skipping: {slug}")
                    continue

            dashboard, widget_count = builder(owner, branch, slug, tenant)
            self.stdout.write(self.style.SUCCESS(
                f"  ✅ Created '{dashboard.name}' → /dashboard/{dashboard.id}/  "
                f"({widget_count} widgets)"
            ))

        self.stdout.write(self.style.SUCCESS("\n✅ All Director dashboards created.\n"))

    # ── Dashboard builders ────────────────────────────────────────────────────

    def _make_theme(self, name, palette_key, owner, branch, tenant=None):
        theme_name = f"Director – {name}"
        palette = THEMES[palette_key]
        theme, _ = DashboardTheme.objects.get_or_create(
            name=theme_name,
            defaults={**palette, "branch": branch, "tenant": tenant},
        )
        # Ensure tenant is set even if the record already existed without it
        if theme.tenant is None and tenant is not None:
            theme.tenant = tenant
            theme.save(update_fields=["tenant"])
        return theme

    def _make_dashboard(self, slug, name, description, theme, owner, branch, is_default=False, tenant=None):
        return Dashboard.objects.create(
            slug=slug,
            name=name,
            description=description,
            theme=theme,
            is_default=is_default,
            is_active=True,
            grid_columns=12,
            branch=branch,
            created_by=owner,
            tenant=tenant,
        )

    # ── 1. General Navigation Dashboard ──────────────────────────────────────

    def _build_general_navigation(self, owner, branch, slug, tenant=None):
        theme = self._make_theme("General", "navy", owner, branch, tenant)
        dashboard = self._make_dashboard(
            slug=slug,
            name="Director – General Navigation",
            description=(
                "Master navigation dashboard for the Director. "
                "Provides quick access to every module via a sidebar and quick-link tiles."
            ),
            theme=theme, owner=owner, branch=branch, is_default=True, tenant=tenant,
        )

        sidebar = _sidebar_widget(dashboard, "All Modules")
        sidebar.config["buttons"] = [
            _section("Financial", "dollar-sign", [
                {"label": "Invoices",            "url": "/sales/invoices"},
                {"label": "Receivables",         "url": "/receivables/dashboard"},
                {"label": "Accounts Payable",    "url": "/liabilities/payables"},
                {"label": "Treasury",            "url": "/treasury/dashboard"},
                {"label": "Bank Accounts",       "url": "/banks/accounts"},
                {"label": "Chart of Accounts",   "url": "/accounts"},
                {"label": "Journal Entries",     "url": "/transactions"},
            ]),
            _section("Students / Clients", "graduation-cap", [
                {"label": "Client Management",   "url": "/clients"},
                {"label": "Entitlements",        "url": "/incomes/entitlements"},
                {"label": "Fee Structures",      "url": "/incomes/fee-structures"},
                {"label": "Statements",          "url": "/receivables/statements"},
            ]),
            _section("Operations", "package", [
                {"label": "Procurement",         "url": "/procurement"},
                {"label": "Inventory",           "url": "/inventory"},
                {"label": "HR",                  "url": "/hr"},
                {"label": "Assets",              "url": "/assets"},
            ]),
            _section("Reports", "bar-chart", [
                {"label": "Reports Centre",      "url": "/reports"},
                {"label": "Trial Balance",       "url": "/reports/financial/trial-balance"},
                {"label": "Profit & Loss",       "url": "/reports/financial/profit-loss"},
                {"label": "Balance Sheet",       "url": "/reports/financial/balance-sheet"},
            ]),
            _section("Admin", "settings", [
                {"label": "Approvals",           "url": "/approvals"},
                {"label": "User Management",     "url": "/settings"},
                {"label": "Workflows",           "url": "/admin/workflows"},
                {"label": "Dashboard Builder",   "url": "/dashboard/create"},
            ]),
        ]

        quick_links_widget = _quick_links_widget(
            dashboard, "Quick Access", [
                _link("Dashboard Home",     "/dashboard",                   "layout-dashboard", "#1e3a5f"),
                _link("Invoices",           "/sales/invoices",              "file-text",        "#2563eb"),
                _link("Receivables",        "/receivables/dashboard",       "trending-up",      "#16a34a"),
                _link("Approvals",          "/approvals",                   "check-circle",     "#d97706"),
                _link("Reports",            "/reports",                     "bar-chart",        "#7c3aed"),
                _link("HR",                 "/hr",                          "users",            "#dc2626"),
                _link("Procurement",        "/procurement",                 "shopping-cart",    "#0891b2"),
                _link("Inventory",          "/inventory",                   "warehouse",        "#65a30d"),
                _link("Trial Balance",      "/reports/financial/trial-balance", "calculator",  "#1d4ed8"),
            ],
        )

        Widget.objects.bulk_create([sidebar, quick_links_widget])
        return dashboard, 2

    # ── 2. Approvals Hub ─────────────────────────────────────────────────────

    def _build_approvals_hub(self, owner, branch, slug, tenant=None):
        theme = self._make_theme("Approvals", "amber", owner, branch, tenant)
        dashboard = self._make_dashboard(
            slug=slug,
            name="Director – Approvals Hub",
            description=(
                "Dedicated approvals dashboard. "
                "Monitor pending items, bank-transfer approvals, and submission history."
            ),
            theme=theme, owner=owner, branch=branch, tenant=tenant,
        )

        sidebar = _sidebar_widget(dashboard, "Approvals")
        sidebar.config["buttons"] = [
            _btn("Pending Approvals",       "/approvals/pending",                "clock"),
            _btn("All Approvals",           "/approvals",                        "check-square"),
            _btn("Bank Transfer Approvals", "/banks/transfers/approvals",        "arrow-left-right"),
            _btn("Form Submissions",        "/forms/submissions",                "inbox"),
            _btn("All Submissions",         "/admin/submissions",                "list"),
            _btn("Workflows",               "/admin/workflows",                  "git-branch"),
        ]

        quick_links = _quick_links_widget(
            dashboard, "Approval Quick Links", [
                _link("Pending Approvals",       "/approvals/pending",            "clock",            "#d97706"),
                _link("All Approvals",           "/approvals",                    "check-circle",     "#16a34a"),
                _link("Bank Transfer Approvals", "/banks/transfers/approvals",    "arrow-left-right", "#2563eb"),
                _link("My Submissions",          "/forms/submissions",            "file-text",        "#7c3aed"),
                _link("All Submissions",         "/admin/submissions",            "inbox",            "#dc2626"),
                _link("Workflow Management",     "/admin/workflows",              "git-branch",       "#0891b2"),
            ],
        )

        # KPI tiles for approvals volume
        kpi_pending  = _kpi_widget(dashboard, "Pending Approvals",   x=3, y=4, w=3, h=3, metric="pending_approvals")
        kpi_approved = _kpi_widget(dashboard, "Pending Expenses",    x=6, y=4, w=3, h=3, metric="pending_expenses")
        kpi_rejected = _kpi_widget(dashboard, "Pending Procurement", x=9, y=4, w=3, h=3, metric="pending_procurement")

        bar      = _chart_widget(dashboard,      "Approvals Over Time",  x=3, y=7, w=9, h=5, metric="approvals_trend")
        stat_grid = _stat_grid_widget(dashboard, "Approval Stats", x=3, y=12, w=6, h=4, metric="approval_stats")
        progress = _progress_widget(dashboard, "Monthly Approval Rate", x=9, y=12, w=3, h=4, metric="approval_rate")

        Widget.objects.bulk_create([
            sidebar, quick_links, kpi_pending, kpi_approved, kpi_rejected,
            bar, stat_grid, progress,
        ])
        return dashboard, 8

    # ── 3. Financial Overview ─────────────────────────────────────────────────

    def _build_financial_overview(self, owner, branch, slug, tenant=None):
        theme = self._make_theme("Financial", "forest", owner, branch, tenant)
        dashboard = self._make_dashboard(
            slug=slug,
            name="Director – Financial Overview",
            description=(
                "High-level financial dashboard. "
                "KPIs for revenue, expenses, receivables, and key financial reports."
            ),
            theme=theme, owner=owner, branch=branch, tenant=tenant,
        )

        sidebar = _sidebar_widget(dashboard, "Finance")
        sidebar.config["buttons"] = [
            _section("Income", "trending-up", [
                {"label": "Invoices",            "url": "/sales/invoices"},
                {"label": "Receivables",         "url": "/receivables/dashboard"},
                {"label": "Aging Report",        "url": "/receivables/aging-report"},
                {"label": "Collections",         "url": "/receivables/collections"},
                {"label": "Payment Trends",      "url": "/receivables/payment-trends"},
            ]),
            _section("Payments & Banking", "credit-card", [
                {"label": "Accounts Payable",    "url": "/liabilities/payables"},
                {"label": "Bank Accounts",       "url": "/banks/accounts"},
                {"label": "Bank Reconciliation", "url": "/treasury/bank-reconciliation"},
                {"label": "Bank Payments",       "url": "/banks/payments"},
                {"label": "Inter-bank Transfers","url": "/banks/transfers"},
            ]),
            _section("Expenses", "dollar-sign", [
                {"label": "All Expenses",        "url": "/expenses"},
                {"label": "Prepaid Expenses",    "url": "/expenses/prepaid"},
                {"label": "Petty Cash",          "url": "/treasury/petty-cash"},
                {"label": "Vouchers",            "url": "/expenses/vouchers"},
            ]),
            _section("Reports", "bar-chart", [
                {"label": "Trial Balance",       "url": "/reports/financial/trial-balance"},
                {"label": "Profit & Loss",       "url": "/reports/financial/profit-loss"},
                {"label": "Balance Sheet",       "url": "/reports/financial/balance-sheet"},
                {"label": "Reports Centre",      "url": "/reports"},
            ]),
            _section("Accounting", "book-open", [
                {"label": "Chart of Accounts",   "url": "/accounts"},
                {"label": "Journal Entries",     "url": "/transactions"},
                {"label": "Account Ledgers",     "url": "/accounts/ledger-search"},
            ]),
        ]

        quick_links = _quick_links_widget(
            dashboard, "Financial Quick Access", [
                _link("Create Invoice",      "/sales/invoices/create",            "file-plus",        "#16a34a"),
                _link("Receivables",         "/receivables/dashboard",            "trending-up",      "#2563eb"),
                _link("Aging Report",        "/receivables/aging-report",         "clock",            "#d97706"),
                _link("Bank Reconciliation", "/treasury/bank-reconciliation",     "check-circle",     "#0891b2"),
                _link("Accounts Payable",    "/liabilities/payables",             "receipt",          "#dc2626"),
                _link("Trial Balance",       "/reports/financial/trial-balance",  "calculator",       "#1d4ed8"),
                _link("Profit & Loss",       "/reports/financial/profit-loss",    "bar-chart-3",      "#7c3aed"),
                _link("Balance Sheet",       "/reports/financial/balance-sheet",  "scale",            "#0f766e"),
            ],
        )

        kpi_revenue      = _kpi_widget(dashboard, "Total Revenue",           x=3, y=4, w=3, h=3, metric="revenue_mtd")
        kpi_expenses     = _kpi_widget(dashboard, "Total Expenses",          x=6, y=4, w=3, h=3, metric="expenses_mtd")
        kpi_receivables  = _kpi_widget(dashboard, "Outstanding Receivables", x=9, y=4, w=3, h=3, metric="outstanding_receivables")

        line  = _line_chart_widget(dashboard,  "Revenue Trend",       x=3, y=7,  w=5, h=5, metric="income_trend")
        pie   = _pie_chart_widget(dashboard,   "Expense Breakdown",   x=8, y=7,  w=4, h=5)
        area  = _area_chart_widget(dashboard,  "Cash Flow",           x=3, y=12, w=9, h=4)
        table = _table_widget(dashboard,       "Recent Transactions", x=3, y=16, w=9, h=5, metric="recent_transactions")

        Widget.objects.bulk_create([
            sidebar, quick_links, kpi_revenue, kpi_expenses, kpi_receivables,
            line, pie, area, table,
        ])
        return dashboard, 9

    # ── 4. Operations Hub ─────────────────────────────────────────────────────

    def _build_operations_hub(self, owner, branch, slug, tenant=None):
        theme = self._make_theme("Operations", "slate", owner, branch, tenant)
        dashboard = self._make_dashboard(
            slug=slug,
            name="Director – Operations Hub",
            description=(
                "Operations dashboard for the Director. "
                "Covers HR, procurement, inventory, and asset management."
            ),
            theme=theme, owner=owner, branch=branch, tenant=tenant,
        )

        sidebar = _sidebar_widget(dashboard, "Operations")
        sidebar.config["buttons"] = [
            _section("Human Resources", "users", [
                {"label": "HR Dashboard",        "url": "/hr"},
                {"label": "Staff",               "url": "/hr/staff"},
                {"label": "Attendance",          "url": "/hr/attendance"},
                {"label": "Leave Management",    "url": "/hr/leave-requests"},
                {"label": "Payroll",             "url": "/hr/payroll"},
            ]),
            _section("Procurement", "shopping-cart", [
                {"label": "Procurement",         "url": "/procurement"},
                {"label": "Purchase Orders",     "url": "/procurement/orders"},
                {"label": "Requisitions",        "url": "/procurement/requisitions"},
                {"label": "Suppliers",           "url": "/procurement/suppliers"},
                {"label": "Goods Receipt",       "url": "/procurement/grn"},
                {"label": "Supplier Quotes",     "url": "/procurement/quotes"},
            ]),
            _section("Inventory", "warehouse", [
                {"label": "Inventory",           "url": "/inventory"},
                {"label": "Items",               "url": "/inventory/items"},
                {"label": "Stock Movements",     "url": "/inventory/movements"},
                {"label": "Adjustments",         "url": "/inventory/adjustments"},
                {"label": "Locations",           "url": "/inventory/locations"},
            ]),
            _section("Assets & Resources", "hard-drive", [
                {"label": "Asset Management",    "url": "/assets"},
                {"label": "Fleet Fuel Monitor",  "url": "/assets/fuel-monitor"},
                {"label": "Fuel Report",         "url": "/expenses/resource-consumption/fuel-report"},
                {"label": "Resources",           "url": "/expenses/resources"},
                {"label": "Resource Consumption","url": "/expenses/resource-consumption"},
                {"label": "Irregularities",      "url": "/expenses/resource-consumption/irregularities"},
            ]),
            _section("Products", "package", [
                {"label": "Products",            "url": "/products"},
                {"label": "Add Product",         "url": "/products/new"},
            ]),
        ]

        quick_links = _quick_links_widget(
            dashboard, "Operations Quick Access", [
                _link("HR Dashboard",            "/hr",                           "users",        "#2563eb"),
                _link("Staff Management",        "/hr/staff",                     "user-check",   "#16a34a"),
                _link("Leave Requests",          "/hr/leave-requests",            "calendar",     "#d97706"),
                _link("Procurement",             "/procurement",                  "shopping-cart","#7c3aed"),
                _link("Purchase Orders",         "/procurement/orders",           "shopping-bag", "#0891b2"),
                _link("Inventory",               "/inventory",                    "warehouse",    "#65a30d"),
                _link("Stock Movements",         "/inventory/movements",          "arrow-right-left","#dc2626"),
                _link("Assets",                  "/assets",                       "hard-drive",   "#1d4ed8"),
                _link("Fuel Report",             "/expenses/resource-consumption/fuel-report", "fuel", "#ea580c"),
            ],
        )

        fuel_stat = Widget(
            dashboard=dashboard,
            instance_key=f"fuel-summary-{uuid.uuid4()}",
            title="Fuel Usage (30 days)",
            widget_type="stat_grid",
            layout_x=3, layout_y=18, layout_w=5, layout_h=4,
            config={"metric": "fuel_summary"},
        )

        stat_grid = _stat_grid_widget(dashboard, "Operations Stats", x=3, y=4, w=5, h=4, metric="operations_stats")
        progress = _progress_widget(dashboard, "Monthly Procurement Target", x=8, y=4, w=4, h=4, metric="procurement_target")

        bar   = _chart_widget(dashboard,  "Procurement Spend by Month", x=3, y=8, w=5, h=5, metric="procurement_spend")
        lst   = _list_widget(dashboard,   "Recent Stock Movements",     x=8, y=8, w=4, h=5, metric="stock_movements")
        table = _table_widget(dashboard,  "Open Purchase Orders",       x=3, y=13, w=9, h=5, metric="open_purchase_orders")

        Widget.objects.bulk_create([
            sidebar, quick_links, stat_grid, progress, bar, lst, table, fuel_stat,
        ])
        return dashboard, 8

    # ── 5. Full Widget Showcase ─────────────────────────────────────────────────────────────

    def _build_full_showcase(self, owner, branch, slug, tenant=None):
        theme = self._make_theme("Showcase", "navy", owner, branch, tenant)
        dashboard = self._make_dashboard(
            slug=slug,
            name="Director – Full Widget Showcase",
            description=(
                "Demonstration dashboard that includes every available widget type. "
                "Use this to verify all widgets render and behave correctly."
            ),
            theme=theme, owner=owner, branch=branch, tenant=tenant,
        )

        sidebar = _sidebar_widget(dashboard, "All Widgets")
        sidebar.config["buttons"] = [
            _btn("Overview",   "/dashboard", "layout-dashboard"),
            _btn("Reports",    "/reports",   "bar-chart"),
            _btn("Settings",   "/settings",  "settings"),
        ]

        # ── Sample data constants ──────────────────────────────────────────────
        _monthly = [
            {"name": "Jan", "value": 8_200_000}, {"name": "Feb", "value": 9_500_000},
            {"name": "Mar", "value": 7_800_000}, {"name": "Apr", "value": 11_200_000},
            {"name": "May", "value": 10_500_000}, {"name": "Jun", "value": 13_000_000},
        ]
        _expenses_pie = [
            {"name": "Salaries",    "value": 45},
            {"name": "Utilities",   "value": 12},
            {"name": "Supplies",    "value": 18},
            {"name": "Maintenance", "value": 10},
            {"name": "Other",       "value": 15},
        ]
        _growth_area = [
            {"name": "Q1 '24", "value": 980},  {"name": "Q2 '24", "value": 1050},
            {"name": "Q3 '24", "value": 1120}, {"name": "Q4 '24", "value": 1180},
            {"name": "Q1 '25", "value": 1200}, {"name": "Q2 '25", "value": 1240},
        ]
        _table_cols = [
            {"label": "Date",        "field": "date",        "format": "date"},
            {"label": "Description", "field": "description"},
            {"label": "Amount (₦)",  "field": "amount",      "format": "currency"},
            {"label": "Status",      "field": "status"},
        ]
        _table_rows = [
            {"date": "2025-06-01", "description": "Term 2 Tuition Fees",    "amount": 4_500_000, "status": "Paid"},
            {"date": "2025-06-05", "description": "Staff Salaries – May",   "amount": 2_800_000, "status": "Processed"},
            {"date": "2025-06-10", "description": "Hostel Fees Batch 3",    "amount": 1_800_000, "status": "Paid"},
            {"date": "2025-06-12", "description": "Utility Bills Q2",       "amount": 320_000,   "status": "Pending"},
            {"date": "2025-06-15", "description": "Library Books Purchase", "amount": 145_000,   "status": "Approved"},
        ]
        _list_items = [
            {"title": "24 new student registrations pending",  "icon": "users",         "description": "Awaiting Director approval"},
            {"title": "PR-2025-041 submitted for approval",    "icon": "shopping-cart", "description": "₦180,000 – Lab equipment"},
            {"title": "Leave: Grace Adeleke",                  "icon": "calendar",      "description": "Annual leave Jun 20 – Jun 30"},
            {"title": "Invoice #187 overdue",                  "icon": "file-text",     "description": "₦45,000 – 12 days overdue"},
            {"title": "Staff Training scheduled Jun 25",       "icon": "check-circle",  "description": "Mandatory CPD session"},
        ]

        widgets = [
            sidebar,
            _quick_links_widget(dashboard, "Quick Links", [
                _link("Invoices",    "/sales/invoices",  "file-text",     "#2563eb"),
                _link("HR",          "/hr",              "users",         "#16a34a"),
                _link("Procurement", "/procurement",     "shopping-cart", "#d97706"),
                _link("Reports",     "/reports",         "bar-chart",     "#7c3aed"),
                _link("Inventory",   "/inventory",       "warehouse",     "#0891b2"),
                _link("Approvals",   "/approvals",       "check-circle",  "#dc2626"),
            ], x=3, y=0, w=9, h=4),

            # ── KPI row ─────────────────────────────────────────────────────
            Widget(
                dashboard=dashboard, instance_key=f"kpi-revenue-{uuid.uuid4()}",
                widget_type="kpi", title="Total Revenue",
                config={
                    "value": 60_200_000, "formatted": "₦60.2M",
                    "format": "currency", "color": "#10b981", "icon": "dollar-sign",
                    "show_trend": True,
                    "trend": {"direction": "up", "percentage": 12.5, "comparison": "vs last term"},
                },
                layout_x=3, layout_y=4, layout_w=3, layout_h=3,
            ),
            Widget(
                dashboard=dashboard, instance_key=f"kpi-students-{uuid.uuid4()}",
                widget_type="kpi", title="Total Students",
                config={
                    "value": 1240, "formatted": "1,240",
                    "format": "number", "color": "#3b82f6", "icon": "users",
                    "show_trend": True,
                    "trend": {"direction": "up", "percentage": 3.3, "comparison": "vs last term"},
                },
                layout_x=6, layout_y=4, layout_w=3, layout_h=3,
            ),

            # ── Progress ────────────────────────────────────────────────────
            Widget(
                dashboard=dashboard, instance_key=f"progress-target-{uuid.uuid4()}",
                widget_type="progress", title="Monthly Target",
                config={
                    "value": 78, "target": 100,
                    "color": "#7c3aed", "show_percentage": True,
                },
                layout_x=9, layout_y=4, layout_w=3, layout_h=3,
            ),

            # ── Chart row ───────────────────────────────────────────────────
            Widget(
                dashboard=dashboard, instance_key=f"barchart-{uuid.uuid4()}",
                widget_type="bar_chart", title="Bar Chart – Monthly Spend",
                config={
                    "data": _monthly, "x_axis": "name", "y_axis": "value",
                    "colors": ["#2563eb"], "show_grid": True,
                },
                layout_x=3, layout_y=7, layout_w=4, layout_h=5,
            ),
            Widget(
                dashboard=dashboard, instance_key=f"linechart-{uuid.uuid4()}",
                widget_type="line_chart", title="Line Chart – Revenue Trend",
                config={
                    "data": _monthly, "x_axis": "name", "y_axis": "value",
                    "colors": ["#0891b2"], "show_grid": True, "show_legend": False,
                },
                layout_x=7, layout_y=7, layout_w=5, layout_h=5,
            ),

            # ── Second chart row ─────────────────────────────────────────────
            Widget(
                dashboard=dashboard, instance_key=f"piechart-{uuid.uuid4()}",
                widget_type="pie_chart", title="Pie Chart – Expense Breakdown",
                config={
                    "data": _expenses_pie,
                    "colors": ["#2563eb", "#10b981", "#d97706", "#dc2626", "#7c3aed"],
                    "show_legend": True,
                },
                layout_x=3, layout_y=12, layout_w=3, layout_h=5,
            ),
            Widget(
                dashboard=dashboard, instance_key=f"areachart-{uuid.uuid4()}",
                widget_type="area_chart", title="Area Chart – Student Growth",
                config={
                    "data": _growth_area, "x_axis": "name", "y_axis": "value",
                    "colors": ["#0891b2"], "show_grid": True,
                },
                layout_x=6, layout_y=12, layout_w=3, layout_h=5,
            ),

            # ── Stats Grid ───────────────────────────────────────────────────
            _stat_grid_widget(dashboard, "Stats Grid", stats=[
                {"label": "Students",    "value": "1,240", "color": "#3b82f6"},
                {"label": "Staff",       "value": "85",    "color": "#10b981"},
                {"label": "Open Orders", "value": "12",    "color": "#d97706"},
                {"label": "Pending",     "value": "7",     "color": "#dc2626"},
            ], x=9, y=12, w=3, h=5),

            # ── Table + List row ─────────────────────────────────────────────
            Widget(
                dashboard=dashboard, instance_key=f"table-tx-{uuid.uuid4()}",
                widget_type="table", title="Data Table – Recent Transactions",
                config={
                    "columns": _table_cols,
                    "data": _table_rows,
                    "pagination": True,
                    "page_size": 5,
                },
                layout_x=3, layout_y=17, layout_w=6, layout_h=5,
            ),
            Widget(
                dashboard=dashboard, instance_key=f"list-updates-{uuid.uuid4()}",
                widget_type="list", title="Item List – Recent Updates",
                config={
                    "show_icon": True,
                    "items": _list_items,
                },
                layout_x=9, layout_y=17, layout_w=3, layout_h=5,
            ),

            # ── Navigation + Text row ────────────────────────────────────────
            _navigation_widget(dashboard, "Navigation Grid", links=[
                _link("Dashboard", "/dashboard", "layout-dashboard", "#1e3a5f"),
                _link("HR",        "/hr",        "users",            "#16a34a"),
                _link("Finance",   "/accounts",  "dollar-sign",      "#d97706"),
                _link("Reports",   "/reports",   "bar-chart",        "#7c3aed"),
            ], x=3, y=22, w=6, h=4),
            _text_widget(
                dashboard, "Notice Board",
                content=(
                    "<p><strong>Full Widget Showcase</strong> – all 13 widget types active.</p>"
                    "<ul style='margin-top:8px;padding-left:16px;line-height:1.8'>"
                    "<li>Sidebar &amp; Quick Links</li>"
                    "<li>KPI Cards (×2) &amp; Progress Bar</li>"
                    "<li>Bar, Line, Pie &amp; Area Charts</li>"
                    "<li>Stats Grid, Data Table &amp; List</li>"
                    "<li>Navigation Grid &amp; Text Block</li>"
                    "</ul>"
                ),
                x=9, y=22, w=3, h=4,
            ),
        ]

        Widget.objects.bulk_create(widgets)
        return dashboard, len(widgets)
