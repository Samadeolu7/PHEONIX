"""
Management command to reconcile LoanAccount.outstanding_principal
with the linked Account.balance in the GL.

The dashboard reads outstanding_principal (business-level field).
The trial balance reads Account.balance (double-entry GL).

If they diverge (e.g. after a partial re-run of the import), this
command posts correction journal entries so the GL matches the
business-level source of truth.

Usage:
  # Diagnose: show what's in the GL vs what's expected
  python manage.py reconcile_loan_balances --tenant-id 1 --diagnose

  # Dry-run: report discrepancies only
  python manage.py reconcile_loan_balances --tenant-id 1

  # Fix: post correction entries
  python manage.py reconcile_loan_balances --tenant-id 1 --fix
"""

from decimal import Decimal
from collections import Counter

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.db.models import Sum, Q, F
from django.utils import timezone


class Command(BaseCommand):
    help = "Reconcile LoanAccount.outstanding_principal with Account.balance"

    def add_arguments(self, parser):
        parser.add_argument('--tenant-id', type=int, required=True)
        parser.add_argument('--branch-id', type=int, default=None)
        parser.add_argument(
            '--diagnose',
            action='store_true',
            help='Probe root cause of the discrepancy',
        )
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
        do_diagnose = options['diagnose']
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

        if do_diagnose:
            self._run_diagnosis(loans, discrepancies, tenant_id, branch_id)

        if do_fix:
            self._post_corrections(discrepancies, tenant_id, branch_id)
        else:
            self._print_details(discrepancies)
            self.stdout.write(
                self.style.WARNING(
                    "\nRun with --diagnose to investigate root cause."
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

    def _run_diagnosis(self, loans, discrepancies, tenant_id, branch_id):
        from accounts.models import Account
        from transactions.models import TransactionEntry

        self.stdout.write("\n" + "=" * 60)
        self.stdout.write("ROOT CAUSE DIAGNOSIS")
        self.stdout.write("=" * 60)

        # 1. Check the OB-MIGRATION transaction
        from transactions.models import Transaction
        ob_txn = Transaction.objects.filter(
            workflow_reference="OB-MIGRATION",
            tenant_id=tenant_id,
        ).first()
        if ob_txn:
            self.stdout.write(
                f"\n[1] Opening balance transaction found: {ob_txn.pk} "
                f"(date={ob_txn.date}, posted={ob_txn.approved})"
            )
        else:
            self.stdout.write(self.style.ERROR(
                "\n[1] NO opening balance transaction found! (OB-MIGRATION missing)"
            ))

        # 2. Check LOAN-related posted entries in the GL
        loan_acct_qs = Account.objects.filter(
            account_type=Account.LOAN,
            tenant_id=tenant_id,
            is_deleted=False,
        )

        posted_entries = TransactionEntry.objects.filter(
            account__in=loan_acct_qs,
            posted=True,
            transaction__is_deleted=False,
        )
        if branch_id:
            posted_entries = posted_entries.filter(transaction__branch_id=branch_id)

        ob_entries = posted_entries.filter(
            transaction__workflow_reference="OB-MIGRATION"
        )
        ob_dr = ob_entries.filter(side=TransactionEntry.DEBIT).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0')
        ob_cr = ob_entries.filter(side=TransactionEntry.CREDIT).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0')

        disb_entries = posted_entries.filter(
            transaction__series__code="LNDSB"
        )
        disb_dr = disb_entries.filter(side=TransactionEntry.DEBIT).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0')

        pmt_entries = posted_entries.filter(
            transaction__series__code="LNMIG"
        )
        pmt_cr = pmt_entries.filter(side=TransactionEntry.CREDIT).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0')

        self.stdout.write(f"\n[2] Posted LOAN entries breakdown:")
        self.stdout.write(f"    Opening balance (OB-MIGRATION):  DR={ob_dr:>12,.2f}  CR={ob_cr:>12,.2f}  "
                          f"net={ob_dr - ob_cr:>+12,.2f}")
        self.stdout.write(f"    Disbursements (LNDSB):            DR={disb_dr:>12,.2f}")
        self.stdout.write(f"    Repayments (LNMIG):               CR={pmt_cr:>12,.2f}")
        self.stdout.write(f"    Net GL contribution:              "
                          f"{(ob_dr - ob_cr) + disb_dr - pmt_cr:>12,.2f}")

        # 3. Ground truth: sum of all stored Account.balance for LOAN accounts
        stored_total = loan_acct_qs.aggregate(total=Sum('balance'))['total'] or Decimal('0')
        self.stdout.write(
            f"\n[3] Total stored Account.balance (LOAN):   {stored_total:>14,.2f}"
        )

        # 4. Pattern: are discrepancies concentrated in certain statuses?
        self.stdout.write("\n[4] Discrepancy by loan status:")
        status_counter = Counter()
        status_totals = {}
        for loan, gl_bal, olb, diff in discrepancies:
            s = loan.status or 'unknown'
            status_counter[s] += 1
            status_totals[s] = status_totals.get(s, Decimal('0')) + diff
        for status in sorted(status_counter):
            self.stdout.write(
                f"    {status:15s}  count={status_counter[status]:3d}  "
                f"total_diff={status_totals[status]:>+12,.2f}"
            )

        # 5. Pattern: GL=0 vs GL>0 but wrong
        zero_gl = sum(1 for _, gl, _, _ in discrepancies if gl == 0)
        nonzero_gl = len(discrepancies) - zero_gl
        self.stdout.write(f"\n[5] Discrepancy pattern:")
        self.stdout.write(f"    GL=0 (opening never posted?):     {zero_gl:4d} loans")
        self.stdout.write(f"    GL>0 but wrong:                   {nonzero_gl:4d} loans")

        # 6. Compare opening posted vs opening expected
        expected_opening = sum(olb - diff for _, _, olb, diff in discrepancies
                               if diff > 0 and (olb - diff) != 0)
        total_correction = sum(diff for _, _, _, diff in discrepancies)
        total_olb = sum(olb for _, _, olb, _ in discrepancies)
        total_gl = sum(gl for _, gl, _, _ in discrepancies)
        self.stdout.write(f"\n[6] Expected opening balance (from OLB): {expected_opening:>14,.2f}")
        self.stdout.write(f"    Total correction needed:                 {total_correction:>+14,.2f}")

        self.stdout.write(
            f"\n[6] The net understatement ({total_olb - total_gl:,.2f}) "
            f"is {'likely due to the opening' if ob_dr == 0 else 'NOT due to missing opening entries'} "
            f"balance not being posted."
        )
        self.stdout.write(
            "\nDiagnosis complete. If the opening balance is missing entirely, "
            "post a single correction entry.\n"
            "If only some loans are affected, check whether the import was "
            "interrupted and partially re-run."
        )

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
            code="RECON",
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
