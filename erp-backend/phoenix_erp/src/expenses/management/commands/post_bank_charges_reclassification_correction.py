"""
expenses/management/commands/post_bank_charges_reclassification_correction.py
================================================================================
Corrects the HISTORICAL GL impact of the bug found by
audit_bank_charges_category_accounts (2026-09): the "Bank Charges"
ExpenseCategory in one or more branches was linked to the wrong
expense_account (confirmed case: HO/Orimerunmu's category pointed to
"Payroll Related Expenses (2026)" instead of that branch's own real
"Bank Charges (2026)" account), so every bank-charge expense posted through
it debited the wrong GL line. fix_bank_charges_category_link corrects the
category's link for FUTURE postings; this command corrects the ALREADY-
POSTED ones, which that relink does not touch.

Does not trust the category's CURRENT link (it may already have been fixed
by fix_bank_charges_category_link, which only changes routing for new
expenses — already-posted ones still show category_id unchanged, still
findable this way) or assume a hardcoded wrong-account name. Instead, for
every is_posted Expense whose category is named "Bank Charges", it walks to
the ACTUAL journal entry that was posted (via the linked BankPayment's own
journal_entry, exactly as post_payment() created it) and reads the real
debit account from there — the GL-anchor method (trust what was actually
posted over any business-field bookkeeping), not the current category
state. Only expenses whose real posted debit account doesn't look like a
bank-charges account are included.

Groups by (branch, wrong_account) and posts ONE aggregate correcting entry
per group — not one per expense — since this is a straightforward two-
account reclassification (unlike e.g. draft_penalty_income_reclass, which
needs one entry per loan because each loan has its own dedicated
receivable account; here every affected expense in a branch shares the
same wrong account and the same correct destination):

    Dr. Bank Charges (that branch's real account)      — recognizes the true expense line
    Cr. Payroll Related Expenses (or whatever was actually debited) — reverses the mispost

SAFETY:
  - Dry-run by default — prints the full per-branch breakdown and grand
    total, writes nothing. Re-run with --apply to actually post.
  - IDEMPOTENT across re-runs: checks FinancialAuditLog(JOURNAL_POST,
    extra__source_command=..., extra__branch_id=...) before posting, so an
    already-corrected branch is skipped rather than double-corrected.
  - Refuses (loudly, not silently) to guess a branch's real "Bank Charges"
    account if more than one or zero exist under that exact name — you'd
    need to resolve that ambiguity by hand first.
  - Every posted correction is logged via FinancialAuditLog(JOURNAL_POST)
    with the branch, amount, and the list of expense reference numbers it
    covers.

Usage:
    python manage.py post_bank_charges_reclassification_correction              # preview
    python manage.py post_bank_charges_reclassification_correction --apply      # posts
"""
from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.utils import timezone

SERIES_CODE = 'BCCOR'
SOURCE_COMMAND = 'post_bank_charges_reclassification_correction'


