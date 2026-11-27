"""
Management command: fix_ln_20261125_8f008d_term

One-off, director-authorized fix for LN-20261125-8F008D (Rabiu Adenike
Kafayat). The loan was booked as 1 day instead of 60 days. It was then
restructured to 60 days at 20%, which charged a fresh N30,000 of interest
on top of the original N30,000 (N60,000 in total). Because the 1-day term was
a data-entry error, not a new deal, the client should owe only the original
N30,000: 20% flat on N150,000 over 60 days from the original disbursement.

WHAT THIS DOES (dry-run by default; nothing is written without --apply)
  1. Reverses the restructure's interest journal (LNRST, N30,000) with
     Transaction.reverse(). Client-facing ledgers hide reversed entries and
     their reversals, so the client never sees it.
  2. Takes that N30,000 back off loan.outstanding_interest.
  3. Records an approved LoanRestructureRequest (is_correction=True) for
     audit, then runs LoanAccount.correct_term(60): the schedule is rebuilt
     from the original disbursement date, every payment made so far is
     replayed onto the new installments, and no further journal is posted.

SAFETY
  Refuses unless the loan is in exactly the diagnosed state: 60 days at
  20%, N150,000 disbursed, exactly one restructure whose journal is the
  N30,000 interest and not yet reversed, total interest N60,000, and no
  penalties or pending restructure requests. Payments made since diagnosis
  are fine; they're replayed with the rest.

Usage:
    python manage.py fix_ln_20261125_8f008d_term --by-username <director>           # dry-run
    python manage.py fix_ln_20261125_8f008d_term --by-username <director> --apply
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.utils import timezone

LOAN_NUMBER = 'LN-20261125-8F008D'
TERM = 60
EXTRA_INTEREST = Decimal('30000.00')


class Command(BaseCommand):
    help = (
        "One-off: undo the N30,000 extra interest charged when LN-20261125-8F008D "
        "was restructured from 1 to 60 days, and rebuild it as a term correction."
    )

    def add_arguments(self, parser):
        parser.add_argument('--by-username', type=str, required=True,
                            help='Username of the director authorizing this fix.')
        parser.add_argument('--apply', action='store_true',
                            help='Write the fix. Without this, only previews.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount, LoanRestructureRequest
        from users.models import User

        try:
            director = User.objects.get(username=options['by_username'])
        except User.DoesNotExist:
            raise CommandError(f"No user found with username={options['by_username']!r}.")

        with db_transaction.atomic():
            sid = db_transaction.savepoint()
            try:
                loan = LoanAccount.objects.select_for_update().get(loan_number=LOAN_NUMBER)
            except LoanAccount.DoesNotExist:
                raise CommandError(f'{LOAN_NUMBER} not found.')

            restructures = list(loan.restructures.order_by('id'))
            restructure = restructures[-1] if restructures else None
            journal = restructure.journal_entry if restructure else None
            total_interest = loan.interest_paid + loan.outstanding_interest

            problems = []
            if loan.status not in ('active', 'overdue'):
                problems.append(f"status is {loan.status!r}")
            if (loan.term_months, loan.term_unit) != (TERM, 'days'):
                problems.append(f"term is {loan.term_months} {loan.term_unit}, expected {TERM} days")
            if loan.interest_rate != Decimal('20.00'):
                problems.append(f"rate is {loan.interest_rate}%, expected 20%")
            if loan.disbursed_amount != Decimal('150000.00'):
                problems.append(f"disbursed {loan.disbursed_amount}, expected 150,000")
            if len(restructures) != 1 or restructure.is_correction:
                problems.append(f"expected exactly one (non-correction) restructure, found {len(restructures)}")
            if journal is None or journal.is_reversed:
                problems.append("restructure journal is missing or already reversed")
            elif restructure.normal_interest_amount + restructure.restructure_interest_amount != EXTRA_INTEREST:
                problems.append("restructure journal isn't the N30,000 interest")
            if total_interest != 2 * EXTRA_INTEREST:
                problems.append(f"total interest is {total_interest:,}, expected 60,000")
            if loan.outstanding_penalties or loan.penalties_paid:
                problems.append("loan has penalties")
            if LoanRestructureRequest.objects.filter(
                loan=loan, status=LoanRestructureRequest.STATUS_PENDING
            ).exists():
                problems.append("loan has a pending restructure request; reject it first")

            if problems:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.ERROR(f'{LOAN_NUMBER} is not in the expected state, refusing:'))
                for p in problems:
                    self.stdout.write(f'  - {p}')
                return

            before = self._snapshot(loan)
            reason = 'Term correction: loan was booked as 1 day instead of 60 days'

            journal.reverse(
                director,
                reason=f'{LOAN_NUMBER} term correction: interest should not have been added',
            )
            loan.outstanding_interest -= EXTRA_INTEREST
            loan.save(update_fields=['outstanding_interest', 'updated_at'])

            req = LoanRestructureRequest.objects.create(
                loan=loan,
                new_term=TERM,
                is_correction=True,
                effective_date=loan.original_disbursement_date,
                reason=reason,
                notes=(
                    'Executed via management command fix_ln_20261125_8f008d_term. The earlier '
                    f'restructure (#{restructure.pk}) added N30,000 interest for what was a '
                    'data-entry error; its journal was reversed and the loan rebuilt as a '
                    'term correction from the original disbursement date.'
                ),
                requested_by=director,
                owner=director,
                branch=loan.branch,
                tenant=loan.tenant,
            )
            record = loan.correct_term(TERM, corrected_by=director, reason=reason, notes=req.notes)
            req.status = LoanRestructureRequest.STATUS_APPROVED
            req.reviewed_by = director
            req.reviewed_at = timezone.now()
            req.restructure = record
            req.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'restructure'])

            loan.refresh_from_db()
            after = self._snapshot(loan)

            self.stdout.write(self.style.MIGRATE_HEADING(f'{LOAN_NUMBER}, authorized by {director.username}'))
            for key in before:
                self.stdout.write(f'  {key:<22} {before[key]:>16}  ->  {after[key]}')

            if not options['apply']:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.WARNING('DRY-RUN: nothing written. Re-run with --apply.'))
                return
            db_transaction.savepoint_commit(sid)
            self.stdout.write(self.style.SUCCESS('Applied.'))

    @staticmethod
    def _snapshot(loan):
        return {
            'start date': str(loan.disbursement_date),
            'maturity': str(loan.maturity_date),
            'installment': f'{loan.installment_amount:,}',
            'principal outstanding': f'{loan.outstanding_principal:,}',
            'interest outstanding': f'{loan.outstanding_interest:,}',
            'interest total': f'{loan.interest_paid + loan.outstanding_interest:,}',
            'total paid': f'{loan.total_paid:,}',
        }
