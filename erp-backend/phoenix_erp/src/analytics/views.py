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
from django.http import HttpResponse
from django.utils import timezone
from decimal import Decimal, ROUND_HALF_UP
import csv
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


def _apply_officer_scope(qs, user, client_lookup: str, *, module: str, page: str):
    """
    Narrow a queryset to only the records this user may see, based on the
    RolePermissionPolicy scope configured for (module, page) via the
    Permission Setup UI — the same PermissionResolver-driven mechanism
    ScopedModelViewSet._apply_officer_scope uses for list endpoints (see
    common/views.py), so a report's totals agree with what an officer can
    already see in the underlying list view for the same module/page.

    Previously this read Role.default_scope directly, a coarser, page-blind
    value the Permission Setup UI's per-page Scope dropdown had no effect
    on — an admin setting "Assigned Clients Only" for a page did nothing to
    any analytics report built from the same data.
    """
    if _is_global_user(user):
        return qs

    from permissions.services import PermissionResolver
    scope = PermissionResolver.resolve(user, module=module, page=page).scope

    if scope in ('own_branch', 'global'):
        return qs

    staff = None
    try:
        staff = user.staff_profile
    except Exception:
        pass
    if not staff:
        return qs.none()

    # Unassigned records (client_lookup IS NULL) are visible to everyone,
    # not just the officers they'd otherwise be scoped to — matches
    # ScopedModelViewSet._apply_officer_scope's documented behavior.
    unassigned = Q(**{f'{client_lookup}__isnull': True})

    if scope == 'ajo_group':
        return qs.filter(
            Q(**{client_lookup: staff}) |
            Q(**{f'{client_lookup}__reports_to': staff}) |
            unassigned
        )

    # own_records / assigned_clients (and any other/unrecognized value) —
    # narrowest tier, fail toward MORE restriction rather than less.
    return qs.filter(Q(**{client_lookup: staff}) | unassigned)


def _parse_date_range(request, default_days=365, max_days=1825):
    """
    Parse start/end query params for report endpoints that need a real
    (non-hardcoded) range. Defaults to the trailing 12 months, clamped to 5
    years. Unlike CashInflowTrendView's 90-day cap (a per-day series), these
    are aggregate queries so a much wider range is cheap.
    """
    today = timezone.now().date()
    start_raw = request.query_params.get('start')
    end_raw = request.query_params.get('end')
    try:
        start = (
            datetime.date.fromisoformat(start_raw) if start_raw
            else today - datetime.timedelta(days=default_days)
        )
    except ValueError:
        start = today - datetime.timedelta(days=default_days)
    try:
        end = datetime.date.fromisoformat(end_raw) if end_raw else today
    except ValueError:
        end = today

    if end < start:
        start, end = end, start
    if (end - start).days > max_days:
        start = end - datetime.timedelta(days=max_days)
    return start, end


def _parse_day_range(request, max_days=92):
    """
    Parse start/end for reports whose natural default is "today", not a
    trailing window (unlike _parse_date_range) — e.g. a daily operational
    roll that can be widened to a month. Capped at max_days so a paginated-
    free disbursements/collections table stays bounded regardless of how
    wide a range is requested.
    """
    today = timezone.now().date()
    start_raw = request.query_params.get('start')
    end_raw = request.query_params.get('end')
    try:
        start = datetime.date.fromisoformat(start_raw) if start_raw else today
    except ValueError:
        start = today
    try:
        end = datetime.date.fromisoformat(end_raw) if end_raw else start
    except ValueError:
        end = start
    if end < start:
        start, end = end, start
    if (end - start).days > max_days:
        start = end - datetime.timedelta(days=max_days)
    return start, end


def _apply_report_filters(qs, request, branch_field='branch_id',
                           product_field='product__product_id',
                           officer_field='client__assigned_officer_id'):
    """Intersect qs with optional ?branch=&product=&officer= query params."""
    for param, field in (
        ('branch', branch_field), ('product', product_field), ('officer', officer_field),
    ):
        raw = request.query_params.get(param)
        if raw:
            try:
                qs = qs.filter(**{field: int(raw)})
            except (TypeError, ValueError):
                pass
    return qs


