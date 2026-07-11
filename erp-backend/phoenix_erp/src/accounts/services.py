from datetime import date
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum, Q
from .models import Account, Period, BalanceSheetSnapshot
from transactions.models import Transaction, TransactionEntry, TransactionSeries

def close_month(owner, branch, year, month, reopenable=True):
    """
    Close a month for a specific tenant/branch.
    """
    Period.objects.for_owner(owner).create(
        owner=owner,
        branch=branch,
        period_type=Period.MONTH,
        year=year,
        month=month,
        is_closed=True,
        can_reopen=reopenable
    )

def reopen_period(owner, period_id):
    """
    Reopen a closed period if allowed.
    """
    # Use all_objects to avoid tenant filtering issues in tests
    p = Period.all_objects.all_tenants().get(id=period_id, owner=owner)
    if p.can_reopen:
        p.is_closed = False
        p.save()
    else:
        raise ValueError("This period cannot be reopened.")

@transaction.atomic
def year_end_close(owner, branch, year):
    """
    Perform year-end closing process:
    1. Create year-end period record (closed, non-reopenable)
    2. Create opening balances for next year
    3. Handle retained earnings
    """
    from django.db import IntegrityError
    
    # 1. Check if year is already closed
    # Use all_objects to avoid tenant filtering issues in tests
    existing = Period.all_objects.all_tenants().filter(
        owner=owner,
        branch=branch,
        period_type=Period.YEAR,
        year=year
    ).first()
    
    if existing:
        raise IntegrityError(f"Year {year} has already been closed for this branch")
    
    # Create year period
    Period.objects.for_owner(owner).create(
        owner=owner,
        branch=branch,
        period_type=Period.YEAR,
        year=year,
        is_closed=True,
        can_reopen=False
    )

    # 2. Opening balances on Jan 1 next year
    next_date = date(year + 1, 1, 1)
    ob_series = TransactionSeries.objects.get(code='OB')  # Opening Balance series

    # Get balances for all accounts - use all_objects to avoid tenant filtering
    accounts = Account.all_objects.all_tenants().filter(owner=owner, branch=branch)
    
    # Get or create Opening Balance Equity account (contra account for opening balances)
    ob_equity_account, _ = Account.all_objects.get_or_create(
        code='OBE',
        owner=owner,
        branch=branch,
        defaults={
            'name': 'Opening Balance Equity',
            'account_type': Account.EQUITY,
            'account_level': Account.LEVEL_PARENT,
            'allow_manual_entries': True,
            'is_system_account': True
        }
    )
    
    # Create opening balance entries (balanced transaction)
    tx = Transaction.objects.create(
        series=ob_series,
        date=next_date,
        owner=owner,
        branch=branch,
        tenant=owner.tenant,
        description=f"Opening Balance for {year+1}",
    )

    total_debits = Decimal('0.00')
    total_credits = Decimal('0.00')
    
    for acct in accounts:
        balance = acct.balance  # Assuming you have a balance property/method
        if balance is not None and balance != 0:
            # Create entry based on balance sign and account type
            # Assets/Expenses with positive balance = Debit
            # Liabilities/Equity/Income with positive balance = Credit
            is_debit_normal = acct.account_type in [Account.ASSET, Account.EXPENSE]
            
            if balance > 0:
                side = TransactionEntry.DEBIT if is_debit_normal else TransactionEntry.CREDIT
            else:
                side = TransactionEntry.CREDIT if is_debit_normal else TransactionEntry.DEBIT
            
            TransactionEntry.objects.create(
                transaction=tx,
                account=acct,
                side=side,
                amount=abs(balance)
            )
            
            if side == TransactionEntry.DEBIT:
                total_debits += abs(balance)
            else:
                total_credits += abs(balance)
    
    # Balance the transaction with opening balance equity account
    if total_debits > total_credits:
        TransactionEntry.objects.create(
            transaction=tx,
            account=ob_equity_account,
            side=TransactionEntry.CREDIT,
            amount=total_debits - total_credits
        )
    elif total_credits > total_debits:
        TransactionEntry.objects.create(
            transaction=tx,
            account=ob_equity_account,
            side=TransactionEntry.DEBIT,
            amount=total_credits - total_debits
        )
    
    # Validate and post the opening balance transaction
    tx.full_clean()
    # Note: We don't post opening balance entries to avoid circular balance updates
    # since they represent the starting state. Mark as approved instead.
    tx.approved = True
    tx.approved_at = timezone.now()
    tx.save(update_fields=['approved', 'approved_at'])

    # 3. Net Income → Retained Earnings
    # Calculate net income - use all_objects to avoid tenant filtering
    income_accounts = Account.all_objects.all_tenants().filter(
        owner=owner,
        branch=branch,
        account_type=Account.INCOME
    ).aggregate(total=Sum('balance'))['total'] or 0

    expense_accounts = Account.all_objects.all_tenants().filter(
        owner=owner,
        branch=branch,
        account_type=Account.EXPENSE
    ).aggregate(total=Sum('balance'))['total'] or 0

    net_income = income_accounts - expense_accounts

    if net_income and abs(net_income) > Decimal('0.01'):
        # Get retained earnings account - use all_objects to avoid tenant filtering
        re_account = Account.all_objects.all_tenants().get(
            owner=owner,
            branch=branch,
            code='RE'  # Assuming you have a standard chart of accounts
        )
        
        # Get or create Income Summary account
        income_summary, _ = Account.all_objects.get_or_create(
            code='IS',
            owner=owner,
            branch=branch,
            defaults={
                'name': 'Income Summary',
                'account_type': Account.EQUITY,
                'account_level': Account.LEVEL_PARENT,
                'allow_manual_entries': True,
                'is_system_account': True
            }
        )

        # Create retained earnings entry (balanced)
        tx2 = Transaction.objects.create(
            series=ob_series,
            date=next_date,
            owner=owner,
            branch=branch,
            tenant=owner.tenant,
            description=f"Transfer Net Income to Retained Earnings for {year}",
        )

        # If profit, debit Income Summary and credit Retained Earnings
        if net_income > 0:
            debit_entry = TransactionEntry.objects.create(
                transaction=tx2,
                account=income_summary,
                side=TransactionEntry.DEBIT,
                amount=abs(net_income)
            )
            credit_entry = TransactionEntry.objects.create(
                transaction=tx2,
                account=re_account,
                side=TransactionEntry.CREDIT,
                amount=abs(net_income)
            )
        # If loss, debit Retained Earnings and credit Income Summary
        else:
            debit_entry = TransactionEntry.objects.create(
                transaction=tx2,
                account=re_account,
                side=TransactionEntry.DEBIT,
                amount=abs(net_income)
            )
            credit_entry = TransactionEntry.objects.create(
                transaction=tx2,
                account=income_summary,
                side=TransactionEntry.CREDIT,
                amount=abs(net_income)
            )
        
        # Validate and post the retained earnings transfer
        tx2.full_clean()
        Account.objects.select_for_update().filter(pk__in=[re_account.pk, income_summary.pk])
        debit_entry.post()
        credit_entry.post()

    return tx.id, tx2.id if net_income else None


