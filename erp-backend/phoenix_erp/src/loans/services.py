# loans/services.py
"""
Business logic for product-driven loan fee collection and savings requirements.
"""
from __future__ import annotations

from decimal import Decimal
from django.db import transaction as db_transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from .models import LoanAccount, LoanProductFee, LoanFeeApplication, LoanProductSavingsRequirement


def check_savings_requirement(client, loan_product, requested_amount: Decimal) -> None:
    """
    Hard-block check: raise ValidationError if the client does not hold enough
    savings to satisfy any active requirement on the loan product.

    Args:
        client:           clients.Client instance.
        loan_product:     loans.LoanProduct instance.
        requested_amount: The loan amount being applied for.

    Raises:
        ValidationError: describing EVERY unsatisfied requirement, so the user
                         sees all failures at once rather than one at a time.
    """
    requirements = loan_product.savings_requirements.filter(is_active=True).select_related(
        'savings_product'
    )
    if not requirements.exists():
        return

    # Import here to avoid circular imports
    from savings.models import SavingsAccount

    errors = []
    for req in requirements:
        # Find the client's savings account for the required product
        savings_account = (
            SavingsAccount.objects
            .filter(client=client, product=req.savings_product, status='active')
            .select_related('account')
            .first()
        )
        current_balance = savings_account.current_balance if savings_account else Decimal('0.00')
        minimum_required = req.required_amount(requested_amount)

        if current_balance < minimum_required:
            shortfall = minimum_required - current_balance
            errors.append(
                f"Insufficient {req.savings_product.name} balance: "
                f"required ₦{minimum_required:,.2f}, "
                f"available ₦{current_balance:,.2f} "
                f"(short by ₦{shortfall:,.2f})."
            )

    if errors:
        raise ValidationError(errors)


@db_transaction.atomic
def apply_loan_fees(loan_account: LoanAccount, trigger: str, posted_by=None) -> list[LoanFeeApplication]:
    """
    Calculate and post all active fee lines for the given loan at the given trigger.

    Args:
        loan_account: The LoanAccount being processed.
        trigger:      'approval' or 'disbursement' — only fees with matching
                      posting_trigger are processed.
        posted_by:    The User performing the action (for the journal entry).

    Returns:
        List of LoanFeeApplication records that were created/updated.

    GL Entry per fee:
        Dr. Accounts Receivable / Loan Account  (LOAN child account)
        Cr. Income Account                       (fee_config.gl_income_account)
    """
    from transactions.models import (
        Transaction as JournalEntry,
        TransactionEntry as JournalEntryLine,
        TransactionSeries,
    )

    fee_lines = loan_account.product.fee_lines.filter(
        posting_trigger=trigger,
        is_active=True,
    ).select_related('gl_income_account')

    if not fee_lines.exists():
        return []

    loan_amount = loan_account.approved_amount or loan_account.requested_amount
    results = []

    series_code = 'LN-FEE-APR' if trigger == 'approval' else 'LN-FEE-DIS'
    series, _ = TransactionSeries.objects.get_or_create(
        code=series_code,
        defaults={'description': f'Loan Fees at {trigger.title()}'},
    )

    for fee in fee_lines:
        amount = fee.calculate(loan_amount)
        if amount <= Decimal('0.00'):
            continue

        # Upsert the application record
        app, created = LoanFeeApplication.objects.get_or_create(
            loan_account=loan_account,
            fee_config=fee,
            defaults={
                'calculated_amount': amount,
                'owner': loan_account.owner,
                'branch': loan_account.branch,
            },
        )
        if not created and app.posted:
            # Already posted — skip to avoid double-posting
            results.append(app)
            continue

        if not created:
            app.calculated_amount = amount
            app.save(update_fields=['calculated_amount', 'updated_at'])

        # Create GL journal entry
        journal = JournalEntry.objects.create(
            series=series,
            date=timezone.now().date(),
            description=(
                f"{fee.name} for loan {loan_account.loan_number} "
                f"({loan_account.client.full_name})"
            ),
            owner=loan_account.owner,
            branch=loan_account.branch,
            created_by=posted_by,
        )

        # Debit: Loan Receivable account (asset — money owed by client)
        JournalEntryLine.objects.create(
            transaction=journal,
            account=loan_account.account,
            side=JournalEntryLine.DEBIT,
            amount=amount,
            description=f"{fee.name} — debit loan account",
        )

        # Credit: Income account
        JournalEntryLine.objects.create(
            transaction=journal,
            account=fee.gl_income_account,
            side=JournalEntryLine.CREDIT,
            amount=amount,
            description=f"{fee.name} income",
        )

        journal.post()

        app.posted = True
        app.posting_date = timezone.now().date()
        app.journal_entry = journal
        app.save(update_fields=['posted', 'posting_date', 'journal_entry', 'updated_at'])

        results.append(app)

    return results


def get_fee_preview(loan_product, loan_amount: Decimal) -> list[dict]:
    """
    Return a list of fee line previews for display in the loan application form.
    Does NOT write anything to the database.

    Returns:
        [{'name': str, 'fee_type': str, 'amount': Decimal, 'posting_trigger': str}, ...]
    """
    return [
        {
            'name': fee.name,
            'fee_type': fee.fee_type,
            'amount': fee.calculate(loan_amount),
            'posting_trigger': fee.posting_trigger,
        }
        for fee in loan_product.fee_lines.filter(is_active=True).order_by('order', 'name')
    ]
