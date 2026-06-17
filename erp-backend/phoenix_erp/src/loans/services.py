# loans/services.py
"""
Business logic for product-driven loan fee collection and savings requirements.
"""
from __future__ import annotations

from decimal import Decimal
from django.db import transaction as db_transaction
from django.utils import timezone
from django.core.exceptions import ValidationError
from typing import Optional

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
def apply_loan_fees(
    loan_account: LoanAccount,
    trigger: str,
    posted_by=None,
    cashier_account=None,
    fee_routing: Optional[dict] = None,
) -> list[LoanFeeApplication]:
    """
    Calculate and post all active fee lines for the given loan at the given trigger.

    Args:
        loan_account:   The LoanAccount being processed.
        trigger:        'registration', 'approval', or 'disbursement'.
        posted_by:      The User performing the action (journal entry created_by).
        cashier_account: The GL Account used when debit_destination='cashier'.
                         Required when any fee routes to cashier.
        fee_routing:    Per-fee override dict keyed by fee PK:
                        {
                          <fee_id>: {
                            'destination': 'cashier' | 'savings',
                            'savings_account_id': <int> | None,  # only when destination=savings
                          }
                        }
                        Used only for fees with debit_destination='user_choice'.

    Returns:
        List of LoanFeeApplication records that were created/updated.

    GL Entries:
        cashier mode:   Dr. Cashier/Cash account  /  Cr. Fee Income account
        savings mode:   Dr. Client Savings GL     /  Cr. Fee Income account
    """
    from transactions.models import (
        Transaction as JournalEntry,
        TransactionEntry as JournalEntryLine,
        TransactionSeries,
    )
    from savings.models import SavingsAccount

    fee_routing = fee_routing or {}

    fee_lines = loan_account.product.fee_lines.filter(
        posting_trigger=trigger,
        is_active=True,
    ).select_related('gl_income_account', 'default_savings_product')

    if not fee_lines.exists():
        return []

    loan_amount = loan_account.approved_amount or loan_account.requested_amount
    client = loan_account.client
    results = []

    series_code_map = {
        'registration': 'LFREG',
        'approval':     'LFAPR',
        'disbursement': 'LFDIS',
    }
    series_code = series_code_map.get(trigger, 'LFEE')
    series, _ = TransactionSeries.objects.get_or_create(
        code=series_code,
        defaults={'description': f'Loan Fees at {trigger.title()}'},
    )

    for fee in fee_lines:
        amount = fee.calculate(loan_amount)
        if amount <= Decimal('0.00'):
            continue

        # ── Resolve debit destination for this fee ───────────────────────
        fee_route = fee_routing.get(fee.pk) or {}
        destination = fee.debit_destination

        if destination == 'user_choice':
            # Take the user's explicit choice; default to cashier if not provided
            destination = fee_route.get('destination', 'cashier')

        # ── Resolve the debit account ────────────────────────────────────
        debit_account = None
        savings_record: Optional[SavingsAccount] = None

        if destination == 'savings':
            # Find the target savings account for this client
            savings_account_id = fee_route.get('savings_account_id')
            if savings_account_id:
                savings_record = (
                    SavingsAccount.objects
                    .filter(pk=savings_account_id, client=client, status='active')
                    .select_related('account')
                    .first()
                )
            if not savings_record and fee.default_savings_product_id:
                # Fall back to the configured default savings product
                savings_record = (
                    SavingsAccount.objects
                    .filter(
                        client=client,
                        product=fee.default_savings_product,
                        status='active',
                    )
                    .select_related('account')
                    .first()
                )
            if not savings_record:
                # Last resort: first active savings account for this client
                savings_record = (
                    SavingsAccount.objects
                    .filter(client=client, status='active')
                    .select_related('account')
                    .order_by('opened_on')
                    .first()
                )
            if not savings_record:
                raise ValidationError(
                    f"Fee '{fee.name}' is configured to debit savings, but client "
                    f"{client.full_name} has no active savings account."
                )
            available = savings_record.available_balance
            if available < amount:
                raise ValidationError(
                    f"Insufficient savings balance for fee '{fee.name}': "
                    f"required ₦{amount:,.2f}, available ₦{available:,.2f} "
                    f"in {savings_record.account_number}."
                )
            debit_account = savings_record.account
        else:
            # destination == 'cashier'
            if cashier_account is None:
                raise ValidationError(
                    f"Fee '{fee.name}' requires a cashier account but none was provided."
                )
            debit_account = cashier_account

        # ── Upsert the application record ────────────────────────────────
        app, created = LoanFeeApplication.objects.get_or_create(
            loan_account=loan_account,
            fee_config=fee,
            defaults={
                'calculated_amount': amount,
                'debit_destination_used': destination,
                'savings_account_debited': savings_record,
                'owner': loan_account.owner,
                'branch': loan_account.branch,
            },
        )
        if not created and app.posted:
            results.append(app)
            continue
        if not created:
            app.calculated_amount = amount
            app.debit_destination_used = destination
            app.savings_account_debited = savings_record
            app.save(update_fields=['calculated_amount', 'debit_destination_used', 'savings_account_debited', 'updated_at'])

        # ── GL journal entry ─────────────────────────────────────────────
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

        JournalEntryLine.objects.create(
            transaction=journal,
            account=debit_account,
            side=JournalEntryLine.DEBIT,
            amount=amount,
            description=f"{fee.name} — debit {'savings' if destination == 'savings' else 'cashier'}",
        )
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
        app.debit_destination_used = destination
        app.savings_account_debited = savings_record
        app.save(update_fields=['posted', 'posting_date', 'journal_entry', 'debit_destination_used', 'savings_account_debited', 'updated_at'])

        results.append(app)

    return results


def get_fee_preview(loan_product, loan_amount: Decimal) -> list[dict]:
    """
    Return a list of fee line previews for display in the loan application form.
    Does NOT write anything to the database.

    Returns:
        [
          {
            'id': int,
            'name': str,
            'fee_type': str,
            'calculated_amount': Decimal,
            'posting_trigger': str,
            'debit_destination': str,
            'default_savings_product_id': int | None,
            'default_savings_product_name': str | None,
          },
          ...
        ]
    """
    return [
        {
            'id': fee.pk,
            'name': fee.name,
            'fee_type': fee.fee_type,
            'calculated_amount': fee.calculate(loan_amount),
            'posting_trigger': fee.posting_trigger,
            'debit_destination': fee.debit_destination,
            'default_savings_product_id': fee.default_savings_product_id,
            'default_savings_product_name': (
                fee.default_savings_product.name if fee.default_savings_product else None
            ),
        }
        for fee in loan_product.fee_lines.filter(is_active=True).order_by('order', 'name')
    ]
