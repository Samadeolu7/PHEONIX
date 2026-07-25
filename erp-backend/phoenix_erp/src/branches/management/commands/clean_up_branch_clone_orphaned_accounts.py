"""
Management command: clean_up_branch_clone_orphaned_accounts

Fixes the fallout from a bug in BranchCloneService._clone_accounts(): it used
to decide which GL accounts were "real chart-of-accounts structure" (safe to
clone) purely from code format — a plain 4-digit code was assumed to always
mean shared GL structure, and only PPPP-NNNNN-format codes were treated as
per-client sub-ledger accounts to exclude. That assumption doesn't hold in
this system: individual loan accounts, savings accounts, cashier tills, bank
accounts, and petty cash funds are all allocated plain sequential 4-digit
codes too (e.g. "1193 - Jane Doe - Monthly Loan", "1115 - Dominion Akinfenwa
- Cash Account"), indistinguishable by format from real GL structure. Cloning
a branch that already had client/cashier activity therefore copied hundreds
of these per-entity accounts into the target branch as empty ($0.00, no real
transactions) orphan rows named after the SOURCE branch's people.

BranchCloneService now excludes these by actual usage (see
_in_use_account_ids), so this bug can't recur. This command finds and
removes the accounts a *previous*, already-run clone left behind.

Detection (conservative, three buckets — only the first is ever auto-cleaned):

  1. CONFIRMED LEFTOVER — safe to remove. The account in the target branch is
     NOT referenced by any LoanAccount/SavingsAccount/CashierAccount/
     BankAccount/PettyCashFund in that branch, has never had a single
     TransactionEntry posted to it, AND another branch in the same tenant has
     an account with the exact same code that IS genuinely in use by one of
     those per-entity links. That combination is the specific signature of a
     clone leftover — a real, still-in-use original exists elsewhere, and
     this copy has never done anything.

  2. HAS REAL ACTIVITY — never touched, always reported. Any account with a
     posted TransactionEntry is left alone regardless of anything else,
     even if it looks orphaned by every other signal.

  3. ORPHANED BUT UNCONFIRMED — reported only, never auto-deleted. An unused
     account with no matching in-use account elsewhere to corroborate it as
     a leftover. Could be a genuinely unused account created some other way;
     needs a human to decide.

Soft-deletes (sets is_deleted=True) rather than hard-deleting, consistent
with every other model in this codebase, and consistent with how the clone
itself never touches real transactional data.

Usage:
    python manage.py clean_up_branch_clone_orphaned_accounts --target-branch HQ2       # report only
    python manage.py clean_up_branch_clone_orphaned_accounts --target-branch 14 --apply
"""
from django.core.management.base import BaseCommand, CommandError

from accounts.models import Account
from branches.models import Branch
from transactions.models import TransactionEntry


def in_use_account_ids(tenant):
    """
    Account ids anywhere in this tenant that are the dedicated ledger
    account of one specific operational entity — mirrors
    BranchCloneService._in_use_account_ids but scanning the whole tenant
    instead of a single source branch.
    """
    from loans.models import LoanAccount
    from savings.models import SavingsAccount
    from cash_management.models import CashierAccount, PettyCashFund
    from banks.models import BankAccount

    ids = set()
    ids.update(LoanAccount.objects.filter(account__tenant=tenant).values_list('account_id', flat=True))
    ids.update(SavingsAccount.objects.filter(account__tenant=tenant).values_list('account_id', flat=True))
    ids.update(CashierAccount.objects.filter(account__tenant=tenant).values_list('account_id', flat=True))
    ids.update(BankAccount.objects.filter(gl_account__tenant=tenant).values_list('gl_account_id', flat=True))
    ids.update(PettyCashFund.objects.filter(petty_cash_account__tenant=tenant).values_list('petty_cash_account_id', flat=True))
    ids.discard(None)
    return ids


class Command(BaseCommand):
    help = (
        'Find and remove GL accounts a previous branch-config clone incorrectly copied '
        '(individual loan/savings/cashier/bank/petty-cash accounts). Dry-run unless --apply is passed.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--target-branch', required=True,
            help='The branch that was cloned INTO (branch id or code) — the one to clean up.',
        )
        parser.add_argument(
            '--apply', action='store_true',
            help='Actually soft-delete the confirmed-leftover accounts. Without this, report only.',
        )

    def handle(self, *args, **options):
        target_ref = options['target_branch']
        apply_changes = options['apply']

        try:
            if str(target_ref).isdigit():
                target_branch = Branch.objects.get(pk=int(target_ref), is_deleted=False)
            else:
                target_branch = Branch.objects.get(code=target_ref, is_deleted=False)
        except Branch.DoesNotExist:
            raise CommandError(f"No branch found matching '{target_ref}'.")

        tenant = target_branch.tenant
        in_use_ids = in_use_account_ids(tenant)

        # code -> set of branch ids where an account with that code is genuinely in use
        used_codes = (
            Account.objects.filter(id__in=in_use_ids, tenant=tenant)
            .values_list('code', 'branch_id')
        )
        code_to_using_branches: dict = {}
        for code, branch_id in used_codes:
            code_to_using_branches.setdefault(code, set()).add(branch_id)

        confirmed_leftovers = []
        has_activity = []
        unconfirmed_orphans = []

        target_accounts = Account.objects.filter(
            branch=target_branch, is_deleted=False, account_level=Account.LEVEL_CHILD,
        )
        for acct in target_accounts:
            if acct.id in in_use_ids:
                continue  # genuinely in use in this branch — never touch

            has_posted_entries = TransactionEntry.objects.filter(account=acct).exists()
            using_branches = code_to_using_branches.get(acct.code, set())
            corroborated_elsewhere = bool(using_branches - {target_branch.id})

            if has_posted_entries:
                has_activity.append(acct)
            elif corroborated_elsewhere:
                confirmed_leftovers.append(acct)
            else:
                unconfirmed_orphans.append(acct)

        self.stdout.write(f"Target branch: {target_branch} (tenant={tenant})")
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(
            f"Confirmed clone leftovers (safe to remove): {len(confirmed_leftovers)}"
        ))
        for acct in confirmed_leftovers:
            self.stdout.write(f"    {acct.code} - {acct.name} (id={acct.pk})")

        self.stdout.write('')
        self.stdout.write(self.style.WARNING(
            f"Has real transaction activity (never touched): {len(has_activity)}"
        ))
        for acct in has_activity:
            self.stdout.write(f"    {acct.code} - {acct.name} (id={acct.pk})")

        self.stdout.write('')
        self.stdout.write(self.style.WARNING(
            f"Orphaned but unconfirmed — needs manual review, not auto-cleaned: {len(unconfirmed_orphans)}"
        ))
        for acct in unconfirmed_orphans:
            self.stdout.write(f"    {acct.code} - {acct.name} (id={acct.pk})")

        if not apply_changes:
            self.stdout.write('')
            self.stdout.write(self.style.WARNING(
                'Dry run only — pass --apply to soft-delete the confirmed leftovers listed above.'
            ))
            return

        if not confirmed_leftovers:
            self.stdout.write('')
            self.stdout.write('Nothing to apply — no confirmed leftovers found.')
            return

        for acct in confirmed_leftovers:
            acct.is_deleted = True
            acct.save(update_fields=['is_deleted'])

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(
            f"Soft-deleted {len(confirmed_leftovers)} confirmed clone-leftover accounts."
        ))
