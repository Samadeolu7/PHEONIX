# hr/services/payroll_accounting.py
"""
Payroll Accounting Service

Handles accounting integration for payroll processing:
- Salary expense journal entries
- Tax payable entries
- Other deduction entries
- Cash/bank account transactions
"""

from decimal import Decimal
from django.db import transaction as db_transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from transactions.models import (
    Transaction as JournalEntry,
    TransactionEntry as JournalEntryLine,
    TransactionSeries
)
from accounts.models import Account
from accounts.utils.account_creation import get_or_create_child_account, get_system_account


class PayrollAccountingService:
    """Service for payroll accounting operations"""
    
    def __init__(self, payroll):
        """
        Initialize service with payroll
        
        Args:
            payroll: Payroll instance
        """
        self.payroll = payroll
    
    @db_transaction.atomic
    def create_payroll_liability_entry(self, approved_by):
        """
        Create liability journal entry on payroll approval (Stage 1 of two-stage accounting)

        Standard payroll accounting entries:

        Entry 1 – Payroll obligation:
          DR  Salary Expense                 (gross pay)
          CR  Employee Pension Payable        (8% employee contribution)
          CR  Tax / PAYE Payable              (tax withheld)
          CR  Other Payroll Deductions Payable (other deductions)
          CR  Salary Payable                  (net pay to be disbursed)

        Entry 2 – Employer pension obligation (if pension enabled):
          DR  Pension Expense                 (employer 10%)
          CR  Employer Pension Payable        (employer 10%)

        Args:
            approved_by: User approving the payroll

        Returns:
            JournalEntry: Created liabilities journal entry

        Raises:
            ValidationError: If payroll cannot be approved
        """
        # Validate
        if self.payroll.status not in ['calculated', 'draft', 'approved']:
            raise ValidationError("Payroll must be calculated before creating liability entry")

        if self.payroll.liabilities_journal_entry:
            raise ValidationError("Liability entry already exists for this payroll")

        # Get accounts
        salary_expense_account       = self._get_salary_expense_account()
        salary_payable_account       = self._get_salary_payable_account()
        tax_payable_account          = self._get_tax_payable_account()
        other_payables_account       = self._get_other_payables_account()
        employee_pension_account     = self._get_employee_pension_payable_account()

        # Get transaction series
        series, _ = TransactionSeries.objects.get_or_create(
            code='PYLIA',
            defaults={'description': 'Payroll Liabilities'}
        )

        # Calculate totals from payslips
        totals = self._calculate_payroll_totals()

        # Persist pension totals on the payroll record for reporting
        self.payroll.total_employee_pension = totals['total_employee_pension']
        self.payroll.total_employer_pension = totals['total_employer_pension']
        self.payroll.save(update_fields=['total_employee_pension', 'total_employer_pension'])

        # ── Entry 1: Payroll obligation ──────────────────────────────────────
        lia_workflow_ref = f"{self.payroll.reference_number}-LIA"
        journal_entry = JournalEntry.objects.create(
            tenant=self.payroll.tenant,
            series=series,
            date=self.payroll.pay_date,
            description=f"Payroll Liabilities: {self.payroll.reference_number}",
            workflow_reference=lia_workflow_ref,
            branch=self.payroll.branch,
            owner=self.payroll.owner
        )

        # DR: Salary Expense (Gross Pay)
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=salary_expense_account,
            side=JournalEntryLine.DEBIT,
            amount=self.payroll.total_gross_pay
        )

        # CR: Employee Pension Payable (employee 8%)
        if totals['total_employee_pension'] > 0:
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=employee_pension_account,
                side=JournalEntryLine.CREDIT,
                amount=totals['total_employee_pension']
            )

        # CR: Tax Payable (Total Tax Withheld)
        if totals['total_tax'] > 0:
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=tax_payable_account,
                side=JournalEntryLine.CREDIT,
                amount=totals['total_tax']
            )

        # CR: Other Payables (deductions with no specific GL account)
        if totals['total_other_deductions'] > 0:
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=other_payables_account,
                side=JournalEntryLine.CREDIT,
                amount=totals['total_other_deductions']
            )

        # CR: Per-GL deduction accounts (e.g. Staff Advances and Loans 1112)
        # Dr Salary Payable / Cr <component gl_account> — recovers the advance
        for gl_account, amount in totals['gl_deductions'].items():
            if amount > 0:
                JournalEntryLine.objects.create(
                    transaction=journal_entry,
                    account=gl_account,
                    side=JournalEntryLine.CREDIT,
                    amount=amount,
                )

        # CR: Salary Payable (Net Pay – to be paid later)
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=salary_payable_account,
            side=JournalEntryLine.CREDIT,
            amount=self.payroll.total_net_pay
        )

        journal_entry.post()

        # Update payroll with liability entry
        self.payroll.liabilities_journal_entry = journal_entry
        self.payroll.save(update_fields=['liabilities_journal_entry'])

        # ── Entry 2: Employer pension expense (if applicable) ────────────────
        if totals['total_employer_pension'] > 0:
            self._create_employer_pension_entry(totals['total_employer_pension'])

        return journal_entry

    @db_transaction.atomic
    def process_payroll_payment(self, processed_by, payment_account=None):
        """
        Process payroll disbursement and clear liabilities (Stage 2 of two-stage accounting)
        
        This is called when payroll is actually paid.
        Creates journal entry:
        DR: Salary Payable (net pay from liabilities)
        CR: Cash/Bank (actual payment)
        
        Also clears other payables if needed.
        
        Args:
            processed_by: User processing the payment
            payment_account: Bank/Cash account for payment (optional)
            
        Returns:
            JournalEntry: Created payment journal entry
            
        Raises:
            ValidationError: If payroll cannot be processed
        """
        # Validate
        if self.payroll.status != 'approved':
            raise ValidationError("Only approved payroll can be processed")
        
        if not self.payroll.liabilities_journal_entry:
            raise ValidationError("Liability entry must exist before processing payment")
        
        # Get accounts
        salary_payable_account = self._get_salary_payable_account()
        
        if not payment_account:
            payment_account = self._get_default_payment_account()
        
        # Get transaction series
        series, _ = TransactionSeries.objects.get_or_create(
            code='PYDIS',
            defaults={'description': 'Payroll Disbursement'}
        )
        
        # Create journal entry for payment with distinct workflow reference
        disb_workflow_ref = f"{self.payroll.reference_number}-DISB"
        journal_entry = JournalEntry.objects.create(
            tenant=self.payroll.tenant,
            series=series,
            date=timezone.now().date(),
            description=f"Payroll Disbursement: {self.payroll.reference_number}",
            workflow_reference=disb_workflow_ref,
            branch=self.payroll.branch,
            owner=self.payroll.owner
        )
        
        # DR: Salary Payable (clear the liability)
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=salary_payable_account,
            side=JournalEntryLine.DEBIT,
            amount=self.payroll.total_net_pay
        )
        
        # CR: Cash/Bank (actual payment)
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=payment_account,
            side=JournalEntryLine.CREDIT,
            amount=self.payroll.total_net_pay
        )
        
        # Post the transaction
        journal_entry.post()

        # ── Warn when "Other Payroll Deductions Payable" (2134) has an outstanding
        #    balance for this payroll.  That account is credited at approval but has
        #    no dedicated clearing workflow (unlike pension which has PensionRemittance
        #    and PAYE which is remitted separately).  Flag it so finance staff know
        #    they need to manually clear those deductions (e.g. development levy
        #    remittances, miscellaneous salary reductions).
        import logging as _logging
        _logger = _logging.getLogger(__name__)
        totals = self._calculate_payroll_totals()
        if totals['total_other_deductions'] > 0:
            _logger.warning(
                "Payroll %s disbursed but Other Payroll Deductions Payable (2134) "
                "has an uncleaned balance of %s for this run. "
                "Create a manual journal entry or remittance to clear it.",
                self.payroll.reference_number,
                totals['total_other_deductions'],
            )

        # Update payroll status
        self.payroll.status = 'paid'
        self.payroll.paid_at = timezone.now()
        self.payroll.paid_by = processed_by
        self.payroll.payment_account = payment_account
        self.payroll.journal_entry = journal_entry
        self.payroll.save()

        # ── Reduce active IOU balances for all staff in this payroll ─────────
        from hr.services.payroll_service import PayrollService
        PayrollService(self.payroll).reduce_iou_balances()

        return journal_entry
    
    def _calculate_payroll_totals(self):
        """
        Calculate breakdown of payroll totals from payslips, including pension.

        Returns:
            Dict with:
              total_tax, total_employee_pension, total_employer_pension,
              total_other_deductions,
              gl_deductions: {Account: Decimal} — per-GL totals for deductions
                             that have a SalaryComponent.gl_account configured
        """
        from hr.models import Payslip, SalaryComponent

        payslips = Payslip.objects.filter(
            payroll=self.payroll,
            is_deleted=False
        )

        # Pre-fetch: component name → gl_account for this branch
        component_gl_map = {
            sc.name: sc.gl_account
            for sc in SalaryComponent.objects.filter(
                branch=self.payroll.branch,
                component_type=SalaryComponent.DEDUCTION,
                gl_account__isnull=False,
                is_deleted=False,
            ).select_related('gl_account')
        }

        # Also map the aggregated "Staff IOU" deduction key to the staff_iou
        # system account so IOU recoveries credit the correct GL account.
        _staff_iou_account = get_system_account(
            'staff_iou', self.payroll.owner, self.payroll.branch
        )
        component_gl_map['Staff IOU'] = _staff_iou_account

        total_tax                = Decimal('0.00')
        total_employee_pension   = Decimal('0.00')
        total_employer_pension   = Decimal('0.00')
        total_other_deductions   = Decimal('0.00')
        gl_deductions            = {}   # {Account instance: Decimal}

        for payslip in payslips:
            total_tax              += payslip.tax
            total_employee_pension += payslip.employee_pension
            total_employer_pension += payslip.employer_pension

            if payslip.deductions:
                for deduction_name, amount in payslip.deductions.items():
                    if deduction_name.lower() in ('tax', 'pension'):
                        continue
                    amt = Decimal(str(amount))
                    # Strip the " (One-time)" suffix added by payroll_service for
                    # one-time BonusDeductionRequest items so we can match the
                    # canonical component name stored in component_gl_map.
                    canonical_name = deduction_name.replace(' (One-time)', '').strip()
                    gl_account = component_gl_map.get(canonical_name)
                    if gl_account:
                        gl_deductions[gl_account] = gl_deductions.get(gl_account, Decimal('0.00')) + amt
                    else:
                        total_other_deductions += amt

        return {
            'total_tax':              total_tax,
            'total_employee_pension': total_employee_pension,
            'total_employer_pension': total_employer_pension,
            'total_other_deductions': total_other_deductions,
            'gl_deductions':          gl_deductions,
        }

    @db_transaction.atomic
    def _create_employer_pension_entry(self, total_employer_pension):
        """
        Create employer pension expense journal entry at payroll approval.

        Entry:
          DR  Pension Expense          (employer contribution — 10%)
          CR  Employer Pension Payable (liability until remitted to fund)
        """
        pension_expense_account  = self._get_pension_expense_account()
        employer_pension_account = self._get_employer_pension_payable_account()

        series, _ = TransactionSeries.objects.get_or_create(
            code='PYNPN',
            defaults={'description': 'Employer Pension Expense'}
        )

        pen_workflow_ref = f"{self.payroll.reference_number}-EMPLPN"
        pension_je = JournalEntry.objects.create(
            tenant=self.payroll.tenant,
            series=series,
            date=self.payroll.pay_date,
            description=f"Employer Pension Expense: {self.payroll.reference_number}",
            workflow_reference=pen_workflow_ref,
            branch=self.payroll.branch,
            owner=self.payroll.owner
        )

        JournalEntryLine.objects.create(
            transaction=pension_je,
            account=pension_expense_account,
            side=JournalEntryLine.DEBIT,
            amount=total_employer_pension
        )
        JournalEntryLine.objects.create(
            transaction=pension_je,
            account=employer_pension_account,
            side=JournalEntryLine.CREDIT,
            amount=total_employer_pension
        )

        pension_je.post()

        self.payroll.pension_expense_journal_entry = pension_je
        self.payroll.save(update_fields=['pension_expense_journal_entry'])

        return pension_je

    @db_transaction.atomic
    def create_pension_remittance_entry(self, remittance, payment_account, remitted_by):
        """
        Create journal entry when pension is remitted to the pension fund.

        Entry:
          DR  Employee Pension Payable  (total employee 8%)
          DR  Employer Pension Payable  (total employer 10%)
          CR  Cash / Bank               (total paid)

        Args:
            remittance: PensionRemittance instance
            payment_account: Account to credit (bank or cash)
            remitted_by: User processing the remittance

        Returns:
            JournalEntry: Posted remittance journal entry
        """
        from hr.models import PensionRemittance

        if remittance.status != 'draft':
            raise ValidationError("Only draft pension remittances can be processed")

        employee_pension_account = self._get_employee_pension_payable_account()
        employer_pension_account = self._get_employer_pension_payable_account()

        series, _ = TransactionSeries.objects.get_or_create(
            code='PNREM',
            defaults={'description': 'Pension Remittance'}
        )

        rem_workflow_ref = f"{remittance.reference_number}-REM"
        journal_entry = JournalEntry.objects.create(
            tenant=self.payroll.tenant,
            series=series,
            date=remittance.remittance_date,
            description=(
                f"Pension Remittance: {remittance.reference_number} "
                f"({remittance.period_start} – {remittance.period_end})"
            ),
            workflow_reference=rem_workflow_ref,
            branch=self.payroll.branch,
            owner=self.payroll.owner
        )

        # DR: Employee Pension Payable
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=employee_pension_account,
            side=JournalEntryLine.DEBIT,
            amount=remittance.total_employee_pension
        )

        # DR: Employer Pension Payable
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=employer_pension_account,
            side=JournalEntryLine.DEBIT,
            amount=remittance.total_employer_pension
        )

        # CR: Cash / Bank
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=payment_account,
            side=JournalEntryLine.CREDIT,
            amount=remittance.total_amount
        )

        journal_entry.post()

        remittance.journal_entry    = journal_entry
        remittance.payment_account  = payment_account
        remittance.remitted_by      = remitted_by
        remittance.status           = 'remitted'
        remittance.save()

        return journal_entry

    def _get_default_payment_account(self):
        """Get default cash account for payment"""
        # Try to get bank account first, then cash.
        # Must be a postable (CHILD, allow_manual_entries) account — a plain
        # name match can otherwise land on a PARENT-level "header" account
        # (e.g. a legacy 3-digit chart's '100 Cash and Bank' group account),
        # which TransactionEntry.clean() correctly refuses to post to.
        account = Account.objects.filter(
            branch=self.payroll.branch,
            account_type=Account.ASSET,
            account_level=Account.LEVEL_CHILD,
            allow_manual_entries=True,
            name__icontains='bank',
            is_deleted=False
        ).order_by('code').first()

        if not account:
            # Fallback to cash account
            account = get_system_account('cash', self.payroll.owner, self.payroll.branch)

        return account

    # ── Account Getters ──────────────────────────────────────────────────────

    def _get_salary_expense_account(self):
        """5201 – Salaries and Wages (Expense)"""
        return get_system_account('salary_expense', self.payroll.owner, self.payroll.branch)

    def _get_salary_payable_account(self):
        """2131 – Salaries Payable / Payroll Clearance (Liability)"""
        return get_system_account('salary_payable', self.payroll.owner, self.payroll.branch)

    def _get_tax_payable_account(self):
        """2122 – PAYE Tax Payable (Liability)"""
        return get_system_account('paye_payable', self.payroll.owner, self.payroll.branch)

    def _get_other_payables_account(self):
        """2134 – Other Payroll Deductions Payable (Liability)"""
        return get_system_account('other_payroll_deductions_payable', self.payroll.owner, self.payroll.branch)

    def _get_employee_pension_payable_account(self):
        """2132 – Employee Pension Payable 8% (Liability)"""
        return get_system_account('employee_pension_payable', self.payroll.owner, self.payroll.branch)

    def _get_employer_pension_payable_account(self):
        """2133 – Employer Pension Payable 10% (Liability)"""
        return get_system_account('employer_pension_payable', self.payroll.owner, self.payroll.branch)

    def _get_pension_expense_account(self):
        """5202 – Pension Expense / Employer Contribution (Expense)"""
        return get_system_account('pension_expense', self.payroll.owner, self.payroll.branch)
