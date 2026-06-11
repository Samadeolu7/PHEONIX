# loans/management/commands/seed_microfinance_products.py
"""
Management command: seed_microfinance_products
==============================================
Creates the three canonical loan products and two savings products that mirror
the legacy Krystartust microfinance system, then wires up savings requirements
for every loan product.

Usage
-----
  python manage.py seed_microfinance_products --owner-id 1 --branch-id 1
  python manage.py seed_microfinance_products --owner-id 1 --branch-id 1 --dry-run
  python manage.py seed_microfinance_products --owner-id 1 --branch-id 1 --force

Products created
----------------
Savings:
  1. Regular Savings        (monthly cycle, standard savings account)
  2. Daily Contribution     (daily cycle, 3-month smart-savings cycle,
                             5 % interest on completion, 5 % penalty on
                             early break — mirrors SmartSavingsAccount)

Loans:
  3. Daily Collection Loan  (daily repayment, 3-month term, 7-day grace)
  4. Weekly Loan            (weekly repayment, 23-week term, 7-day grace)
  5. Monthly Loan           (monthly repayment, 6-month term,
                             first payment the following month)

Savings requirements (10 % of requested amount in DC Savings) are attached
to every loan product at the end.

GL accounts are resolved automatically by account_type — the first matching
PARENT account of the right type is used.  Missing GL links are skipped
gracefully (products are still created); you can wire them up later via the
Loan Product Config page.
"""
from __future__ import annotations

import logging
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction

logger = logging.getLogger(__name__)
User = get_user_model()

# ---------------------------------------------------------------------------
# Product definitions
# ---------------------------------------------------------------------------

SAVINGS_PRODUCTS = [
    {
        "code": "SAV-REG",
        "name": "Regular Savings",
        "description": (
            "Standard member savings account. "
            "Contributions are made at the member's discretion; no fixed cycle."
        ),
        "contribution_cycle": "monthly",
        "contribution_amount": Decimal("0"),
        "interest_rate": Decimal("0"),
        # SavingsProduct config
        "is_daily_contribution": False,
        "first_deposit_is_income": False,
        "has_savings_cycle": False,
        "withdrawal_needs_approval": True,
        "only_account_manager_can_withdraw": True,
    },
    {
        "code": "SAV-DC",
        "name": "Daily Contribution Savings",
        "description": (
            "Thrift / Ajo savings account with a 3-month smart-savings cycle. "
            "Members make daily contributions. At cycle end (3 months) interest "
            "is credited; early withdrawal attracts a penalty."
        ),
        "contribution_cycle": "daily",
        "contribution_amount": Decimal("0"),
        "interest_rate": Decimal("0"),
        # SavingsProduct config
        "is_daily_contribution": True,
        "first_deposit_is_income": False,  # user confirmed: cycle+penalty only
        "has_savings_cycle": True,
        "cycle_length_months": 3,
        "cycle_interest_rate": Decimal("5.00"),
        "cycle_break_penalty_rate": Decimal("5.00"),
        "cycle_auto_renew": True,
        "withdrawal_needs_approval": True,
        "only_account_manager_can_withdraw": True,
    },
]

