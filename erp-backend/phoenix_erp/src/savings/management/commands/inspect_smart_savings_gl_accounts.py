"""
Management command: inspect_smart_savings_gl_accounts

Read-only. For a Smart Savings account that fails to post interest with
`Account matching query does not exist` (even via Account.objects.all_tenants()
— which bypasses tenant scoping but NOT soft-delete filtering, since that's
a separate manager-level concern, see common/base.py SoftDeleteModel), checks
whether either of the two accounts apply_smart_savings_interest tries to
post to has been soft-deleted (is_deleted=True) while something still
holds a FK to it — using Account.all_objects (include_deleted=True) to see
past the default manager's filter.

Usage:
    python manage.py inspect_smart_savings_gl_accounts SAV-DC0200-REG
"""
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Read-only: check whether either GL account a Smart Savings interest posting needs has been soft-deleted.'

    def add_arguments(self, parser):
        parser.add_argument('account_number', type=str)

    def handle(self, *args, **options):
        from savings.models import SavingsAccount
        from savings.tasks import _get_or_create_smart_savings_interest_expense_account
        from accounts.models import Account

        account_number = options['account_number']
        try:
            savings = SavingsAccount.all_objects.select_related('client', 'account', 'branch').get(
                account_number=account_number
            )
        except SavingsAccount.DoesNotExist:
            raise CommandError(f"No SavingsAccount found with account_number='{account_number}' (checked all_objects too)")

        self.stdout.write(self.style.MIGRATE_HEADING(f'SavingsAccount: {savings.account_number}'))
        self.stdout.write(f'  client       = {savings.client.full_name}')
        self.stdout.write(f'  is_deleted (SavingsAccount itself) = {savings.is_deleted}')
        self.stdout.write(f'  branch       = {savings.branch}')
        self.stdout.write(f'  account_id (FK target) = {savings.account_id}')

        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING("This account's own linked GL Account (savings.account)"))
        try:
            acct = Account.all_objects.get(pk=savings.account_id)
            self.stdout.write(f'  code={acct.code}  name={acct.name}  is_deleted={acct.is_deleted}  '
                               f'branch={acct.branch}  tenant={acct.tenant}  balance={acct.balance}')
            if acct.is_deleted:
                self.stdout.write(self.style.ERROR(
                    '  >>> THIS ACCOUNT IS SOFT-DELETED. SavingsAccount still points to it '
                    '(on_delete=PROTECT, so the FK is intact) — this is why journal.post() fails.'
                ))
        except Account.DoesNotExist:
            self.stdout.write(self.style.ERROR(
                f'  >>> No Account row exists at all with pk={savings.account_id}, even including '
                'soft-deleted ones. This is worse than soft-delete — the row is genuinely gone.'
            ))

        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING(
            "This branch's shared Smart Savings Interest Expense account "
            "(_get_or_create_smart_savings_interest_expense_account)"
        ))
        try:
            expense_acct = _get_or_create_smart_savings_interest_expense_account(
                owner=savings.owner, branch=savings.branch,
            )
            self.stdout.write(f'  pk={expense_acct.pk}  code={expense_acct.code}  name={expense_acct.name}  '
                               f'is_deleted={expense_acct.is_deleted}  branch={expense_acct.branch}  '
                               f'tenant={expense_acct.tenant}')
            # Re-fetch via all_objects to see if THIS specific pk is soft-deleted,
            # in case the lookup/get_or_create above silently created a fresh
            # duplicate rather than surfacing the deleted one.
            fresh = Account.all_objects.get(pk=expense_acct.pk)
            if fresh.is_deleted:
                self.stdout.write(self.style.ERROR(
                    '  >>> THIS ACCOUNT IS SOFT-DELETED (confirmed via all_objects on the same pk).'
                ))
        except Exception as exc:  # noqa: BLE001
            self.stdout.write(self.style.ERROR(f'  >>> _get_or_create_smart_savings_interest_expense_account itself raised: {exc!r}'))

        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING('Every Account with is_deleted=True for this branch (context)'))
        deleted_in_branch = Account.all_objects.filter(branch=savings.branch, is_deleted=True).order_by('code')
        deleted_list = list(deleted_in_branch)
        if not deleted_list:
            self.stdout.write('  None.')
        else:
            for a in deleted_list:
                self.stdout.write(f'  pk={a.pk}  code={a.code}  name={a.name}  account_type={a.account_type}')
