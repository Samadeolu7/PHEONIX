"""
savings/signals.py

Django signals for the Savings module.

Handlers:
    _create_default_savings_account
        When a new Client is created, automatically open a Regular Savings
        account (product code SAV-REG) for that client.  A child GL account
        is created under parent 2140 (Customer Savings Deposits) and a
        SavingsAccount record is linked to it.  Failures are logged but never
        propagate — client creation is never blocked.

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
from decimal import Decimal

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

logger = logging.getLogger(__name__)

_SAVINGS_PARENT_CODE = '2140'
_DEFAULT_SAVINGS_PRODUCT_CODE = 'SAV-REG'


@receiver(post_save, sender='clients.Client')
def _create_default_savings_account(sender, instance, created, **kwargs):
    """
    Automatically open a Regular Savings account whenever a new Client is saved.

    Idempotent: if the client already has an active savings account on this branch
    (e.g. created by a management command before this signal was in place) the
    handler exits without creating a duplicate.
    """
    if not created:
        return

    from products.models import Product
    from accounts.models import Account
    from .models import SavingsAccount

    try:
        with transaction.atomic():
            # Find the Regular Savings product, preferring the branch-local one
            product_qs = Product.objects.filter(
                product_type='SAVINGS',
                code=_DEFAULT_SAVINGS_PRODUCT_CODE,
                is_active=True,
            )
            product = (
                product_qs.filter(branch=instance.branch).first()
                or product_qs.first()
            )
            if not product:
                logger.warning(
                    'Auto savings: no active "%s" product found; skipping for client %s.',
                    _DEFAULT_SAVINGS_PRODUCT_CODE,
                    instance.pk,
                )
                return

            # Idempotency guard — skip if the client already has a non-closed account
            # for this specific product (allows other product types to coexist).
            if SavingsAccount.objects.filter(
                client=instance,
                product=product,
            ).exclude(status='closed').exists():
                return

            # Create a child GL account under 2140 (Customer Savings Deposits)
            gl_account = Account.create_with_parent(
                parent_code=_SAVINGS_PARENT_CODE,
                child_data={
                    'name': f'Savings – {instance.full_name}',
                    'allow_manual_entries': True,
                    'owner': instance.owner,
                    'branch': instance.branch,
                    'tenant': instance.tenant,
                    'created_by': instance.created_by,
                },
            )

            SavingsAccount.objects.create(
                client=instance,
                account=gl_account,
                product=product,
                account_number=gl_account.code,
                nickname=f"{instance.first_name}'s Savings",
                status='active',
                opened_on=timezone.now().date(),
                interest_rate=product.interest_rate or Decimal('0.00'),
                interest_calculation_method='monthly',
                minimum_balance=product.minimum_amount or Decimal('0.00'),
                owner=instance.owner,
                branch=instance.branch,
                tenant=instance.tenant,
                created_by=instance.created_by,
            )

            logger.info(
                'Auto savings: opened %s savings account %s for client %s.',
                product.name,
                gl_account.code,
                instance.pk,
            )

    except Exception:
        # Never let a savings setup failure prevent a client from being created.
        logger.exception(
            'Auto savings: failed to create default savings account for client %s.',
            instance.pk,
        )


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
        # Policies are branch/tenant config — don't filter by owner (the record's
        # creator). A policy created by the import admin must be visible to any
        # user in the same branch.
        policy_qs = CompulsorySavingsPolicy.objects.filter(
            branch=instance.branch, enabled=True,
        )
        tenant = getattr(instance, 'tenant', None)
        if tenant:
            policy_qs = policy_qs.filter(tenant=tenant)
        policy = policy_qs.first()
        if not policy or policy.amount <= 0:
            return

        # Find the client's first active savings account on this branch.
        # owner is the record's creator; it may differ from the loan's owner
        # when the loan was imported by an admin account.
        savings_account = (
            SavingsAccount.objects
            .filter(
                client=instance.client,
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
