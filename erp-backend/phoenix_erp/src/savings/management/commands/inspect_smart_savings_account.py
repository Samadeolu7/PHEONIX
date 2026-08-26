"""
Management command: inspect_smart_savings_account

Read-only diagnostic for a Smart Savings account that appears overdue for
its 3-month interest credit. Checks, in order:

  1. Does the SavingsAccount have a linked SmartSavingsAccount at all
     (it's an opt-in wrapper — "Auto Renew" on the base SavingsAccount is
     unrelated and does not imply one exists)?
  2. If it does: is_active, start_date, computed maturity_date, whether
     apply_smart_savings_interest's own maturity filter would pick it up,
     last_interest_date, opening_balance vs current balance.
  3. Is the 'apply-smart-savings-interest' PeriodicTask enabled, and when
     did it last actually run (django_celery_beat tracks last_run_at)?
  4. A portfolio-wide scan: every SmartSavingsAccount that's active and
     matured right now, to tell whether this is a one-off or systemic gap.

Usage:
    python manage.py inspect_smart_savings_account SAV-DC0369-REG
"""
from dateutil.relativedelta import relativedelta
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone


class Command(BaseCommand):
    help = 'Read-only diagnostic for why a Smart Savings account has not received its interest.'

    def add_arguments(self, parser):
        parser.add_argument('account_number', type=str)

    def handle(self, *args, **options):
        from savings.models import SavingsAccount, SmartSavingsAccount

        today = timezone.localdate()
        account_number = options['account_number']

        try:
            savings = SavingsAccount.objects.select_related('client', 'account', 'product').get(
                account_number=account_number
            )
        except SavingsAccount.DoesNotExist:
            raise CommandError(f"No SavingsAccount found with account_number='{account_number}'")

        self.stdout.write(self.style.MIGRATE_HEADING(f'SavingsAccount: {savings.account_number}'))
        self.stdout.write(f'  client              = {savings.client.full_name}')
        self.stdout.write(f'  product             = {savings.product.name}')
        self.stdout.write(f'  status              = {savings.status}')
        self.stdout.write(f'  opened_on           = {savings.opened_on}')
        self.stdout.write(f'  auto_renew          = {savings.auto_renew}  (base-account field — unrelated to Smart Savings opt-in)')
        self.stdout.write(f'  current_balance     = {savings.current_balance}')
        self.stdout.write(f'  interest_rate       = {savings.interest_rate}  (unused by Smart Savings — it always applies a flat 6%)')

        self.stdout.write('')
        smart = getattr(savings, 'smart_account', None)
        if smart is None:
            self.stdout.write(self.style.ERROR(
                '  No SmartSavingsAccount linked to this savings account at all — '
                'it was never opted in, so neither apply_smart_savings_interest nor '
                'anything else will ever credit it. This is a provisioning gap, not '
                'a scheduling failure.'
            ))
        else:
            maturity_date = smart.start_date + relativedelta(months=3)
            would_be_picked_up = smart.is_active and smart.start_date <= today - relativedelta(months=3)
            self.stdout.write(self.style.MIGRATE_HEADING('SmartSavingsAccount'))
            self.stdout.write(f'  is_active           = {smart.is_active}')
            self.stdout.write(f'  start_date          = {smart.start_date}')
            self.stdout.write(f'  maturity_date       = {maturity_date}')
            self.stdout.write(f'  matured (today>=maturity) = {today >= maturity_date}')
            self.stdout.write(f'  opening_balance     = {smart.opening_balance}')
            self.stdout.write(f'  last_interest_date  = {smart.last_interest_date}')
            self.stdout.write(
                f'  would apply_smart_savings_interest\'s own filter pick this up today? '
                f'{self.style.SUCCESS("YES") if would_be_picked_up else self.style.ERROR("NO")}'
            )
            events = list(smart.events.order_by('-created_at')[:10])
            self.stdout.write(f'  recent SmartSavingsEvent rows ({len(events)}):')
            for e in events:
                self.stdout.write(f'    {e.created_at:%Y-%m-%d %H:%M}  {e.event_type:8}  ₦{e.amount:,.2f}  {e.details}')
            if not events:
                self.stdout.write('    (none — this account has never had interest or a penalty applied)')

        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING('apply-smart-savings-interest PeriodicTask'))
        try:
            from django_celery_beat.models import PeriodicTask
            pt = PeriodicTask.objects.filter(name='apply-smart-savings-interest').first()
            if pt is None:
                self.stdout.write(self.style.ERROR('  No PeriodicTask row named "apply-smart-savings-interest" exists at all.'))
            else:
                self.stdout.write(f'  enabled             = {pt.enabled}')
                self.stdout.write(f'  task                = {pt.task}')
                self.stdout.write(f'  crontab             = {pt.crontab}')
                self.stdout.write(f'  last_run_at         = {pt.last_run_at}')
                self.stdout.write(f'  total_run_count     = {pt.total_run_count}')
        except Exception as exc:  # noqa: BLE001
            self.stdout.write(self.style.ERROR(f'  Could not inspect PeriodicTask: {exc}'))

        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING('Portfolio-wide: every active, matured SmartSavingsAccount right now'))
        matured_qs = SmartSavingsAccount.objects.filter(
            is_active=True, start_date__lte=today - relativedelta(months=3),
        ).select_related('savings', 'savings__client').order_by('start_date')
        matured_list = list(matured_qs)
        if not matured_list:
            self.stdout.write(self.style.SUCCESS('  None — every active Smart Savings account is within its current cycle.'))
        else:
            self.stdout.write(self.style.WARNING(
                f'  {len(matured_list)} account(s) are active, matured, and (per the task\'s own filter) '
                'should be picked up on the next run:'
            ))
            for s in matured_list:
                overdue_days = (today - (s.start_date + relativedelta(months=3))).days
                self.stdout.write(
                    f'    {s.savings.account_number:20} {s.savings.client.full_name:30} '
                    f'start={s.start_date}  last_interest_date={s.last_interest_date}  '
                    f'overdue_by={overdue_days}d'
                )
