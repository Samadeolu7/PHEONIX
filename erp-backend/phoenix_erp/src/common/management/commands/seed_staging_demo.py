"""
manage.py seed_staging_demo — small, fake demo data for the STAGING server.

Refuses to run unless settings.STAGING is on (STAGING=true), so it can never
touch production. Safe to run again: everything is looked up by a fixed
demo key first, and money is only posted the first time.

Creates (docs/STAGING.md, "Demo data"):
  - the demo organisation (slug "mt" by default — see --tenant-slug), two
    branches, a director login and three staff logins (branch admin, credit
    officer scoped to assigned clients, teller) with roles, Staff records and
    Permission Setup policies for Online Applications, Online Portal Access,
    Loan Accounts and Savings Withdrawals;
  - a minimal chart of accounts, a bank account, opening capital;
  - a weekly and a monthly loan product, a savings product, a withdrawal
    approval tier;
  - 8 demo clients with obviously fake identities (NIN/BVN start with 000,
    phones 0800000xxxx, emails at the demo domain);
  - savings balances posted through real deposits (SavingsAccount.deposit);
  - two active loans disbursed in the past, one paid up to date and one in
    arrears;
  - the portal switched on (invite-only) at https://staging.krystartrust.ng
    with both loan products offered online.

Every financial posting goes through the normal ledger methods; no balance
is ever set directly.
"""
import secrets
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

PORTAL_URL = 'https://staging.krystartrust.ng'
DEMO_REF = 'STAGING-DEMO'

STAFF = [
    # username,           first,     last,        role key,          staff role_level, groups
    ('demo.director',     'Dayo',    'Director',  'director',        'director',       ['Director']),
    ('demo.branchadmin',  'Bola',    'Admin',     'branch_admin',    'branch_manager', ['Branch Manager']),
    ('demo.creditofficer', 'Chidi',  'Officer',   'credit_officer',  'credit_officer', []),
    ('demo.teller',       'Tola',    'Teller',    'teller',          'operations',     []),
]

# key -> (name, default_scope, permission_codes)
ROLES = {
    'director': ('Demo Director', 'global', ['*']),
    'branch_admin': ('Demo Branch Admin', 'own_branch', []),
    'credit_officer': ('Demo Credit Officer', 'assigned_clients', []),
    'teller': ('Demo Teller', 'own_branch', []),
}

ALL = dict(can_view=True, can_create=True, can_edit=True, can_approve=True, can_export=True)
VIEW = dict(can_view=True)
VIEW_EDIT_APPROVE = dict(can_view=True, can_edit=True, can_approve=True)
VIEW_CREATE = dict(can_view=True, can_create=True)
WORK = dict(can_view=True, can_create=True, can_edit=True)

MODULES = {
    'clients': ('Clients', [('clients', 'Client List'), ('portal-invitations', 'Online Portal Access')]),
    'loans': ('Loans', [('loan-accounts', 'Loan Accounts'), ('loan-disbursements', 'Disbursements'),
                        ('online-loan-applications', 'Online Applications')]),
    'savings': ('Savings', [('savings-withdrawals', 'Withdrawals')]),
}

# role key -> {(module, page or None): flags}. Module-level rows cover every
# other page in that module; page rows are the four pages the portal needs.
POLICIES = {
    'branch_admin': {
        ('clients', None): ALL, ('loans', None): ALL, ('savings', None): ALL,
        ('loans', 'online-loan-applications'): VIEW_EDIT_APPROVE,
        ('clients', 'portal-invitations'): VIEW_CREATE,
        ('loans', 'loan-accounts'): ALL,
        ('savings', 'savings-withdrawals'): ALL,
    },
    'credit_officer': {
        ('clients', None): WORK, ('loans', None): WORK, ('savings', None): WORK,
        ('loans', 'online-loan-applications'): VIEW_EDIT_APPROVE,
        ('clients', 'portal-invitations'): VIEW_CREATE,
        ('loans', 'loan-accounts'): WORK,
        ('savings', 'savings-withdrawals'): WORK,
    },
    'teller': {
        ('clients', None): VIEW, ('loans', None): VIEW, ('savings', None): WORK,
        ('loans', 'online-loan-applications'): VIEW_EDIT_APPROVE,
        ('clients', 'portal-invitations'): VIEW_CREATE,
        ('loans', 'loan-accounts'): dict(can_view=True, can_edit=True, can_approve=True),
        ('savings', 'savings-withdrawals'): ALL,
    },
}

