"""
common/management/commands/setup_microfinance.py
================================================
One-shot setup command for a new Krystar Trust Investment Limited (KTIL)
tenant on Phoenix ERP.

Creates (all idempotent — safe to run multiple times):
  1. Superuser / admin user (tenant owner)
  2. Tenant record (Krystar Trust Investment Limited)
  3. DRF Token for the admin user (and optionally a service-account token)
  4. HQ Branch (Sagamu, Ogun State)
  5. Chart of Accounts skeleton for microfinance (Assets, Liabilities,
     Equity, Income, Expense, Loan, Savings account types)
  6. Three core Loan Products:
       - DC  (Daily / Ajo)   – daily repayment
       - WL  (Weekly)        – weekly repayment
       - ML  (Monthly)       – monthly repayment ("Business Loan")
  7. A service-account user for Java microservices + its Token

Usage:
  python manage.py setup_microfinance
  python manage.py setup_microfinance --owner-email admin@ktil.ng \\
       --branch-name "Ijebu-Ode Branch" --no-loan-products

Flags:
  --owner-email       Email for the tenant owner (default: admin@ktil.ng)
  --owner-password    Password (prompted if omitted)
  --branch-name       Name of HQ branch (default: "Sagamu HQ")
  --branch-code       Code for HQ branch (default: SAG001)
  --no-loan-products  Skip seeding the three default loan products
  --dry-run           Print what would be created without saving anything
"""
from __future__ import annotations

import getpass
import logging

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

logger = logging.getLogger(__name__)
User = get_user_model()


