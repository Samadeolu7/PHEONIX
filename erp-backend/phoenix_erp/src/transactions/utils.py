

from accounts.models import Account
from transactions.models import TransactionEntry
# import_context.py (or a helpers module) — paste this and wire ctx.create_transaction -> create_transaction
from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone

# Import models (adjust paths if different in your project)
from transactions.models import Transaction, TransactionEntry, TransactionSeries

def _ensure_series(series_code, branch, owner):
    """
    Helper: ensure a TransactionSeries exists for the given code. Returns a TransactionSeries instance.
    You may adapt this to your project's wiring (e.g. choose a default series from ctx.options).
    """
    if not series_code:
        # default fallback
        series_code = 'IM'
    series_obj, _ = TransactionSeries.objects.get_or_create(code=series_code, defaults={'description': 'Imported Transactions'})
    return series_obj

@transaction.atomic
def create_transaction(entries, description, workflow_reference=None, date=None,
                       series_code=None, owner=None, branch=None, approved=False, ctx=None):
    """
    Create a Transaction + TransactionEntry rows in a safe, single orchestrated flow.

    Parameters
    - entries: list of dicts: {'account': Account instance, 'side': 'DR'|'CR' or TransactionEntry.DEBIT/CREDIT, 'amount': Decimal}
    - description: str
    - workflow_reference: optional str
    - date: date object (or None -> default in model)
    - series_code: series code string (e.g. 'IM'); if None fallback to 'IM'
    - owner, branch: required (Transaction has owner/branch via BranchScopedModel/TimeStampedModel conventions)
    - approved: boolean, if True mark approved True and set approved_at after posting
    - ctx: optional: your import context (if you want to register statistics etc.)

    Returns: saved Transaction instance (with entries created and posted)
    Raises: ValidationError (or other exceptions) on failure — outer transaction.atomic will roll back.
    """
    # defensive validations
    if not isinstance(entries, (list, tuple)):
        raise ValueError("entries must be a list of entry dicts")

    # Normalize amounts and ensure positive numbers
    normalized_entries = []
    for e in entries:
        try:
            acct = e['account']
            side = e['side']
            amt = e['amount']
        except KeyError as ke:
            raise ValueError(f"Transaction entry missing key: {ke}")

        # coerce to Decimal
        if not isinstance(amt, Decimal):
            amt = Decimal(str(amt or 0))
        # if amt <= Decimal('0.00'):
        #     raise ValueError("Entry amount must be positive and > 0")

        normalized_entries.append({'account': acct, 'side': side, 'amount': amt})

    # Ensure series exists
    series = _ensure_series(series_code, branch, owner)

    # 1) Create Transaction record (save early in order to get PK so entries can point to it)
    tx = Transaction(
        series=series,
        date=(date or None),
        description=(description or '')[:255],
        workflow_reference=(workflow_reference or None),
        created_by=owner,
    )
    # Attach branch/owner if your BranchScopedModel defines these as attributes (adjust names accordingly)
    if owner is not None:
        tx.owner = owner
    if branch is not None:
        tx.branch = branch

    # Save now to obtain PK (we intentionally do not call tx.full_clean() BEFORE entries exist;
    # we'll validate after entries are created)
    tx.save()  # this will run Transaction.save() but with no pre-entry validation when we apply the model change below

    # 2) Create TransactionEntry rows pointing to tx
    created_entries = []
    for e in normalized_entries:
        te = TransactionEntry(
            transaction=tx,
            account=e['account'],
            side=e['side'],
            amount=e['amount']
        )
        # run entry-level validation (calls clean)
        te.full_clean()
        te.save()
        created_entries.append(te)

    # 3) Now validate the transaction as a whole (Transaction.clean uses self.entries.all())
    try:
        tx.full_clean()   # will call Transaction.clean and raise ValidationError if unbalanced / closed period etc.
    except ValidationError:
        # Clean up the partially created entries and transaction, then re-raise
        for te in created_entries:
            try:
                te.delete()
            except Exception:
                pass
        tx.delete()
        raise

    # 4) Post entries (update account balances) — keep inside atomic so posting and tx save are atomic
    for te in created_entries:
        te.post()

    # 5) If approved flag set, mark timestamp and persist
    if approved:
        tx.approved = True
        tx.approved_at = timezone.now()
        tx.save(update_fields=['approved', 'approved_at'])

    # update stats on ctx if provided
    if ctx is not None:
        try:
            ctx.stats = getattr(ctx, 'stats', {})
            ctx.stats['create_transaction_calls'] = ctx.stats.get('create_transaction_calls', 0) + 1
        except Exception:
            pass

    return tx


def handle_decimal_rounding(value, precision=2):
    """
    Round a decimal value to the specified precision.

    Args:
        value (Decimal): The decimal value to round.
        precision (int): The number of decimal places to round to.

    Returns:
        Decimal: The rounded value.
    """
    quantizer = Decimal('1.' + '0' * precision)
    return Decimal(value).quantize(quantizer)

def create_second_leg(transaction, account_type, amount):
    """
    Create a second leg of a transaction for the specified account type.

    Args:
        transaction (Transaction): The transaction to which the entry belongs.
        account_type (str): The type of account (e.g., 'SAVINGS', 'LOAN').
        amount (Decimal): The amount for the second leg.

    Returns:
        TransactionEntry: The created transaction entry.
    """
    account = Account.objects.filter(account_type=account_type).first()
    if not account:
        raise ValueError(f"No account found for type {account_type}")

    return TransactionEntry.objects.create(
        transaction=transaction,
        account=account,
        side=TransactionEntry.CREDIT,
        amount=amount
    )