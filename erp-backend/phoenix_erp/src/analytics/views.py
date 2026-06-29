# analytics/views.py
"""
Microfinance ERP Dashboard Analytics — Krystar Trust Investment Limited
Provides role-specific KPI summaries for the dashboard.

All querysets use Model.objects.for_user(user) — the canonical scoping
pattern for this codebase (OwnerBranchManager.for_user filters by
tenant + branch and excludes soft-deleted rows automatically).
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count, Q
from django.utils import timezone
from decimal import Decimal
import datetime

def _is_global_user(user):
    """True when the user has a global-scope Role (cross-branch access)."""
    if getattr(user, 'is_system_admin', False):
        return True
    if callable(getattr(user, 'is_owner', None)) and user.is_owner():
        return True
    try:
        return user.roles.filter(is_active=True, default_scope='global').exists()
    except Exception:
        return False


def _get_director_branch(request):
    """
    Return the Branch the global-scope user selected via X-Branch-ID, or None.
    Returns None both when the user is not elevated AND when no branch is selected
    (all-branches view).  Callers should apply no extra filter when None is returned.
    """
    user = request.user
    if not _is_global_user(user):
        return None

    header_val = request.META.get('HTTP_X_BRANCH_ID', '').strip()
    if not header_val:
        return None  # "All Branches" view — no extra filter

    try:
        from branches.models import Branch
        tenant = getattr(user, 'tenant', None)
        qs = Branch.objects.filter(pk=int(header_val), is_deleted=False)
        if tenant:
            qs = qs.filter(tenant=tenant)
        return qs.get()
    except Exception:
        return None


def _scoped(qs, branch):
    """Filter queryset by branch when the director has selected one."""
    if branch is None:
        return qs
    try:
        if any(f.name == 'branch' for f in qs.model._meta.get_fields()):
            return qs.filter(branch=branch)
    except Exception:
        pass
    return qs


_SCOPE_RANK = {
    'assigned_clients': 0,
    'own_records':       0,
    'ajo_group':         1,
    'own_branch':        2,
    'global':            3,
}

# These roles are always scoped to personally-assigned clients regardless of
# what default_scope is stored on the Role record in the database.
_FIELD_OFFICER_ROLES = frozenset({
    'credit officer', 'loan officer', 'field officer', 'officer', 'registrar',
})


def _apply_officer_scope(qs, user, client_lookup: str):
    """
    Narrow a queryset to only the records this user may see based on
    their tenant Role.default_scope.  Field officers are always pinned to
    rank 0 (assigned_clients) by role name so that a mis-configured role
    record cannot accidentally expose the whole branch portfolio.
    """
    if _is_global_user(user):
        return qs

    rank = 2
    try:
        for r in user.roles.filter(is_active=True):
            s = getattr(r, 'default_scope', None)
            r_rank = _SCOPE_RANK.get(s)
            if r_rank is not None and r_rank < rank:
                rank = r_rank
            # Force assigned-clients scope for field-level officer roles,
            # even when default_scope is not configured on the role record.
            role_name = (getattr(r, 'name', '') or '').lower()
            if role_name in _FIELD_OFFICER_ROLES:
                rank = min(rank, 0)
    except Exception:
        pass

    if rank >= 2:
        return qs

    staff = None
    try:
        staff = user.staff_profile
    except Exception:
        pass
    if not staff:
        return qs.none()

    if rank == 0:
        return qs.filter(Q(**{client_lookup: staff}))

    # rank 1: ajo_group / supervisor
    return qs.filter(
        Q(**{client_lookup: staff}) |
        Q(**{f'{client_lookup}__reports_to': staff})
    )


class MicrofinanceDashboardStatsView(APIView):
    """
    GET /api/analytics/dashboard-stats/

    Returns all KPIs needed to drive role-based microfinance dashboards.
    Every value is safe to render even when no data exists (defaults to 0 / "0.00").

    Response shape matches the MicrofinanceDashboardStats TypeScript interface.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        today = timezone.now().date()
        branch = _get_director_branch(request)

        req_tenant = getattr(request, 'tenant', None)

        def scope_qs(qs):
            if req_tenant and not getattr(user, 'tenant', None):
                qs = qs.filter(tenant=req_tenant)
            return _scoped(qs, branch)

        data = {}

        # ── Clients ───────────────────────────────────────────────────────────
        try:
            from clients.models import Client
            client_qs = _apply_officer_scope(
                scope_qs(Client.objects.for_user(user)),
                user,
                client_lookup='assigned_officer',
            )
            data['total_clients'] = client_qs.count()
            data['active_clients'] = client_qs.filter(status='active').count()
            data['new_clients_this_month'] = client_qs.filter(
                created_at__year=today.year,
                created_at__month=today.month,
            ).count()
        except Exception:
            data.update({'total_clients': 0, 'active_clients': 0, 'new_clients_this_month': 0})

        # ── Loans ─────────────────────────────────────────────────────────────
        try:
            from loans.models import LoanAccount
            loan_qs = _apply_officer_scope(
                scope_qs(LoanAccount.objects.for_user(user)),
                user,
                client_lookup='client__assigned_officer',
            )

            data['active_loans'] = loan_qs.filter(status__in=['active', 'disbursed']).count()

            total_book = loan_qs.filter(
                status__in=['active', 'disbursed']
            ).aggregate(total=Sum('outstanding_principal'))['total'] or Decimal('0.00')
            data['total_loan_book'] = str(total_book)

            disbursed_this_month = loan_qs.filter(
                disbursement_date__year=today.year,
                disbursement_date__month=today.month,
            ).aggregate(total=Sum('disbursed_amount'))['total'] or Decimal('0.00')
            data['total_disbursed_this_month'] = str(disbursed_this_month)

            data['overdue_loans'] = loan_qs.filter(
                days_in_arrears__gt=0,
                status__in=['active', 'disbursed'],
            ).count()

            # Repayment rate = (total_paid / (total_paid + total_outstanding)) * 100
            agg = loan_qs.filter(status__in=['active', 'disbursed', 'paid_off']).aggregate(
                paid=Sum('total_paid'),
                outstanding=Sum('outstanding_principal'),
            )
            paid = agg['paid'] or Decimal('0.00')
            outstanding = agg['outstanding'] or Decimal('0.00')
            total_obligation = paid + outstanding
            data['loan_repayment_rate'] = (
                round(float(paid / total_obligation) * 100, 1)
                if total_obligation > 0 else 0.0
            )

            # Defaulting loans (CBN classification = loss/doubtful or status=defaulted)
            data['defaulting_loans'] = loan_qs.filter(status='defaulted').count()

            # PAR30 — outstanding balance of loans > 30 days in arrears
            active_qs = loan_qs.filter(status__in=['active', 'disbursed', 'defaulted'])
            glp = active_qs.aggregate(t=Sum('outstanding_principal'))['t'] or Decimal('0')
            par30_bal = active_qs.filter(
                days_in_arrears__gte=30
            ).aggregate(t=Sum('outstanding_principal'))['t'] or Decimal('0')
            data['par30_ratio'] = (
                round(float(par30_bal / glp) * 100, 2) if glp > 0 else 0.0
            )
            data['par30_amount'] = str(par30_bal)

            # Monthly collections — repayments received this calendar month
            try:
                from loans.models import LoanRepaymentSchedule
                monthly_coll = LoanRepaymentSchedule.objects.filter(
                    loan__in=loan_qs,
                    paid_date__year=today.year,
                    paid_date__month=today.month,
                ).aggregate(t=Sum('total_paid'))['t'] or Decimal('0')
                data['collections_this_month'] = str(monthly_coll)
            except Exception:
                data['collections_this_month'] = '0.00'

        except Exception:
            data.update({
                'active_loans': 0,
                'total_loan_book': '0.00',
                'total_disbursed_this_month': '0.00',
                'overdue_loans': 0,
                'defaulting_loans': 0,
                'loan_repayment_rate': 0.0,
                'par30_ratio': 0.0,
                'par30_amount': '0.00',
                'collections_this_month': '0.00',
            })

        # ── Savings ───────────────────────────────────────────────────────────
        try:
            from savings.models import SavingsAccount
            savings_qs = _apply_officer_scope(
                scope_qs(SavingsAccount.objects.for_user(user)).filter(status='active'),
                user,
                client_lookup='client__assigned_officer',
            )
            total_savings = savings_qs.aggregate(
                total=Sum('account__balance')
            )['total'] or Decimal('0.00')
            data['total_savings'] = str(total_savings)
        except Exception:
            data['total_savings'] = '0.00'

        # ── Pending Approvals ─────────────────────────────────────────────────
        pending_approvals = 0
        try:
            from loans.models import LoanAccount
            pending_approvals += _apply_officer_scope(
                scope_qs(LoanAccount.objects.for_user(user)),
                user,
                client_lookup='client__assigned_officer',
            ).filter(status='pending').count()
        except Exception:
            pass

        try:
            from hr.models import LeaveRequest, BonusDeductionRequest
            pending_approvals += scope_qs(LeaveRequest.objects.for_user(user)).filter(status='submitted').count()
            pending_approvals += scope_qs(BonusDeductionRequest.objects.for_user(user)).filter(status='PENDING').count()
        except Exception:
            pass

        try:
            from procurement.models import PurchaseRequisition, PurchaseOrder
            pending_approvals += scope_qs(PurchaseRequisition.objects.for_user(user)).filter(status='submitted').count()
            pending_approvals += scope_qs(PurchaseOrder.objects.for_user(user)).filter(status='submitted').count()
        except Exception:
            pass

        data['pending_approvals'] = pending_approvals

        # ── Cashier Balance ───────────────────────────────────────────────────
        # The logged-in user's own cash account — must be 0 at end of day.
        try:
            from accounts.models import Account
            ca = Account.objects.filter(
                owner=user, is_active=True, is_deleted=False, is_cashier_bank=True
            ).order_by('-created_at').first()
            if ca:
                data['cashier_balance'] = str(ca.balance)
            else:
                data['cashier_balance'] = 'No cashier account'
        except Exception:
            data['cashier_balance'] = 'error'
                
        # ── Pending Tickets ───────────────────────────────────────────────────
        try:
            from tickets.models import Ticket
            data['pending_tickets'] = scope_qs(Ticket.objects.for_user(user)).filter(
                status__in=['OPEN', 'INPR']
            ).count()
        except Exception:
            data['pending_tickets'] = 0

        # ── Staff ─────────────────────────────────────────────────────────────
        try:
            from hr.models import Staff
            data['total_staff'] = scope_qs(Staff.objects.for_user(user)).count()
        except Exception:
            data['total_staff'] = 0

        # ── Financial Period ──────────────────────────────────────────────────
        # Re-uses the AcademicYear/Term infrastructure — can be renamed to
        # FinancialYear/Period in a future model migration.
        try:
            from incomes.models_calendar import AcademicYear
            active_year = AcademicYear.objects.for_user(user).filter(is_active=True).first()
            if active_year:
                data['active_financial_year'] = active_year.name
                active_period = active_year.terms.filter(
                    start_date__lte=today,
                    end_date__gte=today,
                ).first()
                if active_period:
                    data['active_period'] = getattr(active_period, 'name', str(active_period))
                    total_days = max((active_period.end_date - active_period.start_date).days, 1)
                    elapsed = (today - active_period.start_date).days
                    data['period_progress_pct'] = min(100, round((elapsed / total_days) * 100, 1))
                else:
                    data.update({'active_period': None, 'period_progress_pct': 0})
            else:
                data.update({'active_financial_year': None, 'active_period': None, 'period_progress_pct': 0})
        except Exception:
            data.update({'active_financial_year': None, 'active_period': None, 'period_progress_pct': 0})

        return Response({'success': True, 'data': data})


