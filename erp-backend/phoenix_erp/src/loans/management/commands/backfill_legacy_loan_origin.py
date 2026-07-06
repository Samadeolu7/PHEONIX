"""
Management command: backfill_legacy_loan_origin

LoanAccount.origin only exists as of this Phoenix release. Any legacy-imported
loan created by import_legacy_data.py BEFORE this field existed defaults to
'native' — never retroactively tagged 'legacy_import'. That silently breaks
audit_legacy_loan_interest (and any future reporting that relies on origin),
since it only ever looks at loans already tagged 'legacy_import'.

Identifies legacy loans retroactively using two independent signals that must
BOTH agree before retagging:
  1. disbursement_journal_entry IS NULL — legacy loans never call disburse()
     (import_legacy_data.py creates them directly), while every native loan
     always gets this FK set inside disburse().
  2. loan_number matches ^LN-\\d+$ — legacy loans are named f"LN-{old_id}"
     (import_legacy_data.py:_import_loans), native loans are named
     f"LN-{date}-{6-char-hex}" (loans/views.py) and never match this pattern.

Loans where the two signals disagree (no disbursement_journal_entry, but a
native-style loan_number) are reported but left untouched — could be old
test/seed data or a different creation path; needs manual review, not a guess.

Run this BEFORE audit_legacy_loan_interest.

Usage:
    python manage.py backfill_legacy_loan_origin              # dry-run, report only
    python manage.py backfill_legacy_loan_origin --confirm    # apply the retagging
"""
import re

from django.core.management.base import BaseCommand

_LEGACY_LOAN_NUMBER_RE = re.compile(r'^LN-\d+$')


class Command(BaseCommand):
    help = 'Retag pre-existing legacy-imported loans with origin=legacy_import.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--confirm', action='store_true',
            help='Apply the retagging. Without this flag, only the report runs.',
        )

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        confirm = options['confirm']

        candidates = LoanAccount.objects.filter(
            disbursement_journal_entry__isnull=True,
            origin=LoanAccount.ORIGIN_NATIVE,
            is_deleted=False,
        )
        total = candidates.count()
        self.stdout.write(f'Found {total} loan(s) with no disbursement_journal_entry, currently origin=native.')

        confident_ids = []
        ambiguous = []
        for loan in candidates.only('id', 'loan_number'):
            if _LEGACY_LOAN_NUMBER_RE.match(loan.loan_number):
                confident_ids.append(loan.id)
            else:
                ambiguous.append(loan)

        if ambiguous:
            self.stdout.write(self.style.WARNING(
                f'{len(ambiguous)} loan(s) have no disbursement_journal_entry but a '
                f'non-legacy-style loan_number — left untouched, needs manual review:'
            ))
            for loan in ambiguous:
                self.stdout.write(f'  [{loan.loan_number}] id={loan.id}')

        if not confirm:
            self.stdout.write(self.style.WARNING(
                f'DRY-RUN — would retag {len(confident_ids)} loan(s) to '
                f'origin=legacy_import. Re-run with --confirm to apply.'
            ))
            return

        updated = LoanAccount.objects.filter(id__in=confident_ids).update(
            origin=LoanAccount.ORIGIN_LEGACY_IMPORT,
        )
        self.stdout.write(self.style.SUCCESS(
            f'Done. Retagged {updated} loan(s) to origin=legacy_import; '
            f'{len(ambiguous)} left untouched for manual review.'
        ))
