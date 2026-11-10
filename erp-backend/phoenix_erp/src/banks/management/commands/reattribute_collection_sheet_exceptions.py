"""
Re-attribute open "recorded, not in bank" exceptions that came from a
collection sheet to the sheet's credit officer.

Confirmed collection-sheet bank transfers are posted by the supervisor, so
until 2026-11-10 the exception's officer was the supervisor. Officers below
branch manager only see their OWN erp_only lines on Pending Bank Repayments,
so those lines were invisible to the officer who actually collected them.
New exceptions are attributed correctly (banks/officer_attribution.py); this
fixes the open ones. Dry run by default; safe to re-run.

Usage:
    python manage.py reattribute_collection_sheet_exceptions
    python manage.py reattribute_collection_sheet_exceptions --apply
    python manage.py reattribute_collection_sheet_exceptions --include-resolved --apply
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Point collection-sheet erp_only exceptions at the sheet's credit officer (dry run unless --apply)."

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Save the changes (default is a dry run).')
        parser.add_argument('--include-resolved', action='store_true', help='Also fix resolved exceptions (history).')

    def handle(self, *args, **opts):
        from banks.models import ReconciliationException
        from banks.officer_attribution import collecting_officers

        apply = opts['apply']
        qs = ReconciliationException.objects.filter(exception_type='erp_only', loan_payment_id__isnull=False)
        if not opts['include_resolved']:
            qs = qs.filter(resolved=False)
        rows = list(qs.values_list('id', 'loan_payment_id', 'officer_id'))
        officers = collecting_officers([r[1] for r in rows])

        changed = 0
        for exc_id, payment_id, current_officer_id in rows:
            officer = officers.get(payment_id)
            if officer is None or officer.pk == current_officer_id:
                continue
            changed += 1
            self.stdout.write(
                f'  {"" if apply else "[dry run] "}exception #{exc_id} (payment #{payment_id}): '
                f'officer {current_officer_id} -> {officer} (#{officer.pk})'
            )
            if apply:
                ReconciliationException.objects.filter(pk=exc_id).update(
                    officer_id=officer.pk, erp_branch_id=officer.branch_id,
                )

        verb = 'Updated' if apply else 'Would update'
        self.stdout.write(self.style.SUCCESS(f'{verb} {changed} exception(s).'))
        if changed and not apply:
            self.stdout.write('Re-run with --apply to save.')
