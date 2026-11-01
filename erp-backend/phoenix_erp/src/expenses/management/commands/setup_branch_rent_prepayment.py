"""
Put a branch's EXISTING prepaid rent (already sitting in its Rent Prepayment
asset account) on the monthly release schedule, and post any month that is due
but hasn't been moved yet.

    python manage.py setup_branch_rent_prepayment --branch 2 --start 2026-07          # preview
    python manage.py setup_branch_rent_prepayment --branch 2 --start 2026-07 --commit

Everything except the start month is read from the ledger:

  prepaid account   ASSET account on the branch named like "rent prepay..."
  already released  credits to that account dated on/after the start month
                    (the manual JVs done so far)
  cycle total       current balance + already released
  expense account   the account those manual JVs debited (falls back to an
                    EXPENSE account on the branch named like "rent")
  months            cycle total / typical manual JV amount
                    (pass --months if there are no manual JVs yet, or to override)

The original payment into Rent Prepayment is NOT posted again. Months already
covered by manual JVs are not posted again: the schedule only posts
(what should be released by month k) - (already released).

Overrides: --prepaid-account-id, --expense-account-id, --months.
"""
import re
from collections import Counter
from datetime import date
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.db.models import Sum
from django.utils import timezone

from accounts.models import Account
from branches.models import Branch
from expenses.models import ExpenseCategory, PrepaidExpense
from expenses.services.prepaid_amortization import (
    plan_due_amortizations, post_due_amortizations, scheduled_cumulative,
)
from transactions.models import TransactionEntry

ZERO = Decimal('0.00')


