"""
savings/signals.py

Django signals for the Savings module.

Handlers:
    _apply_compulsory_savings_on_disbursement
        When a LoanAccount transitions to 'disbursed', check whether the branch
        has an enabled CompulsorySavingsPolicy.  If so, deposit the policy amount
        into the client's first active savings account.

        GL entry produced by SavingsAccount.deposit() (SAV-DEP series):
            Dr. Cashier / Cash account (loan's disbursement cash account)
            Cr. Member Savings account

        The cashier account used is the loan product's disbursement_account —
        the same cash/bank account that funds the loan, ensuring the deduction
        is recorded as coming from the same source.
"""
import logging

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender='loans.LoanAccount')
def _apply_compulsory_savings_on_disbursement(sender, instance, created, **kwargs):
    """
    Trigger: LoanAccount saved with status == 'disbursed' (not a new creation).

    Deduct the compulsory savings amount from the loan proceeds and credit it
    to the client's active savings account.
    """
    if created or instance.status != 'disbursed':
        return

    # Defer import to avoid circular dependencies at module load time.
    from .models import CompulsorySavingsPolicy, SavingsAccount

    try:
        policy = (
            CompulsorySavingsPolicy.objects
            .filter(owner=instance.owner, branch=instance.branch, enabled=True)
            .first()
        )
        if not policy or policy.amount <= 0:
            return

        # Find the client's first active savings account on this branch.
        savings_account = (
            SavingsAccount.objects
            .filter(
                client=instance.client,
                owner=instance.owner,
                branch=instance.branch,
                status='active',
            )
            .select_related('account', 'client')
            .first()
        )
        if not savings_account:
            logger.warning(
                'Compulsory savings: no active savings account found for client %s '
                '(loan %s). Skipping.',
                instance.client_id,
                instance.loan_number,
            )
            return

        # Use the loan product's disbursement account as the cashier/cash account
        # so the double-entry DR is applied to the same cash pot the loan came from.
        cashier_account = (
            instance.product.disbursement_account
            if instance.product_id
            else None
        )
        if not cashier_account:
            logger.warning(
                'Compulsory savings: loan product has no disbursement_account '
                '(loan %s). Skipping.',
                instance.loan_number,
            )
            return

        with transaction.atomic():
            savings_account.deposit(
                amount=policy.amount,
                description=(
                    f'Compulsory savings deduction at disbursement of loan '
                    f'{instance.loan_number}'
                ),
                cashier_account=cashier_account,
                transacted_by=instance.disbursed_by if hasattr(instance, 'disbursed_by') else None,
            )
            logger.info(
                'Compulsory savings ₦%s credited to account %s for client %s (loan %s).',
                policy.amount,
                savings_account.account_number,
                instance.client_id,
                instance.loan_number,
            )

    except Exception:  # noqa: BLE001
        # Never let compulsory savings failure roll back the disbursement itself.
        logger.exception(
            'Compulsory savings signal failed for loan %s.',
            getattr(instance, 'loan_number', instance.pk),
        )
