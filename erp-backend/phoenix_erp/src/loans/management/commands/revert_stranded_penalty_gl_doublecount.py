"""
Management command: revert_stranded_penalty_gl_doublecount

One-off correction for a mistake made earlier today (2026-08-19) by
correct_stranded_penalty_overpayment. That tool reduces a loan's
outstanding_principal when reallocating "REAL" stranded penalty overpayment
to principal — safe only if nothing has already reduced what the loan owes
for that same excess. For 4 loans, that assumption was false:
correct_penalty_not_capped_at_payoff (2026-08-17) had already posted a real
GL entry reducing the loan's Loan Receivable account (and
outstanding_penalties) for the exact schedule row later flagged as
"stranded overpayment". Reallocating it again today double-counted the
reduction — outstanding_principal + outstanding_interest + outstanding_fees
+ outstanding_penalties now understates the loan's actual GL Loan
Receivable balance by exactly the reallocated amount.

Confirmed by direct GL-vs-business comparison (loan.account.balance vs the
sum of outstanding_* fields) for exactly 4 loans — diff == today's
reallocated amount, exactly, in each case: LN-1030, LN-526, LN-553, LN-855.

Deliberately NOT included:
  - LN-1022: went through the same 2026-08-17 mechanism, but the row it
    flagged today wasn't one that correction touched — diff=0.00,
    confirmed clean, nothing to revert.
  - LN-760, LN-800, LN-907: each has a separate, not-yet-understood
    GL-vs-business mismatch that doesn't cleanly resolve to this pattern.
    Applying this fix to them would be guessing — they need individual
    diagnosis first, not this blanket correction.

Fix: add back exactly the amount correct_stranded_penalty_overpayment
moved out of outstanding_principal, read directly from that correction's
own FinancialAuditLog entry (never retyped/hardcoded) so this can't drift
from what was actually written. Only outstanding_principal changes —
principal_paid/penalties_paid stay as they are: reclassifying which bucket
the historical cash sits in was correct, only the "amount still owed" was
double-reduced. No GL entry — this undoes a business-field-only mistake
with another business-field-only correction.

SAFETY:
  - Dry-run by default. Nothing written until --apply.
  - Re-verifies GL balance vs business-field sum immediately before
    writing, refusing to apply if the diff no longer matches the amount
    read from the log (protects against double-applying, or against the
    picture having changed since this was diagnosed).

Usage:
    python manage.py revert_stranded_penalty_gl_doublecount            # dry-run
    python manage.py revert_stranded_penalty_gl_doublecount --apply
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction

TOLERANCE = Decimal('0.01')
TARGET_LOANS = ['LN-1030', 'LN-526', 'LN-553', 'LN-855']


class Command(BaseCommand):
    help = (
        'One-off: reverts the outstanding_principal double-reduction correct_stranded_penalty_'
        'overpayment introduced on LN-1030/LN-526/LN-553/LN-855 (2026-08-19), where '
        'correct_penalty_not_capped_at_payoff had already GL-reduced the same excess. Adds back '
        'exactly the amount read from that correction\'s own audit log entry.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                             help='Actually write the correction. Without this, only previews.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount
        from common.models import FinancialAuditLog, log_financial_event

        apply_changes = options['apply']

        for loan_number in TARGET_LOANS:
            with db_transaction.atomic():
                sid = db_transaction.savepoint()

                loan = LoanAccount.all_objects.select_for_update().get(loan_number=loan_number)

                correction_log = FinancialAuditLog.objects.filter(
                    record_type='LoanAccount', record_id=str(loan.pk),
                    event_type=FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                    description__startswith='Corrected stranded penalty overpayment',
                ).order_by('-timestamp').first()

                if not correction_log:
                    db_transaction.savepoint_rollback(sid)
                    self.stdout.write(self.style.ERROR(
                        f'[{loan_number}] no "Corrected stranded penalty overpayment" log entry '
                        f'found — skipping.'
                    ))
                    continue

                reallocated = correction_log.amount

                biz_total = (
                    loan.outstanding_principal + loan.outstanding_interest
                    + loan.outstanding_fees + loan.outstanding_penalties
                )
                gl_balance = loan.account.balance
                diff = gl_balance - biz_total

                if abs(diff - reallocated) > TOLERANCE:
                    db_transaction.savepoint_rollback(sid)
                    self.stdout.write(self.style.ERROR(
                        f'[{loan_number}] SAFETY CHECK FAILED — GL-vs-business diff ({diff:,.2f}) no '
                        f'longer matches the reallocated amount ({reallocated:,.2f}) from the log. '
                        f'Refusing to apply — re-diagnose before proceeding.'
                    ))
                    continue

                new_outstanding_principal = loan.outstanding_principal + reallocated
                self.stdout.write(
                    f'[{loan_number}] pk={loan.pk}  outstanding_principal '
                    f'{loan.outstanding_principal:,.2f} -> {new_outstanding_principal:,.2f}  '
                    f'(reverting double-counted reduction of {reallocated:,.2f})'
                )

                if not apply_changes:
                    db_transaction.savepoint_rollback(sid)
                    continue

                loan.outstanding_principal = new_outstanding_principal
                loan.save(update_fields=['outstanding_principal', 'updated_at'])

                log_financial_event(
                    FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                    acted_by=None,
                    record_type='LoanAccount',
                    record_id=str(loan.pk),
                    amount=reallocated,
                    description=(
                        f'Reverted double-counted outstanding_principal reduction — {loan_number}: '
                        f'correct_stranded_penalty_overpayment reduced outstanding_principal by '
                        f'{reallocated:,.2f} assuming nothing had already accounted for it, but '
                        f'correct_penalty_not_capped_at_payoff (2026-08-17) had already reduced the '
                        f'loan\'s real GL Loan Receivable balance for the same excess. Restored '
                        f'outstanding_principal; principal_paid/penalties_paid reclassification left '
                        f'as-is (still correct). No GL entry — reverting a business-field-only error.'
                    ),
                    extra={
                        'loan_number': loan_number,
                        'reverted_amount': str(reallocated),
                        'original_correction_log_id': correction_log.id,
                        'source_command': 'revert_stranded_penalty_gl_doublecount',
                    },
                )

                db_transaction.savepoint_commit(sid)
                self.stdout.write(self.style.SUCCESS(f'  [{loan_number}] Applied.'))