LOAN_PRODUCTS = [
    {
        "code": "LN-DC",
        "name": "Daily Collection Loan",
        "description": (
            "Short-term loan repaid daily. "
            "Designed for traders and petty businesses. "
            "Term: 3 months; first repayment after 7-day grace period."
        ),
        "repayment_frequency": "daily",
        "min_term_months": 1,
        "max_term_months": 3,
        "min_loan_amount": Decimal("1000"),
        "max_loan_amount": Decimal("500000"),
        "default_interest_rate": Decimal("15.00"),
        "interest_calculation_method": "flat",
        "grace_period_days": 7,
        "late_payment_penalty_type": "percentage",
        "late_payment_penalty": Decimal("5.00"),
        "requires_collateral": False,
        "requires_guarantor": True,
        "min_guarantors": 1,
        "requires_approval": True,
        "allowed_repayment_frequencies": ["daily"],
    },
    {
        "code": "LN-WK",
        "name": "Weekly Loan",
        "description": (
            "Medium-term loan repaid weekly over 23 weeks. "
            "First repayment is expected one week after disbursement."
        ),
        "repayment_frequency": "weekly",
        "min_term_months": 1,
        "max_term_months": 6,  # 23 weeks ≈ 6 months
        "min_loan_amount": Decimal("5000"),
        "max_loan_amount": Decimal("1000000"),
        "default_interest_rate": Decimal("15.00"),
        "interest_calculation_method": "flat",
        "grace_period_days": 7,
        "late_payment_penalty_type": "percentage",
        "late_payment_penalty": Decimal("5.00"),
        "requires_collateral": False,
        "requires_guarantor": True,
        "min_guarantors": 1,
        "requires_approval": True,
        "allowed_repayment_frequencies": ["weekly"],
        "additional_config": {
            "term_weeks": 23,
            "grace_weeks": 1,
        },
    },
    {
        "code": "LN-MO",
        "name": "Monthly Loan",
        "description": (
            "Longer-term loan repaid monthly over 6 months. "
            "Repayments begin the month immediately following disbursement."
        ),
        "repayment_frequency": "monthly",
        "min_term_months": 1,
        "max_term_months": 6,
        "min_loan_amount": Decimal("10000"),
        "max_loan_amount": Decimal("5000000"),
        "default_interest_rate": Decimal("15.00"),
        "interest_calculation_method": "flat",
        "grace_period_days": 0,   # payment begins very next month
        "late_payment_penalty_type": "percentage",
        "late_payment_penalty": Decimal("5.00"),
        "requires_collateral": False,
        "requires_guarantor": True,
        "min_guarantors": 1,
        "requires_approval": True,
        "allowed_repayment_frequencies": ["monthly"],
    },
]

# Savings requirement: 10 % of requested loan amount in DC savings
SAVINGS_REQUIREMENT = {
    "savings_product_code": "SAV-DC",
    "requirement_type": "percentage",
    "value": Decimal("10.00"),
    "is_active": True,
}


