"""
management/commands/backfill_daily_contribution_income.py

One-off correction for two bugs fixed in savings/services.py
(handle_first_deposit_income):

  1. The "already deposited this month?" check looked for a CREDIT on the
     savings account itself — but a correctly-diverted first-deposit-income
     charge never produces one (it credits the income account instead), so
     every deposit in a month kept being misclassified as "first" and swept
     to income. Fixed by tracking last_first_deposit_income_date separately.

  2. TransactionEntry.objects.create(..., description=...) raised a hard
     TypeError on every real invocation — TransactionEntry has never had a
     description field, all the way back to transactions/migrations/
     0001_initial.py. Both handle_first_deposit_income and its caller views
     are @transaction.atomic, so every attempt rolled back completely: no
     journal, no entries. Net effect — first_deposit_is_income has NEVER
     successfully swept a single deposit to income for any product. Every
     "first deposit of the month" landed in the client's savings balance
     like any ordinary deposit instead.

This command retroactively corrects that: for every is_daily_contribution
SavingsProduct, it (optionally) enables first_deposit_is_income, then for
each linked account walks every calendar month from the product's creation
date through the current month and, where the first deposit of that month
was never actually swept, posts a correcting journal moving it out of the
client's savings balance and into the income account.

Idempotent / safe to re-run:
  - Skips any (account, month) that already has a genuine SV1ST income
    posting — i.e. the now-fixed live code already handled it correctly.
  - Skips any (account, month) already corrected by a previous run of this
    command (tagged with the 'SV1BF' series).
  - Caps each correction at the account's CURRENT balance so it can never be
    pushed negative (e.g. the client has since withdrawn some of that
    deposit). Any shortfall is reported for manual follow-up, never silently
    dropped or partially misapplied without a warning.
  - Caps each correction at the client's own committed contribution amount
    (SavingsAccount.contribution_amount / ContributionSchedule.expected_amount
    for that date / the product default, in that priority) — mirrors the live
    handle_first_deposit_income() cap added alongside this fix. If the
    original deposit exceeded that amount (e.g. several days paid on one
    instrument), only the committed portion is swept; the excess was
    correctly a genuine deposit and is left in the savings balance.

Dry-run by default — it only reads and reports. Nothing is written unless
--apply is passed.

Usage:
    Dry run, all daily-contribution products:
        python manage.py backfill_daily_contribution_income \\
            --income-account=<Account id or code> --user=<username>

    Apply for real:
        python manage.py backfill_daily_contribution_income \\
            --income-account=<Account id or code> --user=<username> --apply

    Restrict to one product (recommended for the first real run):
        python manage.py backfill_daily_contribution_income \\
            --income-account=<Account id or code> --user=<username> \\
            --product=<Product id> --apply
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.utils import timezone

User = get_user_model()


def _month_start(d: date) -> date:
    return d.replace(day=1)


def _next_month(d: date) -> date:
    if d.month == 12:
        return d.replace(year=d.year + 1, month=1, day=1)
    return d.replace(month=d.month + 1, day=1)


class Command(BaseCommand):
    help = (
        "Retroactively sweep the first deposit of each calendar month on "
        "daily-contribution savings accounts into income, correcting for the "
        "first_deposit_is_income bugs that meant this never actually happened. "
        "Dry-run by default; pass --apply to write changes."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--income-account', required=True, dest='income_account',
            help='Account id or code of the INCOME GL account to sweep into '
                 '(used only for products that do not already have '
                 'first_deposit_income_account set).',
        )
        parser.add_argument(
            '--user', dest='username', default=None,
            help='Username to attribute corrections to (created_by / audit log). '
                 'Required when --apply is passed.',
        )
        parser.add_argument(
            '--product', type=int, default=None,
            help='Restrict to a single Product id (default: all '
                 'is_daily_contribution=True products).',
        )
        parser.add_argument(
            '--limit', type=int, default=None,
            help='Stop after this many accounts have at least one correction '
                 '(useful for a small first test batch).',
        )
        parser.add_argument(
            '--apply', action='store_true',
            help='Actually write the corrections. Without this flag, only a '
                 'report is printed — nothing is saved.',
        )
        parser.add_argument(
            '--as-of', default=None, dest='as_of',
            help='YYYY-MM-DD to treat as "today" for month-boundary purposes '
                 '(default: real today).',
        )

    def handle(self, *args, **options):
        from accounts.models import Account
        from savings.models import SavingsProduct, SavingsAccount, ContributionSchedule
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry,
            TransactionSeries,
        )
        from common.models import FinancialAuditLog, log_financial_event

        apply_changes = options['apply']

        acting_user = None
        if options['username']:
            try:
                acting_user = User.objects.get(username=options['username'])
            except User.DoesNotExist:
                raise CommandError(f"No user found with username {options['username']!r}.")
        if apply_changes and acting_user is None:
            raise CommandError("--user is required when passing --apply (for the audit trail).")

        today = date.fromisoformat(options['as_of']) if options['as_of'] else timezone.localdate()

        income_ref = options['income_account']
        income_account = None
        if income_ref.isdigit():
            income_account = Account.objects.filter(pk=int(income_ref)).first()
        if income_account is None:
            income_account = Account.objects.filter(code=income_ref).first()
        if income_account is None:
            raise CommandError(f"No Account found matching id/code {income_ref!r}.")
        if income_account.account_type != Account.INCOME:
            raise CommandError(
                f"Account {income_account} is type={income_account.account_type}, expected INCOME."
            )

        products_qs = SavingsProduct.objects.all_tenants().filter(is_daily_contribution=True)
        if options['product']:
            products_qs = products_qs.filter(product_id=options['product'])

        if not products_qs.exists():
            self.stdout.write(self.style.WARNING(
                'No is_daily_contribution=True SavingsProduct found. Nothing to do.'
            ))
            return

        grand_total_amount = Decimal('0.00')
        grand_total_corrections = 0
        grand_total_accounts_touched = 0
        shortfalls = []
        limit = options['limit']

        for config in products_qs.select_related('product'):
            product = config.product
            self.stdout.write(self.style.MIGRATE_HEADING(
                f"\n=== Product: {product.name} (id={product.pk}) ==="
            ))

            target_income_account = config.first_deposit_income_account or income_account
            if config.first_deposit_income_account and config.first_deposit_income_account_id != income_account.pk:
                self.stdout.write(self.style.WARNING(
                    f"  Product already has first_deposit_income_account="
                    f"{config.first_deposit_income_account} — keeping it "
                    f"(not overriding with --income-account)."
                ))

            if not config.first_deposit_is_income:
                self.stdout.write(
                    f"  first_deposit_is_income is False -> will enable (apply={apply_changes})."
                )
                if apply_changes:
                    config.first_deposit_is_income = True
                    config.first_deposit_income_account = target_income_account
                    config.full_clean()
                    config.save(update_fields=['first_deposit_is_income', 'first_deposit_income_account'])
            else:
                self.stdout.write("  first_deposit_is_income already True.")

            accounts = SavingsAccount.objects.all_tenants().filter(product=product).select_related(
                'account', 'client'
            )
            self.stdout.write(f"  {accounts.count()} savings account(s) on this product.")

            for sa in accounts:
                if limit is not None and grand_total_accounts_touched >= limit:
                    self.stdout.write(self.style.WARNING(f"\n--limit={limit} reached, stopping."))
                    self._print_summary(
                        grand_total_accounts_touched, grand_total_corrections,
                        grand_total_amount, shortfalls, apply_changes,
                    )
                    return

                start = _month_start(max(product.created_at.date(), sa.opened_on))
                cursor = start
                this_month = _month_start(today)
                account_total = Decimal('0.00')
                account_corrections = 0

                while cursor <= this_month:
                    year, month = cursor.year, cursor.month

                    # SV1ST journals are dated with the actual deposit date, so
                    # filtering by the journal's own date/year/month is correct
                    # for detecting a genuine live-code posting.
                    already_correct = JournalEntry.objects.filter(
                        series__code='SV1ST',
                        date__year=year, date__month=month,
                        description__contains=sa.account_number,
                    ).exists()
                    # SV1BF backfill corrections are always dated with the
                    # CORRECTION date (today), not the historical month they
                    # correct — so which month a correction covers must be read
                    # from the "YYYY-MM" tag embedded in its description, never
                    # from the journal's own date. Using the journal's date
                    # here previously caused every correction from the same
                    # backfill run to appear to have happened "this month",
                    # which made every month but the last look already-done.
                    already_backfilled = JournalEntry.objects.filter(
                        series__code='SV1BF',
                        description__contains=sa.account_number,
                    ).filter(
                        description__contains=f"{year}-{month:02d}",
                    ).exists()

                    if already_correct or already_backfilled:
                        cursor = _next_month(cursor)
                        continue

                    earliest_credit = (
                        TransactionEntry.objects
                        .filter(
                            account=sa.account,
                            side=TransactionEntry.CREDIT,
                            transaction__date__year=year,
                            transaction__date__month=month,
                        )
                        .exclude(transaction__series__code='SV1BF')
                        .select_related('transaction')
                        .order_by('transaction__date', 'id')
                        .first()
                    )

                    if not earliest_credit:
                        cursor = _next_month(cursor)
                        continue

                    original_amount = earliest_credit.amount

                    # Cap at what this client actually committed to that day —
                    # mirrors the live handle_first_deposit_income() cap. An
                    # officer may have posted several days' worth on one
                    # instrument; only the committed portion is income, the
                    # rest was correctly a genuine deposit and must NOT be
                    # swept out of the savings balance retroactively.
                    schedule_row = ContributionSchedule.objects.filter(
                        savings_account=sa, expected_date=earliest_credit.transaction.date,
                    ).first()
                    committed_amount = (
                        schedule_row.expected_amount if schedule_row
                        else sa.effective_contribution_amount
                    )
                    capped_by_commitment = bool(
                        committed_amount and committed_amount > Decimal('0.00')
                        and original_amount > committed_amount
                    )
                    intended_amount = committed_amount if capped_by_commitment else original_amount

                    current_balance = sa.account.balance
                    correction_amount = min(intended_amount, current_balance)

                    if correction_amount <= Decimal('0.00'):
                        shortfalls.append(
                            f"{sa.account_number}: {year}-{month:02d} intended sweep was "
                            f"NGN {intended_amount:,.2f} but current balance is "
                            f"NGN {current_balance:,.2f} — nothing available, skipped."
                        )
                        cursor = _next_month(cursor)
                        continue

                    if correction_amount < intended_amount:
                        shortfalls.append(
                            f"{sa.account_number}: {year}-{month:02d} intended sweep was "
                            f"NGN {intended_amount:,.2f} but only NGN {correction_amount:,.2f} "
                            f"available (balance reduced by withdrawals since) — partial sweep."
                        )

                    cap_note = (
                        f" (original deposit NGN {original_amount:,.2f}, capped to "
                        f"committed amount NGN {committed_amount:,.2f} — excess stays "
                        f"in savings balance)" if capped_by_commitment else
                        f" (original deposit NGN {original_amount:,.2f} on {earliest_credit.transaction.date})"
                    )
                    self.stdout.write(
                        f"    {sa.account_number} {year}-{month:02d}: sweep "
                        f"NGN {correction_amount:,.2f}{cap_note} [apply={apply_changes}]"
                    )

                    if apply_changes:
                        with db_transaction.atomic():
                            series, _ = TransactionSeries.objects.get_or_create(
                                code='SV1BF',
                                defaults={'description': 'First Deposit Income Backfill Correction'},
                            )
                            journal = JournalEntry.objects.create(
                                series=series,
                                date=today,
                                description=(
                                    f"Backfill: first-deposit-income correction - "
                                    f"{sa.account_number} ({sa.client.full_name}) - "
                                    f"{year}-{month:02d}, original deposit txn "
                                    f"#{earliest_credit.transaction_id} on "
                                    f"{earliest_credit.transaction.date}"
                                ),
                                owner=sa.owner,
                                branch=sa.branch,
                                created_by=acting_user,
                                tenant=sa.tenant,
                            )
                            TransactionEntry.objects.create(
                                transaction=journal,
                                account=sa.account,
                                side=TransactionEntry.DEBIT,
                                amount=correction_amount,
                            )
                            TransactionEntry.objects.create(
                                transaction=journal,
                                account=target_income_account,
                                side=TransactionEntry.CREDIT,
                                amount=correction_amount,
                            )
                            journal.post()
                            # journal.post()/entry.post() update the account's
                            # balance via a freshly-fetched Account instance,
                            # not sa.account itself — refresh it now so the
                            # NEXT month's cap check in this same loop reads
                            # the true post-correction balance, not a stale
                            # in-memory one.
                            sa.account.refresh_from_db()

                            if cursor == this_month:
                                sa.last_first_deposit_income_date = today
                                sa.save(update_fields=['last_first_deposit_income_date'])

                            log_financial_event(
                                FinancialAuditLog.SAVINGS_INCOME_BACKFILL,
                                acted_by=acting_user,
                                record_type='SavingsAccount',
                                record_id=str(sa.pk),
                                amount=correction_amount,
                                description=(
                                    f"Backfill first-deposit-income correction for "
                                    f"{sa.account_number}, {year}-{month:02d}"
                                ),
                                extra={
                                    'account_number': sa.account_number,
                                    'client_id': str(sa.client_id),
                                    'year_month': f'{year}-{month:02d}',
                                    'original_amount': str(original_amount),
                                    'corrected_amount': str(correction_amount),
                                    'original_transaction_id': earliest_credit.transaction_id,
                                    'journal_entry_id': journal.pk,
                                },
                            )

                    account_total += correction_amount
                    account_corrections += 1
                    cursor = _next_month(cursor)

                if account_corrections:
                    grand_total_accounts_touched += 1
                    grand_total_amount += account_total
                    grand_total_corrections += account_corrections

        self._print_summary(
            grand_total_accounts_touched, grand_total_corrections,
            grand_total_amount, shortfalls, apply_changes,
        )

    def _print_summary(self, accounts_touched, corrections, amount, shortfalls, apply_changes):
        self.stdout.write(self.style.MIGRATE_HEADING("\n=== Summary ==="))
        self.stdout.write(f"Accounts with at least one correction: {accounts_touched}")
        self.stdout.write(f"Total month-corrections: {corrections}")
        self.stdout.write(f"Total amount swept to income: NGN {amount:,.2f}")
        if shortfalls:
            self.stdout.write(self.style.WARNING(f"\n{len(shortfalls)} shortfall/partial-sweep warning(s):"))
            for s in shortfalls:
                self.stdout.write(f"  - {s}")
        if not apply_changes:
            self.stdout.write(self.style.WARNING(
                "\nDRY RUN — no changes written. Re-run with --apply to commit."
            ))
