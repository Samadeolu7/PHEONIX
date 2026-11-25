"""Shared fixtures for client tests (current model API)."""
from datetime import date
from decimal import Decimal

from accounts.models import Account
from branches.models import Branch
from clients.models import Client
from common.managers import set_current_tenant
from loans.models import LoanAccount, LoanProduct
from products.models import Product
from users.models import Tenant, User


def make_env(username):
    """Tenant owner (elevated) + one branch, with the tenant set current."""
    set_current_tenant(None)
    user = User.objects.create_user(username=username, password="pass")
    tenant = Tenant.objects.create(name=f"T-{username}", slug=f"t-{username}", owner=user)
    user.tenant = tenant
    user.save()
    branch = Branch.objects.create(name="Main", code=username[:10].upper(), tenant=tenant, owner=user)
    user.branch = branch
    user.save()
    set_current_tenant(tenant)
    return user, tenant, branch


def make_client(user, tenant, branch, **extra):
    data = dict(
        first_name="Ada", last_name="Obi", gender="female", phone_primary="08010000000",
        tenant=tenant, owner=user, branch=branch,
    )
    data.update(extra)
    return Client.objects.create(**data)


def make_loan(user, branch, client, status, seq=1):
    """A bare loan in the given status (enough to test client relationships)."""
    parent = Account.objects.filter(code="1300", branch=branch).first() or Account.objects.create(
        name="Loans Receivable", code="1300", account_type=Account.LOAN,
        account_level=Account.LEVEL_PARENT, owner=user, created_by=user, branch=branch)
    cash = Account.objects.filter(code="1000", branch=branch).first() or Account.objects.create(
        name="Cash", code="1000", account_type=Account.ASSET,
        account_level=Account.LEVEL_PARENT, owner=user, created_by=user, branch=branch)
    product = LoanProduct.objects.filter(branch=branch).first()
    if product is None:
        gl_product = Product.objects.create(
            name="Monthly Loan", code="LN-MON", product_type="LOAN", owner=user, branch=branch)
        product = LoanProduct.objects.create(
            product=gl_product, parent_account=parent, disbursement_account=cash,
            default_interest_rate=Decimal("10.00"), interest_calculation_method="flat",
            min_loan_amount=Decimal("1000.00"), max_loan_amount=Decimal("500000.00"),
            owner=user, branch=branch)
    account = Account.objects.create(
        name=f"Loan {seq}", code=f"1300-{seq:05d}", account_type=Account.LOAN,
        account_level=Account.LEVEL_CHILD, parent=parent, owner=user, created_by=user, branch=branch)
    return LoanAccount.objects.create(
        client=client, product=product, account=account, loan_number=f"LN-T-{seq}",
        requested_amount=Decimal("10000.00"), interest_rate=Decimal("10.00"), term_months=3,
        repayment_frequency="monthly", status=status, owner=user, branch=branch)
