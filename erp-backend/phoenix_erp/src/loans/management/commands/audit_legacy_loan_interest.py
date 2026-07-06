"""
Management command: audit_legacy_loan_interest

Legacy-imported loans (LoanAccount.origin='legacy_import') had their interest
already recognized in full, in a prior period, by the old system itself at
original disbursement (see import_legacy_data.py and krystartust web's own
loan/utils.py disbursement code). They should never have interest recognized
again in Phoenix.

Traced precisely rather than assumed: import_legacy_data.py never sets
outstanding_interest for imported loans (stays at its 0 default), and nothing
else populates it except disburse() (which legacy loans never go through) and
restructure(). Since record_payment() computes
interest_payment = min(payment, outstanding_interest), it's always 0 for these
loans today — so no legacy loan payment has actually been double-recognized as
income. This command is a forward-looking safeguard, not a correction: if a
legacy loan's outstanding_interest ever becomes nonzero in the future (via a
restructure, or a manual data edit), record_payment() would otherwise start
wrongly crediting Interest Income for it.

Step 1 (always runs, read-only): reports how many legacy loans currently have
outstanding_interest > 0. Expected: zero. Any that are found are listed
individually and left untouched — they need manual review, not an automatic fix.

Step 2 (only with --confirm): bulk-sets interest_recognized_at_disbursement=True
on every legacy loan where outstanding_interest == 0 (the normal case), so
record_payment() will never credit Interest Income for them even if
outstanding_interest is later changed.

Usage:
    python manage.py audit_legacy_loan_interest              # dry-run, report only
    python manage.py audit_legacy_loan_interest --confirm    # apply the safeguard
"""
from decimal import Decimal

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Audit legacy loans for unexpected outstanding_interest and safeguard future recognition.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--confirm', action='store_true',
            help='Apply the safeguard (set interest_recognized_at_disbursement=True). '
                 'Without this flag, only the diagnostic report runs.',
        )

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        confirm = options['confirm']

        legacy_loans = LoanAccount.objects.filter(
            origin=LoanAccount.ORIGIN_LEGACY_IMPORT,
            is_deleted=False,
        )
        total = legacy_loans.count()
        self.stdout.write(f'Found {total} legacy-imported loan(s).')

        # ── Step 1: diagnostic — flag anything with unexpected outstanding_interest ──
        unexpected = legacy_loans.filter(outstanding_interest__gt=Decimal('0.00'))
        unexpected_count = unexpected.count()

        if unexpected_count:
            self.stdout.write(self.style.WARNING(
                f'{unexpected_count} legacy loan(s) have outstanding_interest > 0 — '
                f'these need manual review before any safeguard is applied to them:'
            ))
            for loan in unexpected:
                self.stdout.write(
                    f'  [{loan.loan_number}] outstanding_interest={loan.outstanding_interest}'
                )
        else:
            self.stdout.write(self.style.SUCCESS(
                'No legacy loans have outstanding_interest > 0 — as expected, none of '
                'them have had interest recognized in Phoenix.'
            ))

        # ── Step 2: safeguard — only the normal (outstanding_interest == 0) case ──
        safe_to_flag = legacy_loans.filter(
            outstanding_interest=Decimal('0.00'),
            interest_recognized_at_disbursement=False,
        )
        safe_count = safe_to_flag.count()

        if not confirm:
            self.stdout.write(self.style.WARNING(
                f'DRY-RUN — would set interest_recognized_at_disbursement=True on '
                f'{safe_count} legacy loan(s). Re-run with --confirm to apply.'
            ))
            return

        updated = safe_to_flag.update(interest_recognized_at_disbursement=True)
        self.stdout.write(self.style.SUCCESS(
            f'Done. Safeguarded {updated} legacy loan(s); '
            f'{unexpected_count} left untouched for manual review.'
        ))
