"""
internal_api/models.py
======================
Persistence models used by internal Java microservice endpoints only.
These are never exposed to the browser frontend.
"""
from django.db import models
from django.utils import timezone


class BatchRunLog(models.Model):
    """
    One row per nightly batch run posted by Java App 1
    (Loan Portfolio Batch Processor).

    Java posts this via POST /api/internal/batch/run-summary/ at the end
    of every batch cycle regardless of success or failure.
    """
    STATUS_CHOICES = [
        ('COMPLETED', 'Completed'),
        ('FAILED', 'Failed'),
        ('STOPPED', 'Stopped'),
    ]

    run_date = models.DateField(
        help_text="Calendar date (Africa/Lagos timezone) that the batch ran for."
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES)
    loans_processed = models.PositiveIntegerField(default=0)
    loans_skipped = models.PositiveIntegerField(default=0)
    duration_seconds = models.PositiveIntegerField(default=0)
    received_at = models.DateTimeField(
        default=timezone.now,
        help_text="When Django received this summary from the batch processor."
    )

    class Meta:
        ordering = ['-run_date', '-received_at']
        verbose_name = "Batch Run Log"
        verbose_name_plural = "Batch Run Logs"

    def __str__(self):
        return f"Batch {self.run_date} – {self.status} ({self.loans_processed} loans)"


class LoanAccrualRecord(models.Model):
    """
    Idempotency table for accrual journal entries posted by Java App 1.

    One row per (loan_id, idempotency_key). Java sends a key formatted as
    "{loanId}-{runDate}" (e.g. "1042-2026-05-23"). If a row already exists
    for that key, Django skips the entry and returns a 200 without
    re-posting the journal entry.

    This table is the audit trail of every accrual cycle.
    """
    loan_id = models.PositiveIntegerField(db_index=True)
    idempotency_key = models.CharField(
        max_length=60,
        unique=True,
        help_text='Format: "{loanId}-{YYYY-MM-DD}" e.g. "1042-2026-05-23"',
    )
    run_date = models.DateField()
    accrual_amount = models.DecimalField(max_digits=18, decimal_places=2)
    provision_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    risk_classification_applied = models.CharField(max_length=20)
    days_in_arrears_at_run = models.PositiveIntegerField(default=0)
    journal_entry_id = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="PK of the Transaction (GL journal entry) created for this accrual."
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-run_date', 'loan_id']
        verbose_name = "Loan Accrual Record"
        verbose_name_plural = "Loan Accrual Records"

    def __str__(self):
        return f"Accrual {self.idempotency_key} – ₦{self.accrual_amount}"
