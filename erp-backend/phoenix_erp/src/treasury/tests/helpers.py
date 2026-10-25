"""Shared test setup for the treasury app: a tenant with two branches, bank accounts and a borrowing."""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from accounts.models import Account
from banks.models import Bank, BankAccount
from branches.models import Branch
from clients.models import Client
from common.managers import set_current_tenant
from loans.models import LoanAccount, LoanProduct
from products.models import Product
from treasury.services import borrowings as svc
from users.models import Tenant, User


def make_env(tag):
    """Returns dict: owner (director), tenant, hq, ikeja, maker (plain staff user in Ikeja)."""
    set_current_tenant(None)
    owner = User.objects.create_user(username=f"{tag}_owner", password="pass")
    tenant = Tenant.objects.create(name=f"T-{tag}", slug=f"t-{tag}", owner=owner)
    owner.tenant = tenant
    owner.save()
    hq = Branch.objects.create(name="HQ", code=f"{tag[:7]}H", tenant=tenant, owner=owner)
    ikeja = Branch.objects.create(name="Ikeja", code=f"{tag[:7]}I", tenant=tenant, owner=owner)
    owner.branch = hq
    owner.save()
    set_current_tenant(tenant)
    maker = User.objects.create_user(username=f"{tag}_maker", password="pass")
    maker.tenant = tenant
    maker.branch = ikeja
    maker.save()
    return {'owner': owner, 'tenant': tenant, 'hq': hq, 'ikeja': ikeja, 'maker': maker}


def make_bank_account(env, branch, number):
    bank = Bank.objects.create(bank_name="GTB", branch=branch, owner=env['owner'], tenant=env['tenant'])
    return BankAccount.objects.create(
        bank=bank, account_number=number, account_name=f"{branch.name} {number}",
        account_manager=env['owner'], branch=branch, owner=env['owner'], tenant=env['tenant'],
    )


def set_balance(account, amount):
    """Seed a GL balance directly (forecast reads Account.balance)."""
    Account.objects.filter(pk=account.pk).update(balance=Decimal(amount))
    account.refresh_from_db()


def balance(account):
    account.refresh_from_db()
    return account.balance


def make_borrowing(env, hq_bank, ikeja_bank, principal='1000000.00', rate='0', tenor=2, first_due=None,
                   hq_amount=None, lead_days=3, receive=True):
    """HQ is the debit branch. Ikeja takes principal - hq_amount (default: Ikeja takes everything)."""
    principal = Decimal(principal)
    hq_amount = Decimal(hq_amount) if hq_amount is not None else Decimal('0')
    allocations = []
    if hq_amount > 0:
        allocations.append({'branch': env['hq'], 'amount': hq_amount, 'bank_account': hq_bank})
    allocations.append({'branch': env['ikeja'], 'amount': principal - hq_amount, 'bank_account': ikeja_bank})
    borrowing = svc.create_borrowing(
        user=env['owner'], lender_name="First Bank", reference="FB-1", principal=principal,
        monthly_rate=Decimal(rate), tenor_months=tenor,
        first_due_date=first_due or (timezone.localdate() + timedelta(days=10)),
        debit_branch=env['hq'], debit_bank_account=hq_bank, allocations=allocations,
        contribution_lead_days=lead_days,
    )
    if receive:
        borrowing = svc.receive_borrowing(borrowing, env['owner'])
    return borrowing


def make_pending_loan(env, branch, amount='100000.00', loan_number='LN-T-1'):
    """A pending loan in `branch`, owned by the plain maker user (so a director can approve it)."""
    owner = env['owner']
    loan_parent = Account.objects.create(
        name="Loans Receivable", code="1300", account_type=Account.LOAN, account_level=Account.LEVEL_PARENT,
        owner=owner, created_by=owner, branch=branch)
    cash_parent = Account.objects.create(
        name="Cash Parent", code="1000", account_type=Account.ASSET, account_level=Account.LEVEL_PARENT,
        owner=owner, created_by=owner, branch=branch)
    cash_child = Account.objects.create(
        name="Till", code="1001", account_type=Account.ASSET, account_level=Account.LEVEL_CHILD,
        parent=cash_parent, owner=owner, created_by=owner, branch=branch)
    income = Account.objects.create(
        name="Interest Income", code="4100", account_type=Account.INCOME, account_level=Account.LEVEL_PARENT,
        owner=owner, created_by=owner, branch=branch)
    gl_product = Product.objects.create(
        name="Monthly Loan", code=f"LOAN-{branch.pk}", product_type="LOAN", owner=owner, branch=branch)
    loan_product = LoanProduct.objects.create(
        product=gl_product, parent_account=loan_parent, disbursement_account=cash_child,
        interest_income_account=income, default_interest_rate=Decimal("10.00"),
        interest_calculation_method="flat", min_loan_amount=Decimal("1000.00"),
        max_loan_amount=Decimal("5000000.00"), owner=owner, branch=branch)
    client = Client.objects.create(
        client_id=f"CLI-{branch.pk}", first_name="Ada", last_name="Lovelace", gender="female",
        phone_primary="08010000001", tenant=env['tenant'], owner=owner, branch=branch)
    loan_account = Account.objects.create(
        name=f"{loan_number} Loan Account", code="130001", account_type=Account.LOAN,
        account_level=Account.LEVEL_CHILD, parent=loan_parent, owner=owner, created_by=owner, branch=branch)
    return LoanAccount.objects.create(
        client=client, product=loan_product, account=loan_account, loan_number=loan_number,
        requested_amount=Decimal(amount), interest_rate=Decimal("10.00"), term_months=2,
        repayment_frequency="monthly", status="pending", owner=env['maker'], created_by=env['maker'],
        branch=branch)
