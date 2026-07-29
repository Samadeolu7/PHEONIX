"""
Payslip PDF Generator
Generates professional monthly payslips with full PAYE breakdown, pension details,
earnings/deductions split, and company branding.
"""
from decimal import Decimal
from .base import BasePDFGenerator


class PayslipPDFGenerator(BasePDFGenerator):
    """
    Generates a PDF payslip for one Payslip instance.

    Context variables passed to the template
    -----------------------------------------
    All base company/branch fields plus:

    payslip            – Payslip model instance
    staff              – Staff model instance
    payroll            – Payroll model instance
    period_label       – e.g. "October 2025"
    currency           – e.g. "NGN (₦)"

    -- Earnings table rows --
    earnings_rows      – list of {label, amount, is_taxable}
    gross_pay          – Decimal
    taxable_income     – Decimal  (monthly)
    annual_taxable     – Decimal

    -- Deductions --
    paye_tax           – Decimal  (monthly PAYE)
    paye_breakdown     – list of band dicts (for optional audit section)
    annual_paye        – Decimal  (paye_tax × 12, for reference)
    employee_pension   – Decimal
    other_deductions   – list of {label, amount}
    total_deductions   – Decimal

    net_pay            – Decimal

    -- Employer (informational only) --
    employer_pension   – Decimal

    -- Attendance --
    days_worked, days_absent, days_on_leave, overtime_hours
    """

    template_name = 'pdf/payslip.html'

    def get_context_data(self):
        context = super().get_context_data()

        payslip = self.instance
        staff   = payslip.staff
        payroll = payslip.payroll

        # ── Period label ──────────────────────────────────────────────────────
        period_label = payroll.period_start.strftime('%B %Y') if payroll.period_start else ''

        # Nigerian Naira
        currency_code = 'NGN'
        # Keep hr_config reference for pension_provider below
        hr_config = None
        try:
            from hr.config_models import HRConfig
            hr_config = HRConfig.get_for_branch(self.branch)
        except Exception:
            pass

        currency_symbols = {
            'NGN': '₦', 'USD': '$', 'GBP': '£', 'EUR': '€', 'GHS': '₵',
            'KES': 'KSh', 'ZAR': 'R', 'UGX': 'USh', 'TZS': 'TSh',
        }
        currency_symbol = currency_symbols.get(currency_code, currency_code)

        # ── Earnings rows ─────────────────────────────────────────────────────
        earnings_rows = []

        # Basic salary is always taxable
        if payslip.basic_salary:
            earnings_rows.append({
                'label':      'Basic Salary',
                'amount':     payslip.basic_salary,
                'is_taxable': True,
            })

        # Overtime is always taxable
        if payslip.overtime_pay:
            earnings_rows.append({
                'label':      f'Overtime Pay ({payslip.overtime_hours} hrs)',
                'amount':     payslip.overtime_pay,
                'is_taxable': True,
            })

        # Bonuses (always taxable)
        if payslip.bonuses:
            earnings_rows.append({
                'label':      'Bonuses',
                'amount':     payslip.bonuses,
                'is_taxable': True,
            })

        # Allowances — stored as {name: {amount, is_taxable}} or legacy {name: amount}
        for name, val in (payslip.allowances or {}).items():
            if isinstance(val, dict):
                amt = Decimal(str(val.get('amount', 0)))
                taxable = val.get('is_taxable', True)
            else:
                amt = Decimal(str(val))
                taxable = True
            if amt:
                earnings_rows.append({
                    'label':      name,
                    'amount':     amt,
                    'is_taxable': taxable,
                })

        # ── Other deductions (non-pension, non-PAYE) ──────────────────────────
        other_deductions = []
        iou_monthly_deduction = Decimal('0')
        for name, amt in (payslip.deductions or {}).items():
            d_amt = Decimal(str(amt))
            if d_amt:
                other_deductions.append({'label': name, 'amount': d_amt})
            if name == 'Staff IOU':
                iou_monthly_deduction = d_amt

        # ── Staff IOU balance details for transparency section ────────────────
        iou_details = []
        iou_total_outstanding = Decimal('0')
        try:
            from hr.models import StaffIOU
            payroll_month = payroll.period_start.replace(day=1)
            active_ious = StaffIOU.objects.filter(
                staff=staff,
                status=StaffIOU.ACTIVE,
                start_month__lte=payroll_month,
                is_deleted=False,
            ).order_by('start_month', 'created_at')
            for iou in active_ious:
                installment = min(iou.monthly_installment, iou.balance_remaining)
                iou_total_outstanding += iou.balance_remaining
                iou_details.append({
                    'reference':          iou.reference_number,
                    'monthly_installment': installment,
                    'balance_before':     iou.balance_remaining,
                    'balance_after':      max(Decimal('0'), iou.balance_remaining - installment),
                })
        except Exception:
            pass
        iou_balance_after = max(Decimal('0'), iou_total_outstanding - iou_monthly_deduction)

        # ── PAYE band details ─────────────────────────────────────────────────
        paye_breakdown = payslip.paye_breakdown or []
        annual_paye = (payslip.tax * Decimal('12')).quantize(Decimal('0.01'))

        # ── Number-to-words for net pay ───────────────────────────────────────
        net_pay_words = self._amount_in_words(payslip.net_pay, currency_code)

        context.update({
            'document_title': f'Payslip – {staff.first_name} {staff.last_name} – {period_label}',
            'document_type':  'MONTHLY PAYSLIP',

            # Core objects
            'payslip':    payslip,
            'staff':      staff,
            'payroll':    payroll,

            # Header identifiers
            'payslip_number': payslip.payslip_number,
            'period_label':   period_label,
            'pay_date':       payroll.pay_date,

            # Staff info
            'staff_name':     f'{staff.first_name} {staff.last_name}',
            'staff_id':       staff.staff_id,
            'staff_position': staff.position or '—',
            'staff_dept':     staff.department or '—',
            'staff_location': (
                self.branch.name
                if self.branch
                else getattr(self.tenant, 'name', '—')
            ),

            # Currency
            'currency_code':   currency_code,
            'currency_symbol': currency_symbol,

            # Earnings
            'earnings_rows': earnings_rows,
            'gross_pay':     payslip.gross_pay,

            # Taxable income / PAYE
            'taxable_income':  payslip.taxable_income,
            'annual_taxable':  payslip.annual_taxable_income,
            'paye_tax':        payslip.tax,
            'annual_paye':     annual_paye,
            'paye_breakdown':  paye_breakdown,

            # Pension
            'employee_pension': payslip.employee_pension,
            'employer_pension': payslip.employer_pension,

            # NHF (National Housing Fund, 2.5% of basic salary)
            'nhf': payslip.nhf,

            # Other deductions
            'other_deductions': other_deductions,
            'total_deductions': payslip.total_deductions,

            # IOU transparency (shown as a separate section below net pay)
            'iou_details':            iou_details,
            'iou_monthly_deduction':  iou_monthly_deduction,
            'iou_total_outstanding':  iou_total_outstanding,
            'iou_balance_after':      iou_balance_after,

            # Net pay
            'net_pay':       payslip.net_pay,
            'net_pay_words': net_pay_words,

            # Attendance
            'days_worked':     payslip.days_worked,
            'days_absent':     payslip.days_absent,
            'days_on_leave':   payslip.days_on_leave,
            'overtime_hours':  payslip.overtime_hours,

            # Pension provider (from HR config or staff record)
            'pension_provider': (
                getattr(staff, 'pension_provider', '')
                or getattr(hr_config, 'pension_provider_name', '')
                if 'hr_config' in dir()
                else getattr(staff, 'pension_provider', '')
            ),
        })

        return context

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _amount_in_words(self, amount: Decimal, currency_code: str = 'NGN') -> str:
        """Convert a Decimal amount to words (e.g. for payslip footer)."""
        try:
            import num2words
            major = int(amount)
            minor = round((amount - major) * 100)
            words = num2words.num2words(major, lang='en').title()
            kobo_label = 'Kobo' if currency_code == 'NGN' else 'Cents'
            currency_label = 'Naira' if currency_code == 'NGN' else currency_code
            if minor:
                return f'{words} {currency_label}, {minor:02d} {kobo_label} Only.'
            return f'{words} {currency_label} Only.'
        except Exception:
            return f'{currency_code} {amount:,.2f}'
