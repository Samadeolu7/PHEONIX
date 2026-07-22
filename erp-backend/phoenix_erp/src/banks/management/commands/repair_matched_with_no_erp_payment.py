"""
banks/management/commands/repair_matched_with_no_erp_payment.py
=================================================================
One-time (and safely re-runnable) repair for a distinct corruption shape
from the ghost-match backlog: a ReconciliationBankTransaction with
matched=True but matched_erp_payment_id IS NULL — a bank line flagged as
"matched" that is actually matched to nothing at all.

Root cause (now fixed — see AUTO_MATCH_MIN_CONFIDENCE / is_auto_committable
in banks/tasks.py's _persist_outcome): Java can report a match entry with
confidence='HIGH' but no erpPaymentId field. _persist_outcome used to
commit any HIGH-confidence match unconditionally, setting matched=True and
matched_erp_payment_id=None together. Every existing tool that looks for
"unattached" lines (audit_unattached_statement_lines, confirm_unambiguous_
ghost_matches, fix_unmatched_stale_resolved_exceptions) filters on
matched=False, so these rows were invisible to all of them — worse than an
ordinary ghost match, which at least carries a historical payment id.

Unlike a normal ghost match, there is nothing to preserve on the ERP side —
no id was ever attached, so there's no erp_only exception to reopen. This
command just calls the existing, audited ReconciliationBankTransaction.
unmatch() (banks/models.py) on each one, exactly as a director would from
the UI: it flips matched=False, records who/why, and reopens (or creates)
the bank_only exception so the line becomes a normal, visible candidate for
matching again.

Usage:
    python manage.py repair_matched_with_no_erp_payment --user-id <id> --dry-run
    python manage.py repair_matched_with_no_erp_payment --user-id <id> --apply

Always run --dry-run first and review the report before --apply.
"""
from django.core.management.base import BaseCommand, CommandError

REPAIR_REASON = (
    'Automated repair: this line was matched=True with NO ERP payment id '
    'attached at all (matched to nothing) — a malformed Java match response '
    'that used to be committed unconditionally (now fixed upstream — see '
    'AUTO_MATCH_MIN_CONFIDENCE / is_auto_committable in banks/tasks.py). '
    'Unmatched so it becomes a normal, visible candidate for matching again.'
)


class Command(BaseCommand):
    help = (
        "Finds ReconciliationBankTransaction rows with matched=True but "
        "matched_erp_payment_id IS NULL (matched to nothing) and unmatches them."
    )

    def add_arguments(self, parser):
        parser.add_argument('--user-id', type=int, required=True, help='User to attribute the unmatch action to.')
        parser.add_argument('--apply', action='store_true', help='Actually unmatch (default is a dry-run report).')
        parser.add_argument('--dry-run', action='store_true', help='Preview only — the default behaviour; accepted for explicitness.')
        parser.add_argument('--bank-account-id', type=int, default=None, help='Restrict to a single bank account.')

    def handle(self, *args, **options):
        from django.contrib.auth import get_user_model
        from django.core.exceptions import ValidationError

        from banks.models import ReconciliationBankTransaction

        User = get_user_model()
        try:
            acting_user = User.objects.get(pk=options['user_id'])
        except User.DoesNotExist:
            raise CommandError(f"No user with id={options['user_id']}")

        apply_changes = options['apply']
        bank_account_id = options['bank_account_id']

        qs = ReconciliationBankTransaction.objects.filter(
            matched=True, matched_erp_payment_id__isnull=True,
        ).select_related('bank_account').order_by('value_date')
        if bank_account_id:
            qs = qs.filter(bank_account_id=bank_account_id)

        rows = list(qs)
        if not rows:
            self.stdout.write(self.style.SUCCESS('No matched-with-nothing rows found.'))
            return

        self.stdout.write(f'Found {len(rows)} row(s) matched=True with no ERP payment id attached.\n')

        fixed = 0
        for tx in rows:
            self.stdout.write(
                f'  {"[DRY RUN] " if not apply_changes else ""}tx={tx.id} {tx.bank_account} '
                f'{tx.direction} ₦{tx.amount} on {tx.value_date} '
                f'(confidence={tx.match_confidence or "?"}, matched_at={tx.matched_at}) '
                f'— narration: {tx.narration[:100]!r}'
            )
            if not apply_changes:
                continue
            try:
                tx.unmatch(acting_user, REPAIR_REASON)
                fixed += 1
            except ValidationError as exc:
                self.stdout.write(self.style.WARNING(f'    skipped: {exc}'))

        if not apply_changes:
            self.stdout.write(f'\nWould unmatch {len(rows)} row(s). Re-run with --apply to actually fix them.')
        else:
            self.stdout.write(f'\nUnmatched {fixed} of {len(rows)} row(s).')
