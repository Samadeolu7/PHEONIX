# hr/services/payroll_service.py
"""
Payroll Processing Service

Handles payroll calculations including:
- Gross pay calculation
- Deductions (tax, insurance, pension, etc.)
- Overtime pay
- Allowances and bonuses
- Net pay calculation
"""

from decimal import Decimal, ROUND_HALF_UP
import logging
from django.db import transaction as db_transaction
from django.utils import timezone
from django.core.exceptions import ValidationError
from datetime import timedelta

logger = logging.getLogger(__name__)


class PayrollService:
    """Service for payroll processing operations"""
    
    def __init__(self, payroll):
        """
        Initialize service with payroll
        
        Args:
            payroll: Payroll instance
        """
        self.payroll = payroll
        self.config = None
    
    def _get_config(self):
        """Get HR config for this branch, create if doesn't exist.

        Uses all_objects (includes soft-deleted) with filter().first() instead
        of get_or_create().  Django's get_or_create() wraps its INSERT in a
        nested `with transaction.atomic()`.  When that insert fails with
        IntegrityError (soft-deleted row still holds the unique slot), Django
        sets `connection.needs_rollback = True` on the outer transaction,
        poisoning every subsequent DB query with TransactionManagementError.
        A plain filter + conditional create avoids that internal atomic block.
        """
        from hr.config_models import HRConfig

        if not self.config:
            # Look for any existing record, including soft-deleted ones.
            self.config = HRConfig.all_objects.filter(
                tenant=self.payroll.tenant,
                owner=self.payroll.owner,
                branch=self.payroll.branch,
            ).first()

            if self.config is None:
                # Genuinely no record — safe to create without IntegrityError.
                self.config = HRConfig(
                    tenant=self.payroll.tenant,
                    owner=self.payroll.owner,
                    branch=self.payroll.branch,
                    enable_leave_approval=True,
                    max_consecutive_leave_days=14,
                    annual_leave_days=20,
                    sick_leave_days=10,
                    enable_attendance_tracking=True,
                    working_hours_per_day=Decimal('8.00'),
                    late_arrival_grace_minutes=15,
                    payroll_currency='USD',
                    payroll_frequency='monthly',
                    tax_rate_percentage=0,
                    enable_pension=False,
                    enable_paye=True,
                    enable_nhf=False,
                    enable_development_levy=False,
                )
                self.config.save()
            elif self.config.is_deleted:
                # Restore a previously soft-deleted config.
                self.config.is_deleted = False
                self.config.save(update_fields=['is_deleted'])

        return self.config
    
    @db_transaction.atomic
    def calculate_payroll(self, staff_list=None):
        """
        Calculate payroll for all staff or specific staff list
        
        Args:
            staff_list: Optional list of Staff instances. If None, processes all active staff
            
        Returns:
            Dict with summary statistics
        """
        from hr.models import Staff, Payslip, Attendance, StaffPayInfo
        
        if self.payroll.status != 'draft':
            raise ValidationError("Can only calculate payroll in draft status")
        
        config = self._get_config()
        
        # Get staff to process
        # Accept either a queryset/list of Staff instances or a list of IDs
        if staff_list:
            # If a list of IDs was passed from the view, convert to queryset
            if isinstance(staff_list, (list, tuple)):
                # detect if items look like primary keys (int or numeric strings)
                if all(isinstance(x, int) or (isinstance(x, str) and x.isdigit()) for x in staff_list):
                    staff_queryset = Staff.objects.filter(
                        id__in=[int(x) for x in staff_list],
                        branch=self.payroll.branch,
                        is_deleted=False
                    )
                else:
                    # Assume it's a list of Staff instances
                    staff_queryset = staff_list
            else:
                # Could be a QuerySet or single Staff instance
                staff_queryset = staff_list
        else:
            staff_queryset = Staff.objects.filter(
                branch=self.payroll.branch,
                is_deleted=False
            )
        
        payslips_created = 0
        total_gross = Decimal('0.00')
        total_deductions = Decimal('0.00')
        total_net = Decimal('0.00')
        total_employee_pension = Decimal('0.00')
        total_employer_pension = Decimal('0.00')
        total_nhf   = Decimal('0.00')
        total_nsitf = Decimal('0.00')

        for staff in staff_queryset:
            # Use a savepoint per staff member so that a failure for one employee
            # only rolls back that slot; the outer atomic block stays intact.
            # Without this, a caught exception breaks the entire transaction in
            # PostgreSQL and all subsequent queries raise TransactionManagementError.
            sid = db_transaction.savepoint()
            try:
                # Calculate staff payslip
                payslip_data = self._calculate_staff_payslip(staff, config)

                # Extract approved_requests before creating payslip
                approved_requests = payslip_data.pop('approved_requests', [])

                # Create payslip
                payslip = Payslip.objects.create(
                    tenant=self.payroll.tenant,
                    payslip_number=config.get_next_payslip_number(),
                    payroll=self.payroll,
                    staff=staff,
                    branch=self.payroll.branch,
                    owner=self.payroll.owner,
                    **payslip_data
                )

                # Calculate totals
                payslip.calculate_totals()
                payslip.save()

                # Mark bonus/deduction requests as applied to this payroll
                for request in approved_requests:
                    request.applied_in_payroll = self.payroll
                    request.save()

                # Update totals
                payslips_created     += 1
                total_gross          += payslip.gross_pay
                total_deductions     += payslip.total_deductions
                total_net            += payslip.net_pay
                total_employee_pension += payslip.employee_pension
                total_employer_pension += payslip.employer_pension
                total_nhf            += payslip.nhf
                total_nsitf          += payslip.nsitf

                db_transaction.savepoint_commit(sid)

            except Exception as e:
                db_transaction.savepoint_rollback(sid)
                logger.warning(
                    "Payroll: skipping staff %s (%s) — %s: %s",
                    staff.pk, staff, type(e).__name__, e,
                    exc_info=True,  # full traceback so we can see the exact line
                )
                continue

        # Update payroll totals
        self.payroll.total_gross_pay       = total_gross
        self.payroll.total_deductions      = total_deductions
        self.payroll.total_net_pay         = total_net
        self.payroll.total_employee_pension = total_employee_pension
        self.payroll.total_employer_pension = total_employer_pension
        self.payroll.total_nhf             = total_nhf
        self.payroll.total_nsitf           = total_nsitf
        self.payroll.status = 'calculated'
        self.payroll.calculated_at = timezone.now()
        self.payroll.save()
        
        return {
            'payslips_created': payslips_created,
            'total_gross_pay': total_gross,
            'total_deductions': total_deductions,
            'total_net_pay': total_net,
        }
    
    def _calculate_staff_payslip(self, staff, config):
        """
        Calculate payslip data for a single staff member.

        PAYE logic
        ----------
        - Only earnings flagged `is_taxable=True` on their SalaryComponent
          are summed into `taxable_income`.
        - `taxable_income` is annualised (×12) and passed through the PAYE
          tiered-band calculator.  Monthly PAYE = annual_PAYE / 12.

        Pension logic (Nigerian Pension Reform Act)
        -------------------------------------------
        - Employee (8%) and employer (10%) pension are computed on
          PENSIONABLE PAY only: Basic Salary + Housing Allowance + Transport
          Allowance (components where `is_pensionable=True`).
        - Leave Allowance, Entertainment, Utility, Lunch, and bonuses are
          excluded from the pension base.

        Returns a dict ready to be spread into Payslip.objects.create().
        """
        from hr.models import Attendance, StaffPayInfo, SalaryComponent, BonusDeductionRequest, StaffIOU

        # Get attendance summary
        attendance_summary = self._get_attendance_summary(staff)

        # ── Collect pay components ────────────────────────────────────────────
        pay_info = StaffPayInfo.objects.filter(
            staff=staff,
            is_deleted=False
        ).select_related('component')

        basic_salary = Decimal('0.00')
        # allowances stored as {name: {amount, is_taxable}}
        allowances = {}
        deductions_dict = {}

        for info in pay_info:
            comp = info.component
            if comp.component_type == SalaryComponent.EARNING:
                name_lower = comp.name.lower()
                if 'basic' in name_lower or 'salary' in name_lower:
                    basic_salary += info.amount
                else:
                    allowances[comp.name] = {
                        'amount': info.amount,
                        'is_taxable': comp.is_taxable,
                        'is_pensionable': comp.is_pensionable,
                    }
            else:  # DEDUCTION
                deductions_dict[comp.name] = info.amount

        # ── Approved one-time bonus / deduction requests ──────────────────────
        payroll_month = self.payroll.period_start.replace(day=1)
        approved_requests = BonusDeductionRequest.objects.filter(
            staff=staff,
            for_month=payroll_month,
            status=BonusDeductionRequest.APPROVED,
            applied_in_payroll__isnull=True,
            is_deleted=False
        ).select_related('component')

        bonuses = Decimal('0.00')
        for request in approved_requests:
            comp = request.component
            if comp.component_type == SalaryComponent.EARNING:
                allowances[f"{comp.name} (One-time)"] = {
                    'amount': request.amount,
                    'is_taxable': comp.is_taxable,
                    'is_pensionable': comp.is_pensionable,
                }
                bonuses += request.amount
            else:
                deductions_dict[f"{comp.name} (One-time)"] = request.amount

        # ── Overtime pay ──────────────────────────────────────────────────────
        overtime_pay = Decimal('0.00')
        if config.enable_overtime_calculation and attendance_summary['overtime_hours'] > 0:
            working_days_per_month = Decimal('22')
            hours_per_day = config.working_hours_per_day
            hourly_rate = basic_salary / (working_days_per_month * hours_per_day)
            overtime_pay = config.calculate_overtime_pay(
                hourly_rate,
                attendance_summary['overtime_hours']
            )

        # ── Gross pay (ALL earnings) ──────────────────────────────────────────
        # NOTE: one-time EARNING requests are stored in the `allowances` dict under
        # "<Name> (One-time)".  total_allowance_amount therefore already includes
        # them.  `bonuses` is kept as a reporting-only subtotal on the payslip so
        # the payslip PDF can display a "One-time bonuses" line, but it must NOT
        # be added again here — doing so would double-count every one-time bonus.
        total_allowance_amount = sum(
            v['amount'] for v in allowances.values()
        )
        gross_pay = basic_salary + overtime_pay + total_allowance_amount

        # ── Pensionable pay (Basic + Housing + Transport per Nigerian Pension Reform Act) ─
        # Basic salary is always pensionable; allowances depend on is_pensionable flag.
        pensionable_allowances = sum(
            v['amount']
            for v in allowances.values()
            if v.get('is_pensionable')
        )
        pensionable_pay = basic_salary + pensionable_allowances

        # ── Taxable income (only taxable earnings) ───────────────────────────
        # Basic salary and overtime are always taxable; allowances depend on flag.
        taxable_allowances = sum(
            v['amount']
            for v in allowances.values()
            if v['is_taxable']
        )
        # One-time taxable bonuses are captured in taxable_allowances via the
        # allowances dict; do NOT add bonuses again.
        taxable_income = basic_salary + overtime_pay + taxable_allowances

        # ── Pension (8% of pensionable pay: Basic + Housing + Transport) ─────
        # Contract staff (is_pension_exempt=True) are excluded from pension.
        if getattr(staff, 'is_pension_exempt', False):
            employee_pension = Decimal('0.00')
            employer_pension = Decimal('0.00')
        else:
            employee_pension = config.calculate_employee_pension(pensionable_pay)
            employer_pension = config.calculate_employer_pension(pensionable_pay)

        # ── PAYE (annualise taxable income, apply progressive bands) ─────────
        monthly_paye, annual_taxable, paye_breakdown = config.calculate_paye_with_breakdown(
            taxable_income, employee_pension=employee_pension
        )

        # ── NHF — National Housing Fund (2.5% of basic salary, employee deduction) ──
        # Statutory rate: 2.5% of basic salary, deducted from employee.
        # NHF-exempt staff can be flagged with `is_nhf_exempt=True` on the Staff model;
        # if that attribute doesn't exist we treat all staff as liable.
        if not config.enable_nhf or getattr(staff, 'is_nhf_exempt', False):
            nhf = Decimal('0.00')
        else:
            nhf = (basic_salary * Decimal('0.025')).quantize(
                Decimal('0.01'), rounding=__import__('decimal').ROUND_HALF_UP
            )

        # ── NSITF — Nigeria Social Insurance Trust Fund (1% of total emolument, employer-paid) ──
        # Statutory rate: 1% of total emolument (gross_pay), borne by employer.
        # Stored on payslip for reporting but does NOT reduce employee net_pay.
        nsitf = (gross_pay * Decimal('0.01')).quantize(
            Decimal('0.01'), rounding=__import__('decimal').ROUND_HALF_UP
        )

        # ── Development Levy (flat per-employee per Nigerian Tax Act 2024) ────
        dev_levy = config.calculate_development_levy()
        if dev_levy > Decimal('0.00'):
            deductions_dict['Development Levy'] = dev_levy

        # ── Active Staff IOUs — fixed monthly deductions ──────────────────────
        # Collect all active IOUs whose start_month <= current payroll month.
        # Each IOU contributes min(monthly_installment, balance_remaining) to
        # the deductions and its balance is reduced after payroll is posted
        # (see PayrollService.reduce_iou_balances).
        payroll_month = self.payroll.period_start.replace(day=1)
        active_ious = StaffIOU.objects.filter(
            staff=staff,
            status=StaffIOU.ACTIVE,
            start_month__lte=payroll_month,
            is_deleted=False,
        )
        iou_total = Decimal('0.00')
        for iou in active_ious:
            installment = min(iou.monthly_installment, iou.balance_remaining)
            iou_total += installment
        if iou_total > 0:
            # All active-IOU deductions are aggregated under a single key so the
            # payroll accounting service can map them to the staff_iou GL account.
            existing = deductions_dict.get('Staff IOU', Decimal('0'))
            deductions_dict['Staff IOU'] = existing + iou_total

        # ── Total deductions ──────────────────────────────────────────────────
        # NHF is a statutory employee deduction (reduces net pay).
        # NSITF is an employer-only cost — NOT deducted from net pay.
        total_other_deductions = sum(v for v in deductions_dict.values())
        total_deductions = monthly_paye + employee_pension + nhf + total_other_deductions

        # ── Net pay ───────────────────────────────────────────────────────────
        net_pay = gross_pay - total_deductions

        return {
            'basic_salary':           basic_salary,
            'overtime_pay':           overtime_pay,
            'allowances':             allowances,
            'bonuses':                bonuses,
            'gross_pay':              gross_pay,
            # PAYE
            'taxable_income':         taxable_income,
            'annual_taxable_income':  Decimal(str(annual_taxable)),
            'paye_breakdown':         paye_breakdown,
            'tax':                    monthly_paye,
            # Pension (computed on Basic + Housing + Transport)
            'employee_pension':       employee_pension,
            'employer_pension':       employer_pension,
            # Other deductions
            'deductions':             deductions_dict,
            'total_deductions':       total_deductions,
            'net_pay':                net_pay,
            # Statutory (NHF = employee deduction; NSITF = employer cost, on-payslip only)
            'nhf':                    nhf,
            'nsitf':                  nsitf,
            # Attendance
            'days_worked':            attendance_summary['days_worked'],
            'days_absent':            attendance_summary['days_absent'],
            'days_on_leave':          attendance_summary['days_on_leave'],
            'overtime_hours':         attendance_summary['overtime_hours'],
            # Pass to caller for marking applied
            'approved_requests':      list(approved_requests),
        }
    
    @db_transaction.atomic
    def reduce_iou_balances(self):
        """
        Called after a payroll is paid/posted.

        For every active StaffIOU whose deduction was included in this
        payroll run, apply one installment reduction.  IOUs whose balance
        drops to zero are automatically marked COMPLETED.

        Returns:
            int — number of IOU records updated
        """
        from hr.models import StaffIOU, Payslip

        payroll_month = self.payroll.period_start.replace(day=1)
        updated = 0

        # Iterate over payslips to know which staff received IOU deductions
        for payslip in self.payroll.payslips.filter(is_deleted=False):
            if not payslip.deductions or 'Staff IOU' not in payslip.deductions:
                continue

            deducted_total = Decimal(str(payslip.deductions['Staff IOU']))

            # Reduce each active IOU for this staff member in order of creation
            for iou in StaffIOU.objects.filter(
                staff=payslip.staff,
                status=StaffIOU.ACTIVE,
                start_month__lte=payroll_month,
                is_deleted=False,
            ).order_by('created_at'):
                if deducted_total <= 0:
                    break
                installment = min(iou.monthly_installment, iou.balance_remaining, deducted_total)
                iou.apply_installment(installment)
                deducted_total -= installment
                updated += 1

        return updated

    def _get_attendance_summary(self, staff):
        """
        Get attendance summary for staff during payroll period
        
        Args:
            staff: Staff instance
            
        Returns:
            Dict with attendance statistics
        """
        from hr.models import Attendance
        
        attendance_records = Attendance.objects.filter(
            staff=staff,
            date__gte=self.payroll.period_start,
            date__lte=self.payroll.period_end,
            is_deleted=False
        )
        
        days_worked = Decimal('0.00')
        days_absent = Decimal('0.00')
        days_on_leave = Decimal('0.00')
        total_overtime_hours = Decimal('0.00')
        
        for record in attendance_records:
            if record.status == 'present':
                days_worked += Decimal('1.00')
            elif record.status == 'late':
                days_worked += Decimal('1.00')  # Still counted as worked
            elif record.status == 'half_day':
                days_worked += Decimal('0.50')
            elif record.status == 'absent':
                days_absent += Decimal('1.00')
            elif record.status == 'on_leave':
                days_on_leave += Decimal('1.00')
            
            # Add overtime hours
            if record.overtime_hours:
                total_overtime_hours += record.overtime_hours
        
        return {
            'days_worked': days_worked,
            'days_absent': days_absent,
            'days_on_leave': days_on_leave,
            'overtime_hours': total_overtime_hours,
        }
    
    @db_transaction.atomic
    def approve_payroll(self, approved_by):
        """
        Approve payroll and post Stage-1 accounting entries.

        This is the single authoritative approval path.  The view MUST call
        this method rather than flipping the status flag directly so that the
        liability journal entries are always created consistently, regardless
        of how the approval is triggered (API, workflow automation, tests, etc.).

        Entries posted:
          JE-LIA  DR Salary Expense / CR Pension Payable / CR PAYE / CR Other / CR Salary Payable
          JE-PEN  DR Pension Expense / CR Employer Pension Payable   (if pension > 0)

        Args:
            approved_by: User approving the payroll

        Returns:
            Payroll instance
        """
        if self.payroll.status != 'calculated':
            raise ValidationError("Can only approve calculated payroll")

        # Stage 1: post liabilities journal entries BEFORE changing status
        # so that any accounting failure rolls back the whole transaction.
        from hr.services.payroll_accounting import PayrollAccountingService
        accounting_service = PayrollAccountingService(self.payroll)
        accounting_service.create_payroll_liability_entry(approved_by)

        self.payroll.status = 'approved'
        self.payroll.approved_at = timezone.now()
        self.payroll.approved_by = approved_by
        self.payroll.save()

        # Notify App 2 (phoenix-compliance-svc) asynchronously.
        # The task creates PayrollStatutoryFiling stubs that App 2 picks up
        # via GET /api/internal/hr/statutory-filings/?status=pending.
        # Import is deferred to avoid circular imports at module load time.
        try:
            from hr.tasks import notify_compliance_service
            notify_compliance_service.delay(self.payroll.pk)
        except Exception:
            # If Celery broker is down, log and continue — don't block the
            # human user's approval action.
            logger.warning(
                'approve_payroll: failed to enqueue notify_compliance_service '
                'for payroll_pk=%s', self.payroll.pk, exc_info=True,
            )

        return self.payroll
    
    @db_transaction.atomic
    def mark_as_paid(self, processed_by, payment_account=None):
        """
        Mark payroll as paid and create accounting entries
        
        Args:
            processed_by: User processing the payment
            payment_account: Optional bank/cash account for payment
            
        Returns:
            Tuple of (Payroll, JournalEntry)
        """
        if self.payroll.status != 'approved':
            raise ValidationError("Can only mark approved payroll as paid")
        
        # Create accounting entries
        from hr.services.payroll_accounting import PayrollAccountingService
        
        accounting_service = PayrollAccountingService(self.payroll)
        journal_entry = accounting_service.process_payroll_payment(
            processed_by=processed_by,
            payment_account=payment_account
        )
        
        # Payroll status is updated by accounting service
        self.payroll.refresh_from_db()
        
        return self.payroll, journal_entry

    
    def generate_payslips_pdf(self):
        """
        Generate PDF for all payslips in this payroll
        
        Returns:
            List of generated PDF file paths
        """
        from hr.services.payslip_generator import PayslipGenerator
        from hr.models import Payslip
        
        payslips = Payslip.objects.filter(payroll=self.payroll, is_active=True)
        generated_files = []
        
        for payslip in payslips:
            generator = PayslipGenerator(payslip)
            pdf_path = generator.generate_pdf()
            if pdf_path:
                generated_files.append(pdf_path)
        
        return generated_files
    
    def get_payroll_summary(self):
        """
        Get payroll summary statistics
        
        Returns:
            Dict with summary data
        """
        from hr.models import Payslip
        
        payslips = Payslip.objects.filter(
            payroll=self.payroll,
            is_deleted=False
        )
        
        return {
            'total_staff': payslips.count(),
            'total_gross_pay': self.payroll.total_gross_pay,
            'total_deductions': self.payroll.total_deductions,
            'total_net_pay': self.payroll.total_net_pay,
            'status': self.payroll.status,
            'period': f"{self.payroll.period_start} to {self.payroll.period_end}",
            'pay_date': self.payroll.pay_date,
        }