# ── Backward-compat alias (old frontend called school-dashboard-stats) ────────
SchoolDashboardStatsView = MicrofinanceDashboardStatsView


class LoanRepaymentTrendView(APIView):
    """
    GET /api/analytics/loan-repayment-trend/?months=6

    Returns monthly loan disbursed vs. repaid amounts for charting.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        months = min(int(request.query_params.get('months', 6)), 24)
        today = timezone.now().date()
        branch = _get_director_branch(request)

        result = []
        for i in range(months - 1, -1, -1):
            year = today.year
            month = today.month - i
            while month <= 0:
                month += 12
                year -= 1

            try:
                from loans.models import LoanAccount, LoanRepaymentSchedule
                disbursed = _scoped(LoanAccount.objects.for_user(user), branch).filter(
                    disbursement_date__year=year,
                    disbursement_date__month=month,
                ).aggregate(total=Sum('disbursed_amount'))['total'] or Decimal('0.00')

                repaid = _scoped(LoanRepaymentSchedule.objects.for_user(user), branch).filter(
                    paid_date__year=year,
                    paid_date__month=month,
                    status='paid',
                ).aggregate(total=Sum('amount_paid'))['total'] or Decimal('0.00')
            except Exception:
                disbursed = Decimal('0.00')
                repaid = Decimal('0.00')

            result.append({
                'month': f"{year}-{month:02d}",
                'label': datetime.date(year, month, 1).strftime('%b %Y'),
                'disbursed': float(disbursed),
                'repaid': float(repaid),
            })

        return Response({'success': True, 'data': result})


class ClientGrowthView(APIView):
    """
    GET /api/analytics/client-growth/?months=6

    Returns monthly new client registrations for charting.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        months = min(int(request.query_params.get('months', 6)), 24)
        today = timezone.now().date()
        branch = _get_director_branch(request)

        result = []
        for i in range(months - 1, -1, -1):
            year = today.year
            month = today.month - i
            while month <= 0:
                month += 12
                year -= 1

            try:
                from clients.models import Client
                count = _scoped(Client.objects.for_user(user), branch).filter(
                    created_at__year=year,
                    created_at__month=month,
                ).count()
            except Exception:
                count = 0

            result.append({
                'month': f"{year}-{month:02d}",
                'label': datetime.date(year, month, 1).strftime('%b %Y'),
                'new_clients': count,
            })

        return Response({'success': True, 'data': result})