class Command(BaseCommand):
    help = "Schedule a branch's existing prepaid rent for monthly release (preview unless --commit)."

    def add_arguments(self, parser):
        parser.add_argument('--branch', type=int, required=True, help='Branch id')
        parser.add_argument('--start', required=True, help='First month the rent covers, YYYY-MM')
        parser.add_argument('--months', type=int, help='Months the rent covers (default: inferred)')
        parser.add_argument(
            '--total',
            help='Rent amount for this cycle, when the prepaid account also holds other items '
                 '(default: balance + already released)')
        parser.add_argument('--prepaid-account-id', type=int)
        parser.add_argument('--expense-account-id', type=int)
        parser.add_argument('--as-of', help='Treat this date (YYYY-MM-DD) as today')
        parser.add_argument('--commit', action='store_true', help='Create the record and post due months')

    # ── helpers ────────────────────────────────────────────────────────────
    def _posted_entries(self, account):
        return TransactionEntry.objects.filter(account=account, posted=True)

    def _sum(self, qs):
        return qs.aggregate(s=Sum('amount'))['s'] or ZERO

    def _balance(self, account):
        e = self._posted_entries(account)
        return (self._sum(e.filter(side=TransactionEntry.DEBIT))
                - self._sum(e.filter(side=TransactionEntry.CREDIT)))

    def _pick_one(self, qs, what, flag):
        # "rent" as a word: plain icontains also matches "cuRRENT", "paRENT".
        items = [a for a in qs
                 if a.account_level != 'PARENT' and re.search(r'\brent\b', a.name, re.I)]
        if len(items) == 1:
            return items[0]
        if not items:
            raise CommandError(f'No {what} found on this branch. Pass {flag}.')
        balances = {a.id: self._balance(a) for a in items}
        with_money = [a for a in items if balances[a.id] != 0]
        if len(with_money) == 1:
            self.stdout.write(
                f"  ({len(items)} possible {what}s; using the only one with a balance)")
            return with_money[0]
        listing = '\n'.join(
            f'  id={a.id} {a.code} {a.name} ({a.account_level}) balance {balances[a.id]:,.2f}'
            for a in items)
        raise CommandError(f'More than one {what} found; pass {flag}:\n{listing}')

    # ── main ───────────────────────────────────────────────────────────────
    def handle(self, *args, **o):
        try:
            y, m = (int(x) for x in o['start'].split('-'))
            start = date(y, m, 1)
        except Exception:  # noqa: BLE001
            raise CommandError('--start must be YYYY-MM, e.g. 2026-07')
        as_of = date.fromisoformat(o['as_of']) if o['as_of'] else timezone.localdate()

        branch = Branch.objects.filter(pk=o['branch']).first()
        if not branch:
            raise CommandError(f"Branch {o['branch']} not found")
        w = self.stdout.write
        w(f"{'' if o['commit'] else 'PREVIEW — nothing will be written. '}"
          f"Branch {branch.pk} {branch.name}, rent from {start:%b %Y}, as of {as_of}")

        # 1. Rent Prepayment account
        if o['prepaid_account_id']:
            prepaid_acct = Account.objects.get(pk=o['prepaid_account_id'], branch=branch)
        else:
            prepaid_acct = self._pick_one(
                Account.objects.filter(branch=branch, account_type='ASSET',
                                       name__icontains='rent').filter(name__icontains='prepa'),
                'Rent Prepayment account', '--prepaid-account-id',
            )

        entries = self._posted_entries(prepaid_acct)
        debits = self._sum(entries.filter(side=TransactionEntry.DEBIT))
        credits = self._sum(entries.filter(side=TransactionEntry.CREDIT))
        balance = debits - credits

        manual = entries.filter(side=TransactionEntry.CREDIT, transaction__date__gte=start)
        released = self._sum(manual)
        total = balance + released
        if o['total']:
            given = Decimal(o['total'].replace(',', ''))
            if given > total:
                raise CommandError(
                    f'--total {given:,.2f} is more than the account holds for this cycle ({total:,.2f})')
            other = total - given
            total = given
        else:
            other = ZERO

        w(f"\nPrepaid account: id={prepaid_acct.id} {prepaid_acct.code} {prepaid_acct.name}")
        w(f"  balance now {balance:,.2f}; moved to expense since {start:%b %Y}: {released:,.2f}"
          f" in {manual.count()} entr{'y' if manual.count() == 1 else 'ies'}")
        w(f"  => this rent cycle total {total:,.2f}")
        w("  Payments into this account:")
        for e in entries.filter(side=TransactionEntry.DEBIT).select_related('transaction') \
                        .order_by('-transaction__date')[:5]:
            w(f"    {e.transaction.date}  {e.amount:,.2f}  {(e.transaction.description or '')[:70]}")
        if manual.exists():
            w("  Manual releases found:")
            for e in manual.select_related('transaction').order_by('transaction__date'):
                w(f"    {e.transaction.date}  {e.amount:,.2f}  {(e.transaction.description or '')[:70]}")

        if other:
            w(f"  => rent total given as {total:,.2f}; {other:,.2f} stays in the account untouched")
        elif entries.filter(side=TransactionEntry.DEBIT, transaction__date__gte=start).count() > 1:
            w(self.style.WARNING(
                "  ! More than one payment into this account since the start month. If any of "
                "them is not rent, re-run with --total <rent amount>."))
        if total <= 0:
            raise CommandError('Nothing left to schedule: the prepaid balance is zero or negative.')

        # 2. Expense account — whatever the manual JVs debited
        if o['expense_account_id']:
            expense_acct = Account.objects.get(pk=o['expense_account_id'], branch=branch)
        else:
            counter = Counter(
                TransactionEntry.objects
                .filter(transaction__in=manual.values('transaction'), side=TransactionEntry.DEBIT,
                        account__account_type='EXPENSE')
                .values_list('account_id', flat=True)
            )
            if counter:
                expense_acct = Account.objects.get(pk=counter.most_common(1)[0][0])
            else:
                expense_acct = self._pick_one(
                    Account.objects.filter(branch=branch, account_type='EXPENSE', name__icontains='rent'),
                    'rent EXPENSE account', '--expense-account-id',
                )
        if expense_acct.account_type != 'EXPENSE':
            raise CommandError(f'{expense_acct} is not an EXPENSE account')
        w(f"Expense account: id={expense_acct.id} {expense_acct.code} {expense_acct.name}")

        # 3. Months covered
        months = o['months']
        if not months:
            months_with_jv = len({(d.year, d.month) for d in manual.values_list('transaction__date', flat=True)})
            if not months_with_jv:
                raise CommandError(
                    'No manual releases found to infer the length from. '
                    'Pass --months (e.g. --months 12).'
                )
            monthly = released / months_with_jv
            months = int((total / monthly).quantize(Decimal('1')))
            w(f"Months covered (inferred): {months}  [{total:,.2f} / ~{monthly:,.2f} a month]")
        else:
            w(f"Months covered (given): {months}")
        if months < 1:
            raise CommandError('Months must be at least 1')
        last_month = start + relativedelta(months=months - 1)
        w(f"  schedule: {scheduled_cumulative(total, months, 1):,.2f} a month, "
          f"{start:%b %Y} to {last_month:%b %Y}")

        # 4. Rent category on this branch
        cat = (ExpenseCategory.objects.filter(branch=branch, prepaid_account=prepaid_acct).first()
               or ExpenseCategory.objects.filter(branch=branch, name__icontains='rent').first())
        cat_action = None
        if cat is None:
            cat_action = 'create'
            w("Category: none on this branch -> will create 'Rent' (code RENT)")
        else:
            if cat.expense_account_id != expense_acct.id:
                raise CommandError(
                    f"Category '{cat.name}' (id={cat.id}) posts to expense account "
                    f"{cat.expense_account}, not {expense_acct}. Fix the category or pass "
                    f"--expense-account-id {cat.expense_account_id}."
                )
            if cat.prepaid_account_id and cat.prepaid_account_id != prepaid_acct.id:
                raise CommandError(
                    f"Category '{cat.name}' (id={cat.id}) uses prepaid account "
                    f"{cat.prepaid_account}, not {prepaid_acct}."
                )
            if not cat.prepaid_account_id:
                cat_action = 'link'
                w(f"Category: '{cat.name}' (id={cat.id}) -> will link prepaid account")
            else:
                w(f"Category: '{cat.name}' (id={cat.id}) already linked")

        if PrepaidExpense.objects.filter(
            branch=branch, category__prepaid_account=prepaid_acct, auto_amortize=True,
            status__in=('active', 'partially_consumed'),
        ).exists():
            raise CommandError('This branch already has an active scheduled rent prepayment.')

        # 5. What would post now
        draft = PrepaidExpense(
            reference_number='(new)', total_amount=total, consumed_amount=released,
            auto_amortize=True, amortization_start_date=start, amortization_months=months,
        )
        plan = plan_due_amortizations(draft, as_of)
        w("\nJVs to post now (Dr expense / Cr prepaid):")
        for period_end, amount in plan:
            w(f"  {period_end}  {amount:,.2f}")
        if not plan:
            w("  none due yet")
        w(f"Rent left in prepaid after that: {total - released - sum((a for _, a in plan), ZERO):,.2f}")

        # Back-dated months must be open, or Transaction.post() refuses them.
        from accounts.models import Period
        closed = [pe for pe, _ in plan if Period.objects.filter(
            branch=branch, period_type=Period.MONTH, year=pe.year, month=pe.month, is_closed=True,
        ).exists()]
        if closed:
            raise CommandError(
                'These months are closed for this branch, so their JVs cannot be posted: '
                + ', '.join(f'{d:%b %Y}' for d in closed)
                + '. Reopen them first, or ask for a single catch-up JV in the current month.')

        if not o['commit']:
            w(self.style.WARNING('\nPreview only. Re-run with --commit to apply.'))
            return

        # 6. Apply
        from common.services.reference_service import ReferenceService
        with db_transaction.atomic():
            owner = prepaid_acct.owner
            tenant = getattr(branch, 'tenant', None)
            if cat_action == 'create':
                cat = ExpenseCategory.objects.create(
                    name='Rent', code='RENT', description='Office rent',
                    expense_account=expense_acct, prepaid_account=prepaid_acct,
                    branch=branch, owner=owner, tenant=tenant,
                )
            elif cat_action == 'link':
                cat.prepaid_account = prepaid_acct
                cat.save(update_fields=['prepaid_account'])

            prepaid = PrepaidExpense.objects.create(
                reference_number=ReferenceService.generate_reference(
                    module='expenses', model_name='prepaid_expense',
                    tenant=tenant or owner, branch=branch,
                ),
                category=cat,
                purchase_date=start,
                description=f'Office rent from {start:%b %Y} ({months} months) — existing prepayment',
                total_amount=total,
                consumed_amount=released,
                auto_amortize=True,
                amortization_start_date=start,
                amortization_months=months,
                is_posted=True,  # the asset is already on the books; don't post it again
                posted_at=timezone.now(),
                branch=branch, owner=owner, tenant=tenant,
            )
            posted = post_due_amortizations(prepaid.pk, as_of)

        w(self.style.SUCCESS(f"\nCreated {prepaid.reference_number}."))
        for period_end, amount, journal in posted:
            w(self.style.SUCCESS(f"  posted {period_end}  {amount:,.2f}  journal {journal.pk}"))
