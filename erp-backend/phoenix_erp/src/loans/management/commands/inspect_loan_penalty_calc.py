"""
Management command: inspect_loan_penalty_calc

READ-ONLY. Triggered 2026-08-28: Br Israel2 reported Damola Kadiri's loan
charging a 10% late penalty on an overdue installment instead of the
product's configured 5% (screenshot showed principal 58,400.00 -> total_due
64,240.00, i.e. a 5,840.00 penalty = exactly 2x the 2,920.00 a 5% single-
period charge should be) -- and said "I have others like that".

For one loan (by --loan or --client name match), and optionally a portfolio-
wide --scan, this prints, per currently-overdue installment:
  - product.late_payment_penalty (the configured rate)
  - days_late / periods_late_for_installment (the current, fixed formula's
    period count)
  - what calculate_late_penalty() says penalty_due SHOULD be right now,
    using the SAME inputs update_loan_status.py's daily cron uses
  - what is actually STORED in sched.penalty_due
and flags any mismatch, so we can tell whether a live discrepancy is a
product-level rate misconfiguration (stored value matches a *different*
rate applied consistently) or a genuine code-path bug (stored value doesn't
match calculate_late_penalty() at ANY plausible rate/periods combination).

Usage:
    python manage.py inspect_loan_penalty_calc --loan LN-1234
    python manage.py inspect_loan_penalty_calc --client "Damola Kadiri"
    python manage.py inspect_loan_penalty_calc --scan          # portfolio-wide, all overdue installments
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Read-only: compare stored penalty_due against what the current calculate_late_penalty() formula says it should be.'

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None)
        parser.add_argument('--client', dest='client_name', default=None)
        parser.add_argument('--scan', action='store_true',
                             help='Check every currently-overdue installment across the whole portfolio.')

    def handle(self, *args, **options):
        from django.utils import timezone
        from loans.models import LoanAccount, LoanRepaymentSchedule

        today = timezone.localdate()
        loan_number = options['loan_number']
        client_name = options['client_name']
        scan = options['scan']

        if not (loan_number or client_name or scan):
            raise CommandError('Provide --loan, --client, or --scan')

        loans = LoanAccount.all_objects.select_related('product', 'client').filter(is_deleted=False)
        if loan_number:
            loans = loans.filter(loan_number=loan_number)
        elif client_name:
            loans = loans.filter(client__full_name__icontains=client_name)

        if not scan:
            loans = list(loans)
            if not loans:
                raise CommandError('No matching loan found.')
        else:
            loans = list(loans.filter(status__in=['active', 'disbursed', 'defaulted']))

        mismatches = 0
        checked = 0

        for loan in loans:
            product = loan.product
            overdue = loan.repayment_schedule.filter(status='overdue').order_by('due_date')
            if not overdue.exists():
                if not scan:
                    self.stdout.write(f'{loan.loan_number} ({loan.client.full_name}) — no overdue installments.')
                continue

            self.stdout.write(self.style.MIGRATE_HEADING(
                f'{loan.loan_number} — {loan.client.full_name} — product={product.name} '
                f'configured_rate={product.late_payment_penalty}% type={product.late_payment_penalty_type} '
                f'frequency={loan.repayment_frequency}'
            ))

            for sched in overdue:
                checked += 1
                days_late = product.effective_days_late(sched.due_date, today)
                periods_late = loan.periods_late_for_installment(sched, today)
                non_penalty_remaining = (
                    (sched.principal_due + sched.interest_due + sched.fees_due)
                    - (sched.principal_paid + sched.interest_paid + sched.fees_paid)
                )
                expected = product.calculate_late_penalty(
                    non_penalty_remaining, days_late, loan.repayment_frequency,
                    periods_late=periods_late,
                )
                stored = sched.penalty_due
                delta = (stored - expected).quantize(Decimal('0.01'))

                # What rate would explain the STORED value, holding periods_late fixed —
                # useful to tell "wrong rate" from "wrong periods" at a glance.
                implied_rate = None
                if non_penalty_remaining > 0 and periods_late > 0:
                    implied_rate = (stored * 100 / (non_penalty_remaining * periods_late)).quantize(Decimal('0.01'))

                flag = ''
                if abs(delta) > Decimal('0.01'):
                    flag = '  <== MISMATCH'
                    mismatches += 1

                self.stdout.write(
                    f'  installment #{sched.installment_number:<3d} due={sched.due_date}  days_late={days_late:<4d}  '
                    f'periods_late={periods_late:<3d}  base={non_penalty_remaining:>12,.2f}  '
                    f'expected_penalty={expected:>12,.2f}  stored_penalty_due={stored:>12,.2f}  '
                    f'delta={delta:>12,.2f}  implied_rate={implied_rate}%{flag}'
                )

        self.stdout.write('')
        self.stdout.write(f'Checked {checked} overdue installment(s), {mismatches} mismatch(es) found.')
        if mismatches:
            self.stdout.write(self.style.ERROR(
                'A mismatch means sched.penalty_due does NOT match what calculate_late_penalty() '
                '(the current, fixed formula, same inputs as update_loan_status.py) says it should be '
                'right now — i.e. this is not explained by the configured rate alone, something wrote '
                'a different value. Check implied_rate: if it lands near a round number (e.g. 10.00% '
                "when configured_rate says 5), that installment's penalty_due was likely computed once "
                'under a stale/different rate or doubled periods_late and never recomputed by a later '
                'run (update_loan_status only ever RAISES penalty_due — see audit_penalty_due_inflation.py).'
            ))
