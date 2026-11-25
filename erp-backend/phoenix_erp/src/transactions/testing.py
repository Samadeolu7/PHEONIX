"""
Test helpers for giving GL accounts a starting balance the proper way.

Account balances may only change through posted journal entries
(Account.save() rejects direct balance writes), so a test that needs an
account to start with money in it posts a balanced opening-balance journal
against an "Opening Balance Equity" account in the same branch — exactly how
real opening balances are entered.
"""
from decimal import Decimal

from accounts.models import Account
from transactions.models import Transaction, TransactionEntry, TransactionSeries

_CREDIT_NATURAL = {Account.LIABILITY, Account.EQUITY, Account.INCOME}


def opening_balance_equity(branch, owner):
    """The branch's Opening Balance Equity account (created on first use)."""
    acct = Account.objects.filter(code='3999', branch=branch).first()
    if acct is None:
        acct = Account.objects.create(
            code='3999', name='Opening Balance Equity', account_type=Account.EQUITY,
            account_level=Account.LEVEL_PARENT, owner=owner, created_by=owner,
            branch=branch, tenant=getattr(branch, 'tenant', None),
        )
    return acct


def post_opening_balance(account, amount, user=None):
    """Post a balanced opening-balance journal so ``account`` starts at
    ``amount`` on its natural side (debit for assets/expenses, credit for
    liabilities/equity/income)."""
    amount = Decimal(str(amount))
    if amount == 0:
        return None
    owner = user or account.owner
    equity = opening_balance_equity(account.branch, owner)
    series, _ = TransactionSeries.objects.get_or_create(
        code='OB', defaults={'description': 'Opening Balance'})
    txn = Transaction.objects.create(
        series=series, description=f'Opening balance - {account.name}',
        branch=account.branch, owner=owner, created_by=owner,
        tenant=getattr(account, 'tenant', None) or getattr(account.branch, 'tenant', None),
    )
    if account.account_type in _CREDIT_NATURAL:
        account_side, equity_side = TransactionEntry.CREDIT, TransactionEntry.DEBIT
    else:
        account_side, equity_side = TransactionEntry.DEBIT, TransactionEntry.CREDIT
    TransactionEntry.objects.create(transaction=txn, account=account, side=account_side, amount=amount)
    TransactionEntry.objects.create(transaction=txn, account=equity, side=equity_side, amount=amount)
    txn.post()
    account.refresh_from_db()
    return txn
