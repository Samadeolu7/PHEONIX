from django.db import models

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel


class OfficerRecoveryTarget(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    A manager-set monthly recovery target for one credit officer.

    Replaces the hand-typed daily "Target / Recovered Today / Cumulative /
    Outstanding Balance" messages officers posted in discussion threads. Only
    the target is stored; every recovered figure is computed live from
    LoanRepaymentAllocation (see analytics/views.py::RecoveryTargetsView), so
    nobody can mistype a running total.

    One row per (staff, month). Removing a target hard-deletes the row
    rather than soft-deleting it, so the unique constraint never collides
    with a hidden is_deleted row.
    """
    staff = models.ForeignKey(
        'hr.Staff', on_delete=models.CASCADE, related_name='recovery_targets',
    )
    month = models.DateField(help_text='First day of the target month')
    target_amount = models.DecimalField(max_digits=18, decimal_places=2)
    notes = models.CharField(max_length=255, blank=True)
    updated_by = models.ForeignKey(
        'users.User', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='recovery_targets_updated',
    )

    class Meta:
        unique_together = [('staff', 'month')]
        indexes = [models.Index(fields=['tenant', 'month'])]
        ordering = ['-month', 'staff__first_name']

    def __str__(self):
        return f'{self.staff} {self.month:%Y-%m}: {self.target_amount}'
