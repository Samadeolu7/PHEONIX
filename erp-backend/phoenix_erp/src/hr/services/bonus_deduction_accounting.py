# hr/services/bonus_deduction_accounting.py
"""
Accounting entries for Bonus/Deduction Requests.

When a DEDUCTION request is APPROVED (advance is given to staff):
  Dr: SalaryComponent.gl_account  (Staff IOU / receivable — e.g. 1112 Staff Advances and Loans)
  Cr: Bank / Cash                  (money leaves the organisation)

When the deduction is recovered at payroll run time the payroll accounting
service handles:
  Dr: Salary Payable (2103)
  Cr: SalaryComponent.gl_account
"""

from decimal import Decimal
from django.db import transaction as db_transaction

from transactions.models import (
    Transaction as JournalEntry,
    TransactionEntry as JournalEntryLine,
    TransactionSeries,
)
from accounts.utils.account_creation import get_system_account


@db_transaction.atomic
def post_deduction_advance_journal(bonus_request, approved_by):
    """
    Post the journal entry that records the cash advance given to a staff member.

    Entry:
      Dr: bonus_request.component.gl_account   (Staff IOU account)
      Cr: default Bank / Cash account

    Args:
        bonus_request: BonusDeductionRequest instance (already APPROVED)
        approved_by:   User who approved the request

    Returns:
        JournalEntry: The posted journal entry
    """
    component = bonus_request.component
    gl_account = component.gl_account  # e.g. 1112 – Staff Advances and Loans

    if gl_account is None:
        raise ValueError(
            f"SalaryComponent '{component.name}' has no GL account configured. "
            "Set gl_account on the component before approving advances."
        )

    branch = bonus_request.staff.branch
    owner  = bonus_request.staff.owner

    # Cr: Bank/Cash — use the branch's default cash-at-bank account
    cash_account = get_system_account('cash', owner, branch)

    series, _ = TransactionSeries.objects.get_or_create(
        code='BDADV',
        defaults={'description': 'Staff Advance (Deduction)'}
    )

    amount = Decimal(str(bonus_request.amount))

    journal_entry = JournalEntry.objects.create(
        tenant=bonus_request.staff.tenant,
        series=series,
        date=bonus_request.approved_date.date() if bonus_request.approved_date else __import__('django.utils.timezone', fromlist=['now']).now().date(),
        description=(
            f"Staff Advance – {component.name}: "
            f"{bonus_request.staff.get_full_name()} "
            f"(Ref: BDR-{bonus_request.pk})"
        ),
        workflow_reference=f"BDR-{bonus_request.pk}-ADV",
        branch=branch,
        owner=owner,
    )

    # Dr: Staff IOU / Receivable
    JournalEntryLine.objects.create(
        transaction=journal_entry,
        account=gl_account,
        side=JournalEntryLine.DEBIT,
        amount=amount,
    )

    # Cr: Bank / Cash
    JournalEntryLine.objects.create(
        transaction=journal_entry,
        account=cash_account,
        side=JournalEntryLine.CREDIT,
        amount=amount,
    )

    journal_entry.post()

    return journal_entry