def _csv_response(filename, headers, rows):
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    writer = csv.writer(response)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    return response


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
                module='clients', page='clients',
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
                module='loans', page='loan-accounts',
            )

            data['active_loans'] = loan_qs.filter(status__in=['active', 'disbursed', 'defaulted']).count()

            # Gross Loan Portfolio — must match the PAR report's definition
            # (loans/views.py par_summary/cbn_returns), which includes
            # 'defaulted' loans since they still carry outstanding balances.
            # Kept as the PAR30 denominator below regardless of what
            # total_loan_book displays — that ratio needs a numerator/
            # denominator on the same (principal-only) basis to mean anything.
            active_qs = loan_qs.filter(status__in=['active', 'disbursed', 'defaulted'])
            glp = active_qs.aggregate(t=Sum('outstanding_principal'))['t'] or Decimal('0.00')

            # "Loan Book" displayed figure: for global-scope users (director/
            # admin/owner — see _is_global_user), show the Trial Balance's own
            # "Customer Loan Portfolio" (GL account 1150) total instead of the
            # app-level outstanding_principal sum, so the dashboard headline
            # matches what Finance sees on the Trial Balance report. This is
            # NOT the same number as `glp` above by design — the GL receivable
            # also carries recognized-at-disbursement interest, and (until
            # cleaned up) any residual balance on loans a legacy import marked
            # terminal without zeroing the GL — see audit_loan_book_gl_gap for
            # the full breakdown of that gap.
            #
            # Branch-manager and officer views keep the outstanding_principal
            # figure: the GL has no per-officer split, and a branch total
            # would misrepresent an individual officer's own book.
            if _is_global_user(user):
                from accounts.models import Account
                tb_parents = Account.objects.filter(
                    code='1150', account_level=Account.LEVEL_PARENT, is_deleted=False,
                )
                if branch:
                    tb_parents = tb_parents.filter(branch=branch)
                elif req_tenant and not getattr(user, 'tenant', None):
                    tb_parents = tb_parents.filter(tenant=req_tenant)
                trial_balance_loan_total = Account.objects.filter(
                    parent__in=tb_parents, is_deleted=False,
                ).aggregate(t=Sum('balance'))['t'] or Decimal('0.00')
                data['total_loan_book'] = str(trial_balance_loan_total)
                data['total_loan_book_source'] = 'trial_balance'
            else:
                data['total_loan_book'] = str(glp)
                data['total_loan_book_source'] = 'outstanding_principal'

            disbursed_this_month = loan_qs.filter(
                disbursement_date__year=today.year,
                disbursement_date__month=today.month,
            ).aggregate(total=Sum('disbursed_amount'))['total'] or Decimal('0.00')
            data['total_disbursed_this_month'] = str(disbursed_this_month)

            # Count live from the repayment schedule, not the cached
            # LoanAccount.days_in_arrears field — that field is dual-written
            # by update_loan_status_task and the external BulkLoanAccrualView
            # batch and can go stale, which is why this KPI (247) used to
            # disagree with the Defaulters Report (131), which already
            # computes arrears the same live way. See defaulted_loans_as_of.
            # Include 'defaulted' status too — those loans are by definition
            # overdue, and the Defaulters Report (loans_active_as_of_qs)
            # already counts them; excluding them here was under-counting.
            from loans.views import defaulted_loans_as_of
            overdue_qs = loan_qs.filter(status__in=['active', 'disbursed', 'defaulted'])
            data['overdue_loans'] = sum(
                1 for _ in defaulted_loans_as_of(overdue_qs, today)
            )

            # Repayment rate = (total_paid / (total_paid + total_outstanding)) * 100
            agg = loan_qs.filter(status__in=['active', 'disbursed', 'paid_off']).aggregate(
                paid=Sum('total_paid'),
                outstanding=Sum('outstanding_principal'),
            )
            paid = agg['paid'] or Decimal('0.00')
            outstanding = agg['outstanding'] or Decimal('0.00')
            total_obligation = paid + outstanding
            data['loan_repayment_rate'] = (
                (paid / total_obligation * 100).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)
                if total_obligation > 0 else Decimal('0')
            )

            # Defaulting loans (CBN classification = loss/doubtful or status=defaulted)
            data['defaulting_loans'] = loan_qs.filter(status='defaulted').count()

            # PAR30 — outstanding balance of loans > 30 days in arrears
            par30_bal = active_qs.filter(
                days_in_arrears__gte=30
            ).aggregate(t=Sum('outstanding_principal'))['t'] or Decimal('0')
            data['par30_ratio'] = (
                (par30_bal / glp * 100).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP) if glp > 0 else Decimal('0')
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
                'total_loan_book_source': 'outstanding_principal',
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
                module='savings', page='savings-accounts',
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
                module='loans', page='loan-accounts',
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
        # Resolved via CashierAccount.cashier=user so that the lookup is always
        # tied to the actual cashier FK, regardless of who "owns" the GL account.
        try:
            from cash_management.models import CashierAccount as _CA
            _ca = (
                _CA.objects
                .filter(cashier=user, is_active=True, is_deleted=False)
                .select_related('account')
                .first()
            )
            if _ca:
                balance = _ca.account.balance if _ca.account_id else _ca.current_balance
                data['cashier_balance'] = str(balance)
                data['cashier_account_name'] = _ca.name
                data['cashier_account_id'] = _ca.account_id
            else:
                data['cashier_balance'] = None
                data['cashier_account_name'] = None
                data['cashier_account_id'] = None
        except Exception:
            data['cashier_balance'] = None
            data['cashier_account_name'] = None
            data['cashier_account_id'] = None
                
        # ── Pending Tickets ───────────────────────────────────────────────────
        try:
            from tickets.models import Ticket
            data['pending_tickets'] = scope_qs(Ticket.objects.for_user(user)).filter(
                status__in=['OPEN', 'INPR']
            ).count()
        except Exception:
            data['pending_tickets'] = 0

        # ── Pending Prospects ─────────────────────────────────────────────────
        try:
            from clients.models import Client
            data['pending_prospects'] = _apply_officer_scope(
                scope_qs(Client.objects.for_user(user)),
                user,
                client_lookup='assigned_officer',
                module='clients', page='clients',
            ).filter(client_type='pr').count()
        except Exception:
            data['pending_prospects'] = 0

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
                    payment_date__year=year,
                    payment_date__month=month,
                    status='paid',
                ).aggregate(total=Sum('total_paid'))['total'] or Decimal('0.00')
            except Exception:
                disbursed = Decimal('0.00')
                repaid = Decimal('0.00')

            result.append({
                'month': f"{year}-{month:02d}",
                'label': datetime.date(year, month, 1).strftime('%b %Y'),
                'disbursed': disbursed,
                'repaid': repaid,
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


class StaffPerformanceView(APIView):
    """
    GET /api/analytics/staff-performance/

    Per-loan-officer scorecard: portfolio size (outstanding), collection rate
    (paid vs. total obligation — same definition as the overall
    loan_repayment_rate KPI), and this-month disbursement volume. Grouped by
    the credit officer (hr.Staff) assigned to each loan's client.

    Director/global users see every officer (optionally narrowed to one
    branch via X-Branch-ID); a scoped user only ever sees their own row via
    the same officer-scoping used everywhere else in this module.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from loans.models import LoanAccount
        from hr.models import Staff

        user = request.user
        today = timezone.now().date()
        branch = _get_director_branch(request)

        req_tenant = getattr(request, 'tenant', None)

        def scope_qs(qs):
            if req_tenant and not getattr(user, 'tenant', None):
                qs = qs.filter(tenant=req_tenant)
            return _scoped(qs, branch)

        loan_qs = _apply_officer_scope(
            scope_qs(LoanAccount.objects.for_user(user)),
            user,
            client_lookup='client__assigned_officer',
            module='loans', page='loan-accounts',
        )

        portfolio_rows = (
            loan_qs.filter(status__in=['active', 'disbursed'])
            .exclude(client__assigned_officer__isnull=True)
            .values('client__assigned_officer')
            .annotate(
                portfolio_size=Sum('outstanding_principal'),
                paid=Sum('total_paid'),
                loan_count=Count('id'),
            )
        )
        portfolio_map = {r['client__assigned_officer']: r for r in portfolio_rows}

        disb_rows = (
            loan_qs.filter(
                disbursement_date__year=today.year,
                disbursement_date__month=today.month,
            )
            .exclude(client__assigned_officer__isnull=True)
            .values('client__assigned_officer')
            .annotate(disbursed=Sum('disbursed_amount'))
        )
        disb_map = {r['client__assigned_officer']: (r['disbursed'] or Decimal('0.00')) for r in disb_rows}

        officer_ids = set(portfolio_map) | set(disb_map)
        staff_qs = scope_qs(Staff.objects.for_user(user)).filter(id__in=officer_ids)

        result = []
        for staff in staff_qs:
            p = portfolio_map.get(staff.id, {})
            portfolio_size = p.get('portfolio_size') or Decimal('0.00')
            paid = p.get('paid') or Decimal('0.00')
            total_obligation = paid + portfolio_size
            collection_rate = (
                (paid / total_obligation * 100).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)
                if total_obligation > 0 else Decimal('0')
            )
            result.append({
                'staff_id': staff.id,
                'name': f"{staff.first_name} {staff.last_name}".strip(),
                'position': staff.position,
                'portfolio_size': str(portfolio_size),
                'loan_count': p.get('loan_count') or 0,
                'collection_rate': str(collection_rate),
                'disbursed_this_month': str(disb_map.get(staff.id, Decimal('0.00'))),
            })

        result.sort(key=lambda r: Decimal(r['portfolio_size']), reverse=True)
        return Response({'success': True, 'data': result})


class CashInflowTrendView(APIView):
    """
    GET /api/analytics/cash-inflow-trend/?start=YYYY-MM-DD&end=YYYY-MM-DD

    Expected (scheduled due) vs. actual (collected) loan repayment cash
    inflow, bucketed by day, for the given range (defaults to the FULL
    current calendar month — 1st through the last day — capped at 90 days).
    Replaces the old system's rotating daily/weekly/monthly cash-inflow text
    and separate weekly-inflow/repayment-schedule charts with one real,
    date-range-able trend.

    Defaulting to the whole month (not just "up to today") is deliberate:
    "expected" is a forecast — it needs to include installments due later
    this week/month, not just what's already past. "actual" naturally never
    exceeds today since payments can't be recorded for the future.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from loans.models import LoanRepaymentSchedule
        import calendar

        user = request.user
        branch = _get_director_branch(request)
        today = timezone.now().date()

        start_raw = request.query_params.get('start')
        end_raw = request.query_params.get('end')
        try:
            start = datetime.date.fromisoformat(start_raw) if start_raw else today.replace(day=1)
        except ValueError:
            start = today.replace(day=1)
        try:
            if end_raw:
                end = datetime.date.fromisoformat(end_raw)
            else:
                last_day = calendar.monthrange(today.year, today.month)[1]
                end = today.replace(day=last_day)
        except ValueError:
            end = today

        if end < start:
            start, end = end, start
        if (end - start).days > 90:
            end = start + datetime.timedelta(days=90)

        qs = _apply_officer_scope(
            _scoped(LoanRepaymentSchedule.objects.for_user(user), branch),
            user,
            client_lookup='loan__client__assigned_officer',
            module='loans', page='loan-accounts',
        )

        expected_rows = (
            qs.filter(due_date__gte=start, due_date__lte=end)
            .values('due_date')
            .annotate(total=Sum('total_due'))
        )
        expected_map = {r['due_date']: (r['total'] or Decimal('0.00')) for r in expected_rows}

        actual_rows = (
            qs.filter(payment_date__gte=start, payment_date__lte=end, payment_date__isnull=False)
            .values('payment_date')
            .annotate(total=Sum('total_paid'))
        )
        actual_map = {r['payment_date']: (r['total'] or Decimal('0.00')) for r in actual_rows}

        result = []
        d = start
        one_day = datetime.timedelta(days=1)
        while d <= end:
            result.append({
                'date': str(d),
                'expected': str(expected_map.get(d, Decimal('0.00'))),
                'actual': str(actual_map.get(d, Decimal('0.00'))),
            })
            d += one_day

        return Response({
            'success': True,
            'data': result,
            'period': {'start': str(start), 'end': str(end)},
        })


class LoanPortfolioByProductView(APIView):
    """
    GET /api/analytics/loan-portfolio-by-product/

    Current outstanding portfolio broken down by loan product, for the
    "loan performance by product" chart (the old system's equivalent broke
    this down by loan_type — daily/weekly/monthly collection loans).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from loans.models import LoanAccount

        user = request.user
        branch = _get_director_branch(request)

        req_tenant = getattr(request, 'tenant', None)

        def scope_qs(qs):
            if req_tenant and not getattr(user, 'tenant', None):
                qs = qs.filter(tenant=req_tenant)
            return _scoped(qs, branch)

        loan_qs = _apply_officer_scope(
            scope_qs(LoanAccount.objects.for_user(user)),
            user,
            client_lookup='client__assigned_officer',
            module='loans', page='loan-accounts',
        ).filter(status__in=['active', 'disbursed'])

        rows = (
            loan_qs.values('product__product__name')
            .annotate(
                loan_count=Count('id'),
                outstanding=Sum('outstanding_principal'),
                disbursed=Sum('disbursed_amount'),
            )
            .order_by('-outstanding')
        )

        result = [
            {
                'product_name': r['product__product__name'] or 'Unassigned',
                'loan_count': r['loan_count'],
                'outstanding': str(r['outstanding'] or Decimal('0.00')),
                'disbursed': str(r['disbursed'] or Decimal('0.00')),
            }
            for r in rows
        ]

        return Response({'success': True, 'data': result})


class PortfolioBreakdownView(APIView):
    """
    GET /api/analytics/portfolio-performance/breakdown/

    Portfolio composition cross-cut by branch x product x officer x CBN risk
    band. outstanding_principal/total_paid/provision_amount are a *current*
    balance snapshot over all in-scope loans regardless of when they were
    disbursed — matching the Gross Loan Portfolio definition used by
    par_summary/cbn_returns/dashboard-stats, so this report's total always
    agrees with the dashboard's. [start, end] (see _parse_date_range —
    defaults to the trailing 12 months) instead scopes only
    disbursed_amount, a cohort ("how much did we lend out in this window")
    figure — it does NOT gate which loans' balances are counted, so a loan
    disbursed outside the window still contributes its current outstanding
    balance. (Previously the date range gated both, which meant a loan's
    entire remaining balance would silently vanish from the report once its
    disbursement date aged past the window, making the portfolio total
    trend downward over time independent of real repayment/origination
    activity.)

    Query params: start, end, branch, product, officer, risk_band,
    group_by (comma list, subset of branch,product,officer,risk_band;
    default all four), format (json|csv).
    """
    permission_classes = [IsAuthenticated]

    ALL_DIMENSIONS = ['branch', 'product', 'officer', 'risk_band']
    FIELD_MAP = {
        'branch': 'branch_id',
        'product': 'product__product_id',
        'officer': 'client__assigned_officer_id',
        'risk_band': 'risk_classification',
    }

    def get(self, request):
        from loans.models import LoanAccount
        from branches.models import Branch
        from hr.models import Staff
        from products.models import Product

        user = request.user
        start, end = _parse_date_range(request)
        branch_filter = _get_director_branch(request)
        req_tenant = getattr(request, 'tenant', None)

        def scope_qs(qs):
            if req_tenant and not getattr(user, 'tenant', None):
                qs = qs.filter(tenant=req_tenant)
            return _scoped(qs, branch_filter)

        loan_qs = _apply_officer_scope(
            scope_qs(LoanAccount.objects.for_user(user)),
            user,
            client_lookup='client__assigned_officer',
            module='loans', page='loan-accounts',
        ).filter(status__in=['active', 'disbursed', 'paid_off', 'defaulted'])
        loan_qs = _apply_report_filters(loan_qs, request)

        risk_band = request.query_params.get('risk_band')
        if risk_band:
            loan_qs = loan_qs.filter(risk_classification=risk_band)

        group_by_raw = request.query_params.get('group_by', ','.join(self.ALL_DIMENSIONS))
        group_keys = [g.strip() for g in group_by_raw.split(',') if g.strip() in self.ALL_DIMENSIONS]
        if not group_keys:
            group_keys = list(self.ALL_DIMENSIONS)

        value_fields = [self.FIELD_MAP[k] for k in group_keys]

        # Current portfolio snapshot — every in-scope loan, regardless of
        # disbursement date.
        rows = list(
            loan_qs.values(*value_fields)
            .annotate(
                loan_count=Count('id'),
                outstanding_principal=Sum('outstanding_principal'),
                total_paid=Sum('total_paid'),
                provision_amount=Sum('provision_amount'),
            )
            .order_by('-outstanding_principal')
        )

        # Disbursement volume is the one figure that's genuinely scoped to
        # [start, end] — a separate query so it can't gate the balance
        # snapshot above. Every group here is necessarily also present in
        # `rows` (same status filter, disbursement_date narrows a subset),
        # so a plain dict lookup below is safe.
        disbursed_rows = (
            loan_qs.filter(disbursement_date__gte=start, disbursement_date__lte=end)
            .values(*value_fields)
            .annotate(disbursed_amount=Sum('disbursed_amount'))
        )
        disbursed_map = {
            tuple(r[f] for f in value_fields): r['disbursed_amount'] or Decimal('0.00')
            for r in disbursed_rows
        }

        branch_names, product_names, officer_names = {}, {}, {}
        if 'branch' in group_keys:
            ids = {r['branch_id'] for r in rows if r.get('branch_id')}
            branch_names = dict(Branch.objects.filter(pk__in=ids).values_list('pk', 'name'))
        if 'product' in group_keys:
            ids = {r['product__product_id'] for r in rows if r.get('product__product_id')}
            product_names = dict(Product.objects.filter(pk__in=ids).values_list('pk', 'name'))
        if 'officer' in group_keys:
            ids = {r['client__assigned_officer_id'] for r in rows if r.get('client__assigned_officer_id')}
            officer_names = {
                s.pk: f"{s.first_name} {s.last_name}".strip()
                for s in Staff.objects.filter(pk__in=ids)
            }

        result = []
        for r in rows:
            paid = r['total_paid'] or Decimal('0.00')
            outstanding = r['outstanding_principal'] or Decimal('0.00')
            total_obligation = paid + outstanding
            collection_rate = (
                (paid / total_obligation * 100).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)
                if total_obligation > 0 else Decimal('0')
            )
            disbursed_key = tuple(r.get(f) for f in value_fields)
            row_out = {
                'loan_count': r['loan_count'],
                'outstanding_principal': str(outstanding),
                'disbursed_amount': str(disbursed_map.get(disbursed_key, Decimal('0.00'))),
                'total_paid': str(paid),
                'provision_amount': str(r['provision_amount'] or Decimal('0.00')),
                'collection_rate': str(collection_rate),
            }
            if 'branch' in group_keys:
                row_out['branch_id'] = r.get('branch_id')
                row_out['branch_name'] = branch_names.get(r.get('branch_id'), 'Unassigned')
            if 'product' in group_keys:
                row_out['product_id'] = r.get('product__product_id')
                row_out['product_name'] = product_names.get(r.get('product__product_id'), 'Unassigned')
            if 'officer' in group_keys:
                row_out['officer_id'] = r.get('client__assigned_officer_id')
                row_out['officer_name'] = officer_names.get(r.get('client__assigned_officer_id'), 'Unassigned')
            if 'risk_band' in group_keys:
                row_out['risk_classification'] = r.get('risk_classification') or 'performing'
            result.append(row_out)

        fmt = request.query_params.get('format', 'json')
        if fmt == 'csv':
            headers = list(result[0].keys()) if result else (
                group_keys + ['loan_count', 'outstanding_principal', 'disbursed_amount', 'total_paid',
                              'provision_amount', 'collection_rate']
            )
            return _csv_response(
                f'portfolio-breakdown-{start}-to-{end}.csv',
                headers,
                [[row.get(h, '') for h in headers] for row in result],
            )
        if fmt != 'json':
            return Response({'success': False, 'error': f"Unsupported format '{fmt}'"}, status=400)

        return Response({
            'success': True,
            'period': {'start': str(start), 'end': str(end)},
            'group_by': group_keys,
            'data': result,
        })


class InterestIncomeByRecognitionModeView(APIView):
    """
    GET /api/analytics/portfolio-performance/interest-income/

    Interest income split by how it was recognized:
      - at_disbursement / deferred: booked in full at disbursement, so the
        recognized figure is the loan's repayment schedule interest_due
        total (fixed at schedule generation, never mutated), filtered by
        disbursement_date.
      - legacy_cash_basis: income recognized only as collected, so the
        figure is interest_paid on schedule rows, filtered by payment_date
        (deliberately a DIFFERENT date field than the other two modes —
        this is a genuine cash-basis vs. accrual-basis distinction, not an
        inconsistency to "fix").

    Query params: start, end, branch, product, officer, format (json|csv).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from loans.models import LoanAccount, LoanRepaymentSchedule

        user = request.user
        start, end = _parse_date_range(request)
        branch_filter = _get_director_branch(request)
        req_tenant = getattr(request, 'tenant', None)

        def scope_qs(qs):
            if req_tenant and not getattr(user, 'tenant', None):
                qs = qs.filter(tenant=req_tenant)
            return _scoped(qs, branch_filter)

        base_qs = _apply_report_filters(
            _apply_officer_scope(
                scope_qs(LoanAccount.objects.for_user(user)),
                user,
                client_lookup='client__assigned_officer',
                module='loans', page='loan-accounts',
            ),
            request,
        )

        disb_loans = base_qs.filter(
            interest_recognized_at_disbursement=True,
            disbursement_date__gte=start, disbursement_date__lte=end,
        )
        at_disb = LoanRepaymentSchedule.objects.filter(loan__in=disb_loans).aggregate(
            t=Sum('interest_due')
        )['t'] or Decimal('0.00')
        at_disb_count = disb_loans.count()

        deferred_loans = base_qs.filter(
            interest_deferral_active=True,
            disbursement_date__gte=start, disbursement_date__lte=end,
        )
        deferred = LoanRepaymentSchedule.objects.filter(loan__in=deferred_loans).aggregate(
            t=Sum('interest_due')
        )['t'] or Decimal('0.00')
        deferred_count = deferred_loans.count()

        legacy_qs = base_qs.filter(
            interest_recognized_at_disbursement=False,
            interest_deferral_active=False,
        )
        legacy_rows = LoanRepaymentSchedule.objects.filter(
            loan__in=legacy_qs,
            payment_date__gte=start, payment_date__lte=end,
            payment_date__isnull=False,
        )
        legacy_income = legacy_rows.aggregate(t=Sum('interest_paid'))['t'] or Decimal('0.00')
        legacy_count = legacy_rows.values('loan_id').distinct().count()

        data = {
            'at_disbursement': {'recognized_income': str(at_disb), 'loan_count': at_disb_count},
            'deferred': {'recognized_income': str(deferred), 'loan_count': deferred_count},
            'legacy_cash_basis': {'recognized_income': str(legacy_income), 'loan_count': legacy_count},
            'total_recognized_income': str(at_disb + deferred + legacy_income),
        }

        fmt = request.query_params.get('format', 'json')
        if fmt == 'csv':
            headers = ['mode', 'recognized_income', 'loan_count']
            rows = [
                ['at_disbursement', data['at_disbursement']['recognized_income'], data['at_disbursement']['loan_count']],
                ['deferred', data['deferred']['recognized_income'], data['deferred']['loan_count']],
                ['legacy_cash_basis', data['legacy_cash_basis']['recognized_income'], data['legacy_cash_basis']['loan_count']],
            ]
            return _csv_response(f'interest-income-by-mode-{start}-to-{end}.csv', headers, rows)
        if fmt != 'json':
            return Response({'success': False, 'error': f"Unsupported format '{fmt}'"}, status=400)

        return Response({'success': True, 'period': {'start': str(start), 'end': str(end)}, 'data': data})


class ProvisioningComplianceView(APIView):
    """
    GET /api/analytics/portfolio-performance/provisioning/

    CBN provisioning compliance — CURRENT SNAPSHOT ONLY, deliberately no
    date range (post_loan_provisions.py has no run-history model and isn't
    scheduled anywhere, so a historical trend isn't cheaply/accurately
    derivable). Required provision is summed per CBN risk band from
    LoanAccount.provision_amount (kept current by update_risk_classification
    via update_loan_status). Booked provision is read directly off each
    LoanProduct.allowance_account's stored Account.balance — the same
    source of truth post_loan_provisions.py itself relies on — deduped
    since multiple products may share one GL account.

    Booked provision is only as fresh as the last time post_loan_provisions
    was actually run; the frontend must surface this as a visible caveat.

    Query params: branch, product, officer, format (json|csv).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from loans.models import LoanAccount
        from accounts.models import Account

        user = request.user
        branch_filter = _get_director_branch(request)
        req_tenant = getattr(request, 'tenant', None)

        def scope_qs(qs):
            if req_tenant and not getattr(user, 'tenant', None):
                qs = qs.filter(tenant=req_tenant)
            return _scoped(qs, branch_filter)

        loan_qs = _apply_report_filters(
            _apply_officer_scope(
                scope_qs(LoanAccount.objects.for_user(user)),
                user,
                client_lookup='client__assigned_officer',
                module='loans', page='loan-accounts',
            ),
            request,
        ).filter(status__in=['active', 'disbursed', 'defaulted'])

        by_band_rows = {
            r['risk_classification']: r
            for r in loan_qs.values('risk_classification').annotate(
                loan_count=Count('id'),
                outstanding_principal=Sum('outstanding_principal'),
                required_provision=Sum('provision_amount'),
            )
        }

        by_band = []
        for _low, _high, label, rate in LoanAccount._CBN_BUCKETS:
            r = by_band_rows.get(label, {})
            by_band.append({
                'risk_classification': label,
                'provision_rate_pct': str(rate),
                'loan_count': r.get('loan_count', 0),
                'outstanding_principal': str(r.get('outstanding_principal') or Decimal('0.00')),
                'required_provision': str(r.get('required_provision') or Decimal('0.00')),
            })

        total_required = loan_qs.aggregate(t=Sum('provision_amount'))['t'] or Decimal('0.00')

        allowance_account_ids = list(
            loan_qs.values_list('product__allowance_account_id', flat=True)
            .exclude(product__allowance_account_id__isnull=True)
            .distinct()
        )
        total_booked = Account.objects.filter(pk__in=allowance_account_ids).aggregate(
            t=Sum('balance')
        )['t'] or Decimal('0.00')

        data = {
            'by_risk_band': by_band,
            'total_required_provision': str(total_required),
            'total_booked_provision': str(total_booked),
            'shortfall_or_surplus': str(total_required - total_booked),
        }

        fmt = request.query_params.get('format', 'json')
        if fmt == 'csv':
            headers = ['risk_classification', 'provision_rate_pct', 'loan_count',
                       'outstanding_principal', 'required_provision']
            rows = [[b[h] for h in headers] for b in by_band]
            return _csv_response('provisioning-compliance.csv', headers, rows)
        if fmt != 'json':
            return Response({'success': False, 'error': f"Unsupported format '{fmt}'"}, status=400)

        return Response({'success': True, 'as_of': str(timezone.now().date()), 'data': data})


class OfficerScorecardTrendView(APIView):
    """
    GET /api/analytics/portfolio-performance/officer-trend/?months=6

    Per-officer, per-month scorecard trend: disbursed_amount and
    loans_disbursed_count (from disbursement_date), amount_due and
    collections_received (from LoanRepaymentSchedule due_date/payment_date),
    and a PERIOD collection_rate (paid/due for that month only — distinct
    from StaffPerformanceView's cumulative collection_rate).

    Historical *outstanding portfolio size* per officer per month is NOT
    included — outstanding_principal is a live mutable field with no
    history, and reconstructing it would require a new snapshot model,
    which is out of scope for this view.

    Query params: months (1-24, default 6), branch, product, officer,
    format (json|csv).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from loans.models import LoanAccount, LoanRepaymentSchedule
        from hr.models import Staff

        user = request.user
        branch_filter = _get_director_branch(request)
        req_tenant = getattr(request, 'tenant', None)
        today = timezone.now().date()

        try:
            months = min(max(int(request.query_params.get('months', 6)), 1), 24)
        except (TypeError, ValueError):
            months = 6

        def scope_qs(qs):
            if req_tenant and not getattr(user, 'tenant', None):
                qs = qs.filter(tenant=req_tenant)
            return _scoped(qs, branch_filter)

        loan_qs = _apply_report_filters(
            _apply_officer_scope(
                scope_qs(LoanAccount.objects.for_user(user)),
                user,
                client_lookup='client__assigned_officer',
                module='loans', page='loan-accounts',
            ),
            request,
        )
        sched_qs = LoanRepaymentSchedule.objects.filter(loan__in=loan_qs)

        staff_name_cache = {}

        def staff_name(sid):
            if sid not in staff_name_cache:
                try:
                    s = Staff.objects.get(pk=sid)
                    staff_name_cache[sid] = (f"{s.first_name} {s.last_name}".strip(), s.position)
                except Staff.DoesNotExist:
                    staff_name_cache[sid] = ('Unknown', '')
            return staff_name_cache[sid]

        month_list = []
        month_cursor = today.replace(day=1)
        for _ in range(months):
            month_list.append(month_cursor)
            month_cursor = (month_cursor - datetime.timedelta(days=1)).replace(day=1)
        month_list.reverse()

        result = []
        for m in month_list:
            disb_rows = (
                loan_qs.filter(disbursement_date__year=m.year, disbursement_date__month=m.month)
                .exclude(client__assigned_officer__isnull=True)
                .values('client__assigned_officer')
                .annotate(disbursed=Sum('disbursed_amount'), cnt=Count('id'))
            )
            due_rows = (
                sched_qs.filter(due_date__year=m.year, due_date__month=m.month)
                .exclude(loan__client__assigned_officer__isnull=True)
                .values('loan__client__assigned_officer')
                .annotate(due=Sum('total_due'))
            )
            paid_rows = (
                sched_qs.filter(payment_date__year=m.year, payment_date__month=m.month)
                .exclude(loan__client__assigned_officer__isnull=True)
                .values('loan__client__assigned_officer')
                .annotate(paid=Sum('total_paid'))
            )

            disb_map = {r['client__assigned_officer']: r for r in disb_rows}
            due_map = {r['loan__client__assigned_officer']: (r['due'] or Decimal('0.00')) for r in due_rows}
            paid_map = {r['loan__client__assigned_officer']: (r['paid'] or Decimal('0.00')) for r in paid_rows}

            month_officer_ids = set(disb_map) | set(due_map) | set(paid_map)
            for sid in month_officer_ids:
                due = due_map.get(sid, Decimal('0.00'))
                paid = paid_map.get(sid, Decimal('0.00'))
                collection_rate = (
                    (paid / due * 100).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)
                    if due > 0 else Decimal('0')
                )
                name, position = staff_name(sid)
                disb = disb_map.get(sid, {})
                result.append({
                    'month': m.strftime('%Y-%m'),
                    'label': m.strftime('%b %Y'),
                    'staff_id': sid,
                    'name': name,
                    'position': position,
                    'disbursed_amount': str(disb.get('disbursed') or Decimal('0.00')),
                    'loans_disbursed_count': disb.get('cnt') or 0,
                    'amount_due': str(due),
                    'collections_received': str(paid),
                    'collection_rate': str(collection_rate),
                })

        fmt = request.query_params.get('format', 'json')
        if fmt == 'csv':
            headers = ['month', 'label', 'staff_id', 'name', 'position', 'disbursed_amount',
                       'loans_disbursed_count', 'amount_due', 'collections_received', 'collection_rate']
            rows = [[r[h] for h in headers] for r in result]
            return _csv_response('officer-scorecard-trend.csv', headers, rows)
        if fmt != 'json':
            return Response({'success': False, 'error': f"Unsupported format '{fmt}'"}, status=400)

        return Response({'success': True, 'months': months, 'data': result})


class DisbursementMasterRollView(APIView):
    """
    GET /api/analytics/disbursement-master-roll/?start=&end=&branch=&officer=&format=json|csv

    Server-side, date-range-scoped replacement for the old client-side
    "Daily Summary Report" (DailySummaryReportPage), which built its tiles
    from paginated list() calls (PAGE_SIZE=20, no date filter server-side)
    filtered by date in the browser — silently wrong beyond the newest ~20
    rows — and had two tiles (collections, savings) that were never wired
    to real data at all (hardcoded to 0). Every figure here is a real
    server-side aggregate.

    - Disbursements: LoanDisbursement (status='disbursed'), the primary
      "master roll" content — returned in full for the range, not paginated
      (bounded by the date-range cap below).
    - Loan collections: LoanRepaymentSchedule.total_paid summed by
      payment_date — same field pair OfficerScorecardTrendView uses.
    - Savings deposits: TransactionEntry CREDIT lines on series 'SVDEP',
      joined back to the client via SavingsAccount.
    - Active loans / defaulters: computed as-of `end` using the same
      loans_active_as_of_qs / defaulted_loans_as_of helpers the canonical
      defaulters report uses, instead of "right now" status or the looser
      status=='defaulted' check the old page used — so this figure always
      agrees with /loans/accounts/defaulters/.

    Query params: start, end (default: today), branch (director override),
    officer, format (json|csv). Range capped at 92 days.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from loans.models import LoanAccount, LoanDisbursement, LoanRepaymentSchedule
        from loans.views import loans_active_as_of_qs, defaulted_loans_as_of
        from clients.models import Client
        from transactions.models import TransactionEntry
        from hr.models import Staff

        user = request.user
        branch_filter = _get_director_branch(request)
        req_tenant = getattr(request, 'tenant', None)
        today = timezone.now().date()
        start, end = _parse_day_range(request)

        def scope_qs(qs):
            if req_tenant and not getattr(user, 'tenant', None):
                qs = qs.filter(tenant=req_tenant)
            return _scoped(qs, branch_filter)

        loan_qs = _apply_report_filters(
            _apply_officer_scope(
                scope_qs(LoanAccount.objects.for_user(user)),
                user,
                client_lookup='client__assigned_officer',
                module='loans', page='loan-accounts',
            ),
            request,
        )

        client_qs = _apply_officer_scope(
            scope_qs(Client.objects.for_user(user)), user, client_lookup='assigned_officer',
            module='clients', page='clients',
        )
        officer_param = request.query_params.get('officer')
        if officer_param:
            try:
                client_qs = client_qs.filter(assigned_officer_id=int(officer_param))
            except (TypeError, ValueError):
                pass

        # ---- Disbursements (primary content) ----
        disb_qs = (
            LoanDisbursement.objects.filter(
                status='disbursed',
                disbursement_date__range=(start, end),
                loan__in=loan_qs,
            )
            .select_related('loan', 'loan__client', 'loan__client__assigned_officer', 'disbursement_account', 'disbursed_by')
            .order_by('disbursement_date', 'loan__loan_number')
        )
        disbursements = []
        for d in disb_qs:
            loan = d.loan
            officer = loan.client.assigned_officer
            disbursements.append({
                'disbursement_id': d.pk,
                'loan_id': loan.pk,
                'loan_number': loan.loan_number,
                'client_id': loan.client_id,
                'client_name': loan.client.full_name,
                'officer_id': officer.pk if officer else None,
                'officer_name': f"{officer.first_name} {officer.last_name}".strip() if officer else '—',
                'amount': str(loan.disbursed_amount or Decimal('0.00')),
                'disbursement_date': str(d.disbursement_date),
                'disbursed_by': (
                    (d.disbursed_by.get_full_name() or d.disbursed_by.username)
                    if d.disbursed_by else ''
                ),
                'account_name': d.disbursement_account.name if d.disbursement_account else '',
            })
        disb_agg = disb_qs.aggregate(total=Sum('loan__disbursed_amount'), cnt=Count('id'))
        total_disbursed = disb_agg['total'] or Decimal('0.00')
        disbursements_count = disb_agg['cnt'] or 0

        # ---- Loan collections ----
        sched_qs = LoanRepaymentSchedule.objects.filter(loan__in=loan_qs, payment_date__range=(start, end))
        coll_agg = sched_qs.aggregate(total=Sum('total_paid'), cnt=Count('id'))
        total_collections = coll_agg['total'] or Decimal('0.00')
        collections_count = coll_agg['cnt'] or 0

        # ---- Savings deposits ----
        sav_qs = TransactionEntry.objects.filter(
            transaction__series__code='SVDEP',
            transaction__date__range=(start, end),
            side=TransactionEntry.CREDIT,
            account__savings_account_detail__client__in=client_qs,
        )
        sav_agg = sav_qs.aggregate(total=Sum('amount'), cnt=Count('id'))
        total_savings_deposits = sav_agg['total'] or Decimal('0.00')
        savings_deposits_count = sav_agg['cnt'] or 0

        # ---- New clients ----
        new_clients_count = client_qs.filter(created_at__date__range=(start, end)).count()

        # ---- Active loans / defaulters, as-of `end` (not "right now") ----
        active_qs = loans_active_as_of_qs(loan_qs, end, today=today)
        active_loans_count = active_qs.count()
        defaulters_count = sum(1 for _ in defaulted_loans_as_of(active_qs, end))

        # ---- Officer breakdown ----
        disb_by_officer = {
            r['loan__client__assigned_officer']: r
            for r in disb_qs.exclude(loan__client__assigned_officer__isnull=True)
            .values('loan__client__assigned_officer')
            .annotate(total=Sum('loan__disbursed_amount'), cnt=Count('id'))
        }
        coll_by_officer = {
            r['loan__client__assigned_officer']: r
            for r in sched_qs.exclude(loan__client__assigned_officer__isnull=True)
            .values('loan__client__assigned_officer')
            .annotate(total=Sum('total_paid'), cnt=Count('id'))
        }
        sav_by_officer = {
            r['account__savings_account_detail__client__assigned_officer']: r
            for r in sav_qs.exclude(account__savings_account_detail__client__assigned_officer__isnull=True)
            .values('account__savings_account_detail__client__assigned_officer')
            .annotate(total=Sum('amount'), cnt=Count('id'))
        }
        officer_ids = set(disb_by_officer) | set(coll_by_officer) | set(sav_by_officer)
        staff_cache = {s.pk: s for s in Staff.objects.filter(pk__in=officer_ids)}

        officer_breakdown = []
        for oid in officer_ids:
            s = staff_cache.get(oid)
            name = f"{s.first_name} {s.last_name}".strip() if s else 'Unknown'
            d_row = disb_by_officer.get(oid, {})
            c_row = coll_by_officer.get(oid, {})
            sv_row = sav_by_officer.get(oid, {})
            officer_breakdown.append({
                'officer_id': oid,
                'officer_name': name,
                'disbursed_total': str(d_row.get('total') or Decimal('0.00')),
                'disbursed_count': d_row.get('cnt') or 0,
                'collections_total': str(c_row.get('total') or Decimal('0.00')),
                'collections_count': c_row.get('cnt') or 0,
                'savings_total': str(sv_row.get('total') or Decimal('0.00')),
                'savings_count': sv_row.get('cnt') or 0,
            })
        officer_breakdown.sort(key=lambda r: r['officer_name'])

        summary = {
            'total_disbursed': str(total_disbursed),
            'disbursements_count': disbursements_count,
            'total_collections': str(total_collections),
            'collections_count': collections_count,
            'total_savings_deposits': str(total_savings_deposits),
            'savings_deposits_count': savings_deposits_count,
            'new_clients_count': new_clients_count,
            'active_loans_count': active_loans_count,
            'defaulters_count': defaulters_count,
        }

        fmt = request.query_params.get('format', 'json')
        if fmt == 'csv':
            headers = ['loan_number', 'client_name', 'officer_name', 'amount',
                       'disbursement_date', 'disbursed_by', 'account_name']
            rows = [[row[h] for h in headers] for row in disbursements]
            return _csv_response(f'disbursement-master-roll-{start}_{end}.csv', headers, rows)
        if fmt != 'json':
            return Response({'success': False, 'error': f"Unsupported format '{fmt}'"}, status=400)

        return Response({
            'success': True,
            'period': {'start': str(start), 'end': str(end)},
            'summary': summary,
            'disbursements': disbursements,
            'officer_breakdown': officer_breakdown,
        })


class DailyCollectionReportView(APIView):
    """
    GET /api/analytics/daily-collection-report/?start=&end=&branch=&officer=&group=&format=json|csv

    Digitizes the branch's existing paper "Daily Collection Report" sheet:
    one row per (client, date) with activity in range, split into Savings
    Collection (Savings / Registration / Risk Premium / Loan form / ID
    Card) and Loan Collection (Amount Due / Amount Collected / Total
    Collection). None of this data previously fed any report. Sources:

      - Savings: TransactionEntry CREDIT lines on series 'SVDEP'.
      - Registration / ID Card: FinancialAuditLog CLIENT_REGISTRATION_FEE
        (extra.registration_fee / extra.id_fee) — added alongside this
        report since Transaction has no client FK to join through directly
        (see clients/services.py collect_client_registration_fees).
      - Risk Premium / Loan form / anything else: LoanFeeApplication,
        matched against LoanProductFee.name (case-insensitive substring
        match on the branch-configured fee-line name); anything not
        matching those two canonical columns lands in 'other_fees' rather
        than being silently dropped.
      - Loan collection: LoanRepaymentSchedule — Amount Due keyed by
        due_date, Amount Collected keyed by payment_date (these can be
        different installments/dates for the same client, e.g. catching up
        on an older arrear).
      - Total Collection = everything actually collected on that visit
        (savings + registration + risk premium + loan form + id card +
        amount collected) — same-day cash-in-hand, not the same figure as
        Amount Due.

    Query params: start, end (default: today), branch, officer, group
    (ClientGroup pk), format (json|csv). Range capped at 92 days.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from clients.models import Client
        from loans.models import LoanRepaymentSchedule, LoanFeeApplication
        from transactions.models import TransactionEntry
        from common.models import FinancialAuditLog

        user = request.user
        branch_filter = _get_director_branch(request)
        req_tenant = getattr(request, 'tenant', None)
        start, end = _parse_day_range(request)

        def scope_qs(qs):
            if req_tenant and not getattr(user, 'tenant', None):
                qs = qs.filter(tenant=req_tenant)
            return _scoped(qs, branch_filter)

        client_qs = _apply_officer_scope(
            scope_qs(Client.objects.for_user(user)), user, client_lookup='assigned_officer',
            module='clients', page='clients',
        ).select_related('assigned_officer', 'group')

        officer_param = request.query_params.get('officer')
        if officer_param:
            try:
                client_qs = client_qs.filter(assigned_officer_id=int(officer_param))
            except (TypeError, ValueError):
                pass
        group_param = request.query_params.get('group')
        if group_param:
            try:
                client_qs = client_qs.filter(group_id=int(group_param))
            except (TypeError, ValueError):
                pass

        client_ids = set(client_qs.values_list('id', flat=True))
        client_cache = {c.pk: c for c in client_qs}

        rows = {}

        def bucket(client_id, date_):
            key = (client_id, date_)
            if key not in rows:
                rows[key] = {
                    'savings': Decimal('0.00'), 'registration': Decimal('0.00'),
                    'id_card': Decimal('0.00'), 'risk_premium': Decimal('0.00'),
                    'loan_form': Decimal('0.00'), 'other_fees': Decimal('0.00'),
                    'amount_due': Decimal('0.00'), 'amount_collected': Decimal('0.00'),
                }
            return rows[key]

        # ---- Savings ----
        sav_entries = TransactionEntry.objects.filter(
            transaction__series__code='SVDEP',
            transaction__date__range=(start, end),
            side=TransactionEntry.CREDIT,
            account__savings_account_detail__client_id__in=client_ids,
        ).values('transaction__date', 'account__savings_account_detail__client_id', 'amount')
        for r in sav_entries:
            b = bucket(r['account__savings_account_detail__client_id'], r['transaction__date'])
            b['savings'] += r['amount']

        # ---- Registration + ID Card ----
        reg_logs = FinancialAuditLog.objects.filter(
            event_type=FinancialAuditLog.CLIENT_REGISTRATION_FEE,
            timestamp__date__range=(start, end),
        ).values('timestamp', 'extra')
        for r in reg_logs:
            try:
                cid = int(r['extra'].get('client_id'))
            except (TypeError, ValueError):
                continue
            if cid not in client_ids:
                continue
            b = bucket(cid, r['timestamp'].date())
            b['registration'] += Decimal(r['extra'].get('registration_fee') or '0')
            b['id_card'] += Decimal(r['extra'].get('id_fee') or '0')

        # ---- Loan fees (Risk Premium / Loan form / other) ----
        fee_apps = LoanFeeApplication.objects.filter(
            posted=True,
            posting_date__range=(start, end),
            loan_account__client_id__in=client_ids,
        ).select_related('fee_config', 'loan_account')
        for fa in fee_apps:
            b = bucket(fa.loan_account.client_id, fa.posting_date)
            fee_name = (fa.fee_config.name or '').lower()
            if 'risk premium' in fee_name:
                b['risk_premium'] += fa.calculated_amount
            elif 'loan form' in fee_name:
                b['loan_form'] += fa.calculated_amount
            else:
                b['other_fees'] += fa.calculated_amount

        # ---- Loan collection: due vs collected ----
        due_rows = LoanRepaymentSchedule.objects.filter(
            due_date__range=(start, end), loan__client_id__in=client_ids,
        ).values('due_date', 'loan__client_id').annotate(total=Sum('total_due'))
        for r in due_rows:
            b = bucket(r['loan__client_id'], r['due_date'])
            b['amount_due'] += r['total'] or Decimal('0.00')

        paid_rows = LoanRepaymentSchedule.objects.filter(
            payment_date__range=(start, end), loan__client_id__in=client_ids,
        ).values('payment_date', 'loan__client_id').annotate(total=Sum('total_paid'))
        for r in paid_rows:
            b = bucket(r['loan__client_id'], r['payment_date'])
            b['amount_collected'] += r['total'] or Decimal('0.00')

        result = []
        for (client_id, date_), b in rows.items():
            client = client_cache.get(client_id)
            if not client:
                continue
            officer = client.assigned_officer
            group = client.group
            total_collection = (
                b['savings'] + b['registration'] + b['id_card']
                + b['risk_premium'] + b['loan_form'] + b['other_fees']
                + b['amount_collected']
            )
            result.append({
                'date': str(date_),
                'client_id': client_id,
                'client_name': client.full_name,
                'group_id': group.pk if group else None,
                'group_name': group.name if group else '',
                'officer_id': officer.pk if officer else None,
                'officer_name': f"{officer.first_name} {officer.last_name}".strip() if officer else '',
                'savings': str(b['savings']),
                'registration': str(b['registration']),
                'risk_premium': str(b['risk_premium']),
                'loan_form': str(b['loan_form']),
                'id_card': str(b['id_card']),
                'other_fees': str(b['other_fees']),
                'amount_due': str(b['amount_due']),
                'amount_collected': str(b['amount_collected']),
                'total_collection': str(total_collection),
            })

        result.sort(key=lambda r: (r['date'], r['group_name'], r['client_name']))

        fmt = request.query_params.get('format', 'json')
        if fmt == 'csv':
            headers = ['date', 'group_name', 'officer_name', 'client_name', 'savings',
                       'registration', 'risk_premium', 'loan_form', 'id_card', 'other_fees',
                       'amount_due', 'amount_collected', 'total_collection']
            csv_rows = [[r[h] for h in headers] for r in result]
            return _csv_response(f'daily-collection-report-{start}_{end}.csv', headers, csv_rows)
        if fmt != 'json':
            return Response({'success': False, 'error': f"Unsupported format '{fmt}'"}, status=400)

        return Response({
            'success': True,
            'period': {'start': str(start), 'end': str(end)},
            'count': len(result),
            'results': result,
        })


class DisbursementByProductView(APIView):
    """
    GET /api/analytics/disbursement-by-product/?months=6&branch=&product=&officer=&format=json|csv

    Server-side successor to the branch's old hand-typed "Disbursement by
    Product" spreadsheet — a matrix with three hardcoded rows (Monthly /
    Weekly / Daily) and a couple of hardcoded month columns that someone
    had to fill in by hand every month. This is a live pivot instead:

      - Rows are whatever loan products actually exist for this tenant
        (LoanProduct, via Product.name) rather than a fixed three-row
        list, so a newly-added product shows up automatically. Every
        *active* product is seeded into the matrix with zero cells even
        if it had no disbursements this period (a silent gap is a real
        signal — e.g. "Daily Loan disbursed ₦0 this month" — not
        something to hide by omitting the row); a product with historical
        disbursements but since deactivated still appears because it has
        real data in range.
      - Columns are the trailing `months` calendar months (default 6,
        max 24) ending this month — not two fixed month names — computed
        from LoanAccount.disbursement_date via TruncMonth.
      - Each cell carries both disbursed amount and disbursement count,
        so "why did the total drop" (fewer loans vs. smaller loans) is
        answerable directly from the report instead of requiring a
        follow-up query.

    A TOTAL row (sum across products per month) and a grand-total column
    (sum across months per product) are computed the same way the legacy
    sheet's row was, but from live data.

    Query params: months (1-24, default 6), branch, product, officer,
    format (json|csv).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db.models.functions import TruncMonth
        from loans.models import LoanAccount, LoanProduct

        user = request.user
        branch_filter = _get_director_branch(request)
        req_tenant = getattr(request, 'tenant', None)
        today = timezone.now().date()

        try:
            months = min(max(int(request.query_params.get('months', 6)), 1), 24)
        except (TypeError, ValueError):
            months = 6

        # Trailing `months` calendar months, oldest first — e.g. months=3
        # requested on a date in July gives [May, Jun, Jul].
        month_starts = []
        cursor = today.replace(day=1)
        for _ in range(months):
            month_starts.append(cursor)
            cursor = (cursor - datetime.timedelta(days=1)).replace(day=1)
        month_starts.reverse()

        range_start = month_starts[0]
        last_month_start = month_starts[-1]
        next_month_start = (
            last_month_start.replace(year=last_month_start.year + 1, month=1)
            if last_month_start.month == 12
            else last_month_start.replace(month=last_month_start.month + 1)
        )
        range_end = next_month_start - datetime.timedelta(days=1)

        month_keys = [m.strftime('%Y-%m') for m in month_starts]
        month_meta = [{'key': m.strftime('%Y-%m'), 'label': m.strftime('%b %Y')} for m in month_starts]

        def scope_qs(qs):
            if req_tenant and not getattr(user, 'tenant', None):
                qs = qs.filter(tenant=req_tenant)
            return _scoped(qs, branch_filter)

        def empty_months():
            return {mkey: {'amount': Decimal('0.00'), 'count': 0} for mkey in month_keys}

        # ---- Seed every active loan product as a zero-filled row -----------
        product_qs = scope_qs(LoanProduct.objects.for_user(user)).filter(
            product__is_active=True
        ).select_related('product')
        product_param = request.query_params.get('product')
        if product_param:
            try:
                product_qs = product_qs.filter(product_id=int(product_param))
            except (TypeError, ValueError):
                pass

        products = {}
        for lp in product_qs:
            products[lp.product_id] = {
                'product_id': lp.product_id,
                'product_name': lp.product.name,
                # LoanProduct has no single repayment_frequency field (that's
                # per-LoanAccount) — allowed_repayment_frequencies is the
                # product-level config, and every canonical product carries
                # exactly one entry (daily/weekly/monthly).
                'repayment_frequency': ', '.join(lp.allowed_repayment_frequencies or []),
                'months': empty_months(),
            }

        # ---- Overlay actual disbursements in range -------------------------
        loan_qs = _apply_report_filters(
            _apply_officer_scope(
                scope_qs(LoanAccount.objects.for_user(user)),
                user,
                client_lookup='client__assigned_officer',
                module='loans', page='loan-accounts',
            ),
            request,
        ).filter(
            disbursement_date__gte=range_start,
            disbursement_date__lte=range_end,
            disbursed_amount__gt=0,
        )

        agg_rows = (
            loan_qs.annotate(month=TruncMonth('disbursement_date'))
            .values('month', 'product__product_id', 'product__product__name')
            .annotate(disbursed=Sum('disbursed_amount'), cnt=Count('id'))
        )

        for r in agg_rows:
            mkey = r['month'].strftime('%Y-%m')
            if mkey not in month_keys:
                continue
            pid = r['product__product_id']
            entry = products.get(pid)
            if entry is None:
                # Historical disbursement on a product that's since been
                # deactivated (or was filtered out of the seed set) — still
                # show it, since the money genuinely moved in this period.
                entry = products.setdefault(pid, {
                    'product_id': pid,
                    'product_name': r['product__product__name'] or 'Unassigned',
                    'repayment_frequency': None,  # backfilled below in one batched query
                    'months': empty_months(),
                })
            entry['months'][mkey] = {
                'amount': r['disbursed'] or Decimal('0.00'),
                'count': r['cnt'] or 0,
            }

        # ---- Backfill frequency label for products found only via the -----
        # ---- overlay (deactivated products not in the seeded set) ---------
        missing_freq_ids = [pid for pid, e in products.items() if e['repayment_frequency'] is None]
        if missing_freq_ids:
            freq_lookup = dict(
                LoanProduct.objects.filter(product_id__in=missing_freq_ids)
                .values_list('product_id', 'allowed_repayment_frequencies')
            )
            for pid in missing_freq_ids:
                products[pid]['repayment_frequency'] = ', '.join(freq_lookup.get(pid) or [])

        # ---- Row totals + column (month) totals + grand total --------------
        month_totals = {mkey: {'amount': Decimal('0.00'), 'count': 0} for mkey in month_keys}
        grand_total = {'amount': Decimal('0.00'), 'count': 0}

        product_rows = []
        for entry in products.values():
            row_total = {'amount': Decimal('0.00'), 'count': 0}
            months_out = {}
            for mkey in month_keys:
                cell = entry['months'][mkey]
                months_out[mkey] = {'amount': str(cell['amount']), 'count': cell['count']}
                row_total['amount'] += cell['amount']
                row_total['count'] += cell['count']
                month_totals[mkey]['amount'] += cell['amount']
                month_totals[mkey]['count'] += cell['count']
            grand_total['amount'] += row_total['amount']
            grand_total['count'] += row_total['count']
            product_rows.append({
                'product_id': entry['product_id'],
                'product_name': entry['product_name'],
                'repayment_frequency': entry['repayment_frequency'],
                'months': months_out,
                'total_amount': str(row_total['amount']),
                'total_count': row_total['count'],
            })

        product_rows.sort(key=lambda r: Decimal(r['total_amount']), reverse=True)

        totals_row = {
            'months': {mkey: {'amount': str(v['amount']), 'count': v['count']} for mkey, v in month_totals.items()},
            'total_amount': str(grand_total['amount']),
            'total_count': grand_total['count'],
        }

        fmt = request.query_params.get('format', 'json')
        if fmt == 'csv':
            headers = ['product', 'repayment_frequency']
            for m in month_meta:
                headers += [f"{m['label']} (₦)", f"{m['label']} (count)"]
            headers += ['Total (₦)', 'Total (count)']

            csv_rows = []
            for row in product_rows:
                line = [row['product_name'], row['repayment_frequency']]
                for m in month_meta:
                    cell = row['months'][m['key']]
                    line += [cell['amount'], cell['count']]
                line += [row['total_amount'], row['total_count']]
                csv_rows.append(line)

            total_line = ['TOTAL', '']
            for m in month_meta:
                cell = totals_row['months'][m['key']]
                total_line += [cell['amount'], cell['count']]
            total_line += [totals_row['total_amount'], totals_row['total_count']]
            csv_rows.append(total_line)

            return _csv_response(f'disbursement-by-product-{month_keys[0]}_{month_keys[-1]}.csv', headers, csv_rows)
        if fmt != 'json':
            return Response({'success': False, 'error': f"Unsupported format '{fmt}'"}, status=400)

        return Response({
            'success': True,
            'period': {'start': str(range_start), 'end': str(range_end)},
            'months': month_meta,
            'products': product_rows,
            'totals': totals_row,
        })




# ---------------------------------------------------------------------------
# Officer recovery targets
# ---------------------------------------------------------------------------

def _parse_month(raw, today):
    """'YYYY-MM' -> first day of that month; falls back to the current month."""
    try:
        year, month = (int(p) for p in (raw or '').split('-')[:2])
        return datetime.date(year, month, 1)
    except (TypeError, ValueError):
        return today.replace(day=1)


def _can_set_recovery_targets(user):
    """Directors, or anyone with edit rights on Loan Reports at branch-or-wider scope.
    A credit officer limited to their own clients can see their target but not set it."""
    from common.views import is_elevated_user
    if is_elevated_user(user):
        return True
    from permissions.services import PermissionResolver
    perm = PermissionResolver.resolve(user, module='loans', page='loan-reports')
    return bool(perm.can_edit and perm.scope in ('own_branch', 'global'))


def _restrict_staff_to_scope(staff_qs, user):
    """Officer-level users see only their own row (plus direct reports for ajo_group scope),
    mirroring _apply_officer_scope for the client-linked data. Returns (qs, is_narrow)."""
    if _is_global_user(user):
        return staff_qs, False
    from permissions.services import PermissionResolver
    scope = PermissionResolver.resolve(user, module='loans', page='loan-reports').scope
    if scope in ('own_branch', 'global'):
        return staff_qs, False
    try:
        staff = user.staff_profile
    except Exception:
        staff = None
    if not staff:
        return staff_qs.none(), True
    if scope == 'ajo_group':
        return staff_qs.filter(Q(pk=staff.pk) | Q(reports_to=staff)), True
    return staff_qs.filter(pk=staff.pk), True


RECOVERY_MIN_DAYS_OVERDUE = 30
# Ignore penny leftovers from schedule rounding drift when deciding whether an
# installment was still unpaid - otherwise a ₦0.01 remainder could make a
# healthy loan look 30+ days in default.
RECOVERY_UNPAID_TOLERANCE = Decimal('1.00')


def _recovery_payments(loan_qs, start, end):
    """
    Yield (officer_id, date, amount) for every repayment between start and end
    (inclusive) made on a loan that was RECOVERY_MIN_DAYS_OVERDUE+ days in
    arrears on the day of that payment.

    "In arrears on day D" is rebuilt backwards, like treasury's recovery_rate:
    what an installment still owed just before D = what it owes now + every
    allocation made to it on or after D. That works for legacy loans (whose
    older payments predate allocation tracking) because it only needs
    allocations from `start` onward. The defaulters report's helper can't be
    reused here: it reads each installment's CURRENT status, so the very
    payment that clears an old arrear would make the loan look as if it was
    never in default.
    """
    from django.db.models import F
    from loans.models import LoanRepaymentAllocation, LoanRepaymentSchedule

    live = dict(journal_entry__is_reversed=False, journal_entry__is_reversal=False,
                journal_entry__is_deleted=False)
    applied = Sum(F('principal_applied') + F('interest_applied') + F('fees_applied') + F('penalty_applied'))

    payments = list(
        LoanRepaymentAllocation.objects.filter(
            loan_id__in=loan_qs.values('id'), journal_entry__date__range=(start, end), **live)
        .values('loan_id', 'loan__client__assigned_officer', 'journal_entry__date')
        .annotate(amt=applied)
    )
    if not payments:
        return

    cutoff = end - datetime.timedelta(days=RECOVERY_MIN_DAYS_OVERDUE)
    rows = {}
    for r in (
        LoanRepaymentSchedule.objects.filter(
            loan_id__in={p['loan_id'] for p in payments}, due_date__lte=cutoff)
        .exclude(status='restructured')
        .values('id', 'loan_id', 'due_date', 'total_due', 'total_paid')
    ):
        r['unpaid_now'] = max(r['total_due'] - r['total_paid'], Decimal('0.00'))
        r['later'] = []
        rows[r['id']] = r
    if not rows:
        return

    for a in (
        LoanRepaymentAllocation.objects.filter(
            schedule_id__in=list(rows), journal_entry__date__gte=start, **live)
        .values('schedule_id', 'journal_entry__date')
        .annotate(amt=applied)
    ):
        rows[a['schedule_id']]['later'].append((a['journal_entry__date'], a['amt'] or Decimal('0.00')))

    by_loan = {}
    for r in rows.values():
        by_loan.setdefault(r['loan_id'], []).append(r)

    in_default = {}
    for p in payments:
        loan_id, day = p['loan_id'], p['journal_entry__date']
        key = (loan_id, day)
        if key not in in_default:
            day_cutoff = day - datetime.timedelta(days=RECOVERY_MIN_DAYS_OVERDUE)
            in_default[key] = any(
                r['unpaid_now'] + sum((amt for d, amt in r['later'] if d >= day), Decimal('0.00'))
                > RECOVERY_UNPAID_TOLERANCE
                for r in by_loan.get(loan_id, ()) if r['due_date'] <= day_cutoff
            )
        if in_default[key]:
            yield p['loan__client__assigned_officer'], day, p['amt'] or Decimal('0.00')


class RecoveryTargetsView(APIView):
    """
    GET  /api/analytics/recovery-targets/?month=YYYY-MM&as_of=YYYY-MM-DD&export=csv
    POST /api/analytics/recovery-targets/  {month, targets: [{staff_id, target_amount, notes?}]}

    Monthly recovery target tracker per credit officer: target (manager-set,
    OfficerRecoveryTarget), recovered on the as-of day, recovered month-to-
    date, balance to target, and pace against the share of the month already
    elapsed ("halfway through the month should be 50% of target").

    Recovered = repayments on DEFAULTED loans only: a payment counts when, on
    the day it was made, the loan had an installment unpaid for at least
    RECOVERY_MIN_DAYS_OVERDUE days (see _recovery_payments). Repayments on
    current loans are normal collections, not recovery, and are excluded.
    The whole payment counts (principal + interest + fees + penalty from
    LoanRepaymentAllocation), dated by the payment transaction, excluding
    reversed payments. Money that spilled over into savings is not counted.
    Attribution uses each client's CURRENT assigned officer, so reassigning
    a client mid-month moves that client's earlier recoveries to the new
    officer.

    POST sets/updates targets for the month; a blank/null target_amount
    removes that officer's target.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from loans.models import LoanAccount
        from hr.models import Staff
        from .models import OfficerRecoveryTarget
        import calendar

        user = request.user
        today = timezone.localdate()
        branch = _get_director_branch(request)
        req_tenant = getattr(request, 'tenant', None)

        month_start = _parse_month(request.query_params.get('month'), today)
        days_in_month = calendar.monthrange(month_start.year, month_start.month)[1]
        month_end = month_start.replace(day=days_in_month)

        if month_start > today:
            as_of = None  # future month - nothing recovered yet
        else:
            as_of = min(today, month_end)
            raw_as_of = request.query_params.get('as_of')
            if raw_as_of:
                try:
                    as_of = min(max(datetime.date.fromisoformat(raw_as_of), month_start), month_end, today)
                except ValueError:
                    pass
        days_elapsed = as_of.day if as_of else 0

        def scope_qs(qs):
            if req_tenant and not getattr(user, 'tenant', None):
                qs = qs.filter(tenant=req_tenant)
            return _scoped(qs, branch)

        loan_qs = _apply_officer_scope(
            scope_qs(LoanAccount.objects.for_user(user)), user,
            client_lookup='client__assigned_officer', module='loans', page='loan-reports',
        )

        # officer_id -> {date -> amount}
        daily = {}
        if as_of:
            for officer_id, day, amt in _recovery_payments(loan_qs, month_start, as_of):
                by_day = daily.setdefault(officer_id, {})
                by_day[day] = by_day.get(day, Decimal('0.00')) + amt

        staff_qs, narrow = _restrict_staff_to_scope(scope_qs(Staff.objects.for_user(user)), user)

        prev_month_start = (month_start - datetime.timedelta(days=1)).replace(day=1)
        target_qs = OfficerRecoveryTarget.objects.for_user(user).filter(
            month__in=[month_start, prev_month_start], staff__in=staff_qs,
        )
        targets, prev_targets = {}, {}
        for t in target_qs:
            (targets if t.month == month_start else prev_targets)[t.staff_id] = t

        collected_ids = {sid for sid in daily if sid is not None}
        officer_ids = set(targets) | collected_ids | set(
            staff_qs.filter(assigned_clients__is_deleted=False).values_list('pk', flat=True)
        )
        officers = staff_qs.filter(pk__in=officer_ids).select_related('branch')

        remaining_days = days_in_month - days_elapsed
        two = Decimal('0.01')
        tot = {k: Decimal('0.00') for k in ('target', 'today', 'mtd', 'balance', 'expected')}

        rows = []
        for staff in officers:
            by_day = daily.get(staff.pk, {})
            mtd = sum(by_day.values(), Decimal('0.00'))
            today_amt = by_day.get(as_of, Decimal('0.00')) if as_of else Decimal('0.00')
            t = targets.get(staff.pk)
            prev = prev_targets.get(staff.pk)
            row = {
                'staff_id': staff.pk,
                'name': f"{staff.first_name} {staff.last_name}".strip(),
                'position': staff.position,
                'branch_name': staff.branch.name if staff.branch else '',
                'target': str(t.target_amount) if t else None,
                'notes': t.notes if t else '',
                'previous_target': str(prev.target_amount) if prev else None,
                'recovered_today': str(today_amt),
                'recovered_mtd': str(mtd),
                'daily': [{'date': str(d), 'amount': str(a)} for d, a in sorted(by_day.items())],
                'balance': None, 'pct_achieved': None, 'expected_to_date': None,
                'pace_gap': None, 'required_daily': None, 'status': 'no_target',
            }
            tot['today'] += today_amt
            tot['mtd'] += mtd
            if t and t.target_amount > 0:
                target = t.target_amount
                expected = (target * days_elapsed / days_in_month).quantize(two)
                balance = max(target - mtd, Decimal('0.00'))
                pct = (mtd / target * 100).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)
                if mtd >= target:
                    status_ = 'achieved'
                elif mtd >= expected:
                    status_ = 'on_pace'
                elif mtd >= expected * Decimal('0.8'):
                    status_ = 'slightly_behind'
                else:
                    status_ = 'behind'
                row.update({
                    'balance': str(balance),
                    'pct_achieved': str(pct),
                    'expected_to_date': str(expected),
                    'pace_gap': str(mtd - expected),
                    'required_daily': (
                        str((balance / remaining_days).quantize(two))
                        if remaining_days > 0 and balance > 0 else None
                    ),
                    'status': status_,
                })
                tot['target'] += target
                tot['balance'] += balance
                tot['expected'] += expected
            rows.append(row)

        rows.sort(key=lambda r: (r['target'] is None, -Decimal(r['pct_achieved'] or '0'), r['name']))

        unassigned_mtd = sum(daily.get(None, {}).values(), Decimal('0.00'))
        totals = {
            'target': str(tot['target']),
            'recovered_today': str(tot['today']),
            'recovered_mtd': str(tot['mtd']),
            'balance': str(tot['balance']),
            'expected_to_date': str(tot['expected']),
            'pct_achieved': (
                str((tot['mtd'] / tot['target'] * 100).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP))
                if tot['target'] > 0 else None
            ),
            # Recovery on clients with no assigned officer - shown so nothing recovered
            # goes unseen. Hidden from officer-scoped users.
            'unassigned_recovered_mtd': None if narrow else str(unassigned_mtd),
        }

        # 'export' rather than 'format': DRF reserves ?format= for renderer
        # selection and 404s on a value no renderer handles.
        fmt = request.query_params.get('export', 'json')
        if fmt == 'csv':
            headers = ['name', 'branch_name', 'target', 'recovered_today', 'recovered_mtd',
                       'balance', 'pct_achieved', 'expected_to_date', 'required_daily', 'status']
            return _csv_response(
                f'recovery-targets-{month_start:%Y-%m}.csv', headers,
                [[r[h] if r[h] is not None else '' for h in headers] for r in rows],
            )
        if fmt != 'json':
            return Response({'success': False, 'error': f"Unsupported format '{fmt}'"}, status=400)

        return Response({
            'success': True,
            'month': f'{month_start:%Y-%m}',
            'as_of': str(as_of) if as_of else None,
            'days_in_month': days_in_month,
            'days_elapsed': days_elapsed,
            'pct_month_elapsed': str(
                (Decimal(days_elapsed) / days_in_month * 100).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)
            ),
            'can_set_targets': _can_set_recovery_targets(user),
            'min_days_overdue': RECOVERY_MIN_DAYS_OVERDUE,
            'officers': rows,
            'totals': totals,
        })

    def post(self, request):
        from decimal import InvalidOperation
        from django.db import transaction as db_transaction
        from hr.models import Staff
        from .models import OfficerRecoveryTarget

        user = request.user
        if not _can_set_recovery_targets(user):
            return Response(
                {'success': False, 'error': 'You do not have permission to set recovery targets.'}, status=403)

        month_raw = request.data.get('month')
        if not month_raw:
            return Response({'success': False, 'error': 'month (YYYY-MM) is required.'}, status=400)
        month_start = _parse_month(month_raw, timezone.localdate())
        items = request.data.get('targets')
        if not isinstance(items, list) or not items:
            return Response({'success': False, 'error': 'targets must be a non-empty list.'}, status=400)

        requested_ids = []
        for i in items:
            if isinstance(i, dict):
                try:
                    requested_ids.append(int(i.get('staff_id')))
                except (TypeError, ValueError):
                    pass
        allowed_staff = {s.pk: s for s in Staff.objects.for_user(user).filter(pk__in=requested_ids)}

        errors, parsed = [], []
        for idx, item in enumerate(items):
            if not isinstance(item, dict):
                errors.append({'index': idx, 'error': 'Each target must be an object.'})
                continue
            try:
                staff = allowed_staff.get(int(item.get('staff_id')))
            except (TypeError, ValueError):
                staff = None
            if staff is None:
                errors.append({'index': idx, 'error': f"Officer {item.get('staff_id')} not found."})
                continue
            raw = item.get('target_amount')
            amount = None
            if raw not in (None, ''):
                try:
                    amount = Decimal(str(raw).replace(',', '')).quantize(Decimal('0.01'))
                except (InvalidOperation, ValueError):
                    errors.append({'index': idx, 'error': f'Invalid amount for {staff}.'})
                    continue
                if amount < 0:
                    errors.append({'index': idx, 'error': f'Target for {staff} cannot be negative.'})
                    continue
            parsed.append((staff, amount, str(item.get('notes') or '')[:255]))
        if errors:
            return Response({'success': False, 'errors': errors}, status=400)

        saved = removed = 0
        with db_transaction.atomic():
            for staff, amount, notes in parsed:
                existing = OfficerRecoveryTarget.all_objects.filter(staff=staff, month=month_start).first()
                if amount is None:
                    if existing:
                        existing.delete()
                        removed += 1
                    continue
                if existing is None:
                    existing = OfficerRecoveryTarget(
                        staff=staff, month=month_start, tenant=staff.tenant, branch=staff.branch,
                        owner=user, created_by=user,
                    )
                existing.target_amount = amount
                existing.notes = notes
                existing.is_deleted = False
                existing.updated_by = user
                existing.save()
                saved += 1

        return Response({'success': True, 'month': f'{month_start:%Y-%m}', 'saved': saved, 'removed': removed})
