"""
Management command: enroll_smart_savings

Opts an existing SavingsAccount into Smart Savings, with a backdated cycle
start_date (the account's real deposit date) instead of today — for
enrolling accounts that should have been Smart Savings all along.

created_at on the new SmartSavingsAccount row is NOT backdated — Django's
TimeStampedModel uses auto_now_add, which always stamps the real time of
the enrollment action regardless of what's passed in, correct for audit
purposes. Only the business-meaningful start_date field is backdated.

If the backdated start_date is already 3+ months in the past, the account
becomes immediately eligible for its first interest credit — this command
does NOT post that itself. Run apply_smart_savings_interest (or the
run_smart_savings_interest backstop command) separately afterward; its own
GL journal date is already set to maturity_date (not today), so the
interest posting itself is correctly backdated too.

Safety: opening_balance is set from the account's CURRENT balance, which
is only correct if the balance hasn't changed since start_date. If any
TransactionEntry exists against the account's GL between start_date and
today, this command refuses and tells you to review manually rather than
silently using a wrong opening_balance.

Usage:
    python manage.py enroll_smart_savings --account SAV-DC0369-REG --start-date 2026-05-11              # dry-run
    python manage.py enroll_smart_savings --account SAV-DC0369-REG --start-date 2026-05-11 --apply
"""
from datetime import datetime

from dateutil.relativedelta import relativedelta
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone


class Command(BaseCommand):
    help = 'Opt an existing SavingsAccount into Smart Savings with a backdated cycle start_date.'

    def add_arguments(self, parser):
        parser.add_argument('--account', dest='account_number', required=True)
        parser.add_argument(
            '--start-date', dest='start_date', required=True,
            help='YYYY-MM-DD — the real deposit date this cycle should be backdated to.',
        )
        parser.add_argument('--apply', action='store_true',
                             help='Actually create the SmartSavingsAccount. Without this, only previews.')

    def handle(self, *args, **options):
        from savings.models import SavingsAccount, SmartSavingsAccount
        from transactions.models import TransactionEntry

        apply_changes = options['apply']
        account_number = options['account_number']
        try:
            start_date = datetime.strptime(options['start_date'], '%Y-%m-%d').date()
        except ValueError:
            raise CommandError('--start-date must be YYYY-MM-DD')

        try:
            savings = SavingsAccount.objects.select_related('client', 'account').get(
                account_number=account_number
            )
        except SavingsAccount.DoesNotExist:
            raise CommandError(f"No SavingsAccount found with account_number='{account_number}'")

        existing = getattr(savings, 'smart_account', None)
        if existing is not None:
            raise CommandError(
                f'{account_number} already has a SmartSavingsAccount (is_active={existing.is_active}, '
                f'start_date={existing.start_date}) — refusing to create a second one.'
            )

        today = timezone.localdate()
        if start_date > today:
            raise CommandError(f'--start-date {start_date} is in the future.')

        # Guard: opening_balance = current_balance is only correct if nothing
        # has touched this account's GL since start_date. If it has, the true
        # balance AT start_date isn't simply "current_balance" and needs a
        # human to work out — refuse rather than silently guess.
        #
        # Excludes OBMIG: a migration entry represents the account's ORIGINAL
        # balance establishment, not a later change — backdating start_date
        # to before a migrated account's OBMIG date (the normal case, since
        # OBMIG is dated when Phoenix absorbed the balance, not the real
        # legacy-system deposit date) must not trip this guard.
        activity_since = TransactionEntry.objects.filter(
            account=savings.account,
            transaction__date__gt=start_date,
            transaction__is_reversed=False,
        ).exclude(transaction__series__code='OBMIG').select_related('transaction').order_by('transaction__date')
        activity_list = list(activity_since)
        if activity_list:
            self.stdout.write(self.style.ERROR(
                f'Refusing: {len(activity_list)} transaction(s) touched this account after {start_date} — '
                f'current_balance ({savings.current_balance:,.2f}) is NOT necessarily the balance at '
                f'start_date. Review manually:'
            ))
            for e in activity_list:
                self.stdout.write(
                    f'    {e.transaction.date}  {e.transaction.reference_number}  {e.side}  {e.amount:,.2f}  '
                    f'{e.transaction.description}'
                )
            return

        maturity_date = start_date + relativedelta(months=3)
        opening_balance = savings.current_balance

        self.stdout.write(self.style.MIGRATE_HEADING(f'Enroll {account_number} — {savings.client.full_name}'))
        self.stdout.write(f'  opening_balance (= current_balance, no activity since start_date) = {opening_balance:,.2f}')
        self.stdout.write(f'  start_date (backdated)   = {start_date}')
        self.stdout.write(f'  first maturity_date      = {maturity_date}')
        if today >= maturity_date:
            overdue_days = (today - maturity_date).days
            self.stdout.write(self.style.WARNING(
                f'  This cycle is ALREADY matured ({overdue_days}d overdue as of today) — the account will '
                f'be immediately eligible for its first interest credit. This command does NOT post that — '
                f'run apply_smart_savings_interest / run_smart_savings_interest --apply separately afterward.'
            ))
        else:
            self.stdout.write(f'  Not yet matured — {(maturity_date - today).days}d remaining in this cycle.')

        if not apply_changes:
            self.stdout.write(self.style.WARNING('\nDRY-RUN — no changes made. Re-run with --apply to enroll.'))
            return

        smart = SmartSavingsAccount.objects.create(
            savings=savings,
            is_active=True,
            start_date=start_date,
            opening_balance=opening_balance,
            last_interest_date=None,
        )
        self.stdout.write(self.style.SUCCESS(
            f'\nEnrolled. SmartSavingsAccount pk={smart.pk}, created_at={smart.created_at} '
            f'(today — correct for audit; only start_date is backdated).'
        ))