# Fake people. NIN/BVN start with 000 (not issued in Nigeria), phones are
# 0800000xxxx. (client_id, first, last, gender, branch key, opening deposits)
CLIENTS = [
    ('DEMO-001', 'Adaeze', 'Testperson', 'female', 'hq', [Decimal('150000'), Decimal('35000')]),
    ('DEMO-002', 'Babatunde', 'Sampleman', 'male', 'hq', [Decimal('80000')]),
    ('DEMO-003', 'Chiamaka', 'Placeholder', 'female', 'hq', [Decimal('220000'), Decimal('15000')]),
    ('DEMO-004', 'Danjuma', 'Fictional', 'male', 'hq', [Decimal('45000')]),
    ('DEMO-005', 'Efua', 'Notreal', 'female', 'hq', [Decimal('60000'), Decimal('20000')]),
    ('DEMO-006', 'Folarin', 'Dummydata', 'male', 'oyo', [Decimal('95000')]),
    ('DEMO-007', 'Gbemisola', 'Examplename', 'female', 'oyo', [Decimal('30000')]),
    ('DEMO-008', 'Hassan', 'Mockclient', 'male', 'oyo', [Decimal('125000')]),
]

# Active loans: client_id -> (product key, amount, term, periods elapsed, periods paid)
LOANS = {
    'DEMO-001': ('weekly', Decimal('100000'), 12, 6, 6),    # up to date
    'DEMO-003': ('monthly', Decimal('300000'), 6, 3, 1),    # two months in arrears
}


