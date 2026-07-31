from django.conf import settings
from django.db import models
from django.db.models.query import QuerySet as _QuerySet
from django.utils import timezone

from common.base import TimeStampedModel, SoftDeleteModel
from common.managers import OwnerBranchManager


class InterBranchClearingAccount(TimeStampedModel, SoftDeleteModel):
    """
    Registry of the reciprocal "Due from X" / "Due to X" GL accounts used to
    post inter-branch transfers. One row per (branch, counterparty_branch,
    direction) — provisioned lazily by interbranch.services the first time a
    transfer actually needs that specific reciprocal account.

    due_from: an Asset account in `branch`'s books — `branch` sent value out
              to `counterparty_branch` and is owed it back.
    due_to:   a Liability account in `branch`'s books — `branch` received
              value from `counterparty_branch` and owes it back.
    """
    DUE_FROM = 'due_from'
    DUE_TO = 'due_to'
    DIRECTION_CHOICES = [
        (DUE_FROM, 'Due From (Asset)'),
        (DUE_TO, 'Due To (Liability)'),
    ]

    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        related_name='interbranch_clearing_accounts',
    )
    counterparty_branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        related_name='+',
    )
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    account = models.OneToOneField(
        'accounts.Account',
        on_delete=models.PROTECT,
        related_name='interbranch_clearing_registration',
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['branch', 'counterparty_branch', 'direction'],
                condition=models.Q(is_deleted=False),
                name='unique_interbranch_clearing_account',
            )
        ]

    def __str__(self):
        return f"{self.get_direction_display()}: {self.branch} <-> {self.counterparty_branch}"


class InterBranchTransfer(TimeStampedModel, SoftDeleteModel):
    """
    Header record linking the two single-branch Transactions (JVs) that make
    up one inter-branch transfer. Never itself posts a cross-branch entry —
    each linked Transaction is fully balanced within its own branch, via the
    InterBranchClearingAccount pair. See interbranch.services.create_interbranch_transfer.
    """
    STATUS_POSTED = 'posted'
    STATUS_REVERSED = 'reversed'
    STATUS_CHOICES = [
        (STATUS_POSTED, 'Posted'),
        (STATUS_REVERSED, 'Reversed'),
    ]

    transfer_number = models.CharField(max_length=50, unique=True, db_index=True, editable=False)

    from_branch = models.ForeignKey(
        'branches.Branch', on_delete=models.PROTECT, related_name='outgoing_interbranch_transfers'
    )
    to_branch = models.ForeignKey(
        'branches.Branch', on_delete=models.PROTECT, related_name='incoming_interbranch_transfers'
    )
    from_account = models.ForeignKey(
        'accounts.Account', on_delete=models.PROTECT, related_name='+',
        help_text="Real operational account debited in the source branch (e.g. Cash/Bank)",
    )
    to_account = models.ForeignKey(
        'accounts.Account', on_delete=models.PROTECT, related_name='+',
        help_text="Real operational account credited in the destination branch (e.g. Cash/Bank)",
    )

    amount = models.DecimalField(max_digits=18, decimal_places=2)
    description = models.CharField(max_length=255)
    date = models.DateField(default=timezone.localdate)

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_POSTED, db_index=True)

    source_transaction = models.ForeignKey(
        'transactions.Transaction', on_delete=models.PROTECT, related_name='+',
        help_text="JV posted in from_branch: Dr Due-from-clearing / Cr from_account",
    )
    destination_transaction = models.ForeignKey(
        'transactions.Transaction', on_delete=models.PROTECT, related_name='+',
        help_text="JV posted in to_branch: Dr to_account / Cr Due-to-clearing",
    )

    initiated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='+'
    )

    reversed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    reversed_at = models.DateTimeField(null=True, blank=True)
    reversal_reason = models.TextField(blank=True)

    objects = OwnerBranchManager()

    class Meta:
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['from_branch', 'date']),
            models.Index(fields=['to_branch', 'date']),
        ]

    def save(self, *args, **kwargs):
        if not self.transfer_number:
            date_str = timezone.now().strftime('%Y%m%d')
            # Query without the tenant/soft-delete scoped manager so a
            # soft-deleted transfer from earlier today can't cause a
            # transfer_number collision.
            last = (
                _QuerySet(model=InterBranchTransfer, using='default')
                .filter(transfer_number__startswith=f'IBT-{date_str}')
                .order_by('-transfer_number')
                .first()
            )
            if last:
                try:
                    new_seq = int(last.transfer_number.split('-')[-1]) + 1
                except (ValueError, IndexError):
                    new_seq = 1
            else:
                new_seq = 1
            self.transfer_number = f'IBT-{date_str}-{new_seq:04d}'
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.transfer_number}: {self.from_branch} -> {self.to_branch} ({self.amount})"
