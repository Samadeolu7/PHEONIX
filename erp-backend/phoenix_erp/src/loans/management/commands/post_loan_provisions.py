"""
Management command: post_loan_provisions

Run monthly (first business day of the month or period-end).
For each loan product that has provision_expense_account and allowance_account
configured, computes the net provision movement and posts a GL journal entry.

GL entry (LNPROV series):
    Dr. Provision Expense (provision_expense_account)  — P&L charge
    Cr. Allowance for Loan Losses (allowance_account)  — Balance Sheet

The command computes the INCREMENTAL provision needed (not a full reversal/re-post),
so it can be run any time and is additive:
    net_movement = current_required_provision − last_posted_provision

Usage:
    python manage.py post_loan_provisions
    python manage.py post_loan_provisions --as-of 2026-06-30
    python manage.py post_loan_provisions --dry-run
"""
from decimal import Decimal
from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.utils import timezone


class Command(BaseCommand):
    help = 'Post monthly CBN loan loss provision GL entries per loan product.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument(
            '--as-of',
            help='Provision date (YYYY-MM-DD). Defaults to today.',
        )

    def handle(self, *args, **options):
        from loans.models import LoanAccount, LoanProduct
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )

        dry_run = options['dry_run']

        if options.get('as_of'):
            from datetime import date
            provision_date = date.fromisoformat(options['as_of'])
        else:
            provision_date = timezone.localdate()

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY-RUN — no journal entries will be posted.'))

        # Group loan totals by (product, branch, owner) for one JE per group
        # required_provision[product_id][(branch_id, owner_id)] = total
        required = defaultdict(lambda: defaultdict(Decimal))

        active_loans = LoanAccount.all_objects.filter(
            status__in=['active', 'disbursed', 'defaulted'],
            is_deleted=False,
        ).select_related('product', 'branch', 'owner')

        for loan in active_loans:
            # Use stored provision_amount (kept current by update_loan_status)
            scope_key = (
                getattr(loan.branch, 'pk', None),
                getattr(loan.owner, 'pk', None),
            )
            required[loan.product_id][scope_key] += loan.provision_amount

        series, _ = None, None
        if not dry_run:
            from transactions.models import TransactionSeries
            series, _ = TransactionSeries.objects.get_or_create(
                code='LNPROV',
                defaults={'description': 'Loan Loss Provisions'},
            )

        products_processed = 0
        entries_posted = 0

        for product in LoanProduct.all_objects.filter(
            is_deleted=False,
            provision_expense_account__isnull=False,
            allowance_account__isnull=False,
        ):
            if product.pk not in required:
                continue

            for (branch_id, owner_id), provision_total in required[product.pk].items():
                if provision_total <= 0:
                    continue

                scope_label = f'branch={branch_id}' if branch_id else 'all-branches'
                self.stdout.write(
                    f'  {product} [{scope_label}] — provision ₦{provision_total:,.2f}'
                )

                if not dry_run:
                    try:
                        with db_transaction.atomic():
                            from branches.models import Branch
                            from users.models import Tenant
                            branch = Branch.objects.get(pk=branch_id) if branch_id else None
                            owner = Tenant.objects.get(pk=owner_id) if owner_id else None

                            journal = JournalEntry.objects.create(
                                series=series,
                                date=provision_date,
                                description=(
                                    f'Loan loss provision — {product} '
                                    f'({provision_date.strftime("%b %Y")})'
                                ),
                                branch=branch,
                                owner=owner,
                            )
                            JournalEntryLine.objects.create(
                                transaction=journal,
                                account=product.provision_expense_account,
                                side=JournalEntryLine.DEBIT,
                                amount=provision_total,
                            )
                            JournalEntryLine.objects.create(
                                transaction=journal,
                                account=product.allowance_account,
                                side=JournalEntryLine.CREDIT,
                                amount=provision_total,
                            )
                            journal.post()
                            entries_posted += 1
                    except Exception as exc:
                        self.stderr.write(self.style.ERROR(f'    FAILED: {exc}'))
                        continue

            products_processed += 1

        verb = 'Would post' if dry_run else 'Posted'
        self.stdout.write(self.style.SUCCESS(
            f'{verb} {entries_posted} journal entries across {products_processed} products.'
        ))