class Command(BaseCommand):
    help = (
        "Seed the three canonical microfinance loan products (daily, weekly, monthly) "
        "and two savings products (regular, daily-contribution/thrift) that mirror "
        "the legacy Krystartust system."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--owner-id",
            type=int,
            required=True,
            help="Primary key of the owner User (your admin/superuser).",
        )
        parser.add_argument(
            "--branch-id",
            type=int,
            default=None,
            help="Primary key of the Branch to scope these products to (optional).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print what would be created without touching the database.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help=(
                "Re-create or update products that already exist "
                "(matched by product code). Default: skip existing."
            ),
        )

    # ------------------------------------------------------------------
    def handle(self, *args, **options):
        owner_id = options["owner_id"]
        branch_id = options.get("branch_id")
        dry_run = options["dry_run"]
        force = options["force"]

        # ── resolve owner ──────────────────────────────────────────────
        try:
            owner = User.objects.get(pk=owner_id)
        except User.DoesNotExist:
            raise CommandError(f"User with id={owner_id} does not exist.")

        tenant = getattr(owner, "tenant", None)

        # ── resolve branch ─────────────────────────────────────────────
        branch = None
        if branch_id:
            from branches.models import Branch

            try:
                branch = Branch.objects.get(pk=branch_id)
            except Branch.DoesNotExist:
                raise CommandError(f"Branch with id={branch_id} does not exist.")

        self.stdout.write(
            self.style.MIGRATE_HEADING(
                f"\n{'[DRY RUN] ' if dry_run else ''}Seeding microfinance products "
                f"for owner={owner} branch={branch}\n"
            )
        )

        # ── resolve GL accounts (best-effort) ─────────────────────────
        gl = self._resolve_gl_accounts(owner, branch, tenant)
        self._print_gl_summary(gl)

        if dry_run:
            self._dry_run(owner, branch, tenant, gl)
            self.stdout.write(self.style.WARNING("\nDry run complete — nothing written.\n"))
            return

        # ── run inside a single atomic block ──────────────────────────
        with db_transaction.atomic():
            savings_products = self._create_savings_products(owner, branch, tenant, gl, force)
            loan_products = self._create_loan_products(owner, branch, tenant, gl, force)
            self._create_savings_requirements(loan_products, savings_products, owner, branch, tenant, force)

        self.stdout.write(self.style.SUCCESS("\nAll products seeded successfully.\n"))

    # ------------------------------------------------------------------
    # GL account resolution
    # ------------------------------------------------------------------

    def _resolve_gl_accounts(self, owner, branch, tenant):
        """
        Return a dict of best-effort GL account objects keyed by role.
        Looks up by account_type (and PARENT level where relevant).
        Returns None for any account that doesn't yet exist.
        """
        from accounts.models import Account

        def first(account_type, level=None, qs_extra=None):
            qs = Account.objects.filter(account_type=account_type, owner=owner)
            if level:
                qs = qs.filter(account_level=level)
            if qs_extra:
                qs = qs.filter(**qs_extra)
            return qs.order_by("code").first()

        return {
            # Loan product parent GL account (LOAN, PARENT)
            "loan_parent_account": first(Account.LOAN, level=Account.LEVEL_PARENT),
            # Income accounts
            "interest_income": first(Account.INCOME),
            "fee_income": first(Account.INCOME),
            "penalty_income": first(Account.INCOME),
            # Expense accounts
            "interest_expense": first(Account.EXPENSE),
        }

    def _print_gl_summary(self, gl):
        self.stdout.write("  GL account resolution:")
        for role, acct in gl.items():
            if acct:
                self.stdout.write(
                    f"    {role:<30} → {acct.code}  {acct.name}"
                )
            else:
                self.stdout.write(
                    self.style.WARNING(f"    {role:<30} → NOT FOUND (will be left blank)")
                )
        self.stdout.write("")

    # ------------------------------------------------------------------
    # Dry-run preview
    # ------------------------------------------------------------------

    def _dry_run(self, owner, branch, tenant, gl):
        self.stdout.write("  Would create savings products:")
        for sp in SAVINGS_PRODUCTS:
            self.stdout.write(f"    [{sp['code']}]  {sp['name']}")
        self.stdout.write("\n  Would create loan products:")
        for lp in LOAN_PRODUCTS:
            self.stdout.write(f"    [{lp['code']}]  {lp['name']}  @{lp['default_interest_rate']}% flat")
        self.stdout.write(
            "\n  Would create savings requirements (10% DC savings) for every loan product."
        )

    # ------------------------------------------------------------------
    # Savings product creation
    # ------------------------------------------------------------------

    def _create_savings_products(self, owner, branch, tenant, gl, force) -> dict:
        """
        Create Product + SavingsProduct config records.
        Returns {code: Product} mapping.
        """
        from products.models import Product
        from savings.models import SavingsProduct

        created = {}

        for spec in SAVINGS_PRODUCTS:
            existing = Product.objects.filter(code=spec["code"], owner=owner).first()
            if existing and not force:
                self.stdout.write(
                    f"  SKIP  [{spec['code']}] {spec['name']} — already exists (use --force to update)"
                )
                created[spec["code"]] = existing
                continue

            product, prod_created = Product.objects.update_or_create(
                code=spec["code"],
                owner=owner,
                defaults={
                    "name": spec["name"],
                    "description": spec["description"],
                    "product_class": "FINANCIAL",
                    "product_type": Product.SAVINGS,
                    "is_active": True,
                    "contribution_cycle": spec.get("contribution_cycle"),
                    "contribution_amount": spec.get("contribution_amount"),
                    "interest_rate": spec.get("interest_rate", Decimal("0")),
                    "branch": branch,
                    "tenant": tenant,
                },
            )

            action = "CREATED" if prod_created else "UPDATED"
            self.stdout.write(self.style.SUCCESS(f"  {action}  [{spec['code']}] {spec['name']}"))

            # ── SavingsProduct config ─────────────────────────────────
            config_defaults = {
                "is_daily_contribution": spec["is_daily_contribution"],
                "first_deposit_is_income": spec.get("first_deposit_is_income", False),
                "has_savings_cycle": spec.get("has_savings_cycle", False),
                "cycle_auto_renew": spec.get("cycle_auto_renew", True),
                "withdrawal_needs_approval": spec.get("withdrawal_needs_approval", True),
                "only_account_manager_can_withdraw": spec.get("only_account_manager_can_withdraw", True),
                "owner": owner,
                "branch": branch,
                "tenant": tenant,
            }

            if spec.get("has_savings_cycle"):
                config_defaults.update(
                    {
                        "cycle_length_months": spec.get("cycle_length_months"),
                        "cycle_interest_rate": spec.get("cycle_interest_rate"),
                        "cycle_break_penalty_rate": spec.get("cycle_break_penalty_rate"),
                        "interest_expense_account": gl.get("interest_expense"),
                        "penalty_income_account": gl.get("penalty_income"),
                    }
                )
                if not gl.get("interest_expense"):
                    self.stdout.write(
                        self.style.WARNING(
                            f"    ⚠  No EXPENSE account found — interest_expense_account left blank "
                            f"on {spec['name']}. Wire it up via the Savings Product Config page."
                        )
                    )
                if not gl.get("penalty_income"):
                    self.stdout.write(
                        self.style.WARNING(
                            f"    ⚠  No INCOME account found — penalty_income_account left blank "
                            f"on {spec['name']}. Wire it up via the Savings Product Config page."
                        )
                    )

            SavingsProduct.objects.update_or_create(
                product=product,
                defaults=config_defaults,
            )

            created[spec["code"]] = product

        return created

    # ------------------------------------------------------------------
    # Loan product creation
    # ------------------------------------------------------------------

    def _create_loan_products(self, owner, branch, tenant, gl, force) -> dict:
        """
        Create Product + LoanProduct records.
        Returns {code: LoanProduct} mapping.
        """
        from products.models import Product
        from loans.models import LoanProduct

        if not gl["loan_parent_account"]:
            self.stdout.write(
                self.style.WARNING(
                    "\n  ⚠  No LOAN PARENT account found in the GL. "
                    "LoanProduct records require a parent_account FK. "
                    "Please create a Loans Receivable parent account (account_type=LOAN, "
                    "account_level=PARENT) and re-run, OR set the account manually after creation.\n"
                )
            )
            # We'll proceed but set parent_account to the first-found LOAN account as fallback
            from accounts.models import Account
            fallback = Account.objects.filter(account_type=Account.LOAN, owner=owner).first()
            if fallback:
                self.stdout.write(f"  Using fallback LOAN account: {fallback.code} {fallback.name}")
                gl["loan_parent_account"] = fallback
            else:
                raise CommandError(
                    "Cannot create LoanProduct records: no Account with account_type=LOAN "
                    "exists for this owner. Create one first (Chart of Accounts)."
                )

        created = {}

        for spec in LOAN_PRODUCTS:
            existing_product = Product.objects.filter(code=spec["code"], owner=owner).first()
            if existing_product and not force:
                loan_product = LoanProduct.objects.filter(product=existing_product).first()
                if loan_product:
                    self.stdout.write(
                        f"  SKIP  [{spec['code']}] {spec['name']} — already exists (use --force to update)"
                    )
                    created[spec["code"]] = loan_product
                    continue

            product, prod_created = Product.objects.update_or_create(
                code=spec["code"],
                owner=owner,
                defaults={
                    "name": spec["name"],
                    "description": spec["description"],
                    "product_class": "FINANCIAL",
                    "product_type": Product.LOAN,
                    "is_active": True,
                    "branch": branch,
                    "tenant": tenant,
                    "interest_rate": spec["default_interest_rate"],
                    "requires_approval": spec.get("requires_approval", True),
                },
            )

            loan_defaults = {
                "parent_account": gl["loan_parent_account"],
                "interest_income_account": gl.get("interest_income"),
                "fee_income_account": gl.get("fee_income"),
                "penalty_income_account": gl.get("penalty_income"),
                "default_interest_rate": spec["default_interest_rate"],
                "interest_calculation_method": spec.get("interest_calculation_method", "flat"),
                "min_term_months": spec["min_term_months"],
                "max_term_months": spec["max_term_months"],
                "min_loan_amount": spec["min_loan_amount"],
                "max_loan_amount": spec["max_loan_amount"],
                "allowed_repayment_frequencies": spec.get("allowed_repayment_frequencies", []),
                "grace_period_days": spec.get("grace_period_days", 0),
                "late_payment_penalty_type": spec.get("late_payment_penalty_type", "percentage"),
                "late_payment_penalty": spec.get("late_payment_penalty", Decimal("0")),
                "requires_collateral": spec.get("requires_collateral", False),
                "collateral_percentage": Decimal("0"),
                "requires_guarantor": spec.get("requires_guarantor", False),
                "min_guarantors": spec.get("min_guarantors", 0),
                "requires_approval": spec.get("requires_approval", True),
                "additional_config": spec.get("additional_config", {}),
                "owner": owner,
                "branch": branch,
                "tenant": tenant,
            }

            loan_product, lp_created = LoanProduct.objects.update_or_create(
                product=product,
                defaults=loan_defaults,
            )

            action = "CREATED" if (prod_created or lp_created) else "UPDATED"
            self.stdout.write(
                self.style.SUCCESS(
                    f"  {action}  [{spec['code']}] {spec['name']}  "
                    f"@ {spec['default_interest_rate']}% flat  "
                    f"(₦{spec['min_loan_amount']:,.0f} – ₦{spec['max_loan_amount']:,.0f})"
                )
            )

            created[spec["code"]] = loan_product

        return created

    # ------------------------------------------------------------------
    # Savings requirements
    # ------------------------------------------------------------------

    def _create_savings_requirements(
        self, loan_products: dict, savings_products: dict, owner, branch, tenant, force
    ):
        """
        Attach a 10 % DC-savings requirement to every loan product.
        """
        from loans.models import LoanProductSavingsRequirement

        req_spec = SAVINGS_REQUIREMENT
        dc_savings_product = savings_products.get(req_spec["savings_product_code"])

        if not dc_savings_product:
            self.stdout.write(
                self.style.WARNING(
                    "  ⚠  DC savings product not found — savings requirements not created."
                )
            )
            return

        self.stdout.write("\n  Savings requirements:")
        for code, loan_product in loan_products.items():
            existing = LoanProductSavingsRequirement.objects.filter(
                loan_product=loan_product,
                savings_product=dc_savings_product,
            ).first()

            if existing and not force:
                self.stdout.write(
                    f"  SKIP  [{code}] requirement already exists"
                )
                continue

            LoanProductSavingsRequirement.objects.update_or_create(
                loan_product=loan_product,
                savings_product=dc_savings_product,
                defaults={
                    "requirement_type": req_spec["requirement_type"],
                    "value": req_spec["value"],
                    "is_active": req_spec["is_active"],
                    "owner": owner,
                    "branch": branch,
                    "tenant": tenant,
                },
            )
            self.stdout.write(
                self.style.SUCCESS(
                    f"  CREATED  [{code}] requires 10% DC savings balance"
                )
            )
