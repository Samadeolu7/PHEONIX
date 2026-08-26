"""
Management command: run_smart_savings_interest

Manual backstop for savings.tasks.apply_smart_savings_interest — for when
a scheduled run was missed (or, as found 2026-08-26, this task had NEVER
successfully processed a single account in this codebase — a wrong
select_related() field name raised a FieldError on every candidate, every
run, plus a separate owner-scoping bug in GL account resolution that would
have kept failing even once the field name was fixed — see both fixes in
savings/tasks.py).

--dry-run (default): read-only preview of every matured, active Smart
Savings account, the interest that would be credited, and whether a
manual Journal Voucher already appears to cover the cycle (in which case
the real task would skip it rather than double-credit) — no writes.

--apply: runs the real task function synchronously, in-process (not via
Celery's async dispatch, so this works even if the beat/worker pipeline
itself is the thing broken) — the exact same code path the daily cron
uses, so a successful run here is real evidence the underlying bug is
fixed, not just that this command has different logic.

Usage:
    python manage.py run_smart_savings_interest              # dry-run
    python manage.py run_smart_savings_interest --apply
"""
from decimal import Decimal, ROUND_HALF_UP

from dateutil.relativedelta import relativedelta
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = 'Preview (default) or run the Smart Savings interest job without waiting for the daily cron.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                             help='Actually run the job and post real GL entries. Without this, only previews.')

    def handle(self, *args, **options):
        from savings.models import SmartSavingsAccount
        from transactions.models import TransactionEntry

        apply_changes = options['apply']
        today = timezone.localdate()

        candidates = (
            SmartSavingsAccount.objects
            .filter(is_active=True, start_date__lte=today - relativedelta(months=3))
            .select_related('savings', 'savings__client', 'savings__account')
            .order_by('start_date')
        )

        self.stdout.write(f'{candidates.count()} active, matured Smart Savings account(s) found.')
        for acct in candidates:
            maturity_date = acct.start_date + relativedelta(months=3)
            base_balance = (
                acct.opening_balance if acct.opening_balance is not None
                else acct.savings.current_balance
            )
            overdue_days = (today - maturity_date).days
            if base_balance is None or base_balance <= 0:
                self.stdout.write(
                    f'  {acct.savings.account_number:20} {acct.savings.client.full_name:30} '
                    f'base_balance={base_balance}  -- would SKIP (no positive balance) and reset cycle'
                )
                continue

            manual_jv = TransactionEntry.objects.filter(
                account=acct.savings.account,
                transaction__series__code='JV',
                transaction__date__gte=acct.start_date,
                transaction__is_reversed=False,
            ).select_related('transaction').first()
            if manual_jv is not None:
                self.stdout.write(self.style.WARNING(
                    f'  {acct.savings.account_number:20} {acct.savings.client.full_name:30} '
                    f'-- would SKIP posting (manual JV {manual_jv.transaction.reference_number} on '
                    f'{manual_jv.transaction.date} already appears to cover this cycle) and reset cycle only'
                ))
                continue

            interest = (base_balance * Decimal('0.06')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            self.stdout.write(
                f'  {acct.savings.account_number:20} {acct.savings.client.full_name:30} '
                f'base_balance={base_balance:,.2f}  interest(6%)={interest:,.2f}  '
                f'overdue_by={overdue_days}d  maturity_date={maturity_date}'
            )

        if not apply_changes:
            self.stdout.write(self.style.WARNING(
                '\nDRY-RUN — no changes made. Re-run with --apply to actually post interest '
                '(runs the real apply_smart_savings_interest task synchronously, in-process).'
            ))
            return

        self.stdout.write(self.style.WARNING('\nApplying — running apply_smart_savings_interest now...'))
        from savings.tasks import apply_smart_savings_interest
        result = apply_smart_savings_interest()
        self.stdout.write(self.style.SUCCESS(f'Done. {result}'))
