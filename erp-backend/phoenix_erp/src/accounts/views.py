from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, extend_schema_view
from django.db.models import Sum

from common.views import ScopedModelViewSet

from .models import Account, Period, BalanceSheetSnapshot
from .serializers import (
    AccountSerializer, AccountCategorySerializer,
    PeriodSerializer, BalanceSheetSnapshotSerializer
)
from .services import (
    close_month, year_end_close, create_balance_snapshots,
    reopen_period_and_invalidate, reclose_periods
)



from rest_framework import status
from rest_framework.decorators import action
from rest_framework import viewsets
from rest_framework.response import Response
from django.db import transaction
from decimal import Decimal

from automations.models import FormSchema, WorkflowTemplate
from pages.models import ModulePage
from accounts.models import Account, AccountCategory
from .models import Account as AccountModel
from products.models import Product
from .serializers import AccountSerializer, AccountReadSerializer

@extend_schema_view(
    list=extend_schema(
        summary="List accounts",
        description="Get a list of all accounts accessible to the current user.",
        responses={200: AccountSerializer(many=True)}
    ),
    create=extend_schema(
        summary="Create account",
        description="Create a new account with the given data.",
        responses={201: AccountSerializer}
    ),
    retrieve=extend_schema(
        summary="Get account details",
        description="Retrieve details of a specific account.",
        responses={200: AccountSerializer}
    ),
    update=extend_schema(
        summary="Update account",
        description="Update all fields of an existing account.",
        responses={200: AccountSerializer}
    ),
    partial_update=extend_schema(
        summary="Partially update account",
        description="Update specific fields of an existing account.",
        responses={200: AccountSerializer}
    ),
    destroy=extend_schema(
        summary="Delete account",
        description="Delete an existing account."
    )
)
class AccountViewSet(ScopedModelViewSet):
    """
    ViewSet for managing accounts in the chart of accounts.
    
    Note: Pagination is disabled for accounts since users typically need
    the complete chart of accounts for selection lists and reports.
    """
    permission_module = 'accounts'
    permission_page = 'chart-of-accounts'
    queryset = Account.objects.select_related("parent")
    serializer_class = AccountSerializer
    READ_ACTIONS = {
    "list",
    "retrieve",
    "parents",
    "parent_accounts",
    "children_summary",
}

    def get_serializer_class(self):
        if self.action in self.READ_ACTIONS:
            return AccountReadSerializer
        return AccountSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        # List views are where per-entity sub-ledgers (one row per loan/
        # savings account/cashier till) clutter a "pick a GL account"
        # dropdown — retrieve-by-id and children_summary (drilling into a
        # parent's own children) are left alone since hiding sub-ledgers
        # there would either break a page that already knows the specific
        # id, or defeat the point of that action.
        if self.action == 'list':
            raw = self.request.query_params.get('include_subledgers', '').strip().lower()
            if raw == 'true':
                # Include every sub-ledger kind — no exclusion at all.
                pass
            elif raw:
                # Comma-separated sub-ledger kinds to keep visible (e.g.
                # "cashier" so Ledger Search can find a staff member's cash
                # till) while still hiding the much noisier per-loan/
                # per-savings/per-asset/per-supplier rows.
                keep_kinds = {k.strip() for k in raw.split(',') if k.strip()}
                qs = Account.exclude_entity_subledgers(qs, keep_kinds=keep_kinds)
            else:
                qs = Account.exclude_entity_subledgers(qs)
        return qs

    filterset_fields = ['account_type', 'account_level', 'branch', 'parent']
    search_fields = ['name', 'code']
    ordering_fields = ['code', 'name', 'balance', 'created_at']
    ordering = ['code']  # Default ordering by account code
    pagination_class = None  # Disable pagination - return all accounts
    
    @action(detail=True, methods=['get'], url_path='children-summary')
    def children_summary(self, request, pk=None):
        """
        Get summary of all child accounts for a parent account.
        
        GET /api/accounts/{id}/children-summary/
        Returns: List of children with balances + aggregated totals
        """
        account = self.get_object()
        
        # Only parent accounts can have children
        if account.account_level != Account.LEVEL_PARENT:
            return Response({
                'error': 'This endpoint is only for parent/category accounts'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get all child accounts — use all_objects.for_owner to avoid tenant-thread-local
        # filtering differences between model reverse relations and request-scoped queries.
        # from .models import Account as AccountModel
        # # Ensure thread-local tenant matches request user for manager filtering
        # try:
        #     from common.managers import set_current_tenant
        #     if getattr(request.user, 'tenant', None) is not None:
        #         set_current_tenant(request.user.tenant)
        # except Exception:
        #     pass

        # In the 4-digit FIRS scheme children are linked via FK (e.g. parent 1100 → children 1101, 1102 …).
        # Use the parent FK relationship which is always correct.
        try:
            children = (
                AccountModel.all_objects
                .filter(parent_id=account.id)
                .select_related("parent")
                .order_by("code")
            )

            summary = children.aggregate(
                total_balance=Sum("balance")
            )
        except Exception:
            children = AccountModel.objects.none()
        
        # Calculate total balance
        total_balance = summary["total_balance"] or Decimal("0")
        
        # Serialize children
        children = list(children)
        
        return Response({
            'parent_account': {
                'id': account.id,
                'code': account.code,
                'name': account.name,
                'account_type': account.get_account_type_display(),
            },
            'children': children,
            'summary': {
                'total_children': len(children),
                'total_balance': total_balance,
            }
        }, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['get'], url_path='reconciliation-detail')
    def reconciliation_detail(self, request, pk=None):
        """
        Investigation data for reconciling entries posted directly against
        this account — built for suspense/clearing accounts (e.g. the
        "Unidentified Cash Receipts" account used to hold funds pending
        matching to a real bank account) but works for any account.

        GET /api/accounts/{id}/reconciliation-detail/?start_date=&end_date=&side=

        For each entry, enriches the raw ledger data with whatever
        FinancialAuditLog captured for the transaction (loan number, client,
        bank reference, principal/interest/fee/penalty split) when
        available, and who actually recorded it.
        """
        from transactions.models import TransactionEntry
        from common.models import FinancialAuditLog

        account = self.get_object()

        entries = (
            TransactionEntry.objects
            .filter(account=account, transaction__is_deleted=False)
            .select_related('transaction', 'transaction__series', 'transaction__created_by')
            .order_by('-transaction__date', '-id')
        )

        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        side = request.query_params.get('side')
        if start_date:
            entries = entries.filter(transaction__date__gte=start_date)
        if end_date:
            entries = entries.filter(transaction__date__lte=end_date)
        if side in (TransactionEntry.DEBIT, TransactionEntry.CREDIT):
            entries = entries.filter(side=side)

        entries = list(entries)

        # Batch-fetch matching audit log rows (one per journal) instead of
        # querying per-entry.
        journal_ids = {str(e.transaction_id) for e in entries}
        audit_logs = {
            log.extra.get('journal_entry_id'): log
            for log in FinancialAuditLog.objects.filter(
                extra__journal_entry_id__in=list(journal_ids)
            ).select_related('acted_by')
        }

        total_debit = Decimal('0.00')
        total_credit = Decimal('0.00')
        results = []
        for entry in entries:
            txn = entry.transaction
            if entry.side == TransactionEntry.DEBIT:
                total_debit += entry.amount
            else:
                total_credit += entry.amount

            recorded_by = getattr(txn.created_by, 'email', None) \
                or getattr(txn.created_by, 'username', None) or txn.created_by_id

            row = {
                'entry_id': entry.pk,
                'transaction_reference': txn.reference_number,
                'series': txn.series.code if txn.series_id else None,
                'date': txn.date,
                'side': entry.side,
                'amount': str(entry.amount),
                'posted': entry.posted,
                'posted_at': entry.posted_at,
                'description': txn.description,
                'recorded_by': recorded_by,
                'audit': None,
            }

            log = audit_logs.get(str(txn.pk))
            if log:
                extra = log.extra or {}
                row['audit'] = {
                    'event_type': log.event_type,
                    'acted_by': getattr(log.acted_by, 'email', log.acted_by_id),
                    'timestamp': log.timestamp,
                    'loan_number': extra.get('loan_number'),
                    'client_id': extra.get('client_id'),
                    'bank_reference': extra.get('bank_reference') or None,
                    'principal': extra.get('principal'),
                    'interest': extra.get('interest'),
                    'fees': extra.get('fees'),
                    'penalty': extra.get('penalty'),
                }

            results.append(row)

        return Response({
            'account': {
                'id': account.id,
                'code': account.code,
                'name': account.name,
                'account_type': account.account_type,
                'balance': str(account.balance),
            },
            'entries': results,
            'summary': {
                'count': len(results),
                'total_debit': str(total_debit),
                'total_credit': str(total_credit),
                'net': str(total_debit - total_credit),
            },
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='generated-components')
    def get_generated_components(self, request, pk=None):
        """
        Get all auto-generated components for an account.
        
        GET /api/accounts/{id}/generated-components/
        """
        account = self.get_object()
        
        # Only child accounts have generated components
        if account.account_level != Account.LEVEL_CHILD:
            return Response({
                'message': 'Parent accounts do not have auto-generated components'
            }, status=status.HTTP_200_OK)
        
        try:
            # Get generated components
            form_schema = FormSchema.objects.filter(
                trigger_event_name=f'transaction.{account.code.replace("-", "_").lower()}'
            ).first()
            
            workflow = WorkflowTemplate.objects.filter(
                name=f'Process {account.name} Transaction'
            ).first()
            
            module_page = ModulePage.objects.filter(
                code=f'{account.code.replace("-", "_").lower()}_transaction'
            ).first()
            
            from reports.models import Report
            report = Report.objects.filter(
                name__icontains=account.name
            ).first()
            
            report_page = ModulePage.objects.filter(
                code=f'{account.code.replace("-", "_").lower()}_report',
                page_type='report'
            ).first()
            
            return Response({
                'form_schema': {
                    'id': form_schema.id,
                    'name': form_schema.name,
                } if form_schema else None,
                'workflow': {
                    'id': workflow.id,
                    'name': workflow.name,
                } if workflow else None,
                'module_page': {
                    'id': module_page.id,
                    'url_path': module_page.url_path,
                    'title': module_page.title,
                } if module_page else None,
                'report': {
                    'id': report.id,
                    'name': report.name,
                    'code': report.code,
                } if report else None,
                'report_page': {
                    'id': report_page.id,
                    'url_path': report_page.url_path,
                    'title': report_page.title,
                } if report_page else None,
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'], url_path='products')
    def get_products(self, request):
        """
        Get available products for account types (SAVINGS, LOAN).
        
        GET /api/accounts/products/?product_type=SAVINGS
        """
        product_type = request.query_params.get('product_type')
        
        if not product_type:
            return Response(
                {'error': 'product_type query parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            products = Product.objects.filter(
                owner=request.user,
                branch=request.user.branch,
                product_type=product_type,
                is_active=True
            )
            
            from products.serializers import ProductSerializer
            return Response({
                'results': ProductSerializer(products, many=True).data
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'], url_path='parents')
    def parent_accounts(self, request):
        """
        List parent accounts (not classifications).

        GET /api/accounts/parents/
        Returns paginated list of accounts where `account_level` == `Account.LEVEL_PARENT`.
        """
        parents = self.filter_queryset(self.get_queryset().filter(account_level=Account.LEVEL_PARENT).order_by('code'))

        page = self.paginate_queryset(parents)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(parents, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['get'], url_path='generated-components')
    def generated_components(self, request, pk=None):
        """
        Return any generated components (form schema, workflow, module page)
        related to this account. This mirrors the AccountSerializer helper
        fields and is useful for clients that want to check existence.
        GET /api/accounts/{pk}/generated-components/
        """
        account = self.get_object()
        try:
            from automations.models import FormSchema, WorkflowTemplate
            from pages.models import ModulePage

            form = FormSchema.objects.filter(
                trigger_event_name=f'transaction.{account.code.replace("-", "_").lower()}'
            ).first()

            workflow = WorkflowTemplate.objects.filter(
                name__icontains=account.name,
                workflow_type='template'
            ).first()

            page_code = f'{account.code.replace("-", "_").lower()}_transaction'
            page = ModulePage.objects.filter(code=page_code).first()

            return Response({
                'generated_form_schema': {'id': form.id, 'name': form.name} if form else None,
                'generated_workflow': {'id': workflow.id, 'name': workflow.name} if workflow else None,
                'generated_page': {'id': page.id, 'url_path': page.url_path, 'title': page.title} if page else None,
            })
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@extend_schema_view(
    list=extend_schema(
        summary="List account classifications",
        description="Get a list of all account classifications.",
        responses={200: AccountCategorySerializer(many=True)}
    ),
    create=extend_schema(
        summary="Create classification",
        description="Create a new account classification.",
        responses={201: AccountCategorySerializer}
    ),
    retrieve=extend_schema(
        summary="Get classification details",
        description="Retrieve details of a specific account classification.",
        responses={200: AccountCategorySerializer}
    ),
    update=extend_schema(
        summary="Update classification",
        description="Update all fields of an existing account classification.",
        responses={200: AccountCategorySerializer}
    ),
    partial_update=extend_schema(
        summary="Partially update classification",
        description="Update specific fields of an existing account classification.",
        responses={200: AccountCategorySerializer}
    ),
    destroy=extend_schema(
        summary="Delete classification",
        description="Delete an existing account classification."
    )
)
class AccountCategoryViewSet(ScopedModelViewSet):
    """
    ViewSet for managing account classifications.
    Classifications help organize accounts into categories.
    """
    permission_module = 'accounts'
    permission_page = 'account-categories'
    queryset = AccountCategory.objects.all()
    serializer_class = AccountCategorySerializer
    ordering_fields = ['name']
    ordering = ['name']

    @action(detail=False, methods=['get'], url_path='deleted')
    def deleted(self, request):
        """List soft-deleted account categories for the current user/branch."""
        qs = AccountCategory.all_objects.filter(owner=request.user, branch=request.user.branch, is_deleted=True).order_by('name')

        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='restore')
    def restore(self, request, pk=None):
        """Restore a soft-deleted account category."""
        obj = AccountCategory.all_objects.filter(pk=pk, owner=request.user, branch=request.user.branch).first()
        if obj is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not getattr(obj, 'is_deleted', False):
            return Response({'detail': 'Record is not deleted.'}, status=status.HTTP_400_BAD_REQUEST)

        obj.is_deleted = False
        obj.save()
        return Response(self.get_serializer(obj).data, status=status.HTTP_200_OK)


@extend_schema_view(
    list=extend_schema(
        summary="List accounting periods",
        description="Get a list of all accounting periods.",
        responses={200: PeriodSerializer(many=True)}
    ),
    create=extend_schema(
        summary="Create period",
        description="Create a new accounting period.",
        responses={201: PeriodSerializer}
    ),
    retrieve=extend_schema(
        summary="Get period details",
        description="Retrieve details of a specific accounting period.",
        responses={200: PeriodSerializer}
    ),
    update=extend_schema(
        summary="Update period",
        description="Update all fields of an existing accounting period.",
        responses={200: PeriodSerializer}
    ),
    partial_update=extend_schema(
        summary="Partially update period",
        description="Update specific fields of an existing accounting period.",
        responses={200: PeriodSerializer}
    ),
    destroy=extend_schema(
        summary="Delete period",
        description="Delete an existing accounting period."
    )
)
class PeriodViewSet(ScopedModelViewSet):
    """
    ViewSet for managing accounting periods.
    Supports month-end and year-end closing operations.
    """
    permission_module = 'accounts'
    permission_page = 'accounting-periods'
    queryset = Period.objects.all()
    serializer_class = PeriodSerializer
    filterset_fields = ['period_type', 'year', 'month', 'is_closed']
    ordering = ['-year', '-month']

    @extend_schema(
        summary="Close period",
        description="""Close an accounting period (month or year).
        This will:
        1. Mark the period as closed
        2. Create balance snapshots for all accounts
        3. For year-end, handle retained earnings transfers""",
        responses={200: {"type": "object", "properties": {"status": {"type": "string"}}}}
    )
    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        period = self.get_object()
        if period.period_type == Period.MONTH:
            close_month(
                owner=request.user,
                branch=period.branch,
                year=period.year,
                month=period.month
            )
        else:
            year_end_close(
                owner=request.user,
                branch=period.branch,
                year=period.year
            )
        create_balance_snapshots(
            owner=request.user,
            branch=period.branch,
            period_type=period.period_type,
            year=period.year,
            month=period.month if period.period_type == Period.MONTH else None
        )
        return Response({'status': 'period closed'})

    @extend_schema(
        summary="Reopen period",
        description="""Reopen a closed accounting period.
        This will:
        1. Delete snapshots for this and all subsequent periods
        2. Mark this and all subsequent periods as open
        3. Return list of affected periods""",
        responses={200: {"type": "object", "properties": {
            "status": {"type": "string"},
            "affected_periods": {"type": "array", "items": {"$ref": "#/components/schemas/Period"}}
        }}}
    )
    @action(detail=True, methods=['post'])
    def reopen(self, request, pk=None):
        period = self.get_object()
        affected = reopen_period_and_invalidate(
            owner=request.user,
            branch=period.branch,
            period_type=period.period_type,
            year=period.year,
            month=period.month if period.period_type == Period.MONTH else None
        )
        return Response({
            'status': 'period reopened',
            'affected_periods': PeriodSerializer(affected, many=True).data
        })

    @extend_schema(
        summary="Reclose period",
        description="""Reclose a previously reopened period.
        This will:
        1. Re-close the period
        2. Create new balance snapshots
        3. If year-end, re-run the closing process""",
        responses={200: {"type": "object", "properties": {"status": {"type": "string"}}}}
    )
    @action(detail=True, methods=['post'])
    def reclose(self, request, pk=None):
        period = self.get_object()
        affected = Period.objects.filter(id=period.id)
        reclose_periods(
            owner=request.user,
            branch=period.branch,
            affected_periods=affected
        )
        return Response({'status': 'period reclosed'})

    @action(detail=False, methods=['post'], url_path='close-year')
    def close_year(self, request):
        """
        Close a full financial year by supplying { year: <int> }.

        Finds or creates the YEAR period for the authenticated user's branch,
        runs year_end_close(), and creates balance snapshots.  This is the
        endpoint used by the CloseYearPage frontend component.
        """
        from django.db import IntegrityError

        year_raw = request.data.get('year')
        if not year_raw:
            return Response({'detail': 'year is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            year = int(year_raw)
        except (ValueError, TypeError):
            return Response({'detail': 'year must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)

        branch = getattr(request.user, 'branch', None)

        # Check if already closed
        existing = Period.objects.filter(
            owner=request.user,
            branch=branch,
            period_type=Period.YEAR,
            year=year,
            is_closed=True,
        ).first()
        if existing:
            return Response(
                {'detail': f'Financial year {year} is already closed for this branch.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            year_end_close(owner=request.user, branch=branch, year=year)
            create_balance_snapshots(
                owner=request.user,
                branch=branch,
                period_type=Period.YEAR,
                year=year,
                month=None,
            )
        except IntegrityError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'status': f'Financial year {year} closed successfully.'})


@extend_schema_view(
    list=extend_schema(
        summary="List snapshots",
        description="Get a list of all balance sheet snapshots.",
        responses={200: BalanceSheetSnapshotSerializer(many=True)}
    ),
    retrieve=extend_schema(
        summary="Get snapshot details",
        description="Retrieve details of a specific balance sheet snapshot.",
        responses={200: BalanceSheetSnapshotSerializer}
    )
)
class BalanceSheetSnapshotViewSet(ScopedModelViewSet):
    """
    ViewSet for viewing balance sheet snapshots.
    Snapshots are created automatically during period closing.
    They provide historical account balances for faster reporting.
    """
    permission_module = 'accounts'
    permission_page = 'balance-sheet'
    queryset = BalanceSheetSnapshot.objects.all()
    serializer_class = BalanceSheetSnapshotSerializer
    filterset_fields = ['period', 'account']
    ordering = ['-period__year', '-period__month']
    ordering_fields = ['name']
    ordering = ['name']