# ---------------------------------------------------------------------------
# Chart of Accounts definitions
# ---------------------------------------------------------------------------
#
# Format: (code, name, account_type, account_level, normal_side, description)
#   account_level: PARENT | CHILD
#   normal_side  : DR | CR
#
COA_ENTRIES = [
    # ═══════════════════════════════════════════════════════════════════════════
    # ASSETS  (1xxx)
    # ═══════════════════════════════════════════════════════════════════════════

    # ── Cash and Bank Accounts ─────────────────────────────────────────────────
    ("1000", "Cash and Bank",                            "ASSET",     "PARENT", "DR", "All cash and bank balances"),
    ("1001", "Cash In Hand",                             "ASSET",     "CHILD",  "DR", "Main branch vault cash"),
    ("1002", "MoniePoint",                               "ASSET",     "CHILD",  "DR", "MoniePoint mobile / POS settlement account"),
    ("1003", "First Bank",                               "ASSET",     "CHILD",  "DR", "First Bank main current account – Sagamu"),
    ("1004", "First Bank – Orimerunmu",                  "ASSET",     "CHILD",  "DR", "First Bank current account – Orimerunmu branch"),

    # ── Credit Officer Cash Floats ─────────────────────────────────────────────
    # NOTE: One child account per Credit Officer is auto-created by the staff /
    #       cashier module when a user is assigned the Credit Officer role.
    ("1010", "Credit Officer Cash Floats",               "ASSET",     "PARENT", "DR", "Cash floats held by individual credit officers — child accounts auto-created per staff member"),

    # ── Suspense and Control Accounts ─────────────────────────────────────────
    ("1050", "Suspense and Control Accounts",            "ASSET",     "PARENT", "DR", "Clearing, reconciliation and unconfirmed transaction accounts"),
    ("1051", "Control Account",                          "ASSET",     "CHILD",  "DR", "General suspense for unconfirmed entries"),
    ("1052", "Control Ledger",                           "ASSET",     "CHILD",  "DR", "Ledger-level reconciliation suspense"),

    # ── Loan Portfolio ─────────────────────────────────────────────────────────
    ("1100", "Loan Portfolio",                           "LOAN",      "PARENT", "DR", "All loan receivables – roll-up only"),
    ("1101", "Daily Contribution Loans (DC)",            "LOAN",      "CHILD",  "DR", "Ajo / daily repayment loan accounts"),
    ("1102", "Weekly Loans (WL)",                        "LOAN",      "CHILD",  "DR", "Weekly repayment loan accounts"),
    ("1103", "Monthly Business Loans (ML)",              "LOAN",      "CHILD",  "DR", "Monthly reducing-balance business loans"),

    # ── Savings Portfolio ──────────────────────────────────────────────────────
    ("1200", "Savings Portfolio",                        "SAVINGS",   "PARENT", "CR", "All member savings balances – roll-up only"),
    ("1201", "Savings",                                  "SAVINGS",   "CHILD",  "CR", "Member savings accounts"),

    # ── Prepayments ────────────────────────────────────────────────────────────
    ("1300", "Prepayments",                              "ASSET",     "PARENT", "DR", "Costs and expenses paid in advance"),
    ("1301", "Rent Prepayment",                          "ASSET",     "CHILD",  "DR", "Office rent paid in advance"),
    ("1302", "Interest Prepayment",                      "ASSET",     "CHILD",  "DR", "Loan interest received from borrowers in advance"),
    ("1303", "Prepayment",                               "ASSET",     "CHILD",  "DR", "General sundry prepayments"),

    # ── Receivables and Staff Advances ────────────────────────────────────────
    ("1400", "Receivables and Staff Advances",           "ASSET",     "PARENT", "DR", "Amounts owed to the organisation"),
    ("1401", "Staff Salary Advance",                     "ASSET",     "CHILD",  "DR", "Salary advances issued to individual staff members"),
    ("1402", "Salary Advance",                           "ASSET",     "CHILD",  "DR", "Short-term salary advances – general"),
    ("1403", "Interest Receivable",                      "ASSET",     "CHILD",  "DR", "Accrued loan interest not yet collected"),

    # ── Inventory ──────────────────────────────────────────────────────────────
    ("1500", "Inventory",                                "ASSET",     "PARENT", "DR", "Goods and supplies held for sale or use"),
    ("1501", "General Inventory",                        "ASSET",     "CHILD",  "DR", "General stock of goods and office supplies"),

    # ── Fixed Assets ───────────────────────────────────────────────────────────
    ("1600", "Property and Equipment",                   "ASSET",     "PARENT", "DR", "Fixed assets at cost less accumulated depreciation"),
    ("1601", "Fixed Assets",                             "ASSET",     "CHILD",  "DR", "Property, equipment and fittings – at cost"),
    ("1602", "Accumulated Depreciation",                 "ASSET",     "CHILD",  "CR", "Cumulative depreciation charged on fixed assets"),


    # ═══════════════════════════════════════════════════════════════════════════
    # LIABILITIES  (2xxx)
    # ═══════════════════════════════════════════════════════════════════════════

    # ── External Borrowings ────────────────────────────────────────────────────
    ("2000", "External Borrowings",                      "LIABILITY", "PARENT", "CR", "Funds borrowed from external investors and third parties"),
    ("2001", "Loan Account – Oyo",                       "LIABILITY", "CHILD",  "CR", "Borrowed funds – Oyo investor"),
    ("2002", "Loan Account – Omidire",                   "LIABILITY", "CHILD",  "CR", "Borrowed funds – Omidire investor"),
    ("2003", "Mrs Nimota Lawal",                         "LIABILITY", "CHILD",  "CR", "Borrowed funds – Mrs Nimota Lawal"),

    # ── Member Welfare Fund ────────────────────────────────────────────────────
    ("2100", "Member Welfare Fund",                      "LIABILITY", "PARENT", "CR", "Fees collected from borrowers held for member events and welfare activities"),
    ("2101", "Union Contribution",                       "LIABILITY", "CHILD",  "CR", "Union fee deducted at loan disbursement – used for member events, parties and holiday gifts"),

    # ── Statutory Payables ─────────────────────────────────────────────────────
    ("2200", "Statutory Payables",                       "LIABILITY", "PARENT", "CR", "Statutory deductions and remittances due to government agencies"),
    ("2201", "NHF Payable",                              "LIABILITY", "CHILD",  "CR", "National Housing Fund remittance due to FMBN"),
    ("2202", "NSITF Payable",                            "LIABILITY", "CHILD",  "CR", "NSITF contribution remittance due to NSITF Board"),
    ("2203", "PAYE Tax Payable",                         "LIABILITY", "CHILD",  "CR", "Pay-As-You-Earn income tax withheld (OGIRS)"),
    ("2204", "Pension Payable",                          "LIABILITY", "CHILD",  "CR", "Staff and employer pension contributions payable (PRA 2014)"),

    # ── Trade and Other Payables ───────────────────────────────────────────────
    ("2300", "Trade and Other Payables",                 "LIABILITY", "PARENT", "CR", "Amounts owed to vendors, staff and other creditors"),
    ("2301", "Payroll Clearance",                        "LIABILITY", "CHILD",  "CR", "Payroll clearing and suspense account"),
    ("2302", "KPD Concept",                              "LIABILITY", "CHILD",  "CR", "Amount owed to KPD Concept"),
    ("2303", "Kenning Printing",                         "LIABILITY", "CHILD",  "CR", "Amount owed to Kenning Printing"),


    # ═══════════════════════════════════════════════════════════════════════════
    # EQUITY  (3xxx)
    # ═══════════════════════════════════════════════════════════════════════════
    ("3000", "Equity",                                   "EQUITY",    "PARENT", "CR", "Shareholders equity and accumulated earnings"),
    ("3001", "Paid Up Capital",                          "EQUITY",    "CHILD",  "CR", "Paid-up share capital contributed by shareholders / members"),
    ("3002", "Retained Earnings",                        "EQUITY",    "CHILD",  "CR", "Cumulative retained earnings brought forward"),
    ("3003", "Current Year Profit / Loss",               "EQUITY",    "CHILD",  "CR", "Net profit or loss for the current financial year"),


    # ═══════════════════════════════════════════════════════════════════════════
    # INCOME  (4xxx)
    # ═══════════════════════════════════════════════════════════════════════════

    # ── Interest Income ────────────────────────────────────────────────────────
    ("4000", "Interest Income",                          "INCOME",    "PARENT", "CR", "All interest earned on loan portfolios"),
    ("4001", "Daily Loan Interest",                      "INCOME",    "CHILD",  "CR", "Interest earned on Ajo / daily contribution loans"),
    ("4002", "Weekly Loan Interest",                     "INCOME",    "CHILD",  "CR", "Interest earned on weekly repayment loans"),
    ("4003", "Monthly Loan Interest",                    "INCOME",    "CHILD",  "CR", "Interest earned on monthly business loans"),

    # ── Fee Income ─────────────────────────────────────────────────────────────
    ("4100", "Fee Income",                               "INCOME",    "PARENT", "CR", "All fees and charges collected from members and borrowers"),
    ("4101", "Registration Fee",                         "INCOME",    "CHILD",  "CR", "One-time member registration fee"),
    ("4102", "Loan Registration Fee",                    "INCOME",    "CHILD",  "CR", "Per-loan application registration fee"),
    ("4103", "Administrative Fee",                       "INCOME",    "CHILD",  "CR", "Monthly administrative charge on active loan accounts"),
    ("4104", "SMS Fee",                                  "INCOME",    "CHILD",  "CR", "SMS notification charge billed to members"),
    ("4105", "ID Fee",                                   "INCOME",    "CHILD",  "CR", "Member identity card issuance fee"),
    ("4106", "Risk Premium",                             "INCOME",    "CHILD",  "CR", "Credit risk / loan protection fee charged on each loan"),
    ("4107", "Daily Contribution",                       "INCOME",    "CHILD",  "CR", "First-of-month payment from Ajo / DC members recognised as income"),

    # ── Penalty Income ─────────────────────────────────────────────────────────
    ("4200", "Penalty Income",                           "INCOME",    "PARENT", "CR", "Late payment and default penalty charges"),
    ("4201", "Loan Penalty",                             "INCOME",    "CHILD",  "CR", "Late repayment penalty charged on overdue loan instalments"),

    # ── Other Income ───────────────────────────────────────────────────────────
    ("4300", "Other Income",                             "INCOME",    "PARENT", "CR", "Non-core and miscellaneous income"),
    ("4301", "Other Income",                             "INCOME",    "CHILD",  "CR", "Sundry and miscellaneous income not classified elsewhere"),


    # ═══════════════════════════════════════════════════════════════════════════
    # EXPENSES  (5xxx)
    # ═══════════════════════════════════════════════════════════════════════════

    # ── Administrative Expenses ────────────────────────────────────────────────
    ("5000", "Administrative Expenses",                  "EXPENSE",   "PARENT", "DR", "General office and branch running costs"),
    ("5001", "Office Rent",                              "EXPENSE",   "CHILD",  "DR", "Monthly office and branch rental charge"),
    ("5002", "Computer Expenses",                        "EXPENSE",   "CHILD",  "DR", "Computer hardware, software and IT consumables"),
    ("5003", "Water / Sewage Expenses",                  "EXPENSE",   "CHILD",  "DR", "Water supply and sewage utility charges"),
    ("5004", "Printing / Stationeries / Photocopies",    "EXPENSE",   "CHILD",  "DR", "Office printing, stationery and photocopying costs"),
    ("5005", "Telephone / Internet / Postage",           "EXPENSE",   "CHILD",  "DR", "Phone lines, internet subscriptions and postal charges"),
    ("5006", "Local Travelling / Weekly Transportation", "EXPENSE",   "CHILD",  "DR", "Staff local travel and weekly field transport costs"),
    ("5007", "Electricity / PHCN Bills",                 "EXPENSE",   "CHILD",  "DR", "Electricity and PHCN utility bills"),
    ("5008", "Fuel / Diesel",                            "EXPENSE",   "CHILD",  "DR", "Fuel and diesel for generators and vehicles"),
    ("5009", "Electrical Repairs and Maintenance",       "EXPENSE",   "CHILD",  "DR", "Electrical installation repairs and maintenance"),
    ("5010", "Furniture Repairs and Maintenance",        "EXPENSE",   "CHILD",  "DR", "Office furniture repair and maintenance costs"),
    ("5011", "Office Management / Repairs",              "EXPENSE",   "CHILD",  "DR", "General office upkeep and structural repairs"),
    ("5012", "Security Expenses",                        "EXPENSE",   "CHILD",  "DR", "Security personnel and equipment costs"),
    ("5013", "Entertainment Expenses",                   "EXPENSE",   "CHILD",  "DR", "Staff and client entertainment costs"),
    ("5014", "Logistic / Conveyance Expenses",           "EXPENSE",   "CHILD",  "DR", "Logistics, courier and conveyance charges"),
    ("5015", "Food Accommodation / DSA",                 "EXPENSE",   "CHILD",  "DR", "Staff meals, accommodation and daily subsistence allowance"),
    ("5016", "Overseas Travelling",                      "EXPENSE",   "CHILD",  "DR", "International travel and accommodation expenses"),
    ("5017", "Newspapers / Periodicals",                 "EXPENSE",   "CHILD",  "DR", "Newspaper, magazine and periodical subscriptions"),
    ("5018", "Training / Seminar / Workshop",            "EXPENSE",   "CHILD",  "DR", "Staff training, seminar and workshop fees"),
    ("5019", "Gen-Set Repairs and Maintenance",          "EXPENSE",   "CHILD",  "DR", "Generator servicing, repairs and maintenance"),
    ("5020", "End of Year Party Expenses",               "EXPENSE",   "CHILD",  "DR", "Annual staff and member end-of-year celebration costs"),

    # ── Payroll Related Expenses ───────────────────────────────────────────────
    ("5100", "Payroll Related Expenses",                 "EXPENSE",   "PARENT", "DR", "All staff compensation and statutory employer contributions"),
    ("5101", "Basic Salary",                             "EXPENSE",   "CHILD",  "DR", "Net basic salary payments to staff"),
    ("5102", "NHF Employer Contribution",                "EXPENSE",   "CHILD",  "DR", "Employer NHF contribution – 2.5% of basic salary (NHF Act 1992)"),
    ("5103", "NSITF Employer Contribution",              "EXPENSE",   "CHILD",  "DR", "Employer NSITF levy – 1% of total emolument"),
    ("5104", "Pension Employer Contribution",            "EXPENSE",   "CHILD",  "DR", "Employer pension contribution – 10% of gross (PRA 2014)"),

    # ── Other Expenses ─────────────────────────────────────────────────────────
    ("5200", "Other Expenses",                           "EXPENSE",   "PARENT", "DR", "Bank charges, sundry and non-recurring expenses"),
    ("5201", "Bank Charges",                             "EXPENSE",   "CHILD",  "DR", "Bank transaction, maintenance and service charges"),
    ("5202", "Excess Refund (Risk Premium)",             "EXPENSE",   "CHILD",  "DR", "Refund of excess risk premium to members upon loan completion"),
    ("5203", "Interest on Loan",                         "EXPENSE",   "CHILD",  "DR", "Interest paid on funds borrowed from external investors"),
    ("5204", "Cost of Sale",                             "EXPENSE",   "CHILD",  "DR", "Direct cost of goods sold from inventory"),

    # ── Financial Expenses ─────────────────────────────────────────────────────
    ("5300", "Financial Expenses",                       "EXPENSE",   "PARENT", "DR", "Finance costs and interest paid on member deposits"),
    ("5301", "Smart Savings Interest",                   "EXPENSE",   "CHILD",  "DR", "Interest paid to members on Smart Savings balances"),

    # ── Marketing Expenses ─────────────────────────────────────────────────────
    ("5400", "Marketing Expenses",                       "EXPENSE",   "PARENT", "DR", "Advertising, promotion and business development costs"),
    ("5401", "Business Promo",                           "EXPENSE",   "CHILD",  "DR", "Business promotion and marketing campaign expenses"),

    # ── Loan Loss Provisions ───────────────────────────────────────────────────
    ("5500", "Loan Loss Provisions",                     "EXPENSE",   "PARENT", "DR", "Provision charges for bad and doubtful loan debts"),
    ("5501", "Loan Loss Provision",                      "EXPENSE",   "CHILD",  "DR", "Charge for estimated uncollectable loans in the period"),
]

