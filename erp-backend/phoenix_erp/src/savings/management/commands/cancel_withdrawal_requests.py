"""
Cancel stale savings withdrawal requests by id, including ones the
Withdrawals page cannot show (e.g. early requests saved without a tenant).

Uses the same rule as the Cancel button: only pending / partially-approved
requests with no approvals yet. Nothing is paid or posted; the request just
stops counting as an upcoming payout in the liquidity watch. A missing tenant
is filled in from the account so the cancelled request shows in history.

Find ids with:  python manage.py investigate_open_withdrawals --branch <name>

Usage:
    python manage.py cancel_withdrawal_requests --id 1 --id 2 --id 3 --reason "Duplicate test entries from July"
    python manage.py cancel_withdrawal_requests --id 1 --id 2 --id 3 --reason "..." --apply
    (optional) --user samuel   who the cancellation is recorded as (default: first superuser)
"""
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


class Command(BaseCommand):
    help = 'Cancel stale savings withdrawal requests by id (dry-run unless --apply).'

    def add_arguments(self, parser):
        parser.add_argument('--id', type=int, action='append', dest='ids', required=True)
        parser.add_argument('--reason', required=True, help='Why, kept on the request')
        parser.add_argument('--user', help='Username recorded as cancelling (default: first superuser)')
        parser.add_argument('--apply', action='store_true')

    def handle(self, *args, **opts):
        from common.managers import set_current_tenant
        from savings.models import SavingsWithdrawalRequest

        set_current_tenant(None)
        User = get_user_model()
        user = (User.objects.filter(username=opts['user']).first() if opts['user']
                else User.objects.filter(is_superuser=True).order_by('pk').first())
        if user is None:
            raise CommandError('Could not find the user to record this as (use --user).')

        found = {wr.pk: wr for wr in SavingsWithdrawalRequest.all_objects
                 .select_related('savings_account__client').filter(pk__in=opts['ids'])}
        missing = sorted(set(opts['ids']) - set(found))
        if missing:
            raise CommandError(f'No withdrawal request with id(s) {missing}')

        ok = True
        for pk in opts['ids']:
            wr = found[pk]
            client = getattr(wr.savings_account, 'client', None)
            line = (f'#{wr.pk}  NGN {wr.amount:,.2f}  {wr.get_status_display()}  '
                    f'{getattr(client, "full_name", "-")} / {wr.savings_account.account_number}')
            if wr.status not in (wr.STATUS_PENDING, wr.STATUS_PARTIAL) or wr.approvals_received > 0:
                ok = False
                self.stdout.write(self.style.ERROR(
                    f'{line}  -> cannot cancel: already approved or not pending (reject it from the page instead)'))
            else:
                self.stdout.write(f'{line}  -> will cancel')
        if not ok:
            raise CommandError('Nothing changed. Remove the ids that cannot be cancelled and run again.')

        if not opts['apply']:
            self.stdout.write(self.style.WARNING('\nDRY-RUN - nothing changed. Re-run with --apply.'))
            return

        with transaction.atomic():
            for pk in opts['ids']:
                wr = SavingsWithdrawalRequest.all_objects.select_for_update().get(pk=pk)
                if wr.tenant_id is None:
                    wr.tenant_id = wr.savings_account.tenant_id
                note = f'[Cancelled by {user.username}: {opts["reason"]}]'
                wr.description = f'{wr.description} {note}'.strip()
                wr.save(update_fields=['tenant', 'description', 'updated_at'])
                try:
                    wr.cancel(user)
                except ValidationError as exc:
                    raise CommandError(f'#{pk}: {exc.messages[0]}')
        self.stdout.write(self.style.SUCCESS(f'\nCancelled {len(opts["ids"])} request(s).'))