class Command(BaseCommand):
    help = (
        "Posts correcting journal entries reclassifying already-posted "
        "bank-charge expenses out of whatever wrong account they were "
        "debited to, into the branch's real Bank Charges account."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply', action='store_true',
            help='Actually post the correcting entries. Without this, only previews.',
        )

    def handle(self, *args, **options):
        from accounts.models import Account
        from banks.models import BankPayment
        from expenses.models import Expense
        from common.models import FinancialAuditLog, log_financial_event
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )

        apply_changes = options['apply']

        candidates = (
            Expense.objects
            .filter(category__name__iexact='Bank Charges', is_posted=True)
            .select_related('branch', 'tenant', 'owner')
        )

        # (branch_id, wrong_account_id) -> {'branch':, 'wrong_account':, 'expenses': [(expense, amount)]}
        groups = defaultdict(lambda: {'branch': None, 'wrong_account': None, 'items': []})

        for expense in candidates:
            payment = expense.bank_payments.filter(
                status='posted', journal_entry__isnull=False,
            ).order_by('-created_at').first()
            if not payment:
                continue

            debit_entry = payment.journal_entry.entries.filter(
                side=JournalEntryLine.DEBIT,
            ).select_related('account').first()
            if not debit_entry:
                continue

            if 'bank charg' in (debit_entry.account.name or '').strip().lower():
                continue  # this one was posted correctly

            key = (expense.branch_id, debit_entry.account_id)
            group = groups[key]
            group['branch'] = expense.branch
            group['wrong_account'] = debit_entry.account
            group['items'].append((expense, debit_entry.amount))

        if not groups:
            self.stdout.write(self.style.SUCCESS(
                'No already-posted bank-charge expenses found debited to the wrong account.'
            ))
            return

        series, _ = TransactionSeries.objects.get_or_create(
            code=SERIES_CODE, defaults={'description': 'Bank Charges Reclassification Corrections'},
        )

        grand_total = Decimal('0.00')

        for (branch_id, wrong_account_id), group in groups.items():
            branch = group['branch']
            wrong_account = group['wrong_account']
            items = group['items']
            total = sum((amt for _, amt in items), Decimal('0.00'))
            grand_total += total

            already_done = FinancialAuditLog.objects.filter(
                event_type=FinancialAuditLog.JOURNAL_POST,
                extra__source_command=SOURCE_COMMAND,
                extra__branch_id=branch_id,
                extra__wrong_account_id=wrong_account_id,
            ).exists()
            if already_done:
                self.stdout.write(
                    f'  branch={branch}  wrong_account={wrong_account.name} ({wrong_account.code}): '
                    f'already corrected in a previous run — skipping.'
                )
                continue

            correct_accounts = list(Account.objects.filter(
                branch=branch, name__iexact='Bank Charges (2026)', account_type='EXPENSE',
            ))
            if len(correct_accounts) != 1:
                self.stdout.write(self.style.ERROR(
                    f'  branch={branch}: found {len(correct_accounts)} accounts named '
                    f'"Bank Charges (2026)" (expected exactly 1) — SKIPPING, resolve manually.'
                ))
                continue
            correct_account = correct_accounts[0]

            self.stdout.write(
                f'\n  {"[DRY RUN] " if not apply_changes else ""}branch={branch}\n'
                f'    Dr {correct_account.name} ({correct_account.code})  ₦{total:,.2f}\n'
                f'    Cr {wrong_account.name} ({wrong_account.code})  ₦{total:,.2f}\n'
                f'    covers {len(items)} expense(s): '
                + ', '.join(e.reference_number for e, _ in items[:10])
                + (f', ... (+{len(items) - 10} more)' if len(items) > 10 else '')
            )

            if not apply_changes:
                continue

            with db_transaction.atomic():
                journal_entry = JournalEntry.objects.create(
                    series=series,
                    date=timezone.now().date(),
                    description=(
                        f'Correction: reclassify {len(items)} bank-charge expense(s) misposted to '
                        f'"{wrong_account.name}" into "{correct_account.name}" ({branch})'
                    ),
                    workflow_reference=f'{SERIES_CODE}-{branch_id}-{wrong_account_id}',
                    branch=branch,
                    owner=items[0][0].owner,
                    tenant=items[0][0].tenant,
                )
                JournalEntryLine.objects.create(
                    transaction=journal_entry, account=correct_account,
                    side=JournalEntryLine.DEBIT, amount=total,
                )
                JournalEntryLine.objects.create(
                    transaction=journal_entry, account=wrong_account,
                    side=JournalEntryLine.CREDIT, amount=total,
                )
                journal_entry.post()

                log_financial_event(
                    FinancialAuditLog.JOURNAL_POST,
                    acted_by=None,
                    record_type='Transaction',
                    record_id=str(journal_entry.pk),
                    amount=total,
                    description=(
                        f'Bank charges reclassification correction — moved ₦{total:,.2f} from '
                        f'"{wrong_account.name}" to "{correct_account.name}" for {branch}, '
                        f'covering {len(items)} previously-misposted expense(s).'
                    ),
                    extra={
                        'source_command': SOURCE_COMMAND,
                        'branch_id': branch_id,
                        'wrong_account_id': wrong_account_id,
                        'correct_account_id': correct_account.id,
                        'expense_reference_numbers': [e.reference_number for e, _ in items],
                        'journal_entry_id': journal_entry.pk,
                    },
                )

            self.stdout.write(self.style.SUCCESS(
                f'    Posted journal entry #{journal_entry.pk}.'
            ))

        self.stdout.write(
            f'\n{"Would move" if not apply_changes else "Moved"} ₦{grand_total:,.2f} total across '
            f'{len(groups)} branch/account group(s).'
        )
        if not apply_changes:
            self.stdout.write('Re-run with --apply to post.')
