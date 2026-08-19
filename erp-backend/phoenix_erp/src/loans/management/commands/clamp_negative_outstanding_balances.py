"""
Management command: clamp_negative_outstanding_balances

Unblocks retire_stale_legacy_schedule_rows on loans like LN-722: that tool
drains a per-component "pool" starting at loan.outstanding_principal/
_interest/_fees/_penalties, then verifies the schedule's post-retirement
remaining matches. A schedule-derived remaining can never be negative (it's
built from real due/paid amounts), so if a loan's outstanding_* is already
negative (see the pre-existing [[project_orphaned_loan_repayment_journals]]
/ LN-714 investigation: "real bug is negative outstanding_interest from
legacy-import seeding" — audit_negative_outstanding_balances finds the full
list), verification can NEVER pass for that component, no matter how
correctly everything else reconciles. LN-722 specifically fails retirement
this way: outstanding_interest=-2,086.67 poisons the whole 4-component check
even though principal/fees/penalty would otherwise retire cleanly.

This clamps any negative outstanding_principal/_interest/_fees/_penalties up
to 0.00 — the minimal, safe correction (a client can never genuinely owe
negative interest/principal/fees/penalty; the negative figure is itself the
bug, not a real balance to preserve). No GL entry: these are business-field
corrections, not money moving — same rationale as
correct_principal_penalty_misallocation's "no GL entry" section. Does NOT
attempt to explain or backfill WHY the field went negative (that's the
separate legacy-import-seeding investigation) — it only removes the
impossible negative value so downstream tools (retire_stale_legacy_schedule_
rows, provisioning, PAR reporting) stop tripping on it.

--legacy-only restricts --batch to origin=legacy_import loans, where the
negative-balance mechanism is understood (the one-time migration script
seeded these fields without cross-checking real schedule/payment data —
see the LN-714 investigation). Loans created after the import (e.g. the
LN-YYYYMMDD-xxxxxx numbering) reaching this state is a DIFFERENT, live,
unexplained problem — clamping those without knowing why would erase the
only evidence of what may be an ongoing bug, and would silently discard
what could be a client's genuine overpayment instead of crediting it
somewhere. Use --legacy-only until non-legacy negatives are diagnosed.

Usage:
    python manage.py clamp_negative_outstanding_balances --loan LN-722     # dry-run
    python manage.py clamp_negative_outstanding_balances --loan LN-722 --apply
    python manage.py clamp_negative_outstanding_balances --batch           # dry-run, all
    python manage.py clamp_negative_outstanding_balances --batch --apply
    python manage.py clamp_negative_outstanding_balances --batch --legacy-only --apply
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.db.models import Q

FIELDS = ['outstanding_principal', 'outstanding_interest', 'outstanding_fees', 'outstanding_penalties']


class Command(BaseCommand):
    help = (
        'Clamp any negative outstanding_principal/_interest/_fees/_penalties up to 0.00. '
        'No GL entry — business-field correction only, unblocks retire_stale_legacy_schedule_rows '
        'and other tools that assume these fields are never negative.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only correct a single loan by loan_number.')
        parser.add_argument('--batch', action='store_true',
                             help='Correct every loan with any negative outstanding_* field.')
        parser.add_argument('--legacy-only', action='store_true',
                             help='With --batch, restrict to origin=legacy_import loans only '
                                  '(the understood-cause group — see module docstring).')
        parser.add_argument('--apply', action='store_true',
                             help='Actually write the correction. Without this, only previews.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        loan_number = options['loan_number']
        batch = options['batch']
        legacy_only = options['legacy_only']
        apply_changes = options['apply']

        if bool(loan_number) == bool(batch):
            raise CommandError('Pass exactly one of --loan <number> or --batch.')
        if legacy_only and not batch:
            raise CommandError('--legacy-only only applies with --batch.')

        loans_qs = LoanAccount.all_objects.filter(is_deleted=False).filter(
            Q(outstanding_principal__lt=0) | Q(outstanding_interest__lt=0)
            | Q(outstanding_fees__lt=0) | Q(outstanding_penalties__lt=0)
        ).order_by('loan_number')
        if legacy_only:
            loans_qs = loans_qs.filter(origin=LoanAccount.ORIGIN_LEGACY_IMPORT)
        if loan_number:
            loans_qs = LoanAccount.all_objects.filter(
                is_deleted=False, loan_number=loan_number,
            )
            if not loans_qs.exists():
                raise CommandError(f'Loan {loan_number} not found.')

        applied, dry_ran, skipped = 0, 0, 0
        for loan in loans_qs.iterator():
            result = self._process_loan(loan, apply_changes)
            if result == 'applied':
                applied += 1
            elif result == 'dry_run_ok':
                dry_ran += 1
            else:
                skipped += 1

        self.stdout.write('')
        if apply_changes:
            self.stdout.write(self.style.SUCCESS(f'Done. applied={applied} unaffected={skipped}'))
        else:
            self.stdout.write(self.style.WARNING(
                f'DRY-RUN done. would_apply={dry_ran} unaffected={skipped} — re-run with --apply to write.'
            ))

    def _process_loan(self, loan, apply_changes):
        from common.models import FinancialAuditLog, log_financial_event

        loan_number = loan.loan_number

        with db_transaction.atomic():
            sid = db_transaction.savepoint()
            loan = type(loan).all_objects.select_for_update().get(pk=loan.pk)

            clamps = {}
            for field in FIELDS:
                value = getattr(loan, field)
                if value < 0:
                    clamps[field] = value

            if not clamps:
                db_transaction.savepoint_rollback(sid)
                return 'unaffected'

            self.stdout.write(
                f'[{loan_number}] pk={loan.pk}  ' +
                '  '.join(f'{f}: {v:,.2f} -> 0.00' for f, v in clamps.items())
            )

            if not apply_changes:
                db_transaction.savepoint_rollback(sid)
                return 'dry_run_ok'

            for field in clamps:
                setattr(loan, field, Decimal('0.00'))
            loan.save(update_fields=list(clamps.keys()) + ['updated_at'])

            log_financial_event(
                FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                acted_by=None,
                record_type='LoanAccount',
                record_id=str(loan.pk),
                amount=sum(abs(v) for v in clamps.values()),
                description=(
                    f'Clamped negative outstanding balance(s) to 0.00 — {loan_number}: ' +
                    ', '.join(f'{f}={v:,.2f}' for f, v in clamps.items())
                ),
                extra={
                    'loan_number': loan_number,
                    'clamped_fields': {f: str(v) for f, v in clamps.items()},
                    'source_command': 'clamp_negative_outstanding_balances',
                },
            )

            db_transaction.savepoint_commit(sid)
            self.stdout.write(self.style.SUCCESS(f'  [{loan_number}] Applied.'))
            return 'applied'