# ---------------------------------------------------------------------------
# Loan product seed data
# ---------------------------------------------------------------------------
LOAN_PRODUCTS = [
    {
        "code": "DC001",
        "name": "Daily Contribution Loan (Ajo)",
        "repayment_frequency": "daily",
        "default_interest_rate": "5.00",   # 5% flat per month
        "interest_calculation_method": "flat",
        "min_tenor": 30,   # days
        "max_tenor": 180,
        "minimum_amount": 5000,
        "maximum_amount": 500000,
        "description": "Short-term daily repayment loan for Ajo group members.",
        "coa_code": "1101",           # Daily Contribution Loans (DC)
        "interest_coa_code": "4001",  # Daily Loan Interest
    },
    {
        "code": "WL001",
        "name": "Weekly Loan (WL)",
        "repayment_frequency": "weekly",
        "default_interest_rate": "5.00",
        "interest_calculation_method": "flat",
        "min_tenor": 4,    # weeks
        "max_tenor": 52,
        "minimum_amount": 10000,
        "maximum_amount": 1000000,
        "description": "Medium-term weekly repayment loan.",
        "coa_code": "1102",           # Weekly Loans (WL)
        "interest_coa_code": "4002",  # Weekly Loan Interest
    },
    {
        "code": "ML001",
        "name": "Monthly Business Loan (ML)",
        "repayment_frequency": "monthly",
        "default_interest_rate": "4.00",
        "interest_calculation_method": "reducing_balance",
        "min_tenor": 3,    # months
        "max_tenor": 24,
        "minimum_amount": 50000,
        "maximum_amount": 5000000,
        "description": "Business loan with monthly reducing-balance repayment.",
        "coa_code": "1103",           # Monthly Business Loans (ML)
        "interest_coa_code": "4003",  # Monthly Loan Interest
    },
]