class Command(BaseCommand):
    help = 'Create small, fake demo data on a STAGING server (refuses unless STAGING=true). Idempotent.'

    def add_arguments(self, parser):
        parser.add_argument('--tenant-slug', default='mt',
                            help="Organisation slug (default 'mt': the API host api.staging.krystartrust.ng "
                                 "resolves to slug 'mt' in common/middleware.py, as production does).")
        parser.add_argument('--tenant-name', default='Krystar Trust (STAGING DEMO)')
        parser.add_argument('--email-domain', default=None,
                            help='Domain for demo emails (default: STAGING_DEMO_EMAIL_DOMAIN or example.com).')
        parser.add_argument('--password', default=None,
                            help='Password for demo staff logins (default: STAGING_DEMO_PASSWORD, else generated '
                                 'and printed once). Only used for logins this run creates, or with --reset-passwords.')
        parser.add_argument('--reset-passwords', action='store_true',
                            help='Set the password on existing demo staff logins too.')

    # ── entry point ─────────────────────────────────────────────────────────
    def handle(self, *args, **opts):
        if not getattr(settings, 'STAGING', False):
            raise CommandError(
                'Refusing to run: STAGING is not on. seed_staging_demo only runs on a staging server '
                '(STAGING=true, see docs/STAGING.md).'
            )
        import os
        self.domain = (opts['email_domain'] or os.environ.get('STAGING_DEMO_EMAIL_DOMAIN') or 'example.com').strip()
        self.password = opts['password'] or os.environ.get('STAGING_DEMO_PASSWORD') or ''
        self.generated_password = not self.password
        if self.generated_password:
            self.password = f"Stg-{secrets.token_urlsafe(9)}-7"
        self.reset_passwords = opts['reset_passwords']
        self.created_logins = []
        self.counts = {}

        from common.managers import set_current_tenant
        try:
            with transaction.atomic():
                self._seed(opts['tenant_slug'], opts['tenant_name'])
        finally:
            set_current_tenant(None)
        self._report()

    def _bump(self, key, created):
        if created:
            self.counts[key] = self.counts.get(key, 0) + 1

    # ── the seed ────────────────────────────────────────────────────────────
    def _seed(self, slug, tenant_name):
        from common.managers import set_current_tenant
        from users.models import Tenant

        set_current_tenant(None)
        director = self._login('demo.director', 'Dayo', 'Director')
        tenant = Tenant.objects.filter(slug=slug).first()
        if tenant is None:
            tenant = Tenant.objects.create(
                name=tenant_name, slug=slug, owner=director, domain_type='microfinance',
                email=f'support@{self.domain}', phone='08000000000', city='Ibadan', state='Oyo', country='Nigeria',
            )
            self._bump('organisation', True)
        elif tenant.owner_id != director.pk:
            raise CommandError(
                f"Organisation '{slug}' already exists and is not the demo organisation "
                f"(owner is not demo.director). Use --tenant-slug or a fresh staging database."
            )
        self.tenant = tenant
        set_current_tenant(tenant)

        self.hq = self._branch('STG-HQ', 'Demo HQ (Ibadan)', 'Ibadan', director)
        self.oyo = self._branch('STG-OYO', 'Demo Oyo Branch', 'Oyo', director)
        director.tenant, director.branch = tenant, self.hq
        director.save(update_fields=['tenant', 'branch'])
        self.director = director

        self.users = {'director': director}
        self.staff = {}
        for username, first, last, key, level, groups in STAFF:
            user = director if key == 'director' else self._login(username, first, last)
            user.tenant, user.branch = tenant, self.hq
            user.save(update_fields=['tenant', 'branch'])
            self.users[key] = user
            self.staff[key] = self._staff(user, first, last, level)
            for g in groups:
                user.groups.add(Group.objects.get_or_create(name=g)[0])
        self.staff['credit_officer'].reports_to = self.staff['branch_admin']
        self.staff['credit_officer'].save(update_fields=['reports_to'])

        self._roles_and_policies()
        self._chart_of_accounts()
        self._bank_account()
        self._opening_capital()
        self._products()
        self._withdrawal_tier()
        self._clients_and_savings()
        self._loans()
        self._portal()

    # ── people ──────────────────────────────────────────────────────────────
    def _login(self, username, first, last):
        from users.models import User
        user = User.objects.filter(username=username).first()
        created = user is None
        if created:
            user = User(username=username, first_name=first, last_name=last,
                        email=f'{username.replace(".", "-")}@{self.domain}', is_active=True,
                        tenant=getattr(self, 'tenant', None), branch=getattr(self, 'hq', None))
        if created or self.reset_passwords:
            user.set_password(self.password)
            self.created_logins.append(username)
        user.save()
        self._bump('logins', created)
        return user

    def _branch(self, code, name, city, owner):
        from branches.models import Branch
        branch, created = Branch.objects.get_or_create(
            code=code, defaults=dict(name=name, city=city, tenant=self.tenant, owner=owner))
        if branch.tenant_id != self.tenant.pk:
            raise CommandError(f'Branch code {code} belongs to another organisation.')
        self._bump('branches', created)
        return branch

    def _staff(self, user, first, last, level):
        from hr.models import Staff
        # A users signal may already have created one; look across tenants.
        staff = Staff.all_objects.all_tenants().filter(user=user).first()
        created = staff is None
        if created:
            staff = Staff(user=user)
        staff.first_name, staff.last_name = first, last
        staff.email = staff.email or user.email
        staff.phone = staff.phone or '08000000001'
        staff.position = staff.position or level.replace('_', ' ').title()
        staff.role_level = level
        staff.tenant, staff.branch = self.tenant, self.hq
        staff.owner = getattr(self, 'director', None) or user
        staff.is_deleted = False
        staff.save()
        self._bump('staff records', created)
        return staff

    def _module(self, code, name):
        from pages.models import Module
        mod = (Module.objects.all_tenants().filter(code=code, branch=None, tenant=self.tenant).first()
               or Module.objects.all_tenants().filter(code=code, branch=None, tenant__isnull=True).first())
        if mod is None:
            mod = Module.objects.create(code=code, name=name, icon='Package', is_active=True,
                                        tenant=self.tenant, branch=None)
        return mod

    def _page(self, module, code, title):
        """Same lookup/creation rules as Permission Setup's sync (permissions/setup_views.py)."""
        from pages.models import ModulePage
        page = (ModulePage.objects.all_tenants().filter(module=module, code=code).first()
                or ModulePage.objects.all_tenants().filter(module__code=module.code, code=code).first())
        if page is None:
            page = ModulePage.objects.create(module=module, code=code, title=title, page_type='list',
                                             is_active=True, tenant=self.tenant, branch=None)
        return page

    def _roles_and_policies(self):
        from permissions.models import RolePermissionPolicy
        from users.models import Role

        modules, pages = {}, {}
        for mcode, (mname, mpages) in MODULES.items():
            modules[mcode] = self._module(mcode, mname)
            for pcode, ptitle in mpages:
                pages[(mcode, pcode)] = self._page(modules[mcode], pcode, ptitle)

        for key, (name, scope, codes) in ROLES.items():
            role, created = Role.objects.get_or_create(
                tenant=self.tenant, name=name,
                defaults=dict(default_scope=scope, permission_codes=codes,
                              description='Created by seed_staging_demo (staging only).'))
            self._bump('roles', created)
            self.users[key].roles.add(role)
            for (mcode, pcode), flags in POLICIES.get(key, {}).items():
                values = dict(can_view=False, can_create=False, can_edit=False, can_delete=False,
                              can_approve=False, can_export=False, scope=scope)
                values.update(flags)
                _, pcreated = RolePermissionPolicy.objects.update_or_create(
                    role=role, module=modules[mcode], page=pages[(mcode, pcode)] if pcode else None,
                    action=None, defaults=values)
                self._bump('permission policies', pcreated)

    # ── ledger ──────────────────────────────────────────────────────────────
    def _account(self, code, name, kind, parent=None):
        from accounts.models import Account
        acc = Account.objects.all_tenants().filter(tenant=self.tenant, branch=self.hq, code=code,
                                                   is_deleted=False).first()
        created = acc is None
        if created:
            acc = Account.objects.create(
                code=code, name=name, account_type=kind,
                account_level=Account.LEVEL_CHILD if parent else Account.LEVEL_PARENT, parent=parent,
                owner=self.director, created_by=self.director, branch=self.hq, tenant=self.tenant,
            )
        self._bump('GL accounts', created)
        return acc

    def _std(self, code, branch=None):
        from accounts.models import Account
        acc = Account.objects.all_tenants().filter(tenant=self.tenant, branch=branch or self.hq, code=code,
                                                   is_deleted=False).first()
        if acc is None:
            raise CommandError(f'Standard account {code} missing after create_standard_accounts().')
        return acc

    def _chart_of_accounts(self):
        """The organisation's standard FIRS/IFRS chart (what a new tenant gets in
        production, accounts/utils/setup_accounts.py), plus three income children."""
        from accounts.models import Account as A
        from accounts.utils.setup_accounts import create_standard_accounts
        # Every branch has its own copy of the chart in production.
        for branch in (self.hq, self.oyo):
            create_standard_accounts(self.tenant, owner=self.director, branch=branch)
        self.till_by_branch = {b.pk: self._std('1101', b) for b in (self.hq, self.oyo)}
        self.till_gl = self.till_by_branch[self.hq.pk]  # Cash on Hand (teller cash)
        self.bank_gl = self._std('1103')          # Cash at Bank – Main Account
        self.loan_parent = self._std('1150')      # Customer Loan Portfolio
        self.savings_parent = self._std('2140')   # Customer Savings and Deposits
        self.capital_gl = self._std('3101')       # Authorised and Issued Share Capital
        other_income = self._std('4200')          # Other Operating Income (parent)
        self.interest_gl = self._account('4250', 'Loan Interest Income', A.INCOME, other_income)
        self.fee_gl = self._account('4251', 'Loan Fee Income', A.INCOME, other_income)
        self.penalty_gl = self._account('4252', 'Loan Penalty Income', A.INCOME, other_income)

    def _bank_account(self):
        from banks.models import Bank, BankAccount
        bank, _ = Bank.objects.get_or_create(
            bank_name='Demo Bank (not real)', tenant=self.tenant,
            defaults=dict(bank_code='000', owner=self.director, branch=self.hq))
        self.bank_account = BankAccount.objects.filter(gl_account=self.bank_gl).first()
        if self.bank_account is None:
            self.bank_account = BankAccount.objects.create(
                bank=bank, account_number='0000000001', account_name='KTI Staging Demo – Operating',
                gl_account=self.bank_gl, account_manager=self.director, owner=self.director,
                branch=self.hq, tenant=self.tenant, date_opened=timezone.localdate(),
            )
            self._bump('bank accounts', True)

    def _journal(self, series_code, ref, description, lines, date=None):
        """Post one balanced journal entry, once (keyed by workflow_reference)."""
        from transactions.models import Transaction, TransactionEntry, TransactionSeries
        if Transaction.objects.all_tenants().filter(tenant=self.tenant, workflow_reference=ref).exists():
            return None
        series, _ = TransactionSeries.objects.get_or_create(code=series_code,
                                                            defaults={'description': description})
        je = Transaction.objects.create(series=series, date=date or timezone.localdate(), description=description,
                                        workflow_reference=ref, owner=self.director, branch=self.hq,
                                        created_by=self.director, tenant=self.tenant)
        for account, side, amount in lines:
            TransactionEntry.objects.create(transaction=je, account=account, side=side, amount=amount)
        je.post()
        self._bump('journal entries', True)
        return je

    def _opening_capital(self):
        from transactions.models import TransactionEntry as E
        amount = Decimal('5000000.00')
        self._journal('STCAP', f'{DEMO_REF}-CAPITAL', 'Opening capital (staging demo)',
                      [(self.bank_gl, E.DEBIT, amount), (self.capital_gl, E.CREDIT, amount)],
                      date=timezone.localdate() - timedelta(days=200))
        till = Decimal('500000.00')
        self._journal('STCAP', f'{DEMO_REF}-TILL', 'Teller till float (staging demo)',
                      [(self.till_gl, E.DEBIT, till), (self.bank_gl, E.CREDIT, till)],
                      date=timezone.localdate() - timedelta(days=200))

    # ── products ────────────────────────────────────────────────────────────
    def _product(self, code, name, ptype):
        from products.models import Product
        prod = Product.objects.all_tenants().filter(branch=self.hq, code=code).first()
        created = prod is None
        if created:
            prod = Product.objects.create(name=name, code=code, product_type=ptype, product_class='FINANCIAL',
                                          owner=self.director, branch=self.hq, tenant=self.tenant)
        self._bump('products', created)
        return prod

    def _products(self):
        from loans.models import LoanProduct
        from savings.models import SavingsProduct

        common = dict(parent_account=self.loan_parent, disbursement_account=self.bank_gl,
                      interest_income_account=self.interest_gl, fee_income_account=self.fee_gl,
                      penalty_income_account=self.penalty_gl, owner=self.director, branch=self.hq,
                      tenant=self.tenant)
        specs = {
            'weekly': ('DEMO-LN-WK', 'Demo Weekly Business Loan',
                       dict(default_interest_rate=Decimal('24.00'), min_loan_amount=Decimal('20000'),
                            max_loan_amount=Decimal('500000'), term_unit='weeks', min_term_months=4,
                            max_term_months=24, allowed_repayment_frequencies=['weekly'])),
            'monthly': ('DEMO-LN-MO', 'Demo Monthly SME Loan',
                        dict(default_interest_rate=Decimal('30.00'), min_loan_amount=Decimal('50000'),
                             max_loan_amount=Decimal('2000000'), term_unit='months', min_term_months=1,
                             max_term_months=12, allowed_repayment_frequencies=['monthly'])),
        }
        self.loan_products = {}
        for key, (code, name, extra) in specs.items():
            product = self._product(code, name, 'LOAN')
            lp = LoanProduct.objects.all_tenants().filter(product=product).first()
            if lp is None:
                lp = LoanProduct.objects.create(product=product, **common, **extra)
            self.loan_products[key] = lp

        # 'SAV-REG' is the code savings/signals.py uses to open a client's
        # savings account automatically, exactly as in production.
        self.savings_product = self._product('SAV-REG', 'Regular Savings', 'SAVINGS')
        if not SavingsProduct.objects.all_tenants().filter(product=self.savings_product).exists():
            SavingsProduct.objects.create(
                product=self.savings_product, withdrawal_needs_approval=True,
                only_account_manager_can_withdraw=True,
                owner=self.director, branch=self.hq, tenant=self.tenant)

    def _withdrawal_tier(self):
        from savings.models import WithdrawalApprovalTier
        # Tiers belong to the savings accounts' owner (savings/services.py:
        # _resolve_tier), which is the director for all demo accounts.
        _, created = WithdrawalApprovalTier.objects.get_or_create(
            owner=self.director, tier_name='Demo: all amounts',
            defaults=dict(min_amount=Decimal('0'), max_amount=None, required_approvers=1,
                          approver_roles=['Branch Manager', 'Director'], order=0, tenant=self.tenant))
        self._bump('withdrawal tiers', created)

    # ── clients, savings ───────────────────────────────────────────────────
    def _clients_and_savings(self):
        from accounts.models import Account
        from clients.models import Client
        from savings.models import SavingsAccount

        officer = self.staff['credit_officer']
        self.clients = {}
        for n, (cid, first, last, gender, bkey, deposits) in enumerate(CLIENTS, start=1):
            branch = self.hq if bkey == 'hq' else self.oyo
            client = Client.all_objects.filter(client_id=cid).first()
            if client is None:
                client = Client.objects.create(
                    client_id=cid, first_name=first, last_name=last, gender=gender,
                    phone_primary=f'0800000{n:04d}', email=f'{first.lower()}.{last.lower()}@{self.domain}',
                    nin=f'000{n:08d}', bvn=f'0001{n:07d}',
                    date_of_birth=date(1996 - n, n, 10),
                    address_street=f'{n} Demo Street', address_city=branch.city or 'Ibadan', address_state='Oyo',
                    occupation='Trader (demo)',
                    assigned_officer=officer, account_manager=officer,
                    tenant=self.tenant, owner=self.director, created_by=self.director, branch=branch,
                )
                self._bump('clients', True)
            self.clients[cid] = client

            # savings/signals.py opens the Regular Savings account when the
            # client is created; open it the same way if that did not happen.
            sa = SavingsAccount.objects.all_tenants().filter(client=client, product=self.savings_product).first()
            if sa is None:
                child = Account.create_with_parent(parent_code='2140', child_data={
                    'name': f'Savings – {client.full_name}', 'allow_manual_entries': True,
                    'owner': self.director, 'branch': client.branch, 'tenant': self.tenant,
                    'created_by': self.director})
                sa = SavingsAccount.objects.create(
                    client=client, account=child, product=self.savings_product, account_number=child.code,
                    interest_rate=Decimal('0.00'), interest_calculation_method='monthly',
                    minimum_balance=Decimal('1000.00'), opened_on=timezone.localdate(), status='active',
                    owner=self.director, created_by=self.director, branch=client.branch, tenant=self.tenant,
                )
            # Money in only once: a fresh account has never had a transaction.
            if sa.last_transaction_date is None and sa.account.balance == Decimal('0'):
                self._bump('savings accounts funded', True)
                for i, amount in enumerate(deposits):
                    sa.deposit(amount, description=f'Demo deposit {i + 1} ({DEMO_REF})',
                               cashier_account=self.till_by_branch[client.branch_id], transacted_by=self.users['teller'],
                               date=timezone.localdate() - timedelta(days=150 - 30 * i))
                    self._bump('savings deposits', True)

    # ── loans ───────────────────────────────────────────────────────────────
    def _loans(self):
        from loans.models import LoanAccount, LoanDisbursement
        from loans.services import DisbursementService, create_loan_account_shell

        for cid, (pkey, amount, term, elapsed, paid) in LOANS.items():
            client = self.clients[cid]
            product = self.loan_products[pkey]
            if LoanAccount.all_objects.filter(client=client, product=product).exists():
                continue
            loan_number, gl = create_loan_account_shell(client, product, self.users['credit_officer'],
                                                        self.hq, self.tenant)
            step = timedelta(weeks=1) if pkey == 'weekly' else timedelta(days=30)
            disbursed_on = timezone.localdate() - step * elapsed - timedelta(days=1)
            loan = LoanAccount.objects.create(
                client=client, product=product, account=gl, loan_number=loan_number,
                application_date=disbursed_on - timedelta(days=3),
                requested_amount=amount, interest_rate=product.default_interest_rate,
                term_months=term, term_unit=product.term_unit, repayment_frequency=pkey,
                status='pending', application_notes=f'Demo loan ({DEMO_REF})',
                owner=self.director, created_by=self.users['credit_officer'], branch=self.hq, tenant=self.tenant,
            )
            # The normal three-person workflow: the credit officer made it, the
            # branch admin approves it (the loans signal then creates the
            # disbursement already approved), the director executes it, dated
            # in the past so there is repayment history.
            loan.approve(self.users['branch_admin'])
            disb = LoanDisbursement.objects.get(loan=loan)
            if disb.status == 'pending_approval':
                DisbursementService.approve(disb, self.users['branch_admin'])
                disb.refresh_from_db()
            disb.execute_disbursement(disbursed_by_user=self.director, disbursement_account=self.bank_gl,
                                      disbursement_date=disbursed_on)
            self._bump('loans', True)

            loan.refresh_from_db()
            for inst in list(loan.repayment_schedule.order_by('due_date')[:paid]):
                loan.refresh_from_db()
                loan.record_payment(inst.total_due, payment_date=inst.due_date, payment_account=self.till_gl,
                                    received_by=self.users['teller'])
                self._bump('loan repayments', True)
            loan.refresh_from_db()
            try:
                loan.mark_overdue_installments()
            except Exception:  # cosmetic only: the nightly job does this too
                pass

    # ── portal ──────────────────────────────────────────────────────────────
    def _portal(self):
        from portal.models import PortalConfig, PortalLoanOffering
        cfg, created = PortalConfig.objects.get_or_create(tenant=self.tenant)
        cfg.is_enabled = True
        cfg.allow_registration = False
        cfg.public_url = PORTAL_URL
        cfg.support_email = cfg.support_email or f'support@{self.domain}'
        cfg.support_phone = cfg.support_phone or '08000000000'
        cfg.save()
        self._bump('portal settings', created)
        for i, (key, lp) in enumerate(self.loan_products.items()):
            _, ocreated = PortalLoanOffering.objects.get_or_create(
                tenant=self.tenant, loan_product=lp,
                defaults=dict(is_active=True, max_online_amount=lp.max_loan_amount, sort_order=i,
                              display_name=lp.product.name,
                              public_description='Demo product on the staging server. Not a real offer.'))
            self._bump('portal loan offerings', ocreated)

    # ── output ──────────────────────────────────────────────────────────────
    def _report(self):
        w = self.stdout.write
        w(self.style.SUCCESS('Staging demo data is in place.'))
        if self.counts:
            for k, v in self.counts.items():
                w(f'  created {v} {k}')
        else:
            w('  nothing new: everything already existed.')
        w(f'  organisation: {self.tenant.name} (slug {self.tenant.slug}); portal: {PORTAL_URL}/portal')
        if self.created_logins:
            w('')
            w('Staff logins (password set this run):')
            for u in self.created_logins:
                w(f'  {u}')
            if self.generated_password:
                w(self.style.WARNING(f'  password: {self.password}'))
                w('  (generated and shown ONCE. Re-run with --reset-passwords to set a new one.)')
            else:
                w('  password: the one you supplied.')
