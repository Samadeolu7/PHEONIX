"""
Management command: execute_ln_20260904_b6514f_restructure

One-off, director-authorized restructure for LN-20260904-B6514F (Banjoko
Khadijat): extend the term from 2 days to 60 days, keeping total interest
owed at the original ₦20,000 (no additional interest charged for the
extension itself). The original restructure proposal (LoanRestructureRequest
#1, new_term=60) was rejected on 2026-09-10 ("On behalf of Israel") — this
was confirmed to be a miscommunication, not an intended rejection.

WHY new_rate=0.00, NOT the old 20% rate
----------------------------------------
LoanAccount.restructure() ADDS whatever interest this call computes for the
new term on top of whatever's already carried forward as unpaid — it does
not replace it. This loan's full ₦20,000 original interest is already
sitting in outstanding_interest, entirely unpaid. Passing new_rate=20.00
(the old rate) would compute ANOTHER ₦20,000 for the new 60-day term and add
it to the ₦20,000 already carried, landing on ₦40,000 total — double what's
actually owed. Passing new_rate=0.00 means this restructure adds nothing new;
the existing ₦20,000 simply carries forward and gets folded into the new
60-day schedule, exactly matching "same total interest, just more time to
pay it." Verified against this exact scenario in
loans/tests/test_restructure_gl_fallback.py::test_explicit_new_rate_bypasses_proportional_derivation.

WHAT THIS WRITES
----------------
  - A NEW LoanRestructureRequest (documenting this action for audit
    continuity — the original rejected request #1 is left untouched as
    history), immediately marked status='approved', reviewed_by/requested_by
    = the given user.
  - LoanAccount.restructure(new_term=60, new_rate=Decimal('0.00')) runs in
    full: old schedule rows (installment_number 1-2) marked 'restructured',
    a new 60-day schedule generated continuing installment_number from 3,
    loan.term_months/interest_rate/disbursement_date/maturity_date updated,
    days_in_arrears/arrears_amount reset, a LoanRestructure audit record
    created. No GL journal entry is posted (total_new_interest is exactly
    0 for this call) — the original ₦20,000 was already recognized as
    income at disbursement and is untouched here, just redistributed across
    the new schedule's rows.

SAFETY
------
Refuses to run unless the loan is found in EXACTLY the diagnosed
pre-restructure state (see the guard in handle()) — if anything about this
loan has changed since 2026-09-12, this command aborts rather than guessing.
Dry-run by default; nothing is written until --apply.

Usage:
    python manage.py execute_ln_20260904_b6514f_restructure --by-username samuel            # dry-run
    python manage.py execute_ln_20260904_b6514f_restructure --by-username samuel --apply
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.utils import timezone

LOAN_NUMBER = 'LN-20260904-B6514F'
NEW_TERM = 60
NEW_RATE = Decimal('0.00')
TOLERANCE = Decimal('0.01')


class Command(BaseCommand):
    help = (
        "One-off: restructure LN-20260904-B6514F from 2 days to 60 days, "
        "keeping total interest at the original 20,000 (no extra interest for "
        "the extension). See this file's module docstring for the full plan."
    )

    def add_arguments(self, parser):
        parser.add_argument('--by-username', type=str, required=True,
                             help='Username of the director authorizing this restructure.')
        parser.add_argument('--apply', action='store_true',
                             help='Write the restructure. Without this, only previews.')

    def handle(self, *args, **options):
        apply_changes = options['apply']
        username = options['by_username']

        from loans.models import LoanAccount, LoanRestructureRequest
        from users.models import User

        try:
            director = User.objects.get(username=username)
        except User.DoesNotExist:
            raise CommandError(f"No user found with username={username!r}.")

        with db_transaction.atomic():
            sid = db_transaction.savepoint()
            try:
                loan = LoanAccount.objects.select_for_update().get(loan_number=LOAN_NUMBER)
            except LoanAccount.DoesNotExist:
                raise CommandError(f'{LOAN_NUMBER} not found.')

            mismatches = []
            if loan.status != 'active':
                mismatches.append(f"loan.status: expected 'active', found {loan.status!r}")
            if loan.term_months != 2 or loan.term_unit != 'days':
                mismatches.append(f"loan.term: expected 2 days, found {loan.term_months} {loan.term_unit}")
            if abs(loan.interest_rate - Decimal('20.00')) > TOLERANCE:
                mismatches.append(f"loan.interest_rate: expected 20.00, found {loan.interest_rate}")
            if abs(loan.outstanding_principal - Decimal('100000.00')) > TOLERANCE:
                mismatches.append(f"loan.outstanding_principal: expected 100000.00, found {loan.outstanding_principal}")
            if loan.restructures.exists():
                mismatches.append("loan already has a LoanRestructure audit record — this loan has already been restructured, refusing to double-apply")
            pending = LoanRestructureRequest.objects.filter(loan=loan, status=LoanRestructureRequest.STATUS_PENDING)
            if pending.exists():
                mismatches.append(f"loan has {pending.count()} pending restructure request(s) already — resolve those through the normal approval flow instead")

            if mismatches:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.ERROR(
                    f'{LOAN_NUMBER} does not match the expected pre-restructure state — refusing:'
                ))
                for m in mismatches:
                    self.stdout.write(f'  {m}')
                return

            old_term, old_term_unit = loan.term_months, loan.term_unit
            old_rate = loan.interest_rate
            old_maturity = loan.maturity_date
            old_outstanding_interest = loan.outstanding_interest

            self.stdout.write(self.style.MIGRATE_HEADING(
                f'{LOAN_NUMBER} — extending term {old_term} {old_term_unit} -> {NEW_TERM} {old_term_unit}, '
                f'rate {old_rate}% -> derived-with-override {NEW_RATE}% (keeps total interest at '
                f'{old_outstanding_interest:,.2f}), authorized by {director.username} (id={director.id}).'
            ))

            if not apply_changes:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.WARNING('  DRY-RUN — nothing written. Re-run with --apply.\n'))
                return

            req = LoanRestructureRequest.objects.create(
                loan=loan,
                new_term=NEW_TERM,
                effective_date=timezone.localdate(),
                reason='Director-authorized restructure to 60 days at same total interest',
                notes=(
                    'Executed via management script. The original proposal (request #1) was '
                    'rejected 2026-09-10 ("On behalf of Israel") due to a miscommunication, '
                    'confirmed by the team to have actually been intended for approval. '
                    f'Re-submitted and approved directly by {director.username} on '
                    f'{timezone.localdate()}. new_rate=0.00 used deliberately so the existing '
                    f'{old_outstanding_interest:,.2f} carried-forward interest is unchanged — '
                    'no additional interest is charged for the term extension itself.'
                ),
                requested_by=director,
                owner=director,
                branch=loan.branch,
                tenant=loan.tenant,
            )

            restructure_record = loan.restructure(
                new_term=NEW_TERM,
                effective_date=req.effective_date,
                restructured_by=director,
                reason=req.reason,
                notes=req.notes,
                new_rate=NEW_RATE,
            )

            req.status = LoanRestructureRequest.STATUS_APPROVED
            req.reviewed_by = director
            req.reviewed_at = timezone.now()
            req.restructure = restructure_record
            req.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'restructure'])

            loan.refresh_from_db()

            self.stdout.write(self.style.SUCCESS(
                f'  Done. LoanRestructureRequest id={req.id} (approved), LoanRestructure id={restructure_record.id}.'
            ))
            self.stdout.write(f'  term: {old_term} {old_term_unit} -> {loan.term_months} {loan.term_unit}')
            self.stdout.write(f'  interest_rate: {old_rate}% -> {loan.interest_rate}%')
            self.stdout.write(f'  maturity_date: {old_maturity} -> {loan.maturity_date}')
            self.stdout.write(f'  outstanding_interest: {old_outstanding_interest:,.2f} -> {loan.outstanding_interest:,.2f}')
            self.stdout.write(f'  outstanding_principal: {loan.outstanding_principal:,.2f} (unchanged)')
            self.stdout.write(f'  days_in_arrears: {loan.days_in_arrears}  status: {loan.status}')
            self.stdout.write('  New schedule:')
            for row in loan.repayment_schedule.filter(status='pending').order_by('installment_number'):
                self.stdout.write(
                    f'    #{row.installment_number} due={row.due_date} total_due={row.total_due:,.2f} status={row.status}'
                )
