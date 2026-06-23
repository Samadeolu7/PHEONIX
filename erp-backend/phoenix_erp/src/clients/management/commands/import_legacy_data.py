"""
import_legacy_data.py
=====================
Imports balance snapshots exported from Krystartust ERP into Phoenix ERP.

This command is the second half of the two-step migration:
  1. Run  export_migration_data  on the old system → produces a directory of JSON files.
  2. Copy that directory to the Phoenix server, then run this command.

What it does (in order)
-----------------------
  Step 1  Bootstrap  – create Tenant, admin User, Branch if they do not already exist.
  Step 2  Chart of Accounts  – create the parent (GL) Account records needed for each account type.
  Step 3  Financial Products  – create minimal Product / LoanProduct records.
  Step 4  Client Groups  – re-create all Ajo / standing groups.
  Step 5  Clients  – create every client with:
              • external_id  = old client_id  (e.g. WL0001)
              • client_id    = new Phoenix ID  (e.g. WL-00001)
              • client_type  mapped from old type codes
  Step 6  Savings accounts  – create SavingsAccount + child SAVINGS Account (with opening balance).
  Step 7  Loans  – create LoanAccount + child LOAN Account (outstanding balance only).
  Step 8  Banks / Cash  – create child ASSET Accounts for each bank/cash record.
  Step 9  Income Accounts  – create child INCOME Accounts.
  Step 10 Expense Accounts  – create child EXPENSE Accounts.
  Step 11 Liability Accounts  – create child LIABILITY Accounts.

Key design decisions
--------------------
* No transaction history is migrated – only the current balance figures.
* Accounts are created with the balance set directly on creation (new records have no PK yet,
  so Phoenix's balance-protection guard does not apply).
* The command is idempotent: re-running it will skip any record that already exists
  (detected by external_id / name / code as appropriate).
* A dry-run mode is supported: --dry-run prints what *would* happen without touching the DB.

Usage
-----
    python manage.py import_legacy_data \\
        --data-dir /path/to/migration_data \\
        --branch-name "Head Office" \\
        --tenant-name "Krystartrust" \\
        --tenant-slug "kti" \\
        [--admin-email admin@krystartrust.ng] \\
        [--dry-run]
"""

import json
import os
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

User = get_user_model()


# ────────────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────────────

def _load(data_dir: str, filename: str) -> list:
    """Load a JSON array from the migration data directory."""
    path = os.path.join(data_dir, filename)
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _d(value, default=Decimal("0.00")) -> Decimal:
    """Safely convert a string/float/None to Decimal."""
    if value is None:
        return default
    try:
        return Decimal(str(value))
    except InvalidOperation:
        return default


def _date(value) -> date:
    """Parse an ISO date string or return today."""
    if not value:
        return date.today()
    try:
        if isinstance(value, date):
            return value
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        return date.today()


def _split_name(full_name: str):
    """
    Split a single-field name into (first_name, last_name).
    Strategy: first word → first_name, remainder → last_name.
    """
    parts = (full_name or "").strip().split(None, 1)
    first = parts[0] if parts else "Unknown"
    last = parts[1] if len(parts) > 1 else "IMPORTED"
    return first, last


# ────────────────────────────────────────────────────────────────────────────
# Management command
# ────────────────────────────────────────────────────────────────────────────