def create_balance_snapshots(owner, branch, period_type, year, month=None):
    """
    Create balance snapshots for all accounts in a given period.
    Wrapped in transaction to avoid duplicate key errors.
    """
    from django.db import transaction as db_transaction
    
    with db_transaction.atomic():
        # Use all_objects to avoid tenant filtering issues in tests
        period = Period.all_objects.all_tenants().get(
            owner=owner,
            branch=branch,
            period_type=period_type,
            year=year,
            month=month
        )
        
        # Lock the period to prevent concurrent snapshot creation
        Period.objects.select_for_update().filter(id=period.id).first()
        
        # Hard delete any existing snapshots for this period to avoid duplicates
        # Use all_objects to bypass tenant filtering when deleting snapshots
        # Note: Using hard_delete() instead of delete() because we need actual deletion
        # (not soft-delete) to avoid unique constraint violations
        BalanceSheetSnapshot.all_objects.all_tenants().filter(
            owner=owner,
            branch=branch,
            period=period
        ).hard_delete()
        
        # Create snapshots for all accounts - use all_objects to avoid tenant filtering
        accounts = Account.all_objects.all_tenants().filter(owner=owner, branch=branch)
        
        snapshots = []
        
        for account in accounts:
            snapshots.append(BalanceSheetSnapshot(
                owner=owner,
                branch=branch,
                period=period,
                account=account,
                balance=account.balance
            ))
        
        # Bulk create all snapshots
        if snapshots:
            BalanceSheetSnapshot.objects.bulk_create(snapshots)


