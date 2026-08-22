"""
Management command: update_loan_status

Run daily (cron/Celery beat). For every active loan:
  1. Recalculates arrears (days_in_arrears, arrears_amount, overdue installments)
  2. Updates CBN risk classification + provision amount
  3. Applies late-payment penalties per product configuration and accrues
     them to GL immediately (income recognized on assessment, not on payment)
  4. Flags status='defaulted' for loans 90+ DPD (configurable via --default-threshold)

Interest is recognized in full at disbursement (see LoanAccount.disburse()), so
there is no periodic interest accrual to suspend/reinstate on NPL loans — this
command intentionally does not touch LoanAccount.interest_suspended. status
still transitions to 'defaulted' as before (used by AR aging / portfolio
dashboards); repayments remain postable on defaulted loans either way.

Penalty accrual (LNPEN series) — one journal entry per overdue INSTALLMENT
(not lumped per loan), so each month's/period's penalty charge is individually
traceable in the ledger. Posted whenever a schedule row's assessed penalty
(delta = new_penalty - sched.penalty_due) moves, for a product with
penalty_income_account configured:
    Fresh/increased charge (delta > 0):
        Dr. Loan Receivable (loan.account)            — ASSET goes up
        Cr. Penalty Income  (product.penalty_income_account) — INCOME goes up
    Self-correction lowering a previously-assessed amount (delta < 0):
        Dr. Penalty Income  (product.penalty_income_account)
        Cr. Loan Receivable (loan.account)
Once a loan has had at least one such entry posted, LoanAccount.penalty_accrual_active
is set True permanently, so LoanAccount.record_payment() stops re-crediting
Penalty Income for that loan's penalty collections (already recognized here) and
instead collects straight against Loan Receivable — see record_payment()'s
docstring. Loans on products without penalty_income_account configured keep the
legacy cash-basis behavior (income recognized only when the penalty is paid).

Usage:
    python manage.py update_loan_status
    python manage.py update_loan_status --dry-run
    python manage.py update_loan_status --default-threshold 90
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.utils import timezone


class Command(BaseCommand):
    help = 'Daily loan status update: arrears, classification, penalties, default flagging.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument(
            '--default-threshold',
            type=int,
            default=90,
            help='DPD at which a loan is moved to defaulted status (default: 90).',
        )

    def handle(self, *args, **options):
        from loans.models import LoanAccount
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )
        from common.models import FinancialAuditLog, log_financial_event

        dry_run = options['dry_run']
        default_threshold = options['default_threshold']
        today = timezone.localdate()

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY-RUN — no changes will be saved.'))

        loans = LoanAccount.all_objects.filter(
            status__in=['active', 'disbursed', 'defaulted'],
            is_deleted=False,
        ).select_related('product', 'branch', 'owner').order_by('id')

        total = loans.count()
        self.stdout.write(f'Processing {total} loans as of {today}…')

        series = None
        if not dry_run:
            series, _ = TransactionSeries.objects.get_or_create(
                code='LNPEN',
                defaults={'description': 'Loan Penalty Accrual'},
            )

        stats = dict(updated=0, penalised=0, accrued=0, defaulted=0, errors=0)

        for loan in loans:
            try:
                with db_transaction.atomic():
                    # 1. Recalculate arrears
                    loan._calculate_arrears()
                    loan.refresh_from_db()

                    # 2. Update risk classification
                    loan.update_risk_classification()

                    # 3. Auto-penalty: apply to overdue installments. Recomputes from
                    # the current days_late every run (not gated on penalty_due=0) so
                    # a percentage penalty keeps growing as more repayment periods
                    # (weeks/months, per the loan's frequency) elapse overdue,
                    # instead of freezing at its first-assessed value.
                    #
                    # penalty_due is always set to the freshly recalculated figure
                    # (not just raised when higher) so this stays self-correcting:
                    # if a stored value was ever inflated — stale data, a prior
                    # formula bug, or simply base_amount shrinking after a partial
                    # payment — the next run brings it back in line with
                    # calculate_late_penalty() instead of leaving it stuck. Only the
                    # (possibly negative) delta is applied to outstanding_penalties,
                    # since penalty_due is an absolute (not incremental) figure.
                    overdue_schedules = loan.repayment_schedule.filter(status='overdue')
                    penalty_delta_total = Decimal('0.00')
                    penalty_account = loan.product.penalty_income_account
                    loan_had_accrual = False
                    for sched in overdue_schedules:
                        days_late = loan.product.effective_days_late(sched.due_date, today)
                        # Base the penalty on principal+interest+fees remaining only —
                        # NOT sched.total_due - sched.total_paid, which bakes the row's
                        # own penalty_due into total_due (see flat_schedule() /
                        # _update_schedule_with_payment, "sched.total_due += portion"
                        # right after penalty_due is added). Using total_due here fed
                        # yesterday's already-accrued penalty back in as part of
                        # tomorrow's base, charging penalty on penalty every time this
                        # job ran on a still-overdue installment.
                        non_penalty_remaining = (
                            (sched.principal_due + sched.interest_due + sched.fees_due)
                            - (sched.principal_paid + sched.interest_paid + sched.fees_paid)
                        )
                        new_penalty = loan.product.calculate_late_penalty(
                            non_penalty_remaining, days_late,
                            loan.repayment_frequency,
                        )
                        delta = new_penalty - sched.penalty_due
                        if delta == 0:
                            continue
                        sched.penalty_due = new_penalty
                        sched.save(update_fields=['penalty_due', 'updated_at'])
                        penalty_delta_total += delta

                        # 3b. Accrue THIS installment's penalty delta to GL now, on
                        # assessment, instead of waiting for the client to pay it (see
                        # module docstring) — one entry per installment, not lumped per
                        # loan, so each month's charge is separately traceable. Only for
                        # products with penalty_income_account configured — loans on
                        # products without one keep the legacy cash-basis behavior,
                        # income recognized by record_payment() when actually collected.
                        if not penalty_account:
                            continue

                        amount = abs(delta)
                        if delta > 0:
                            debit_account, credit_account = loan.account, penalty_account
                        else:
                            debit_account, credit_account = penalty_account, loan.account

                        if dry_run:
                            self.stdout.write(
                                f'  [{loan.loan_number}] would accrue penalty ₦{delta} for '
                                f'installment due {sched.due_date} '
                                f'(Dr {debit_account} / Cr {credit_account} ₦{amount})'
                            )
                        else:
                            journal = JournalEntry.objects.create(
                                series=series,
                                date=today,
                                description=(
                                    f'Loan penalty accrual — {loan.loan_number} '
                                    f'(installment due {sched.due_date})'
                                ),
                                owner=loan.owner,
                                branch=loan.branch,
                            )
                            JournalEntryLine.objects.create(
                                transaction=journal, account=debit_account,
                                side=JournalEntryLine.DEBIT, amount=amount,
                            )
                            JournalEntryLine.objects.create(
                                transaction=journal, account=credit_account,
                                side=JournalEntryLine.CREDIT, amount=amount,
                            )
                            journal.post()

                            log_financial_event(
                                FinancialAuditLog.LOAN_PENALTY_ACCRUAL,
                                acted_by=None,
                                record_type='LoanAccount',
                                record_id=str(loan.pk),
                                amount=delta,
                                description=(
                                    f'Penalty accrual on {loan.loan_number} '
                                    f'(installment due {sched.due_date})'
                                ),
                                extra={
                                    'loan_number': loan.loan_number,
                                    'client_id': str(loan.client_id),
                                    'schedule_id': str(sched.pk),
                                    'installment_due_date': str(sched.due_date),
                                    'journal_entry_id': str(journal.pk),
                                },
                            )

                        loan_had_accrual = True

                    if penalty_delta_total != 0:
                        loan.outstanding_penalties = max(
                            Decimal('0.00'), loan.outstanding_penalties + penalty_delta_total,
                        )
                        stats['penalised'] += 1

                    if loan_had_accrual:
                        loan.penalty_accrual_active = True
                        stats['accrued'] += 1

                    # 4. Mark defaulted at threshold
                    if (
                        loan.days_in_arrears >= default_threshold
                        and loan.status != 'defaulted'
                    ):
                        loan.status = 'defaulted'
                        stats['defaulted'] += 1
                        self.stdout.write(
                            f'  [{loan.loan_number}] → defaulted ({loan.days_in_arrears} DPD)'
                        )

                    loan.save(update_fields=[
                        'risk_classification', 'provision_pct', 'provision_amount',
                        'outstanding_penalties', 'penalty_accrual_active', 'status', 'updated_at',
                    ])

                    # Marked last, not first: Django refuses any further ORM queries
                    # inside an atomic() block once set_rollback(True) has been called
                    # (TransactionManagementError) — calling it at the top of the block
                    # broke every dry-run invocation of this command (every query after
                    # it, starting with _calculate_arrears(), failed). All the work
                    # above still runs and is visible within this transaction; marking
                    # rollback last just discards it when the block exits instead of
                    # committing it.
                    if dry_run:
                        db_transaction.set_rollback(True)
                    stats['updated'] += 1

            except Exception as exc:
                stats['errors'] += 1
                self.stderr.write(
                    self.style.ERROR(
                        f'  [{getattr(loan, "loan_number", loan.pk)}] FAILED: {exc}'
                    )
                )

        self.stdout.write(self.style.SUCCESS(
            f'Done. updated={stats["updated"]} penalised={stats["penalised"]} '
            f'accrued={stats["accrued"]} defaulted={stats["defaulted"]} errors={stats["errors"]}'
        ))