class Command(BaseCommand):
    help = "Bootstrap a new KTIL microfinance tenant on Phoenix ERP."

    def add_arguments(self, parser):
        parser.add_argument(
            "--owner-email",
            default="admin@ktil.ng",
            help="Email for the tenant owner / superuser.",
        )
        parser.add_argument(
            "--owner-password",
            default=None,
            help="Password (prompted interactively if omitted).",
        )
        parser.add_argument(
            "--branch-name",
            default="Sagamu HQ",
            help="Name of the headquarters branch.",
        )
        parser.add_argument(
            "--branch-code",
            default="SAG001",
            help="Short code for the HQ branch.",
        )
        parser.add_argument(
            "--no-loan-products",
            action="store_true",
            default=False,
            help="Skip seeding the three default loan products.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Print what would be created without saving.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be saved.\n"))

        email = options["owner_email"]
        password = options["owner_password"]
        if not password and not dry_run:
            password = getpass.getpass(f"Password for {email}: ")
            if not password:
                raise CommandError("Password cannot be empty.")

        with transaction.atomic():
            owner, tenant, branch = self._setup_core(email, password, options, dry_run)
            self._setup_coa(owner, tenant, branch, dry_run)
            if not options["no_loan_products"]:
                self._setup_loan_products(owner, tenant, branch, dry_run)
            self._setup_service_account(owner, tenant, branch, dry_run)

            if dry_run:
                # Roll back everything so nothing is persisted
                transaction.set_rollback(True)
                self.stdout.write(self.style.WARNING("\nDry run complete — all changes rolled back."))
            else:
                self.stdout.write(self.style.SUCCESS("\n✓ Microfinance setup complete for KTIL."))

    # -----------------------------------------------------------------------
    # Step 1 – Tenant, User, Branch
    # -----------------------------------------------------------------------

    def _setup_core(self, email, password, options, dry_run):
        from users.models import Tenant
        from branches.models import Branch
        from rest_framework.authtoken.models import Token

        # -- Owner user
        owner, created = User.objects.get_or_create(
            email=email,
            defaults={
                "username": email.split("@")[0],
                "first_name": "KTIL",
                "last_name": "Admin",
                "is_staff": True,
                "is_superuser": True,
            },
        )
        if created and not dry_run:
            owner.set_password(password)
            owner.save()
            self.stdout.write(self.style.SUCCESS(f"  [+] Created superuser: {email}"))
        else:
            self.stdout.write(f"  [=] Superuser already exists: {email}")

        # -- Tenant
        tenant, created = Tenant.objects.get_or_create(
            slug="ktil",
            defaults={
                "name": "Krystar Trust Investment Limited",
                "owner": owner,
                "domain_type": "microfinance",
                "domain_config": {
                    "state": "Ogun",
                    "tax_authority": "OGIRS",
                    "cbN_licensed": False,
                    "brand_primary": "#0a1857",
                    "brand_secondary": "#b79758",
                },
            },
        )
        if created:
            self.stdout.write(self.style.SUCCESS("  [+] Created tenant: Krystar Trust Investment Limited"))
        else:
            self.stdout.write("  [=] Tenant already exists: KTIL")

        # -- Link owner <-> tenant
        if not dry_run and not hasattr(owner, "tenant_owned") or (
            hasattr(owner, "tenant_owned") and not Tenant.objects.filter(owner=owner).exists()
        ):
            tenant.owner = owner
            tenant.save(update_fields=["owner"])

        # -- Admin DRF token
        token, created = Token.objects.get_or_create(user=owner)
        if created:
            self.stdout.write(self.style.SUCCESS(f"  [+] Created admin API token: {token.key[:12]}..."))
        else:
            self.stdout.write(f"  [=] Admin token exists: {token.key[:12]}...")

        # -- HQ Branch
        branch_name = options["branch_name"]
        branch_code = options["branch_code"]
        branch, created = Branch.objects.get_or_create(
            code=branch_code,
            defaults={
                "name": branch_name,
                "tenant": tenant,
                "address": "Sagamu, Ogun State, Nigeria",
                "city": "Sagamu",
                "state": "Ogun State",
                "country": "Nigeria",
                "is_active": True,
            },
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f"  [+] Created branch: {branch_name} ({branch_code})"))
        else:
            self.stdout.write(f"  [=] Branch already exists: {branch.name} ({branch.code})")

        return owner, tenant, branch

    # -----------------------------------------------------------------------
    # Step 2 – Chart of Accounts
    # -----------------------------------------------------------------------

    def _setup_coa(self, owner, tenant, branch, dry_run):
        from accounts.models import Account

        self.stdout.write("\n  Chart of Accounts:")
        created_count = 0
        skipped_count = 0

        # Build a lookup from code → Account (already exists in this tenant+branch)
        existing_codes = set(
            Account.all_objects.filter(
                owner=owner, branch=branch, is_deleted=False
            ).values_list("code", flat=True)
        )

        for code, name, acct_type, level, side, description in COA_ENTRIES:
            if code in existing_codes:
                skipped_count += 1
                continue
            if not dry_run:
                Account.objects.create(
                    code=code,
                    name=name,
                    account_type=acct_type,
                    account_level=level,
                    normal_side=side if hasattr(Account, "normal_side") else None,
                    description=description if hasattr(Account, "description") else None,
                    owner=owner,
                    branch=branch,
                    tenant=tenant,
                    is_system_account=True,
                    allow_manual_entries=(level == "CHILD"),
                )
            created_count += 1

        self.stdout.write(
            self.style.SUCCESS(f"    [+] Created {created_count} GL accounts.") +
            f" ({skipped_count} already existed)"
        )

    # -----------------------------------------------------------------------
    # Step 3 – Loan Products
    # -----------------------------------------------------------------------

    def _setup_loan_products(self, owner, tenant, branch, dry_run):
        from accounts.models import Account
        from products.models import Product
        from loans.models import LoanProduct

        self.stdout.write("\n  Loan Products:")

        # Fetch key GL accounts we'll need
        def get_acct(code):
            try:
                return Account.all_objects.get(code=code, owner=owner, branch=branch, is_deleted=False)
            except Account.DoesNotExist:
                return None

        cash_account   = get_acct("1001")   # Cash In Hand → disbursement
        fee_income     = get_acct("4103")   # Administrative Fee → default fee income
        penalty_income = get_acct("4201")   # Loan Penalty → penalty income

        if not cash_account:
            self.stdout.write(self.style.WARNING(
                "    [!] Cash In Hand account (1001) not found — "
                "run setup_microfinance again after Chart of Accounts is seeded. "
                "Skipping loan products."
            ))
            return

        for lp_def in LOAN_PRODUCTS:
            # Get or create the parent Product
            product, p_created = Product.objects.get_or_create(
                code=lp_def["code"],
                owner=owner,
                defaults={
                    "name": lp_def["name"],
                    "description": lp_def["description"],
                    "product_class": "FINANCIAL",
                    "product_type": "LOAN",
                    "is_active": True,
                    "minimum_amount": lp_def["minimum_amount"],
                    "maximum_amount": lp_def["maximum_amount"],
                    "standard_price": 0,
                    "branch": branch,
                    "tenant": tenant,
                },
            )

            # Get loan-specific GL accounts
            loan_coa       = get_acct(lp_def["coa_code"])
            interest_income = get_acct(lp_def["interest_coa_code"])

            # Get or create LoanProduct
            exists = LoanProduct.all_objects.filter(
                product=product, owner=owner, is_deleted=False
            ).exists()

            if exists:
                self.stdout.write(f"    [=] Loan product already exists: {lp_def['name']}")
                continue

            if not dry_run and loan_coa:
                LoanProduct.objects.create(
                    product=product,
                    parent_account=loan_coa,
                    disbursement_account=cash_account,
                    interest_income_account=interest_income,
                    fee_income_account=fee_income,
                    penalty_income_account=penalty_income,
                    default_interest_rate=lp_def["default_interest_rate"],
                    interest_calculation_method=lp_def["interest_calculation_method"],
                    owner=owner,
                    branch=branch,
                    tenant=tenant,
                )
                self.stdout.write(self.style.SUCCESS(f"    [+] Created loan product: {lp_def['name']}"))
            else:
                self.stdout.write(f"    [~] Would create loan product: {lp_def['name']}")

    # -----------------------------------------------------------------------
    # Step 4 – Java microservice service account
    # -----------------------------------------------------------------------

    def _setup_service_account(self, owner, tenant, branch, dry_run):
        from rest_framework.authtoken.models import Token

        self.stdout.write("\n  Java Service Account:")

        svc_email = "java-services@ktil.internal"
        svc_user, created = User.objects.get_or_create(
            email=svc_email,
            defaults={
                "username": "java_service_ktil",
                "first_name": "Java",
                "last_name": "Services",
                "is_staff": True,
                "is_superuser": False,
                "is_active": True,
            },
        )
        if created and not dry_run:
            svc_user.set_password(User.objects.make_random_password(32))
            svc_user.save()
            self.stdout.write(self.style.SUCCESS(f"  [+] Created service account: {svc_email}"))
        else:
            self.stdout.write(f"  [=] Service account already exists: {svc_email}")

        token, t_created = Token.objects.get_or_create(user=svc_user)
        if t_created:
            self.stdout.write(self.style.SUCCESS(
                f"  [+] Service account Token: {token.key}\n"
                f"      ⚠ Store this in your Java app env vars as PHOENIX_SERVICE_TOKEN"
            ))
        else:
            self.stdout.write(
                f"  [=] Service token exists: {token.key[:12]}...\n"
                f"      (use 'python manage.py drf_create_token {svc_email}' to regenerate)"
            )