def get_live_balance(owner, account):
    """
    Get current balance by combining last snapshot with recent transactions.
    """
    # Get last snapshot
    last_snap = BalanceSheetSnapshot.objects.for_owner(owner) \
        .filter(account=account, period__is_closed=True) \
        .order_by('-period__year', '-period__month') \
        .first()
    
    if not last_snap:
        return account.balance
        
    # Get all transactions after the snapshot period ends
    # For a monthly period (e.g., Nov 2024), we want transactions from Dec 1 onwards
    if last_snap.period.month:
        # Monthly period - calculate the first day of next month
        if last_snap.period.month == 12:
            cutoff = date(last_snap.period.year + 1, 1, 1)
        else:
            cutoff = date(last_snap.period.year, last_snap.period.month + 1, 1)
    else:
        # Yearly period - first day of next year
        cutoff = date(last_snap.period.year + 1, 1, 1)
    
    # TransactionEntry doesn't have owner directly, filter through transaction
    # Include all entries (posted and non-posted) after the snapshot period
    entries_qs = TransactionEntry.objects.filter(
        transaction__owner=owner,
        account=account,
        transaction__date__gte=cutoff
    )
    
    # Calculate net impact on balance (DR increases asset accounts, CR decreases)
    # For proper accounting, we need to consider the account's normal balance
    from django.db.models import Sum, Case, When, DecimalField
    
    recent_delta = entries_qs.aggregate(
        debit_sum=Sum('amount', filter=Q(side='DR')),
        credit_sum=Sum('amount', filter=Q(side='CR'))
    )
    
    debit_sum = recent_delta['debit_sum'] or Decimal('0')
    credit_sum = recent_delta['credit_sum'] or Decimal('0')
    net_change = debit_sum - credit_sum
    
    return last_snap.balance + net_change


def reopen_period_and_invalidate(owner, branch, period_type, year, month=None):
    """
    Reopen a period and invalidate all subsequent snapshots.
    """
    # Fetch the reopened period
    p = Period.objects.for_owner(owner).get(
        branch=branch,
        period_type=period_type,
        year=year,
        month=month
    )
    
    if not p.can_reopen:
        raise ValueError("This period cannot be reopened.")
        
    # Find all affected periods (>= reopened one)
    affected = Period.objects.for_owner(owner).filter(
        branch=branch,
        period_type=period_type,
        year__gte=year,
        month__gte=month if month else 0
    )
    
    # Delete their snapshots
    BalanceSheetSnapshot.objects.for_owner(owner).filter(
        period__in=affected
    ).delete()
    
    # Mark them open
    affected.update(is_closed=False)
    
    return affected


def reclose_periods(owner, branch, affected_periods):
    """
    Re-close a sequence of periods in chronological order.
    """
    for period in affected_periods.order_by('year', 'month'):
        if period.period_type == Period.MONTH:
            close_month(owner, branch, period.year, period.month)
        else:
            year_end_close(owner, branch, period.year)
        create_balance_snapshots(
            owner, branch,
            period.period_type,
            period.year,
            period.month
        )
