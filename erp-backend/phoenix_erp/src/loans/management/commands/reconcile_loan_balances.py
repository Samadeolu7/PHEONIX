"""
Management command to reconcile LoanAccount.outstanding_principal
with the linked Account.balance in the GL.

The dashboard reads outstanding_principal (business-level field).
The trial balance reads Account.balance (double-entry GL).

If they diverge (e.g. after a partial re-run of the import), this
command posts correction journal entries so the GL matches the
business-level source of truth.

Usage:
  # Dry-run: report discrepancies only
  python manage.py reconcile_loan_balances --tenant-id 1

  # Fix: post correction entries
  python manage.py reconcile_loan_balances --tenant-id 1 --fix
"""

from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.utils import timezone


class Command(BaseCommand):
    help = "Reconcile LoanAccount.outstanding_principal with Account.balance"

    def add_arguments(self, parser):
        parser.add_argument('--tenant-id', type=int, required=True)
        parser.add_argument('--branch-id', type=int, default=None)
        parser.add_argument(
            '--fix',
            action='store_true',
            help='Post correction entries to sync GL with outstanding_principal',
        )

    def handle(self, *args, **options):
        from accounts.models import Account
        from loans.models import LoanAccount

        tenant_id = options['tenant_id']
        branch_id = options['branch_id']
        do_fix = options['fix']

        filters = {'account__tenant_id': tenant_id, 'is_deleted': False}
        if branch_id:
            filters['account__branch_id'] = branch_id

        loans = list(
            LoanAccount.objects.filter(**filters)
            .select_related('account')
            .order_by('loan_number')
        )

        discrepancies = []
        total_gl = Decimal('0')
        total_olb = Decimal('0')

        for loan in loans:
            gl_bal = loan.account.balance
            olb = loan.outstanding_principal
            diff = olb - gl_bal
            total_gl += gl_bal
            total_olb += olb
            if diff != 0:
                discrepancies.append((loan, gl_bal, olb, diff))

        self.stdout.write(f"\nLoans checked: {len(loans)}")
        self.stdout.write(f"Total Account.balance (GL):       {total_gl:>14,.2f}")
        self.stdout.write(f"Total outstanding_principal:      {total_olb:>14,.2f}")
        self.stdout.write(f"Difference:                       {total_olb - total_gl:>14,.2f}")
        self.stdout.write(f"Loans with discrepancies:         {len(discrepancies)}")

        if not discrepancies:
            self.stdout.write(self.style.SUCCESS("\nAll loan balances are in sync."))
            return

        if do_fix:
            self._post_corrections(discrepancies, tenant_id, branch_id)
        else:
            self._print_details(discrepancies)
            self.stdout.write(
                self.style.WARNING(
                    "\nRun with --fix to post correction journal entries."
                )
            )

    def _print_details(self, discrepancies):
        self.stdout.write("\n--- Discrepancy Details ---")
        total_correction = Decimal('0')
        for loan, gl_bal, olb, diff in discrepancies:
            total_correction += diff
            self.stdout.write(
                f"  {loan.loan_number:20s}  "
                f"GL={gl_bal:>10,.2f}  OLB={olb:>10,.2f}  "
                f"diff={diff:>+10,.2f}"
            )
        self.stdout.write(f"\nTotal correction needed: {total_correction:>+14,.2f}")

    @db_transaction.atomic
    def _post_corrections(self, discrepancies, tenant_id, branch_id):
        from accounts.models import Account
        from loans.models import LoanAccount
        from transactions.models import Transaction, TransactionEntry, TransactionSeries
        from django.contrib.auth import get_user_model

        User = get_user_model()
        acting_user = User.objects.filter(is_superuser=True).first()
        if not acting_user:
            raise CommandError("No superuser found to author correction entries.")

        series, _ = TransactionSeries.objects.get_or_create(
            code="BAL-RECON",
            defaults={"description": "Loan Balance Reconciliation"},
        )

        offset_acct = Account.objects.filter(
            code__in=['SUSPENSE', 'OBE', '9999'],
            tenant_id=tenant_id,
            is_deleted=False,
        ).first()
        if not offset_acct:
            offset_acct = Account.objects.filter(
                account_type=Account.EQUITY,
                tenant_id=tenant_id,
                is_deleted=False,
            ).order_by('code').first()
        if not offset_acct:
            raise CommandError(
                "No offset account found (tried SUSPENSE, OBE, or any EQUITY account). "
                "Create one or pass an explicit --offset-account-id."
            )

        txn = Transaction.objects.create(
            series=series,
            date=timezone.now().date(),
            description="Loan Balance Reconciliation - Post-Import Correction",
            workflow_reference=f"BAL-RECON-{timezone.now():%Y%m%d%H%M%S}",
            owner=acting_user,
            branch_id=branch_id,
            tenant_id=tenant_id,
            created_by=acting_user,
        )

        total_dr = Decimal('0')
        total_cr = Decimal('0')

        for loan, gl_bal, olb, diff in discrepancies:
            if diff > 0:
                TransactionEntry.objects.create(
                    transaction=txn, account=loan.account,
                    side=TransactionEntry.DEBIT, amount=abs(diff),
                )
                TransactionEntry.objects.create(
                    transaction=txn, account=offset_acct,
                    side=TransactionEntry.CREDIT, amount=abs(diff),
                )
                total_dr += abs(diff)
                total_cr += abs(diff)
            elif diff < 0:
                TransactionEntry.objects.create(
                    transaction=txn, account=loan.account,
                    side=TransactionEntry.CREDIT, amount=abs(diff),
                )
                TransactionEntry.objects.create(
                    transaction=txn, account=offset_acct,
                    side=TransactionEntry.DEBIT, amount=abs(diff),
                )
                total_dr += abs(diff)
                total_cr += abs(diff)

        txn.post()

        self.stdout.write(self.style.SUCCESS(
            f"\nCorrection posted: DR={total_dr:,.2f}, CR={total_cr:,.2f} "
            f"(offset account: {offset_acct.code} - {offset_acct.name})"
        ))