class StaffAttendanceSummaryView(APIView):
    """
    GET /api/analytics/staff-attendance/?date=YYYY-MM-DD

    Returns the attendance summary for a given date (defaults to today).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        date_str = request.query_params.get('date')
        try:
            target_date = datetime.date.fromisoformat(date_str) if date_str else timezone.now().date()
        except ValueError:
            target_date = timezone.now().date()

        try:
            from hr.models import Attendance, Staff
            total_staff = Staff.objects.for_user(user).count()
            att_qs = Attendance.objects.for_user(user).filter(date=target_date)
            summary = att_qs.values('status').annotate(count=Count('id'))
            summary_dict = {row['status']: row['count'] for row in summary}

            data = {
                'date': str(target_date),
                'total_staff': total_staff,
                'present': summary_dict.get('present', 0),
                'absent': summary_dict.get('absent', 0),
                'late': summary_dict.get('late', 0),
                'on_leave': summary_dict.get('on_leave', 0),
                'attendance_rate': (
                    round((summary_dict.get('present', 0) / total_staff) * 100, 1)
                    if total_staff else 0.0
                ),
            }
        except Exception:
            data = {
                'date': str(target_date),
                'total_staff': 0, 'present': 0, 'absent': 0,
                'late': 0, 'on_leave': 0, 'attendance_rate': 0.0,
            }

        return Response({'success': True, 'data': data})