class Command(BaseCommand):
    help = "Import balance snapshots from Krystartust ERP into Phoenix ERP."

    # ------------------------------------------------------------------
    def add_arguments(self, parser):
        parser.add_argument(
            "--data-dir",
            required=True,
            help="Path to the directory produced by export_migration_data.",
        )
        parser.add_argument("--branch-name", default="Head Office")
        parser.add_argument("--branch-code", default="HO")
        parser.add_argument("--tenant-name", default="Krystartrust")
        parser.add_argument("--tenant-slug", default="kti")
        parser.add_argument(
            "--admin-email",
            default="admin@krystartrust.ng",
            help="E-mail of the admin user who will own imported records.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print counts of what would be imported without writing to the DB.",
        )

    # ------------------------------------------------------------------
    def handle(self, *args, **options):
        data_dir = options["data_dir"]
        dry_run = options["dry_run"]

        if not os.path.isdir(data_dir):
            raise CommandError(f"Data directory not found: {data_dir}")

        # ── lazy imports (avoids import-time circular deps) ──────────────────
        from accounts.models import Account, AccountCategory
        from branches.models import Branch
        from clients.models import Client, ClientGroup
        from loans.models import LoanAccount, LoanProduct
        from products.models import Product
        from savings.models import SavingsAccount
        from users.models import Tenant

        if dry_run:
            self.stdout.write(self.style.WARNING("\n[DRY-RUN] No data will be written.\n"))

        # ── Load JSON files ───────────────────────────────────────────────────
        groups_data         = _load(data_dir, "groups.json")
        clients_data        = _load(data_dir, "clients.json")
        savings_data        = _load(data_dir, "savings.json")
        loans_data          = _load(data_dir, "loans.json")
        schedules_data      = _load(data_dir, "loan_schedules.json")
        banks_data          = _load(data_dir, "banks.json")
        income_data         = _load(data_dir, "income_accounts.json")
        expense_data        = _load(data_dir, "expense_accounts.json")
        liability_data      = _load(data_dir, "liability_accounts.json")
        savings_pmts_data   = _load(data_dir, "savings_payments.json")
        inventory_data      = _load(data_dir, "inventory.json")
        loan_disb_data      = _load(data_dir, "loan_disbursements.json")
        loan_pmts_data      = _load(data_dir, "loan_payments.json")
        income_pmts_data    = _load(data_dir, "income_payments.json")
        expense_pmts_data   = _load(data_dir, "expense_payments.json")
        liability_pmts_data = _load(data_dir, "liability_payments.json")

        self.stdout.write(
            self.style.MIGRATE_HEADING(
                f"\nLoaded from {data_dir}/\n"
                f"  clients={len(clients_data)}, groups={len(groups_data)}, "
                f"savings={len(savings_data)}, loans={len(loans_data)}, "
                f"schedules={len(schedules_data)}, "
                f"banks={len(banks_data)}, income={len(income_data)}, "
                f"expenses={len(expense_data)}, liabilities={len(liability_data)}, "
                f"savings_payments={len(savings_pmts_data)}, "
                f"inventory={len(inventory_data)}, "
                f"loan_disbursements={len(loan_disb_data)}, "
                f"loan_payments={len(loan_pmts_data)}, "
                f"income_payments={len(income_pmts_data)}, "
                f"expense_payments={len(expense_pmts_data)}, "
                f"liability_payments={len(liability_pmts_data)}\n"
            )
        )

        if dry_run:
            self.stdout.write(self.style.SUCCESS("Dry run complete – nothing written."))
            return

        # Suppress the post_save signal on Tenant/Account that tries to
        # auto-seed a chart of accounts.  We build the chart ourselves in
        # Steps 1-2, so the signal would only fail (no parent accounts exist
        # yet when Tenant is first created) and produce noise in the logs.
        from common.managers import _thread_locals
        _thread_locals.skip_account_components = True
        try:
            with transaction.atomic():
                # ── STEP 1: Bootstrap  ───────────────────────────────────────
                self.stdout.write("Step 1/19  Bootstrap (Tenant → User → Branch) …")
                owner, tenant, branch = self._bootstrap(
                    options, Tenant, Branch
                )

                # Context shared across all steps
                ctx = dict(
                    owner=owner,
                    tenant=tenant,
                    branch=branch,
                )

                # ── STEP 2: Chart of Accounts (parent GL accounts) ────────────
                self.stdout.write("Step 2/19  Chart of accounts …")
                gl = self._setup_chart_of_accounts(Account, ctx)

                # ── STEP 3: Financial Products ────────────────────────────────
                self.stdout.write("Step 3/19  Financial products …")
                products = self._setup_products(Product, LoanProduct, gl, ctx)

                # ── STEP 4: Client Groups ─────────────────────────────────────
                self.stdout.write("Step 4/19  Client groups …")
                group_map = self._import_groups(groups_data, ClientGroup, ctx)

                # ── STEP 5: Clients ───────────────────────────────────────────
                self.stdout.write("Step 5/19  Clients …")
                client_map = self._import_clients(clients_data, Client, ClientGroup, group_map, ctx)

                # ── STEP 6: Savings ───────────────────────────────────────────
                # ob_entries: (account, balance, balance_bf, "DR"|"CR") for
                # every child account with a non-zero imported balance.
                # Step 12 posts these as a single balanced GL transaction.
                ob_entries: list = []

                self.stdout.write("Step 6/19  Savings accounts …")
                self._import_savings(savings_data, SavingsAccount, Account, products, client_map, gl, ctx, ob_entries)

                # ── STEP 7: Loans ─────────────────────────────────────────────
                self.stdout.write("Step 7/19  Loan accounts …")
                self._import_loans(loans_data, schedules_data, LoanAccount, Account, products, client_map, gl, ctx, ob_entries)

                # ── STEP 8: Banks / Cash ──────────────────────────────────────
                self.stdout.write("Step 8/19  Bank / cash accounts …")
                self._import_banks(banks_data, Account, gl, ctx, ob_entries)

                # ── STEP 9: Inventory ─────────────────────────────────────────
                # Must run before Step 13 (OBE) so inventory balance_bf is captured.
                self.stdout.write("Step 9/19  Inventory …")
                self._import_inventory(inventory_data, Account, gl, ctx, ob_entries)

                # ── STEP 10: Income ───────────────────────────────────────────
                self.stdout.write("Step 10/19 Income accounts …")
                self._import_income(income_data, Account, gl, ctx, ob_entries)

                # ── STEP 11: Expenses ─────────────────────────────────────────
                self.stdout.write("Step 11/19 Expense accounts …")
                self._import_expenses(expense_data, Account, gl, ctx, ob_entries)

                # ── STEP 12: Liabilities ──────────────────────────────────────
                self.stdout.write("Step 12/19 Liability accounts …")
                self._import_liabilities(liability_data, Account, gl, ctx, ob_entries)

                # ── STEP 13: Opening balance transaction ──────────────────────
                self.stdout.write("Step 13/19 Opening balance transaction …")
                self._create_opening_balance_transaction(ob_entries, Account, ctx)

                # ── STEP 14: Savings payment history ──────────────────────────
                self.stdout.write("Step 14/19 Savings payment history …")
                self._import_savings_payments(
                    savings_pmts_data, banks_data, SavingsAccount, Account, gl, ctx
                )

                # ── STEP 15: Loan disbursement history (new loans issued this year) ──
                # Posts: Dr. Loan child account, Cr. Bank (money going out to borrowers).
                # Required because 2026-disbursed loans have opening_balance=0 and would
                # otherwise only accumulate repayment credits (Step 16), driving the
                # loan portfolio negative.
                self.stdout.write("Step 15/19 Loan disbursements …")
                self._import_loan_disbursements(
                    loan_disb_data, banks_data, LoanAccount, Account, gl, ctx
                )

                # ── STEP 16: Loan payment history (repayments) ────────────────
                self.stdout.write("Step 16/19 Loan payment history …")
                self._import_loan_payments(
                    loan_pmts_data, banks_data, LoanAccount, Account, gl, ctx
                )

                # ── STEP 17: Income payment history ───────────────────────────
                self.stdout.write("Step 17/19 Income payment history …")
                self._import_income_payments(
                    income_pmts_data, banks_data, Account, gl, ctx
                )

                # ── STEP 18: Expense payment history ──────────────────────────
                self.stdout.write("Step 18/19 Expense payment history …")
                self._import_expense_payments(
                    expense_pmts_data, banks_data, Account, gl, ctx
                )

                # ── STEP 19: Liability payment history ────────────────────────
                self.stdout.write("Step 19/19 Liability payment history …")
                self._import_liability_payments(
                    liability_pmts_data, banks_data, Account, gl, ctx
                )

        finally:
            _thread_locals.skip_account_components = False

        self.stdout.write(self.style.SUCCESS("\nMigration complete!\n"))

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 1 – Bootstrap
    # ══════════════════════════════════════════════════════════════════════════

    def _bootstrap(self, options, Tenant, Branch):
        admin_email = options["admin_email"]
        tenant_name = options["tenant_name"]
        tenant_slug = options["tenant_slug"]
        branch_name = options["branch_name"]
        branch_code = options["branch_code"]

        # Admin user – use existing superuser or create one
        owner = User.objects.filter(is_superuser=True).first()
        if not owner:
            owner = User.objects.filter(email=admin_email).first()
        if not owner:
            owner = User.objects.create_superuser(
                username=admin_email.split("@")[0],
                email=admin_email,
                password="ChangeMe@2024!",  # must be changed after migration
            )
            self.stdout.write(
                self.style.WARNING(
                    f"    Created admin user '{owner.username}'. "
                    "CHANGE THE PASSWORD IMMEDIATELY."
                )
            )

        # Tenant
        tenant, _ = Tenant.objects.get_or_create(
            slug=tenant_slug,
            defaults={"name": tenant_name, "owner": owner},
        )
        # Link owner → tenant if not already linked
        if not hasattr(owner, "tenant") or owner.tenant is None:
            try:
                owner.tenant = tenant
                owner.save(update_fields=["tenant"])
            except Exception:
                pass

        # Branch
        branch, _ = Branch.objects.get_or_create(
            code=branch_code,
            defaults={
                "name": branch_name,
                "tenant": tenant,
                "owner": owner,
            },
        )

        # Fix the admin Staff profile created by the auto-signal before tenant
        # was linked: patch tenant/branch onto it and retry leave balances.
        try:
            from hr.models import Staff
            from hr.services.leave_service import LeaveService
            import datetime as _dt
            staff = Staff.objects.filter(user=owner).first()
            if staff:
                updates = []
                if staff.tenant_id is None:
                    staff.tenant = tenant
                    updates.append("tenant")
                if staff.branch_id is None:
                    staff.branch = branch
                    updates.append("branch")
                if updates:
                    staff.save(update_fields=updates)
                LeaveService.initialize_leave_balances(staff, _dt.date.today().year)
        except Exception as exc:
            self.stdout.write(self.style.WARNING(f"    Admin leave balances: {exc}"))

        self.stdout.write(
            f"    tenant={tenant.slug}, branch={branch.name}, owner={owner.username}"
        )
        return owner, tenant, branch

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 2 – Chart of Accounts (parent GL accounts)
    # ══════════════════════════════════════════════════════════════════════════

    # GL parent accounts — codes MUST match setup_accounts.py exactly.
    #
    # Accounting treatment (IFRS / CBN Microfinance Bank regulations):
    #   LOAN    → 1150  Customer Loan Portfolio  (Asset:  money owed TO the MFB)
    #   SAVINGS → 2140  Customer Savings/Deposits (Liability: money owed BY the MFB)
    #   ASSET   → 1100  Cash and Cash Equivalents
    #   INCOME  → 4200  Other Operating Income
    #   EXPENSE → 5300  Administrative and General Expenses
    #   LIABILITY→ 2100  Trade and Other Payables
    #
    # Child sub-ledger codes use the format  PPPP-NNNNN  (e.g. 1150-00001).
    # This is unlimited in scale and never collides with sibling parent codes.
    _GL_PARENTS = [
        # (code, name, account_type)  ← code must match setup_accounts.py
        ("1150", "Customer Loan Portfolio",         "LOAN"),
        ("1100", "Cash and Cash Equivalents",        "ASSET"),
        ("2140", "Customer Savings and Deposits",    "SAVINGS"),
        ("2100", "Trade and Other Payables",         "LIABILITY"),
        ("4200", "Other Operating Income",           "INCOME"),
        ("5300", "Administrative and General Expenses", "EXPENSE"),
    ]

    def _setup_chart_of_accounts(self, Account, ctx):
        """
        Get-or-create the parent GL accounts required for migration.
        Returns a dict keyed by account_type string.

        IMPORTANT: We use get_or_create so this is safe whether the tenant
        already has a chart of accounts from setup_accounts (in which case the
        existing rows are returned) or is starting fresh.
        """
        gl = {}
        for code, name, atype in self._GL_PARENTS:
            acct, created = Account.objects.get_or_create(
                code=code,
                tenant=ctx["tenant"],
                branch=ctx["branch"],
                defaults={
                    "name": name,
                    "account_type": atype,
                    "account_level": Account.LEVEL_PARENT,
                    "owner": ctx["owner"],
                    "created_by": ctx["owner"],
                    "is_system_account": True,
                    "balance": Decimal("0.00"),
                    "balance_bf": Decimal("0.00"),
                },
            )
            gl[atype] = acct
            status = "created" if created else "exists"
            self.stdout.write(f"    [{status}] {code} – {acct.name}")
        return gl

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 3 – Financial Products
    # ══════════════════════════════════════════════════════════════════════════

    def _setup_products(self, Product, LoanProduct, gl, ctx):
        """
        Create two Savings products (SAV-REG, SAV-DC) and three Loan products
        (LN-DC, LN-WK, LN-MO) that match the canonical seed_microfinance_products
        codes used everywhere else in Phoenix ERP.

        Returns:
            {
                "savings": {
                    "N": <Product SAV-REG>,   # old Savings.type 'N' = Normal
                    "D": <Product SAV-DC>,    # old Savings.type 'D' = Daily Contribution
                },
                "loans": {
                    "daily":   <LoanProduct LN-DC>,
                    "weekly":  <LoanProduct LN-WK>,
                    "monthly": <LoanProduct LN-MO>,
                },
            }
        """
        common = dict(
            owner=ctx["owner"],
            tenant=ctx["tenant"],
            branch=ctx["branch"],
            created_by=ctx["owner"],
            product_class="FINANCIAL",
        )

        # ── Savings products ──────────────────────────────────────────────────
        # SAV-REG: Regular Savings  →  old type 'N' (Normal)
        sav_reg, _ = Product.objects.get_or_create(
            code="SAV-REG",
            tenant=ctx["tenant"],
            branch=ctx["branch"],
            defaults={**common, "name": "Regular Savings", "product_type": "SAVINGS"},
        )

        # SAV-DC: Daily Contribution Savings  →  old type 'D' (Daily Contribution / Ajo)
        sav_dc, _ = Product.objects.get_or_create(
            code="SAV-DC",
            tenant=ctx["tenant"],
            branch=ctx["branch"],
            defaults={
                **common,
                "name": "Daily Contribution Savings",
                "product_type": "SAVINGS",
            },
        )

        sav_products = {"N": sav_reg, "D": sav_dc}

        # ── Loan products ─────────────────────────────────────────────────────
        loan_products = {}
        loan_parent_account = gl.get("LOAN")
        loan_definitions = [
            # (product_code, product_name, freq_key, repayment_freq, interest_rate)
            ("LN-DC",  "Daily Collection Loan", "daily",   "daily",   Decimal("15.00")),
            ("LN-WK",  "Weekly Loan",           "weekly",  "weekly",  Decimal("15.00")),
            ("LN-MO",  "Monthly Loan",          "monthly", "monthly", Decimal("15.00")),
        ]
        for code, name, freq_key, repayment_freq, rate in loan_definitions:
            prod, _ = Product.objects.get_or_create(
                code=code,
                tenant=ctx["tenant"],
                branch=ctx["branch"],
                defaults={**common, "name": name, "product_type": "LOAN"},
            )
            lp, _ = LoanProduct.objects.get_or_create(
                product=prod,
                defaults={
                    "owner": ctx["owner"],
                    "tenant": ctx["tenant"],
                    "branch": ctx["branch"],
                    "created_by": ctx["owner"],
                    "parent_account": loan_parent_account,
                    "default_interest_rate": rate,
                    "min_loan_amount": Decimal("1000.00"),
                    "max_loan_amount": Decimal("10000000.00"),
                    "min_term_months": 1,
                    "max_term_months": 120,
                    "allowed_repayment_frequencies": [repayment_freq],
                    "requires_approval": False,
                },
            )
            loan_products[freq_key] = lp

        self.stdout.write(
            f"    savings products: SAV-REG (N), SAV-DC (D); "
            f"loan products: {list(loan_products.keys())}"
        )
        return {"savings": sav_products, "loans": loan_products}

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 4 – Client Groups
    # ══════════════════════════════════════════════════════════════════════════

    def _import_groups(self, groups_data, ClientGroup, ctx):
        """
        Returns a dict:  old_group_id (int) → ClientGroup instance
        """
        group_map = {}
        created_count = 0
        for g in groups_data:
            # Derive a short unique code from the old group id: GRP-<id>
            code = f"GRP-{g['id']}"
            grp, created = ClientGroup.objects.get_or_create(
                owner=ctx["owner"],
                code=code,
                defaults={
                    "name": g["name"],
                    "tenant": ctx["tenant"],
                    "branch": ctx["branch"],
                    "created_by": ctx["owner"],
                    "description": g.get("description") or "",
                    "meeting_day": g.get("meeting_day"),
                },
            )
            group_map[g["id"]] = grp
            if created:
                created_count += 1

        self.stdout.write(
            f"    {created_count} created, "
            f"{len(groups_data) - created_count} already existed"
        )
        return group_map

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 5 – Clients
    # ══════════════════════════════════════════════════════════════════════════

    # Map old uppercase client_type → Phoenix lowercase
    _TYPE_MAP = {
        "WL": "wl",
        "ML": "ml",
        "DC": "dc",
        "PR": "pr",
    }

    # Map old account_status code → Phoenix status
    _STATUS_MAP = {
        "A": "active",
        "L": "inactive",
        "D": "inactive",
        "P": "active",
    }

    def _import_clients(self, clients_data, Client, ClientGroup, group_map, ctx):
        """
        Returns a dict:  old_client_id (str like 'WL0001') → Client instance
        """
        client_map = {}
        created_count = 0
        skipped = 0

        for rec in clients_data:
            old_id = rec.get("client_id")
            if not old_id:
                skipped += 1
                continue

            # Skip if already imported (external_id is unique per tenant)
            existing = Client.objects.filter(
                external_id=old_id,
                tenant=ctx["tenant"],
            ).first()
            if existing:
                client_map[old_id] = existing
                skipped += 1
                continue

            first_name, last_name = _split_name(rec.get("name", ""))
            client_type = self._TYPE_MAP.get(rec.get("client_type", "").upper())
            status = self._STATUS_MAP.get(rec.get("account_status", "A"), "active")
            group = group_map.get(rec.get("group_id"))

            client = Client(
                # Phoenix will auto-generate client_id (WL-00001 etc.) in save()
                first_name=first_name,
                last_name=last_name,
                phone_primary=rec.get("phone") or "0000000000",
                email=rec.get("email") or None,
                address_street=rec.get("address") or None,
                marital_status=rec.get("marital_status") or None,
                bank_name=rec.get("bank_name") or None,
                bank_account_number=rec.get("account_number") or None,
                next_of_kin_name=rec.get("next_of_kin") or None,
                next_of_kin_phone=rec.get("next_of_kin_phone") or None,
                client_type=client_type,
                group=group,
                status=status,
                usage_context="financial",
                kyc_status="pending",
                external_id=old_id,          # ← stores original Krystartust ID
                tenant=ctx["tenant"],
                branch=ctx["branch"],
                owner=ctx["owner"],
                created_by=ctx["owner"],
            )
            client.save()   # auto-generates client_id
            client_map[old_id] = client
            created_count += 1

        self.stdout.write(
            f"    {created_count} created, {skipped} skipped (already existed / no ID)"
        )
        return client_map

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 6 – Savings
    # ══════════════════════════════════════════════════════════════════════════

    # Map old Savings.type → (product_key, account_number_suffix, name_prefix)
    _SAVINGS_TYPE_MAP = {
        "N": ("N",  "REG", "Savings"),                   # Normal → SAV-REG
        "D": ("D",  "DC",  "Daily Contribution Savings"), # Daily Contribution → SAV-DC
    }

    def _import_savings(self, savings_data, SavingsAccount, Account, products, client_map, gl, ctx, ob_entries):
        """
        Create one SavingsAccount + child SAVINGS Account per savings row.

        Old system rules
        ----------------
        • Savings.type = 'N'  →  Regular Savings      (SAV-REG product)
        • Savings.type = 'D'  →  Daily Contribution    (SAV-DC  product)
        • unique_together = ("client", "type") so each client has at most
          ONE Normal row and ONE DC row = maximum two SavingsAccounts per client.

        NO MERGING — every source row produces exactly one SavingsAccount.
        The only legitimate skip is an orphaned client_id.

        Idempotency
        -----------
        account_number is globally unique:
          SAV-<client_id>-REG   (type N)
          SAV-<client_id>-DC    (type D)
        Re-running the import will skip any account_number that already exists.

        Sub-ledger code format: 2140-NNNNN
          2140 = Customer Savings and Deposits (LIABILITY — MFB owes depositors)
        """
        created_count = 0
        skipped_existing = 0
        orphan_count = 0    # rows whose client_id isn't in client_map
        orphan_ids = []
        sav_products = products["savings"]   # dict: {"N": Product, "D": Product}
        parent_acct = gl["SAVINGS"]          # code 2140
        sav_ob_total = Decimal("0.00")       # running total for reconciliation

        for rec in savings_data:
            balance = _d(rec.get("balance"))
            client_id = rec.get("client_id", "?")
            client = client_map.get(client_id)

            if not client:
                orphan_count += 1
                orphan_ids.append(client_id)
                continue

            # Determine product and account identifiers from the old savings type
            sav_type = rec.get("type", "N")   # 'N' or 'D'
            type_info = self._SAVINGS_TYPE_MAP.get(sav_type, self._SAVINGS_TYPE_MAP["N"])
            product_key, acct_suffix, name_prefix = type_info

            product = sav_products.get(product_key, sav_products["N"])
            account_number = f"SAV-{client_id}-{acct_suffix}"

            # Idempotency: account_number is globally unique — skip if already imported
            if SavingsAccount.objects.filter(account_number=account_number).exists():
                skipped_existing += 1
                continue

            # Generate sub-ledger code PPPP-NNNNN under parent 2140
            child_code = self._next_subledger_code(Account, parent_acct)

            child_acct = Account.objects.create(
                code=child_code,
                name=f"{name_prefix} – {client.full_name}",
                account_type=Account.SAVINGS,
                account_level=Account.LEVEL_CHILD,
                parent=parent_acct,
                owner=ctx["owner"],
                tenant=ctx["tenant"],
                branch=ctx["branch"],
                created_by=ctx["owner"],
            )
            ob_amount = _d(rec.get("opening_balance", rec.get("balance")))
            if ob_amount:
                ob_entries.append((child_acct, ob_amount, ob_amount, 'CR'))
                sav_ob_total += ob_amount

            SavingsAccount.objects.create(
                client=client,
                account=child_acct,
                product=product,
                account_number=account_number,
                opened_on=_date(rec.get("created_at")),
                status="active" if balance > 0 else "dormant",
                interest_rate=Decimal("0.00"),
                interest_calculation_method="monthly",
                owner=ctx["owner"],
                tenant=ctx["tenant"],
                branch=ctx["branch"],
                created_by=ctx["owner"],
            )
            created_count += 1

        self.stdout.write(
            f"    {created_count} created, "
            f"{skipped_existing} already existed, "
            f"{orphan_count} orphaned (client not found)\n"
            f"    ► Total savings opening balance (CR)  : {sav_ob_total:>14,.2f}"
        )
        if orphan_ids:
            self.stdout.write(
                self.style.WARNING(f"    ORPHANED savings client_ids: {orphan_ids}")
            )

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 7 – Loans
    # ══════════════════════════════════════════════════════════════════════════

    # Map old Loan.loan_type → LoanProduct key
    _LOAN_TYPE_MAP = {
        "daily":   "daily",
        "Daily":   "daily",
        "weekly":  "weekly",
        "Weekly":  "weekly",
        "monthly": "monthly",
        "Monthly": "monthly",
    }

    # Map old Loan.status → LoanAccount.status
    _LOAN_STATUS_MAP = {
        "Active":               "active",
        "Approved":             "approved",
        "Pending Approval":     "pending",
        "Pending Disbursement": "approved",
        "Closed":               "paid_off",
    }

    def _import_loans(self, loans_data, schedules_data, LoanAccount, Account, products, client_map, gl, ctx, ob_entries):
        """
        Create one LoanAccount + child LOAN Account per loan, then rebuild
        every repayment schedule installment from the exported schedule rows.

        Why we import schedules
        -----------------------
        Phoenix tracks defaulters through LoanRepaymentSchedule rows whose
        status is 'overdue' and through the LoanAccount.days_in_arrears /
        arrears_amount fields.  Without the schedule Phoenix has no way to
        know which clients have missed payments.

        Schedule mapping
        ----------------
        Old system row          → Phoenix LoanRepaymentSchedule
        is_paid=True            → status='paid'
        is_paid=False, overdue  → status='overdue'   (due_date < today)
        is_paid=False, future   → status='pending'   (due_date >= today)

        Arrears + risk classification
        -----------------------------
        After creating all schedules we compute arrears directly from the
        overdue rows and set risk_classification per CBN PAR bands:
          0 days         → performing
          1-30 days      → watch
          31-90 days     → substandard
          91-180 days    → doubtful
          > 180 days     → loss

        Sub-ledger code format: 1150-NNNNN
          1150 = Customer Loan Portfolio (ASSET — MFB is the creditor)
        """
        from loans.models import LoanRepaymentSchedule

        today = date.today()

        created_count = 0
        sched_created = 0
        skipped = 0
        loan_ob_total = Decimal("0.00")   # running total for reconciliation
        loan_products = products["loans"]
        parent_acct = gl["LOAN"]   # code 1150

        # Pre-index schedules by old loan_id for O(1) lookup
        schedules_by_loan: dict = {}
        for s in schedules_data:
            schedules_by_loan.setdefault(s["loan_id"], []).append(s)

        for rec in loans_data:
            client = client_map.get(rec["client_id"])
            if not client:
                skipped += 1
                continue

            loan_number = f"LN-{rec['id']}"

            # Idempotency — skip if already imported
            if LoanAccount.objects.filter(loan_number=loan_number).exists():
                skipped += 1
                continue

            balance       = _d(rec.get("balance"))
            amount        = _d(rec.get("amount", rec.get("balance")))
            interest_rate = _d(rec.get("interest"))
            emi           = _d(rec.get("emi"))

            # Map loan type → product key
            raw_type = rec.get("loan_type", "Monthly")
            product_key = self._LOAN_TYPE_MAP.get(raw_type, "monthly")
            loan_product = loan_products.get(product_key, loan_products["monthly"])

            # Compute term_months from start/end dates
            start = _date(rec.get("start_date"))
            end   = _date(rec.get("end_date"))
            months_diff = (end.year - start.year) * 12 + (end.month - start.month)
            term_months = max(1, months_diff)

            freq_map = {"daily": "daily", "weekly": "weekly", "monthly": "monthly"}
            repayment_freq = freq_map.get(product_key, "monthly")

            old_status = rec.get("status", "Active")
            new_status = self._LOAN_STATUS_MAP.get(old_status, "active")

            # ── GL child account ─────────────────────────────────────────
            child_code = self._next_subledger_code(Account, parent_acct)
            child_acct = Account.objects.create(
                code=child_code,
                name=f"Loan – {client.full_name} ({loan_number})",
                account_type=Account.LOAN,
                account_level=Account.LEVEL_CHILD,
                parent=parent_acct,
                owner=ctx["owner"],
                tenant=ctx["tenant"],
                branch=ctx["branch"],
                created_by=ctx["owner"],
            )
            ob_amount = _d(rec.get("opening_balance", rec.get("balance")))
            if ob_amount:
                ob_entries.append((child_acct, ob_amount, ob_amount, 'DR'))
                loan_ob_total += ob_amount

            # ── Compute arrears from schedule rows before creating the account
            raw_schedules = schedules_by_loan.get(rec["id"], [])
            overdue_rows = [
                s for s in raw_schedules
                if not s.get("is_paid") and s.get("status") != "Deleted"
                and _date(s["due_date"]) < today
            ]
            arrears_amount = sum(_d(s["amount_due"]) for s in overdue_rows)
            if overdue_rows:
                earliest_overdue = min(_date(s["due_date"]) for s in overdue_rows)
                days_in_arrears = (today - earliest_overdue).days
            else:
                days_in_arrears = 0

            # CBN PAR-based risk classification
            if days_in_arrears == 0:
                risk = "performing"
            elif days_in_arrears <= 30:
                risk = "watch"
            elif days_in_arrears <= 90:
                risk = "substandard"
            elif days_in_arrears <= 180:
                risk = "doubtful"
            else:
                risk = "loss"

            # Counts paid installments for the field
            installments_paid = sum(
                1 for s in raw_schedules
                if s.get("is_paid") and s.get("status") != "Deleted"
            )
            num_installments = sum(
                1 for s in raw_schedules
                if s.get("status") != "Deleted"
            )

            loan_acct = LoanAccount.objects.create(
                client=client,
                product=loan_product,
                account=child_acct,
                loan_number=loan_number,
                application_date=start,
                requested_amount=amount,
                approved_amount=amount,
                disbursed_amount=amount,
                outstanding_principal=balance,
                interest_rate=interest_rate,
                term_months=term_months,
                repayment_frequency=repayment_freq,
                status=new_status,
                disbursement_date=start,
                first_payment_date=start,
                maturity_date=end,
                installment_amount=emi,
                number_of_installments=num_installments,
                installments_paid=installments_paid,
                days_in_arrears=days_in_arrears,
                arrears_amount=arrears_amount,
                risk_classification=risk,
                owner=ctx["owner"],
                tenant=ctx["tenant"],
                branch=ctx["branch"],
                created_by=ctx["owner"],
            )
            created_count += 1

            # ── Repayment schedule rows ──────────────────────────────────
            for i, s in enumerate(
                sorted(
                    (r for r in raw_schedules if r.get("status") != "Deleted"),
                    key=lambda r: _date(r["due_date"]),
                ),
                start=1,
            ):
                due = _date(s["due_date"])
                is_paid = bool(s.get("is_paid"))
                penalty = _d(s.get("penalty_amount", 0))
                amount_due = _d(s["amount_due"])

                if is_paid:
                    sched_status = "paid"
                elif due < today:
                    sched_status = "overdue"
                else:
                    sched_status = "pending"

                # The old system stores a single amount_due with no
                # principal/interest split.  We reconstruct a best-effort
                # split: interest = penalty (already charged), remainder =
                # principal.  Phoenix requires both fields.
                interest_due = penalty   # any accrued penalty maps to interest
                principal_due = max(Decimal("0.00"), amount_due - interest_due)

                LoanRepaymentSchedule.objects.create(
                    loan=loan_acct,
                    installment_number=i,
                    due_date=due,
                    principal_due=principal_due,
                    interest_due=interest_due,
                    fees_due=Decimal("0.00"),
                    penalty_due=penalty,
                    total_due=amount_due,
                    total_paid=amount_due if is_paid else Decimal("0.00"),
                    principal_paid=principal_due if is_paid else Decimal("0.00"),
                    interest_paid=interest_due if is_paid else Decimal("0.00"),
                    status=sched_status,
                    payment_date=_date(s.get("payment_date")) if s.get("payment_date") else None,
                    days_late=(today - due).days if sched_status == "overdue" else 0,
                    owner=ctx["owner"],
                    tenant=ctx["tenant"],
                    branch=ctx["branch"],
                    created_by=ctx["owner"],
                )
                sched_created += 1

        self.stdout.write(
            f"    {created_count} loans created, "
            f"{sched_created} schedule installments created, "
            f"{skipped} skipped\n"
            f"    ► Total loan opening balance (DR)     : {loan_ob_total:>14,.2f}"
        )

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 8 – Banks / Cash
    # ══════════════════════════════════════════════════════════════════════════

    def _import_banks(self, banks_data, Account, gl, ctx, ob_entries):
        """
        Create a child ASSET Account (4-digit code) for EVERY bank/cash record.

        NO MERGING — each source row produces exactly one GL child account.

        Duplicate names (same bank across multiple financial years)
        -----------------------------------------------------------
        The old system has one Bank row per financial year.  When multiple rows
        share the same bank name a numeric suffix is appended:

            GTBank          (1st occurrence in source order)
            GTBank-1        (2nd occurrence)
            GTBank-2        (3rd occurrence)   … etc.

        Idempotency
        -----------
        Banks are processed in the same pk order every run (export sorts by pk).
        An in-memory counter assigns a deterministic name to each source row —
        the Nth occurrence of "GTBank" always maps to the same suffixed name.
        Re-running simply finds that name already exists and skips it.

        Codes start at 1101 upward under parent 1100 (Cash and Cash Equivalents).
        """
        parent_acct = gl["ASSET"]
        code_counter = self._next_available_code(Account, 1101, ctx)
        created_count = 0
        skipped_existing = 0
        bank_ob_total = Decimal("0.00")   # running total for reconciliation

        # Tracks how many times each base name has been seen so far in this run.
        # Ensures occurrence 0 → "GTBank", occurrence 1 → "GTBank-1", etc.,
        # regardless of what already exists in the DB.
        name_occurrence: dict = {}

        for rec in banks_data:
            base_name = rec["name"]

            # Which occurrence of this base name is this source row?
            occurrence = name_occurrence.get(base_name, 0)
            name_occurrence[base_name] = occurrence + 1

            # Build the deterministic account name for this row
            account_name = base_name if occurrence == 0 else f"{base_name}-{occurrence}"

            # Idempotency: skip if this exact name already exists under the parent
            if Account.objects.filter(
                name=account_name,
                parent=parent_acct,
                tenant=ctx["tenant"],
                branch=ctx["branch"],
                is_deleted=False,
            ).exists():
                skipped_existing += 1
                continue

            # opening_balance = pre-year balance (before 2026 payment flows).
            # After Steps 13/14 post savings/loan flows through this account
            # the GL balance will arrive at the correct current balance.
            # Falls back to full balance for old exports without opening_balance.
            ob_amount = _d(rec.get("opening_balance", rec.get("balance")))
            bal_bf    = _d(rec.get("balance_bf"))
            acct = Account.objects.create(
                code=str(code_counter),
                name=account_name,
                account_type=Account.ASSET,
                account_level=Account.LEVEL_CHILD,
                parent=parent_acct,
                owner=ctx["owner"],
                tenant=ctx["tenant"],
                branch=ctx["branch"],
                created_by=ctx["owner"],
            )
            if ob_amount:
                ob_entries.append((acct, ob_amount, bal_bf, 'DR'))
                bank_ob_total += ob_amount
                self.stdout.write(
                    f"    {account_name:<40} ob={ob_amount:>12,.2f}  curr={_d(rec.get('balance')):>12,.2f}"
                )
            code_counter += 1
            created_count += 1

        self.stdout.write(
            f"    {created_count} created, {skipped_existing} already existed\n"
            f"    ► Total bank opening balance (DR)     : {bank_ob_total:>14,.2f}"
        )

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 9 – Inventory
    # ══════════════════════════════════════════════════════════════════════════

    def _import_inventory(self, inventory_data, Account, gl, ctx, ob_entries):
        """
        Imports physical-stock items from the old Inventory model into Phoenix's
        InventoryItem / InventoryStock / InventoryCategory hierarchy.

        GL treatment (opening balance):
          Dr  1200-00001  Inventory and Supplies  (ASSET, DR-normal)
          Cr  OBE                                  (absorbed by OBE in Step 13)

        The inventory GL account is set with balance_bf = sum of old balance_bf
        values, so Step 13 picks it up automatically in the OBE sweep.
        """
        from inventory.models import InventoryCategory, InventoryItem, InventoryStock, Location

        if not inventory_data:
            self.stdout.write("    No inventory items to import — skipping.")
            return

        # ── 1. Inventory parent GL account (1200) ────────────────────────────
        inv_parent, _ = Account.objects.get_or_create(
            code="1200",
            tenant=ctx["tenant"],
            branch=ctx["branch"],
            defaults={
                "name":           "Inventory and Physical Assets",
                "account_type":   Account.ASSET,
                "account_level":  Account.LEVEL_PARENT,
                "owner":          ctx["owner"],
                "created_by":     ctx["owner"],
                "is_system_account": True,
                "balance":    Decimal("0.00"),
                "balance_bf": Decimal("0.00"),
            },
        )

        # ── 2. Child GL account for inventory valuation ───────────────────────
        total_bf  = sum(_d(r.get("balance_bf", 0)) for r in inventory_data)
        total_bal = sum(_d(r.get("balance",    0)) for r in inventory_data)

        inv_gl, _ = Account.objects.get_or_create(
            code="1200-00001",
            tenant=ctx["tenant"],
            branch=ctx["branch"],
            defaults={
                "name":          "Inventory and Supplies",
                "account_type":  Account.ASSET,
                "account_level": Account.LEVEL_CHILD,
                "parent":        inv_parent,
                "owner":         ctx["owner"],
                "created_by":    ctx["owner"],
                "balance_bf":    total_bf,
                "balance":       Decimal("0.00"),
            },
        )

        # ── 3. COGS expense child account under 5300 ──────────────────────────
        expense_parent = gl.get("EXPENSE") or Account.objects.filter(
            code="5300", tenant=ctx["tenant"], branch=ctx["branch"]
        ).first()

        cogs_gl, _ = Account.objects.get_or_create(
            code="5300-COGS",
            tenant=ctx["tenant"],
            branch=ctx["branch"],
            defaults={
                "name":          "Cost of Goods Sold",
                "account_type":  Account.EXPENSE,
                "account_level": Account.LEVEL_CHILD,
                "parent":        expense_parent,
                "owner":         ctx["owner"],
                "created_by":    ctx["owner"],
                "balance_bf": Decimal("0.00"),
                "balance":    Decimal("0.00"),
            },
        )

        # ── 4. InventoryCategory ──────────────────────────────────────────────
        inv_cat, _ = InventoryCategory.objects.get_or_create(
            code="INVGEN",
            branch=ctx["branch"],
            defaults={
                "name":              "General Inventory",
                "description":       "Migrated from legacy system",
                "inventory_account": inv_gl,
                "cogs_account":      cogs_gl,
                "item_type":         "General",
                "owner":             ctx["owner"],
                "tenant":            ctx["tenant"],
            },
        )

        # ── 5. Default Location ───────────────────────────────────────────────
        location, _ = Location.objects.get_or_create(
            name=ctx["branch"].name,
            branch=ctx["branch"],
            defaults={
                "code":          "HO",
                "location_type": "store",
                "owner":         ctx["owner"],
                "tenant":        ctx["tenant"],
            },
        )

        # ── 6. InventoryItem + InventoryStock per record ──────────────────────
        created = skipped = 0
        for rec in inventory_data:
            name = (rec.get("name") or "").strip()
            if not name:
                skipped += 1
                continue

            inv_id   = rec.get("id")
            price    = _d(rec.get("price",    0))
            quantity = _d(rec.get("quantity", 0))
            balance  = _d(rec.get("balance",  0))

            item, _ = InventoryItem.objects.get_or_create(
                sku=f"INV-{inv_id}",
                branch=ctx["branch"],
                defaults={
                    "name":             name,
                    "description":      rec.get("description", ""),
                    "category":         inv_cat,
                    "cost_price":       price,
                    "selling_price":    price,
                    "valuation_method": "average",
                    "owner":            ctx["owner"],
                    "tenant":           ctx["tenant"],
                },
            )

            InventoryStock.objects.get_or_create(
                item=item,
                location=location,
                defaults={
                    "quantity_on_hand":   quantity,
                    "quantity_reserved":  Decimal("0"),
                    "quantity_available": quantity,
                    "average_cost":       price,
                    "total_value":        balance,
                    "branch":             ctx["branch"],
                    "owner":              ctx["owner"],
                    "tenant":             ctx["tenant"],
                },
            )
            created += 1

        # ── 7. Register GL entry ───────────────────────────────────────────────
        # Post the full current inventory value (total_bal) as a DR to the GL,
        # absorbed by OBE.  balance_bf is set separately to total_bf so the
        # period-start figure is correct.  Using total_bal (not total_bf) ensures
        # the in-period acquisitions (items with balance_bf=0, balance>0) are
        # also captured by a journal entry rather than a direct balance write.
        if total_bal != Decimal("0"):
            ob_entries.append((inv_gl, total_bal, total_bf, "DR"))

        self.stdout.write(
            self.style.SUCCESS(
                f"    {created} inventory items imported, {skipped} skipped"
            )
        )
        self.stdout.write(
            f"    ► Inventory opening balance (balance_bf) : {total_bf:>15,.2f}"
        )
        self.stdout.write(
            f"    ► Inventory current value (GL DR entry)  : {total_bal:>15,.2f}"
        )

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 10 – Income accounts
    # ══════════════════════════════════════════════════════════════════════════

    def _import_income(self, income_data, Account, gl, ctx, ob_entries):
        """
        Create child INCOME accounts (4-digit codes) under parent 4200.
        Codes start at 4201 upward.

        Opening balance uses balance_bf (typically 0 for annual income accounts).
        Step 15 posts all 2026 income receipts from that starting point, so the
        account reaches the correct current balance without double-counting.
        """
        parent_acct = gl["INCOME"]
        code_counter = self._next_available_code(Account, 4201, ctx)
        created_count = 0
        skipped = 0

        for rec in income_data:
            name = f"{rec['name']} ({rec.get('year', 'YTD')})"
            if Account.objects.filter(
                name=name, parent=parent_acct,
                tenant=ctx["tenant"], branch=ctx["branch"], is_deleted=False,
            ).exists():
                skipped += 1
                continue

            bal_bf = _d(rec.get("balance_bf"))
            acct = Account.objects.create(
                code=str(code_counter),
                name=name,
                account_type=Account.INCOME,
                account_level=Account.LEVEL_CHILD,
                parent=parent_acct,
                owner=ctx["owner"],
                tenant=ctx["tenant"],
                branch=ctx["branch"],
                created_by=ctx["owner"],
            )
            # Use balance_bf (= 0 for annual accounts) — Step 15 posts each
            # 2026 payment and drives the balance to the current figure.
            if bal_bf:
                ob_entries.append((acct, bal_bf, bal_bf, 'CR'))
            code_counter += 1
            created_count += 1

        self.stdout.write(f"    {created_count} created, {skipped} skipped")

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 11 – Expense accounts
    # ══════════════════════════════════════════════════════════════════════════

    def _import_expenses(self, expense_data, Account, gl, ctx, ob_entries):
        """
        Create child EXPENSE accounts (4-digit codes) under parent 5300.
        Codes start at 5301 upward.

        Opening balance uses balance_bf (typically 0 for annual expense accounts).
        Step 16 posts all 2026 expense payments from that starting point.
        """
        parent_acct = gl["EXPENSE"]
        code_counter = self._next_available_code(Account, 5301, ctx)
        created_count = 0
        skipped = 0

        for rec in expense_data:
            name = f"{rec['name']} ({rec.get('year', 'YTD')})"
            if Account.objects.filter(
                name=name, parent=parent_acct,
                tenant=ctx["tenant"], branch=ctx["branch"], is_deleted=False,
            ).exists():
                skipped += 1
                continue

            bal_bf = _d(rec.get("balance_bf"))
            acct = Account.objects.create(
                code=str(code_counter),
                name=name,
                account_type=Account.EXPENSE,
                account_level=Account.LEVEL_CHILD,
                parent=parent_acct,
                owner=ctx["owner"],
                tenant=ctx["tenant"],
                branch=ctx["branch"],
                created_by=ctx["owner"],
            )
            if bal_bf:
                ob_entries.append((acct, bal_bf, bal_bf, 'DR'))
            code_counter += 1
            created_count += 1

        self.stdout.write(f"    {created_count} created, {skipped} skipped")

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 12 – Liability accounts
    # ══════════════════════════════════════════════════════════════════════════

    def _import_liabilities(self, liability_data, Account, gl, ctx, ob_entries):
        """
        Create child LIABILITY accounts (4-digit codes) under parent 2100.
        Codes start at 2101 upward.

        Opening balance uses balance_bf (the pre-year carry-forward balance).
        Liabilities are balance-sheet items that roll over between years, so
        balance_bf is non-zero whenever there was an outstanding liability at
        the start of the year.  Step 17 posts all 2026 liability movements from
        that starting point and drives the balance to the correct current figure.
        """
        parent_acct = gl["LIABILITY"]
        code_counter = self._next_available_code(Account, 2101, ctx)
        created_count = 0
        skipped = 0
        liab_bf_total = Decimal("0.00")   # running total for reconciliation

        for rec in liability_data:
            name = f"{rec['name']} ({rec.get('year', 'YTD')})"
            if Account.objects.filter(
                name=name, parent=parent_acct,
                tenant=ctx["tenant"], branch=ctx["branch"], is_deleted=False,
            ).exists():
                skipped += 1
                continue

            bal_bf  = _d(rec.get("balance_bf"))
            bal_cur = _d(rec.get("balance"))
            acct = Account.objects.create(
                code=str(code_counter),
                name=name,
                account_type=Account.LIABILITY,
                account_level=Account.LEVEL_CHILD,
                parent=parent_acct,
                owner=ctx["owner"],
                tenant=ctx["tenant"],
                branch=ctx["branch"],
                created_by=ctx["owner"],
            )
            # balance_bf = outstanding liability balance at the start of the year.
            self.stdout.write(
                f"    {rec['name']:<40} bf={bal_bf:>12,.2f}  curr={bal_cur:>12,.2f}"
            )
            if bal_bf:
                ob_entries.append((acct, bal_bf, bal_bf, 'CR'))
                liab_bf_total += bal_bf
            code_counter += 1
            created_count += 1

        self.stdout.write(
            f"    {created_count} created, {skipped} skipped\n"
            f"    ► Total liability opening balance (CR): {liab_bf_total:>14,.2f}"
        )


    def _create_opening_balance_transaction(self, ob_entries, Account, ctx):
        """
        Post a single opening-balance journal entry for all imported accounts.

        DR-normal: ASSET, LOAN, EXPENSE  -> positive balance -> DEBIT entry
        CR-normal: LIABILITY, SAVINGS, INCOME -> positive balance -> CREDIT entry

        Any imbalance in the imported books is absorbed by an "Opening Balance
        Equity" (OBE) account so the mandatory debits == credits invariant is
        never violated.

        After posting, balance_bf is synced to the imported value for every
        child account, and parent GL accounts have balance_bf set from their
        now-correct balance field.
        """
        from transactions.models import Transaction, TransactionEntry, TransactionSeries

        non_zero = [(a, amt, bbf, side) for (a, amt, bbf, side) in ob_entries if amt]
        if not non_zero:
            self.stdout.write("    No non-zero opening balances — skipping transaction.")
            return

        # ── Pre-flight reconciliation ─────────────────────────────────────────
        # Negative amounts flip the effective posting side:
        #   e.g. a bank in overdraft has opening_balance < 0  (asset with credit
        #   balance).  The ob_entry says side='DR' but amount=-626K.  Correct
        #   posting is CR 626K, not DR 626K.
        def _effective_side(side, amt):
            if amt < 0:
                return 'CR' if side == 'DR' else 'DR'
            return side

        type_dr: dict = {}
        type_cr: dict = {}
        for acct, amt, _, side in non_zero:
            at = acct.account_type
            eff = _effective_side(side, amt)
            if eff == 'DR':
                type_dr[at] = type_dr.get(at, Decimal("0")) + abs(amt)
            else:
                type_cr[at] = type_cr.get(at, Decimal("0")) + abs(amt)

        total_dr = sum(type_dr.values())
        total_cr = sum(type_cr.values())
        diff     = total_dr - total_cr

        self.stdout.write("\n    ┌─── Opening Balance Reconciliation ────────────────────────┐")
        self.stdout.write(    "    │  DEBIT (assets / DR-normal)                              │")
        for at, amt in sorted(type_dr.items()):
            self.stdout.write(f"    │    {at:<20} {amt:>14,.2f}                        │")
        self.stdout.write(f"    │    {'TOTAL DR':<20} {total_dr:>14,.2f}                        │")
        self.stdout.write(    "    │  CREDIT (liabilities / equity / overdrafts)              │")
        for at, amt in sorted(type_cr.items()):
            self.stdout.write(f"    │    {at:<20} {amt:>14,.2f}                        │")
        self.stdout.write(f"    │    {'TOTAL CR':<20} {total_cr:>14,.2f}                        │")
        self.stdout.write(f"    │    {'GAP (OBE)':<20} {diff:>14,.2f}                        │")
        self.stdout.write(    "    └───────────────────────────────────────────────────────────┘\n")

        # Idempotency: skip if the migration transaction already exists
        if Transaction.objects.filter(
            workflow_reference="OB-MIGRATION",
            tenant=ctx["tenant"],
            branch=ctx["branch"],
        ).exists():
            self.stdout.write("    Opening balance transaction already exists — skipping.")
            return

        series, _ = TransactionSeries.objects.get_or_create(
            code="OBMIG",
            defaults={"description": "Opening Balance Migration"},
        )

        txn = Transaction.objects.create(
            series=series,
            date=date.today(),
            description="Opening Balances – System Migration",
            workflow_reference="OB-MIGRATION",
            owner=ctx["owner"],
            branch=ctx["branch"],
            tenant=ctx["tenant"],
            created_by=ctx["owner"],
        )

        total_dr = Decimal("0.00")
        total_cr = Decimal("0.00")

        for account, amount, _bbf, side in non_zero:
            eff_side = _effective_side(side, amount)
            entry_side = TransactionEntry.DEBIT if eff_side == "DR" else TransactionEntry.CREDIT
            TransactionEntry.objects.create(
                transaction=txn,
                account=account,
                side=entry_side,
                amount=abs(amount),
            )
            if eff_side == "DR":
                total_dr += abs(amount)
            else:
                total_cr += abs(amount)

        # Absorb any imbalance via an Opening Balance Equity account.
        # This is a standalone parent-level account — Phoenix requires child
        # accounts to have a parent, but OBE is migration-only and has none.
        diff = total_dr - total_cr
        if abs(diff) > Decimal("0.01"):
            obe_acct, _ = Account.objects.get_or_create(
                code="OBE",
                tenant=ctx["tenant"],
                branch=ctx["branch"],
                defaults={
                    "name": "Opening Balance Equity",
                    "account_type": Account.EQUITY,
                    "account_level": Account.LEVEL_PARENT,
                    "owner": ctx["owner"],
                    "created_by": ctx["owner"],
                    "is_system_account": True,
                },
            )
            if diff > 0:
                TransactionEntry.objects.create(
                    transaction=txn, account=obe_acct,
                    side=TransactionEntry.CREDIT, amount=diff,
                )
                total_cr += diff
            else:
                TransactionEntry.objects.create(
                    transaction=txn, account=obe_acct,
                    side=TransactionEntry.DEBIT, amount=abs(diff),
                )
                total_dr += abs(diff)

        txn.post()  # validates balance, marks posted=True, updates Account.balance

        imbalance_note = (
            f" (imbalance {diff} absorbed by OBE)" if abs(diff) > Decimal("0.01") else ""
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"    Posted opening balance: DR={total_dr}, CR={total_cr}{imbalance_note}"
            )
        )

        # Sync balance_bf on every imported child account to its source value
        for account, _amount, bbf_value, _side in non_zero:
            Account.objects.filter(pk=account.pk).update(balance_bf=bbf_value)

        # Propagate balance_bf to parent GL accounts (balance is correct after post)
        parent_pks = {a.parent_id for a, _, _, _ in non_zero if a.parent_id}
        for pk in parent_pks:
            parent_bal = Account.objects.get(pk=pk).balance
            Account.objects.filter(pk=pk).update(balance_bf=parent_bal)

        self.stdout.write(
            f"    balance_bf set for {len(non_zero)} accounts "
            f"and {len(parent_pks)} parent accounts."
        )

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 14 – Savings payment history
    # ══════════════════════════════════════════════════════════════════════════

    def _import_savings_payments(self, savings_pmts_data, banks_data, SavingsAccount, Account, gl, ctx):
        """
        Post each exported SavingsPayment as a balanced GL journal entry.

        Accounting treatment
        --------------------
        Deposit (type S / C):  Dr. Bank/Cash  |  Cr. Savings Account
        Withdrawal (type W):   Dr. Savings Account  |  Cr. Bank/Cash

        The opening balance for each savings account was already set to the
        pre-2026 state in Step 6, so re-posting the 2026 payments here drives
        the GL balance to exactly the current balance exported from the old system.

        Idempotency
        -----------
        Guarded by the existence of a TransactionSeries with code "SAVMIG".
        If any transactions already exist in that series for this tenant/branch,
        the whole step is skipped.
        """
        from transactions.models import Transaction, TransactionEntry, TransactionSeries

        if not savings_pmts_data:
            self.stdout.write("    No savings payment history — skipping.")
            return

        series, _ = TransactionSeries.objects.get_or_create(
            code="SVMIG",
            defaults={"description": "Savings Payment History Migration"},
        )
        if Transaction.objects.filter(
            series=series, tenant=ctx["tenant"], branch=ctx["branch"]
        ).exists():
            self.stdout.write("    Savings payment history already imported — skipping.")
            return

        bank_acct_map = self._build_bank_account_map(banks_data, Account, gl, ctx)
        suspense = self._get_suspense_account(Account, gl, ctx)

        created = 0
        skipped = 0

        for rec in savings_pmts_data:
            client_id = rec.get("client_id")
            sav_type  = rec.get("savings_type", "N")
            acct_suffix = "DC" if sav_type == "D" else "REG"
            account_number = f"SAV-{client_id}-{acct_suffix}"

            try:
                sav_acct = SavingsAccount.objects.get(account_number=account_number)
            except SavingsAccount.DoesNotExist:
                skipped += 1
                continue

            gl_sav_acct = sav_acct.account
            bank_id     = rec.get("bank_id")
            cash_acct   = bank_acct_map.get(bank_id, suspense) if bank_id else suspense
            amount      = _d(rec.get("amount"))

            if amount == Decimal("0"):
                skipped += 1
                continue

            txn_type = rec.get("transaction_type", "S")
            pay_date = _date(rec.get("payment_date"))
            description = (rec.get("description") or "").strip() or (
                "Savings Deposit" if txn_type in ("S", "C") else "Savings Withdrawal"
            )

            txn = Transaction.objects.create(
                series=series,
                date=pay_date,
                description=description,
                owner=ctx["owner"],
                branch=ctx["branch"],
                tenant=ctx["tenant"],
                created_by=ctx["owner"],
            )

            entry_amount = abs(amount)
            if txn_type in ("S", "C") and amount > Decimal("0"):
                # Normal deposit: Dr. Bank/Cash, Cr. Savings Account
                dr_acct, cr_acct = cash_acct, gl_sav_acct
            else:
                # Withdrawal OR negative-amount deposit (reversal/deduction):
                # Dr. Savings Account, Cr. Bank/Cash
                dr_acct, cr_acct = gl_sav_acct, cash_acct

            TransactionEntry.objects.create(
                transaction=txn, account=dr_acct,
                side=TransactionEntry.DEBIT, amount=entry_amount,
            )
            TransactionEntry.objects.create(
                transaction=txn, account=cr_acct,
                side=TransactionEntry.CREDIT, amount=entry_amount,
            )
            txn.post()
            created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"    {created} savings payment transactions posted, {skipped} skipped"
            )
        )

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 15 – Loan disbursement history
    # ══════════════════════════════════════════════════════════════════════════

    def _import_loan_disbursements(self, loan_disb_data, banks_data, LoanAccount, Account, gl, ctx):
        """
        Post each 2026 loan disbursement as a balanced GL journal entry.

        Accounting treatment
        --------------------
        Disbursement:  Dr. Loan Account  |  Cr. Bank/Cash
        (Dr. increases the outstanding loan asset; Cr. reflects cash going out.)

        This is the counterpart to opening_balance=0 for 2026-disbursed loans.
        Without it, Step 15 repayment credits accumulate with no matching debit,
        making the entire loan portfolio go deeply negative.

        Idempotency
        -----------
        Guarded by TransactionSeries code "LNDSB".
        """
        from transactions.models import Transaction, TransactionEntry, TransactionSeries

        if not loan_disb_data:
            self.stdout.write("    No loan disbursements to post — skipping.")
            return

        series, _ = TransactionSeries.objects.get_or_create(
            code="LNDSB",
            defaults={"description": "Loan Disbursement History Migration"},
        )
        if Transaction.objects.filter(
            series=series, tenant=ctx["tenant"], branch=ctx["branch"]
        ).exists():
            self.stdout.write("    Loan disbursement history already imported — skipping.")
            return

        bank_acct_map = self._build_bank_account_map(banks_data, Account, gl, ctx)
        suspense = self._get_suspense_account(Account, gl, ctx)

        created = 0
        skipped = 0

        for rec in loan_disb_data:
            loan_id = rec.get("loan_id")
            if not loan_id:
                skipped += 1
                continue

            loan_number = f"LN-{loan_id}"
            try:
                loan_acct = LoanAccount.objects.get(loan_number=loan_number)
            except LoanAccount.DoesNotExist:
                skipped += 1
                continue

            gl_loan_acct = loan_acct.account
            bank_id  = rec.get("bank_id")
            cash_acct = bank_acct_map.get(bank_id, suspense) if bank_id else suspense
            amount   = _d(rec.get("amount"))

            if amount <= Decimal("0"):
                skipped += 1
                continue

            disb_date   = _date(rec.get("disbursement_date"))
            description = f"Loan Disbursement – {loan_number}"

            txn = Transaction.objects.create(
                series=series,
                date=disb_date,
                description=description,
                owner=ctx["owner"],
                branch=ctx["branch"],
                tenant=ctx["tenant"],
                created_by=ctx["owner"],
            )

            # Disbursement: Dr. Loan (asset increases), Cr. Bank (cash goes out)
            TransactionEntry.objects.create(
                transaction=txn, account=gl_loan_acct,
                side=TransactionEntry.DEBIT, amount=amount,
            )
            TransactionEntry.objects.create(
                transaction=txn, account=cash_acct,
                side=TransactionEntry.CREDIT, amount=amount,
            )
            txn.post()
            created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"    {created} loan disbursement transactions posted, {skipped} skipped"
            )
        )

    # STEP 16 – Loan payment history
    # ══════════════════════════════════════════════════════════════════════════

    def _import_loan_payments(self, loan_pmts_data, banks_data, LoanAccount, Account, gl, ctx):
        """
        Post each exported LoanPayment as a balanced GL journal entry.

        Accounting treatment
        --------------------
        Loan repayment:  Dr. Bank/Cash  |  Cr. Loan Account
        (Cr. on a LOAN/Asset account reduces the outstanding balance.)

        The opening balance for each loan account was already set to the pre-2026
        outstanding balance in Step 7, so posting 2026 repayments here drives the
        GL balance to exactly the current outstanding balance from the old system.

        Idempotency
        -----------
        Guarded by the existence of any Transaction with series code "LNMIG"
        for this tenant/branch.
        """
        from transactions.models import Transaction, TransactionEntry, TransactionSeries

        if not loan_pmts_data:
            self.stdout.write("    No loan payment history — skipping.")
            return

        series, _ = TransactionSeries.objects.get_or_create(
            code="LNMIG",
            defaults={"description": "Loan Payment History Migration"},
        )
        if Transaction.objects.filter(
            series=series, tenant=ctx["tenant"], branch=ctx["branch"]
        ).exists():
            self.stdout.write("    Loan payment history already imported — skipping.")
            return

        bank_acct_map = self._build_bank_account_map(banks_data, Account, gl, ctx)
        suspense = self._get_suspense_account(Account, gl, ctx)

        created = 0
        skipped = 0

        for rec in loan_pmts_data:
            loan_id = rec.get("loan_id")
            if not loan_id:
                skipped += 1
                continue

            loan_number = f"LN-{loan_id}"
            try:
                loan_acct = LoanAccount.objects.get(loan_number=loan_number)
            except LoanAccount.DoesNotExist:
                skipped += 1
                continue

            gl_loan_acct = loan_acct.account
            bank_id      = rec.get("bank_id")
            cash_acct    = bank_acct_map.get(bank_id, suspense) if bank_id else suspense
            amount       = _d(rec.get("amount"))

            if amount <= Decimal("0"):
                skipped += 1
                continue

            pay_date    = _date(rec.get("payment_date"))
            description = (rec.get("description") or "").strip() or "Loan Repayment"

            txn = Transaction.objects.create(
                series=series,
                date=pay_date,
                description=description,
                owner=ctx["owner"],
                branch=ctx["branch"],
                tenant=ctx["tenant"],
                created_by=ctx["owner"],
            )

            # Repayment: Dr. Bank/Cash (money received), Cr. Loan (reduces balance)
            TransactionEntry.objects.create(
                transaction=txn, account=cash_acct,
                side=TransactionEntry.DEBIT, amount=amount,
            )
            TransactionEntry.objects.create(
                transaction=txn, account=gl_loan_acct,
                side=TransactionEntry.CREDIT, amount=amount,
            )
            txn.post()
            created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"    {created} loan payment transactions posted, {skipped} skipped"
            )
        )

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 17 – Income payment history
    # ══════════════════════════════════════════════════════════════════════════

    def _import_income_payments(self, income_pmts_data, banks_data, Account, gl, ctx):
        """
        Post each income receipt as: Dr. Bank/Cash, Cr. Income Account.

        Income accounts were created in Step 9 with names of the form
        "{income.name} ({income.year})".  We look them up by that same key.
        """
        from transactions.models import Transaction, TransactionEntry, TransactionSeries

        if not income_pmts_data:
            self.stdout.write("    No income payment history — skipping.")
            return

        series, _ = TransactionSeries.objects.get_or_create(
            code="INMIG",
            defaults={"description": "Income Payment History Migration"},
        )
        if Transaction.objects.filter(
            series=series, tenant=ctx["tenant"], branch=ctx["branch"]
        ).exists():
            self.stdout.write("    Income payment history already imported — skipping.")
            return

        bank_acct_map = self._build_bank_account_map(banks_data, Account, gl, ctx)
        suspense      = self._get_suspense_account(Account, gl, ctx)
        income_parent = gl["INCOME"]

        created = 0
        skipped = 0

        for rec in income_pmts_data:
            income_name = rec.get("income_name")
            income_year = rec.get("income_year", "YTD")
            account_name = f"{income_name} ({income_year})"

            try:
                income_acct = Account.objects.get(
                    name=account_name,
                    parent=income_parent,
                    tenant=ctx["tenant"],
                    branch=ctx["branch"],
                    is_deleted=False,
                )
            except Account.DoesNotExist:
                skipped += 1
                continue

            amount   = _d(rec.get("amount"))
            if amount <= Decimal("0"):
                skipped += 1
                continue

            bank_id   = rec.get("bank_id")
            cash_acct = bank_acct_map.get(bank_id, suspense) if bank_id else suspense
            pay_date  = _date(rec.get("payment_date"))
            description = (rec.get("description") or "").strip() or f"Income: {income_name}"

            txn = Transaction.objects.create(
                series=series, date=pay_date, description=description,
                owner=ctx["owner"], branch=ctx["branch"],
                tenant=ctx["tenant"], created_by=ctx["owner"],
            )
            # Dr. Bank/Cash (+), Cr. Income (+)
            TransactionEntry.objects.create(
                transaction=txn, account=cash_acct,
                side=TransactionEntry.DEBIT, amount=amount,
            )
            TransactionEntry.objects.create(
                transaction=txn, account=income_acct,
                side=TransactionEntry.CREDIT, amount=amount,
            )
            txn.post()
            created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"    {created} income payment transactions posted, {skipped} skipped"
            )
        )

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 18 – Expense payment history
    # ══════════════════════════════════════════════════════════════════════════

    def _import_expense_payments(self, expense_pmts_data, banks_data, Account, gl, ctx):
        """
        Post each approved expense as: Dr. Expense Account, Cr. Bank/Cash.

        Expense accounts were created in Step 10 with names of the form
        "{expense.name} ({expense.year})".
        """
        from transactions.models import Transaction, TransactionEntry, TransactionSeries

        if not expense_pmts_data:
            self.stdout.write("    No expense payment history — skipping.")
            return

        series, _ = TransactionSeries.objects.get_or_create(
            code="EXMIG",
            defaults={"description": "Expense Payment History Migration"},
        )
        if Transaction.objects.filter(
            series=series, tenant=ctx["tenant"], branch=ctx["branch"]
        ).exists():
            self.stdout.write("    Expense payment history already imported — skipping.")
            return

        bank_acct_map  = self._build_bank_account_map(banks_data, Account, gl, ctx)
        suspense       = self._get_suspense_account(Account, gl, ctx)
        expense_parent = gl["EXPENSE"]

        created = 0
        skipped = 0

        for rec in expense_pmts_data:
            expense_name = rec.get("expense_name")
            expense_year = rec.get("expense_year", "YTD")
            account_name = f"{expense_name} ({expense_year})"

            try:
                expense_acct = Account.objects.get(
                    name=account_name,
                    parent=expense_parent,
                    tenant=ctx["tenant"],
                    branch=ctx["branch"],
                    is_deleted=False,
                )
            except Account.DoesNotExist:
                skipped += 1
                continue

            amount   = _d(rec.get("amount"))
            if amount <= Decimal("0"):
                skipped += 1
                continue

            bank_id   = rec.get("bank_id")
            cash_acct = bank_acct_map.get(bank_id, suspense) if bank_id else suspense
            pay_date  = _date(rec.get("payment_date"))
            description = (rec.get("description") or "").strip() or f"Expense: {expense_name}"

            txn = Transaction.objects.create(
                series=series, date=pay_date, description=description,
                owner=ctx["owner"], branch=ctx["branch"],
                tenant=ctx["tenant"], created_by=ctx["owner"],
            )
            # Dr. Expense (+), Cr. Bank/Cash (-)
            TransactionEntry.objects.create(
                transaction=txn, account=expense_acct,
                side=TransactionEntry.DEBIT, amount=amount,
            )
            TransactionEntry.objects.create(
                transaction=txn, account=cash_acct,
                side=TransactionEntry.CREDIT, amount=amount,
            )
            txn.post()
            created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"    {created} expense payment transactions posted, {skipped} skipped"
            )
        )

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 19 – Liability payment history
    # ══════════════════════════════════════════════════════════════════════════

    def _import_liability_payments(self, liability_pmts_data, banks_data, Account, gl, ctx):
        """
        Post each liability movement:
          - Positive amount (liability increases / money received):
              Dr. Bank/Cash, Cr. Liability Account
          - Negative amount (liability decreases / money paid back):
              Dr. Liability Account, Cr. Bank/Cash

        Liability accounts were created in Step 11 with names of the form
        "{liability.name} ({liability.year})".
        """
        from transactions.models import Transaction, TransactionEntry, TransactionSeries

        if not liability_pmts_data:
            self.stdout.write("    No liability payment history — skipping.")
            return

        series, _ = TransactionSeries.objects.get_or_create(
            code="LBMIG",
            defaults={"description": "Liability Payment History Migration"},
        )
        if Transaction.objects.filter(
            series=series, tenant=ctx["tenant"], branch=ctx["branch"]
        ).exists():
            self.stdout.write("    Liability payment history already imported — skipping.")
            return

        bank_acct_map     = self._build_bank_account_map(banks_data, Account, gl, ctx)
        suspense          = self._get_suspense_account(Account, gl, ctx)
        liability_parent  = gl["LIABILITY"]

        created = 0
        skipped = 0

        for rec in liability_pmts_data:
            liability_name = rec.get("liability_name")
            liability_year = rec.get("liability_year", "YTD")
            account_name   = f"{liability_name} ({liability_year})"

            try:
                liability_acct = Account.objects.get(
                    name=account_name,
                    parent=liability_parent,
                    tenant=ctx["tenant"],
                    branch=ctx["branch"],
                    is_deleted=False,
                )
            except Account.DoesNotExist:
                skipped += 1
                continue

            amount   = _d(rec.get("amount"))
            if amount == Decimal("0"):
                skipped += 1
                continue

            bank_id   = rec.get("bank_id")
            cash_acct = bank_acct_map.get(bank_id, suspense) if bank_id else suspense
            pay_date  = _date(rec.get("payment_date"))
            description = (rec.get("description") or "").strip() or f"Liability: {liability_name}"

            txn = Transaction.objects.create(
                series=series, date=pay_date, description=description,
                owner=ctx["owner"], branch=ctx["branch"],
                tenant=ctx["tenant"], created_by=ctx["owner"],
            )
            entry_amount = abs(amount)
            if amount > Decimal("0"):
                # Liability increases (money received) → Dr Bank, Cr Liability
                dr_acct, cr_acct = cash_acct, liability_acct
            else:
                # Liability decreases (money paid back) → Dr Liability, Cr Bank
                dr_acct, cr_acct = liability_acct, cash_acct

            TransactionEntry.objects.create(
                transaction=txn, account=dr_acct,
                side=TransactionEntry.DEBIT, amount=entry_amount,
            )
            TransactionEntry.objects.create(
                transaction=txn, account=cr_acct,
                side=TransactionEntry.CREDIT, amount=entry_amount,
            )
            txn.post()
            created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"    {created} liability payment transactions posted, {skipped} skipped"
            )
        )

    # ══════════════════════════════════════════════════════════════════════════
    # Helpers for Steps 13–17
    # ══════════════════════════════════════════════════════════════════════════

    def _build_bank_account_map(self, banks_data, Account, gl, ctx) -> dict:
        """
        Reconstruct the {old_bank_id → GL Account} map by replaying the same
        name de-duplication logic used in _import_banks.

        The old system can have multiple Bank rows with the same name (one per
        financial year).  _import_banks de-duplicates them to "GTBank",
        "GTBank-1", etc. in source pk order.  We replay that here so that
        bank_id from the payment export maps to the correct GL account.
        """
        parent_acct = gl["ASSET"]
        name_occurrence: dict = {}
        bank_map: dict = {}

        for rec in banks_data:
            base_name = rec["name"]
            occurrence = name_occurrence.get(base_name, 0)
            name_occurrence[base_name] = occurrence + 1
            account_name = base_name if occurrence == 0 else f"{base_name}-{occurrence}"

            try:
                acct = Account.objects.get(
                    name=account_name,
                    parent=parent_acct,
                    tenant=ctx["tenant"],
                    branch=ctx["branch"],
                    is_deleted=False,
                )
                bank_map[rec["id"]] = acct
            except Account.DoesNotExist:
                pass

        return bank_map

    def _get_suspense_account(self, Account, gl, ctx):
        """
        Get or create a Migration Payment Suspense account for payments whose
        source bank cannot be determined (null bank_id or bank not found in map).
        These can be investigated and reclassified after the migration.
        """
        acct, _ = Account.objects.get_or_create(
            code="MIGS",
            tenant=ctx["tenant"],
            branch=ctx["branch"],
            defaults={
                "name": "Migration Payment Suspense",
                "account_type": Account.ASSET,
                "account_level": Account.LEVEL_CHILD,
                "parent": gl["ASSET"],
                "owner": ctx["owner"],
                "created_by": ctx["owner"],
                "is_system_account": True,
            },
        )
        return acct

    # ══════════════════════════════════════════════════════════════════════════
    # Utility
    # ══════════════════════════════════════════════════════════════════════════

    @staticmethod
    def _next_available_code(Account, start: int, ctx) -> int:
        """
        Find the first 4-digit code >= start not already in use for this
        tenant + branch combination.
        """
        used_codes = set(
            Account.objects.filter(
                tenant=ctx["tenant"],
                branch=ctx["branch"],
                is_deleted=False,
            ).values_list("code", flat=True)
        )
        counter = start
        while str(counter) in used_codes:
            counter += 1
        return counter

    @staticmethod
    def _next_subledger_code(Account, parent_account) -> str:
        """
        Generate the next available sub-ledger code for a given parent account.

        Format: PPPP-NNNNN
          PPPP  = parent's 4-digit GL code (e.g. '1150')
          NNNNN = zero-padded 5-digit sequence (00001 … 99999)

        This is:
          • Unlimited (99,999 children per parent)
          • Collision-proof (PPPP prefix makes it unique per parent)
          • Compliant with the PPPP-NNNNN validator added in migration 0012
          • Idempotent across repeated import runs
        """
        prefix = f"{parent_account.code}-"
        existing_seqs = []
        for code in Account.objects.filter(
            parent=parent_account,
            tenant=parent_account.tenant,
            branch=parent_account.branch,
            is_deleted=False,
            code__startswith=prefix,
        ).values_list("code", flat=True):
            try:
                existing_seqs.append(int(code[len(prefix):]))
            except (ValueError, IndexError):
                pass
        next_seq = (max(existing_seqs) + 1) if existing_seqs else 1
        return f"{parent_account.code}-{next_seq:05d}"
