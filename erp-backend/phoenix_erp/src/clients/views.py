from django.shortcuts import render
from django.http import StreamingHttpResponse
from django.core.exceptions import ValidationError
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.views import APIView
from django.db.models import Q, Count, Sum, OuterRef, Subquery, DecimalField, Value
from django.db.models.functions import Coalesce
from decimal import Decimal
from datetime import date, timedelta
import csv
import io

from common.serializers import IsTenantUser
from common.views import ScopedModelViewSet

from .models import (
    Client, ClientClassification, ClientDocument, 
    ClientRelationship, ClientNote, ClientGroup, CustomerAuditLog,
    ClientRegistrationConfig,
)
from .serializers import (
    ClientListSerializer, ClientDetailSerializer, ClientCreateUpdateSerializer,
    ClientClassificationSerializer, ClientDocumentSerializer,
    ClientRelationshipSerializer, ClientNoteSerializer,
    ClientGroupSerializer, ClientGroupListSerializer,
    CustomerAuditLogSerializer,
    ClientRegistrationConfigSerializer,
    ProspectPublicRegistrationSerializer,
)
from .services import get_active_registration_config, collect_client_registration_fees
from cash_management.services.payment_routing import PaymentRoutingService


class ClientViewSet(ScopedModelViewSet):
    """
    Universal client/student endpoint with comprehensive management capabilities.
    
    Supports filtering by:
    - usage_context: 'student', 'financial', 'patient', 'customer'
    - status: 'active', 'inactive', 'suspended', 'blacklisted'
    - classification: ID of client classification
    - search: Search by name, client_id, phone, email

    Access scoping (microfinance):
    - credit_officer  → only their assigned clients + unassigned clients
    - supervisor      → own + direct-reports' clients + unassigned
    - branch_manager / director / operations / admin → full branch/tenant scope
    """
    permission_module = 'clients'
    permission_page = 'clients'
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]
    queryset = Client.objects.all()
    officer_client_lookup = 'assigned_officer'

    def get_queryset(self):
        # Get the base scoped + officer-scoped queryset from parent class
        queryset = super().get_queryset()

        # Filter by usage context
        usage_context = self.request.query_params.get('usage_context')
        if usage_context:
            queryset = queryset.filter(usage_context=usage_context)
        
        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Filter by classification
        classification = self.request.query_params.get('classification')
        if classification:
            queryset = queryset.filter(classification_id=classification)
        
        # Search functionality
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(middle_name__icontains=search) |
                Q(client_id__icontains=search) |
                Q(phone_primary__icontains=search) |
                Q(email__icontains=search)
            )
        
        return queryset.select_related('classification', 'owner', 'branch', 'assigned_officer')
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ClientListSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return ClientCreateUpdateSerializer
        return ClientDetailSerializer

    def perform_create(self, serializer):
        """
        Collect registration + ID fee at client creation (except prospects).
        Posting entry:
          Dr Cashier Account (ASSET)
          Cr Registration Income
          Cr ID Fee Income
        """
        from django.db import transaction as db_transaction

        user = self.request.user
        tenant = getattr(user, 'tenant', None)
        if self._is_elevated_user(user):
            branch = self._get_director_branch_override()
            if branch is None:
                raise DRFValidationError({
                    'non_field_errors': [
                        'Select a branch from the branch switcher before registering a client.'
                    ]
                })
        else:
            branch = getattr(user, 'branch', None)

        with db_transaction.atomic():
            client = serializer.save(owner=user, branch=branch, tenant=tenant)

            # Prospects pay on conversion, not at public/staff capture.
            if (client.client_type or '').lower() == 'pr':
                return

            try:
                cashier_account = PaymentRoutingService.resolve_cashier_gl_account(
                    self.request.user,
                    owner=client.owner,
                    branch=client.branch,
                    cashier_account_id=self.request.data.get('cashier_account_id'),
                )
            except ValidationError:
                raise DRFValidationError({'cashier_account_id': 'Cashier account not found.'})

            config = get_active_registration_config(owner=client.owner, branch=client.branch)
            if not config:
                raise DRFValidationError(
                    {
                        'registration_config': (
                            'No active registration config found for this branch. '
                            'Create one first before registering non-prospect clients.'
                        )
                    }
                )

            try:
                collect_client_registration_fees(
                    client=client,
                    cashier_account=cashier_account,
                    transacted_by=self.request.user,
                    config=config,
                )
            except ValidationError as exc:
                raise DRFValidationError({'detail': exc.messages})

    @action(detail=False, methods=['get'], url_path='registration-fee-preview')
    def registration_fee_preview(self, request):
        client_type = (request.query_params.get('client_type') or '').lower()
        if client_type not in {'dc', 'wl', 'ml', 'pr'}:
            return Response(
                {'detail': 'client_type must be one of dc, wl, ml, pr.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        config = get_active_registration_config(owner=request.user, branch=request.user.branch)
        if not config:
            return Response(
                {'detail': 'No active registration config found for your branch.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        registration_fee, id_fee = config.get_fees_for_client_type(client_type)
        return Response(
            {
                'client_type': client_type,
                'registration_fee': str(registration_fee),
                'id_fee': str(id_fee),
                'total': str((registration_fee or 0) + (id_fee or 0)),
                'registration_income_account': config.registration_income_account_id,
                'id_fee_income_account': config.id_fee_income_account_id,
            }
        )

    @action(detail=True, methods=['post'], url_path='convert-prospect')
    def convert_prospect(self, request, pk=None):
        """
        Convert a prospect (pr) into an active client type and collect
        registration + ID fee in cash.
        """
        from django.db import transaction as db_transaction

        client = self.get_object()
        if (client.client_type or '').lower() != 'pr':
            return Response(
                {'detail': 'Only prospects can be converted using this endpoint.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        new_type = (request.data.get('client_type') or '').lower()
        if new_type not in {'dc', 'wl', 'ml'}:
            return Response(
                {'detail': 'client_type must be one of dc, wl, ml.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            cashier_account = PaymentRoutingService.resolve_cashier_gl_account(
                request.user,
                owner=client.owner,
                branch=client.branch,
                cashier_account_id=request.data.get('cashier_account_id'),
            )
        except ValidationError:
            return Response({'detail': 'Cashier account not found.'}, status=status.HTTP_400_BAD_REQUEST)

        config = get_active_registration_config(owner=client.owner, branch=client.branch)
        if not config:
            return Response(
                {'detail': 'No active registration config found for this branch.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with db_transaction.atomic():
            client.client_type = new_type
            client.status = 'active'
            client.save(update_fields=['client_type', 'status', 'updated_at'])
            collect_client_registration_fees(
                client=client,
                cashier_account=cashier_account,
                transacted_by=request.user,
                config=config,
            )

        return Response(ClientDetailSerializer(client, context={'request': request}).data)
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """Get client statistics"""
        queryset = self.get_queryset()
        
        total = queryset.count()
        by_status = queryset.values('status').annotate(count=Count('id'))
        by_usage = queryset.values('usage_context').annotate(count=Count('id'))
        by_gender = queryset.values('gender').annotate(count=Count('id'))
        
        # KYC statistics
        by_kyc = queryset.values('kyc_status').annotate(count=Count('id'))
        
        # Recent registrations (last 30 days)
        thirty_days_ago = date.today() - timedelta(days=30)
        recent_registrations = queryset.filter(created_at__gte=thirty_days_ago).count()
        
        return Response({
            'total_clients': total,
            'by_status': list(by_status),
            'by_usage_context': list(by_usage),
            'by_gender': list(by_gender),
            'by_kyc_status': list(by_kyc),
            'recent_registrations': recent_registrations,
        })

    @action(detail=False, methods=['get'], url_path='export-csv')
    def export_csv(self, request):
        """
        Stream a CSV of all clients (matching current filters) with fee summary
        derived directly from Invoices.

        Columns: Student ID, Full Name, Gender, Age, Date of Birth, Email,
                 Phone, Grade Level, Class Name, Academic Year, Status,
                 Enrollment Date, Total Invoiced, Amount Paid, Balance Owed,
                 Overdue Amount
        """
        from incomes.models import Invoice

        queryset = self.get_queryset()

        today = date.today()

        # Use all_tenants() to bypass the OwnerBranchManager thread-local
        # tenant filter — older invoices may have tenant=NULL and would
        # otherwise be silently excluded.  The outer client queryset is
        # already scoped to request.tenant, so OuterRef('pk') is safe.
        invoice_base = Invoice.objects.all_tenants()

        # Single-query aggregation: annotate each client with their invoice totals
        queryset = queryset.annotate(
            total_fees=Coalesce(
                Subquery(
                    invoice_base.filter(
                        client=OuterRef('pk'),
                    ).exclude(status='cancelled')
                    .values('client')
                    .annotate(s=Sum('total_amount'))
                    .values('s')
                ),
                Value(Decimal('0')),
                output_field=DecimalField(),
            ),
            paid_amount=Coalesce(
                Subquery(
                    invoice_base.filter(
                        client=OuterRef('pk'),
                    ).exclude(status='cancelled')
                    .values('client')
                    .annotate(s=Sum('amount_paid'))
                    .values('s')
                ),
                Value(Decimal('0')),
                output_field=DecimalField(),
            ),
            overdue_amount=Coalesce(
                Subquery(
                    invoice_base.filter(
                        client=OuterRef('pk'),
                        status__in=['sent', 'partial', 'overdue'],
                        due_date__lt=today,
                    ).values('client')
                    .annotate(s=Sum('total_amount') - Sum('amount_paid'))
                    .values('s')
                ),
                Value(Decimal('0')),
                output_field=DecimalField(),
            ),
        )

        STATUS_LABELS = {
            'active': 'Enrolled',
            'inactive': 'Graduated/Left',
            'suspended': 'Suspended',
            'blacklisted': 'Expelled',
        }

        def generate_rows():
            headers = [
                'Student ID', 'Full Name', 'Gender', 'Age', 'Date of Birth',
                'Email', 'Phone', 'Grade Level', 'Class Name', 'Academic Year',
                'Status', 'Enrollment Date',
                'Total Invoiced', 'Amount Paid', 'Balance Owed', 'Overdue Amount',
            ]

            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(headers)
            yield buf.getvalue()

            for client in queryset.iterator(chunk_size=500):
                total = client.total_fees or Decimal('0')
                paid = client.paid_amount or Decimal('0')
                balance = max(Decimal('0'), total - paid)
                overdue = max(Decimal('0'), client.overdue_amount or Decimal('0'))

                buf = io.StringIO()
                writer = csv.writer(buf)
                writer.writerow([
                    getattr(client, 'admission_number', None) or client.client_id,
                    client.full_name,
                    client.gender,
                    client.age,
                    client.date_of_birth or '',
                    client.email or '',
                    client.phone_primary,
                    client.classification.name if client.classification else '',
                    getattr(client, 'class_name', '') or '',
                    getattr(client, 'academic_year', '') or '',
                    STATUS_LABELS.get(client.status, client.status),
                    client.created_at.strftime('%d/%m/%Y'),
                    f'{total:.2f}',
                    f'{paid:.2f}',
                    f'{balance:.2f}',
                    f'{overdue:.2f}',
                ])
                yield buf.getvalue()

        filename = f'students_export_{date.today().isoformat()}.csv'
        response = StreamingHttpResponse(generate_rows(), content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    @action(detail=True, methods=['post'])
    def update_kyc(self, request, pk=None):
        """Update KYC status for a client"""
        client = self.get_object()
        new_status = request.data.get('status')
        notes = request.data.get('notes', '')
        
        if new_status not in ['pending', 'submitted', 'verified', 'rejected']:
            return Response(
                {'error': 'Invalid KYC status'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        client.update_kyc_status(new_status, notes)
        
        return Response({
            'success': True,
            'kyc_status': client.kyc_status,
            'kyc_last_update': client.kyc_last_update,
        })
    
    @action(detail=True, methods=['get'])
    def financial_summary(self, request, pk=None):
        """Get financial summary for client"""
        from incomes.models import Income
        from expenses.models import Expense
        from loans.models import LoanAccount
        from savings.models import SavingsAccount
        
        client = self.get_object()
        
        # Get all income records
        incomes = Income.objects.filter(client=client, tenant=request.tenant)
        
        # Get expenses (if client-related expenses exist)
        expenses = Expense.objects.filter(
            metadata__client_id=client.id, 
            tenant=request.tenant
        )
        
        # Get loans
        loans = LoanAccount.objects.filter(client=client, tenant=request.tenant)
        
        summary = {
            'total_invoiced': sum(i.amount for i in incomes),
            'total_paid': sum(i.amount_paid for i in incomes),
            'total_outstanding': sum(i.balance for i in incomes),
            'overdue_amount': sum(
                i.balance for i in incomes 
                if i.status in ['pending', 'partial'] and i.due_date and i.due_date < date.today()
            ),
            'total_expenses': sum(e.amount for e in expenses),
            'active_loans': loans.filter(status='active').count(),
            'total_loan_balance': sum(l.balance for l in loans.filter(status='active')),
        }
        
        return Response(summary)
    
    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """Deactivate a client"""
        client = self.get_object()
        client.status = 'inactive'
        client.save()
        return Response({'success': True, 'status': client.status})
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Activate a client"""
        client = self.get_object()
        client.status = 'active'
        client.save()
        return Response({'success': True, 'status': client.status})
    
    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def bulk_import(self, request):
        """Bulk import clients from CSV file"""
        if 'file' not in request.FILES:
            return Response(
                {'error': 'No file provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        csv_file = request.FILES['file']
        if not csv_file.name.endswith('.csv'):
            return Response(
                {'error': 'File must be a CSV'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Read CSV file
            decoded_file = csv_file.read().decode('utf-8')
            io_string = io.StringIO(decoded_file)
            reader = csv.DictReader(io_string)
            
            created_count = 0
            updated_count = 0
            errors = []
            
            for row_num, row in enumerate(reader, start=2):
                try:
                    # Check if client exists by client_id or phone
                    client_id = row.get('client_id', '').strip()
                    phone = row.get('phone_primary', '').strip()
                    
                    if not phone:
                        errors.append(f"Row {row_num}: phone_primary is required")
                        continue
                    
                    # Try to find existing client
                    existing_client = None
                    if client_id:
                        existing_client = Client.objects.filter(
                            client_id=client_id, 
                            tenant=request.tenant
                        ).first()
                    
                    if not existing_client:
                        existing_client = Client.objects.filter(
                            phone_primary=phone,
                            tenant=request.tenant
                        ).first()
                    
                    # Prepare data
                    data = {
                        'first_name': row.get('first_name', '').strip(),
                        'last_name': row.get('last_name', '').strip(),
                        'middle_name': row.get('middle_name', '').strip(),
                        'gender': row.get('gender', 'male').strip().lower(),
                        'phone_primary': phone,
                        'phone_secondary': row.get('phone_secondary', '').strip(),
                        'email': row.get('email', '').strip(),
                        'date_of_birth': row.get('date_of_birth', '').strip() or None,
                        'address_street': row.get('address_street', '').strip(),
                        'address_city': row.get('address_city', '').strip(),
                        'address_state': row.get('address_state', '').strip(),
                        'usage_context': row.get('usage_context', 'financial').strip(),
                        'status': row.get('status', 'active').strip(),
                    }
                    
                    # Remove empty strings
                    data = {k: v for k, v in data.items() if v}
                    
                    if existing_client:
                        # Update existing
                        for key, value in data.items():
                            setattr(existing_client, key, value)
                        existing_client.save()
                        updated_count += 1
                    else:
                        # Create new
                        if not data.get('first_name') or not data.get('last_name'):
                            errors.append(f"Row {row_num}: first_name and last_name are required")
                            continue
                        
                        Client.objects.create(
                            tenant=request.tenant,
                            owner=request.user,
                            branch=request.user.branch if hasattr(request.user, 'branch') else None,
                            **data
                        )
                        created_count += 1
                        
                except Exception as e:
                    errors.append(f"Row {row_num}: {str(e)}")
            
            return Response({
                'success': True,
                'created': created_count,
                'updated': updated_count,
                'errors': errors,
            })
            
        except Exception as e:
            return Response(
                {'error': f'Failed to process file: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(
        detail=False,
        methods=['post'],
        url_path='school-fees-import',
        parser_classes=[MultiPartParser, FormParser],
    )
    def school_fees_import(self, request):
        """
        Import student records, create + post + pay school fee invoices from Excel.

        Expected column layout (one or more class blocks, each separated by a
        blank row + fresh header row):
            Date | Ref | Name | Class | Term | Tuition | Special Events |
            Coding | Maintenance | Practical | PTA | Transport | BECE & NECO

        Full lifecycle per student
        --------------------------
        1. Auto-provision FIRS GL accounts 4106-4116 if missing.
        2. Get-or-create ClientClassification for the class name.
        3. Get-or-create the Student (Client) record and assign the class.
        4. Build a service catalog (IncomeCategory + ServiceItem) once per import
           for all 8 fee types, each linked to the correct FIRS income account.
        5. Create a draft Invoice dated on the Excel date (= the payment date).
        6. Add SERVICE InvoiceItems (never custom) — each line posts to its own
           FIRS income account when the invoice is posted.
        7. Post the invoice → journal entry: Dr Accounts Receivable / Cr Revenue
           (one Cr leg per distinct GL account, dated on the Excel date).
        8. Record full payment → journal entry: Dr Cash / Cr Accounts Receivable
           (also dated on the Excel date so the cash book is correct).
        9. Update invoice.amount_paid + status = 'paid'.
        10. Create a FeeEntitlement (status='active') for every service item that
            has creates_entitlement=True so the school can gate access per service.

        GL account mapping (FIRS-compliant)
        ------------------------------------
            Tuition        → 4103  School Fees and Tuition Income
            Special Events → 4111  Special Events and Functions Income
            Coding         → 4112  Coding and Technology Classes Income
            Maintenance    → 4109  Development and Maintenance Levy
            Practical      → 4115  Practical and Laboratory Fees
            PTA            → 4114  Parent-Teacher Association Levy
            Transport      → 4113  Transportation and School Bus Fees
            BECE & NECO    → 4116  BECE and NECO Examination Fees
        """
        import openpyxl
        import logging
        from io import BytesIO
        from decimal import Decimal, InvalidOperation
        from datetime import date, timedelta, datetime
        from django.db import transaction as db_transaction
        from django.utils import timezone
        from incomes.models import Invoice, InvoiceItem, IncomeCategory, ServiceItem, FeeEntitlement
        from accounts.models import Account
        from clients.models import ClientClassification

        logger = logging.getLogger(__name__)

        # ── Validate upload ────────────────────────────────────────────────────
        if 'file' not in request.FILES:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)

        excel_file = request.FILES['file']
        filename = excel_file.name.lower()
        if not (filename.endswith('.xlsx') or filename.endswith('.xls')):
            return Response(
                {'error': 'File must be an Excel file (.xlsx or .xls)'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Parse Excel ────────────────────────────────────────────────────────
        try:
            wb = openpyxl.load_workbook(BytesIO(excel_file.read()), data_only=True)
        except Exception as exc:
            return Response(
                {'error': f'Could not open Excel file: {exc}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        def parse_amount(value):
            """Convert cell value to Decimal; return 0 for dash/empty/None."""
            if value is None:
                return Decimal('0')
            s = str(value).strip().replace(',', '')
            if s in ('-', '', 'N/A', 'n/a', '0'):
                return Decimal('0')
            try:
                return Decimal(s)
            except InvalidOperation:
                return Decimal('0')

        def parse_date(value):
            """Return a Python date from various cell formats."""
            if value is None:
                return date.today()
            if isinstance(value, datetime):
                return value.date()
            if isinstance(value, date):
                return value
            s = str(value).strip()
            for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%m/%d/%Y', '%d-%m-%Y'):
                try:
                    return datetime.strptime(s, fmt).date()
                except ValueError:
                    pass
            return date.today()

        # ── Detect header row and map columns by name ─────────────────────────
        # Supported name-column keywords (besides fee headers)
        FIXED_HEADER_KEYWORDS = {
            'names', 'name', 'class', 'term', 'date', 'ref',
            'student ref', 'student id', 'id', 'total', 'amount', 'totat',
        }
        # HEADER_TO_FEE_MAP is defined later but we need the key set for detection
        # — use a minimal set to identify the header row early.
        FEE_HEADER_KEYWORDS = {
            'tuition', 'tution',
            'supplies', 'supply', 'e-portal', 'eportal', 'lunch',
            'lesson', 'lessons', 'transport', 'transportation', 'special events',
            'special event', 'coding', 'pta', 'maintenance', 'maintenance fee',
            'maintenance fees', 'practical', 'bece & neco', 'bece', 'project',
            'roject', 'textbook', 'textbooks', 'uniforms', 'uniform',
            'admission fee', 'admission fees', 'admission',
            'development levy', 'development',
            'prize giving day', 'prize giving',
            'graduation', 'graduation photo frame', 'graduation photo',
        }
        ALL_HEADER_KEYWORDS = FIXED_HEADER_KEYWORDS | FEE_HEADER_KEYWORDS

        # ── Cell normalisation: strip ALL Unicode whitespace variants ──────────
        # openpyxl can return cells with non-breaking spaces (\xa0), zero-width
        # spaces (\u200b), narrow no-break spaces (\u202f), etc. that survive a
        # plain str.strip().  We replace every such character with a regular
        # ASCII space, collapse runs, then strip and lowercase.
        import re as _re
        _UNICODE_WS = _re.compile(
            r'[\xa0\u00ad\u200b\u200c\u200d\u2060\u202f\u205f\u3000\ufeff]'
        )

        def _norm(c):
            if c is None:
                return ''
            s = _UNICODE_WS.sub(' ', str(c))
            return _re.sub(r'\s+', ' ', s).strip().lower()

        # ── Parse every worksheet (one sheet per term is fully supported) ──────
        def parse_worksheet(ws, sheet_name_fallback=''):
            """
            Parse a single worksheet and return a list of student dicts.
            sheet_name_fallback is used as the term when no TERM column exists.
            Returns (parsed_rows, col_map, diagnostic_str).
            """
            all_rows = list(ws.iter_rows(values_only=True))
            header_row_idx = None
            col_map = {}

            for i, row in enumerate(all_rows):
                normalised = [_norm(c) for c in row]
                hits = sum(1 for n in normalised if n in ALL_HEADER_KEYWORDS)
                # Require the row to contain a name column AND ≥ 2 keyword hits
                # to avoid false-positive matches on data/metadata rows.
                has_name_col = any(n in normalised for n in ('names', 'name'))
                if hits >= 2 and has_name_col:
                    header_row_idx = i
                    col_map = {n: j for j, n in enumerate(normalised) if n}
                    break

            parsed = []
            diagnostic = ''

            if header_row_idx is not None:
                # Use explicit `in` checks instead of `or` so that column index 0
                # (a valid falsy integer) is never skipped over.
                def _col(*keys):
                    for k in keys:
                        if k in col_map:
                            return col_map[k]
                    return None

                name_col  = _col('names', 'name')
                class_col = _col('class')
                term_col  = _col('term')
                date_col  = _col('date')
                ref_col   = _col('ref', 'student ref', 'student id', 'id')

                def _get(row, col):
                    return row[col] if col is not None and len(row) > col else None

                skipped_empty_name = 0
                for row in all_rows[header_row_idx + 1:]:
                    if all(v is None for v in row):
                        continue
                    name_val = _get(row, name_col)
                    if not name_val:
                        skipped_empty_name += 1
                        continue
                    full_name = str(name_val).strip()
                    if not full_name or _norm(name_val) in ('names', 'name', 'total', 'subtotal', 's/n', 'sn', 'no', 'no.'):
                        skipped_empty_name += 1
                        continue

                    class_name   = str(_get(row, class_col) or '').strip()
                    # Use TERM column if present; otherwise fall back to sheet name
                    term_val     = _get(row, term_col) if term_col is not None else None
                    term         = str(term_val).strip() if term_val else sheet_name_fallback
                    payment_date = parse_date(_get(row, date_col))

                    if ref_col is not None and _get(row, ref_col):
                        ref = str(_get(row, ref_col)).strip()
                    else:
                        parts = full_name.replace(',', ' ').split()
                        ref = '-'.join(p[:3].upper() for p in parts[:3]) or full_name[:10].upper()

                    name_parts = full_name.replace(',', ' ').split()
                    last_name  = name_parts[0] if name_parts else full_name
                    first_name = ' '.join(name_parts[1:]) if len(name_parts) > 1 else 'Student'

                    parsed.append({
                        'ref': ref,
                        'full_name': full_name,
                        'first_name': first_name,
                        'last_name': last_name,
                        'class_name': class_name,
                        'term': term,
                        'payment_date': payment_date,
                        '_row': row,
                        '_col_map': col_map,
                    })

                if not parsed:
                    diagnostic = (
                        f'Header found at row {header_row_idx + 1} '
                        f'(columns: {list(col_map.keys())}), '
                        f'but no valid student name rows followed '
                        f'({skipped_empty_name} row(s) had empty/header names).'
                    )
            else:
                # Fallback: position-based parsing for the original format
                LEGACY_FEE_COLUMNS = [
                    (5, 'Tuition'), (6, 'Special Events'), (7, 'Coding'),
                    (8, 'Maintenance'), (9, 'Practical'), (10, 'PTA'),
                    (11, 'Transport'), (12, 'BECE & NECO'),
                ]
                for row in all_rows:
                    if all(v is None for v in row):
                        continue
                    cell0 = _norm(row[0]) if row[0] is not None else ''
                    cell2 = _norm(row[2]) if row[2] is not None else ''
                    if cell0 == 'date' or cell2 == 'name':
                        continue
                    if not row[1] or not row[2]:
                        continue
                    ref        = str(row[1]).strip()
                    full_name  = str(row[2]).strip()
                    class_name = str(row[3]).strip() if row[3] else ''
                    term       = str(row[4]).strip() if row[4] else sheet_name_fallback
                    payment_date = parse_date(row[0])
                    name_parts = full_name.split()
                    last_name  = name_parts[0] if name_parts else full_name
                    first_name = ' '.join(name_parts[1:]) if len(name_parts) > 1 else 'Student'
                    fees = {
                        fee_name: parse_amount(row[col_idx] if len(row) > col_idx else None)
                        for col_idx, fee_name in LEGACY_FEE_COLUMNS
                    }
                    fees = {k: v for k, v in fees.items() if v > 0}
                    if fees:
                        parsed.append({
                            'ref': ref, 'full_name': full_name,
                            'first_name': first_name, 'last_name': last_name,
                            'class_name': class_name, 'term': term,
                            'payment_date': payment_date, 'fees': fees,
                        })

                if not parsed:
                    # Collect raw header-like cells to help the user diagnose
                    sample = []
                    for row in all_rows[:10]:
                        if row and row[0] is not None:
                            sample.append(str(row[0])[:40])
                    diagnostic = (
                        'No header row detected. Could not find a NAMES column plus '
                        'at least one other known column keyword. '
                        f'First cells seen: {sample}'
                    )

            return parsed, col_map, diagnostic

        students_data = []
        sheet_diagnostics = []
        for sheet in wb.worksheets:
            sheet_rows, sheet_col_map, sheet_diag = parse_worksheet(
                sheet, sheet_name_fallback=sheet.title
            )
            students_data.extend(sheet_rows)
            if sheet_diag:
                sheet_diagnostics.append(f'Sheet "{sheet.title}": {sheet_diag}')
            # Attach the col_map to each row so fee resolution below works per-sheet
            for entry in sheet_rows:
                if '_col_map' not in entry:
                    entry['_col_map'] = sheet_col_map

        if not students_data:
            diag_detail = (
                (' Details per sheet:\n  ' + '\n  '.join(sheet_diagnostics))
                if sheet_diagnostics else ''
            )
            return Response(
                {
                    'error': (
                        'No student data found in the Excel file. '
                        'Two formats are accepted (columns detected by header name):\n'
                        '  Full:   NAMES | CLASS | TERM | TUITION | SUPPLIES | '
                        'E-PORTAL | LUNCH | TRANSPORT | LESSON | SPECIAL EVENT | '
                        'CODING | PTA | PROJECT | TOTAL\n'
                        '  Simple: NAMES | CLASS | TERM | TUITION\n'
                        'Both formats can be mixed across sheets in the same workbook. '
                        'DATE and REF columns are optional.'
                        + diag_detail
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        # request.tenant is set by middleware which runs before DRF authentication,
        # so it can be None on multipart/form-data requests. user.tenant is always
        # authoritative once the request is authenticated.
        tenant = getattr(request, 'tenant', None) or getattr(user, 'tenant', None)
        branch = getattr(user, 'branch', None)

        if not tenant:
            return Response(
                {'error': 'Could not determine tenant from request. Please log in again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Fallback: if user has no branch assigned, use the first branch under
        # this tenant so that all created records have a non-NULL branch and
        # remain visible through the normal scoped queryset.
        if not branch and tenant:
            from branches.models import Branch as _Branch
            branch = (
                _Branch.objects.all_tenants()
                .filter(tenant=tenant, is_deleted=False)
                .order_by('id')
                .first()
            )

        if not branch:
            return Response(
                {
                    'error': (
                        'Could not determine a branch for this import. '
                        'Please ensure your user account has a branch assigned, '
                        'or that at least one branch exists for this organisation.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Fee → FIRS GL account mapping ─────────────────────────────────────
        # Tuple layout:
        #   (svc_code, svc_name, cat_code, cat_name, acct_code,
        #    creates_entitlement, entitlement_config)
        FEE_SERVICE_MAP = {
            'Tuition': (
                'SVC-TUITION', 'Tuition Fee',
                'CAT-SCH-TUITION', 'School Fees and Tuition Income', '4104',
                True, {
                    'payment_term_type': 'minimum_deposit',
                    'minimum_required_percent': 50,
                    'full_access_at_percent': 100,
                    'grace_period_days': 30,
                    'allowed_services': ['school_access'],
                },
            ),
            'Special Events': (
                'SVC-SPECEVT', 'Special Events Fee',
                'CAT-SCH-SPECEVT', 'Special Events and Functions Income', '4111',
                True, {
                    'payment_term_type': 'full_upfront',
                    'minimum_required_percent': 100,
                    'full_access_at_percent': 100,
                    'grace_period_days': 0,
                    'allowed_services': ['special_events'],
                },
            ),
            'Coding': (
                'SVC-CODING', 'Coding Classes Fee',
                'CAT-SCH-CODING', 'Coding and Technology Classes Income', '4112',
                True, {
                    'payment_term_type': 'minimum_deposit',
                    'minimum_required_percent': 50,
                    'full_access_at_percent': 100,
                    'grace_period_days': 14,
                    'allowed_services': ['coding_classes'],
                },
            ),
            'Maintenance': (
                'SVC-MAINT', 'Maintenance Fee',
                'CAT-SCH-MAINT', 'Development and Maintenance Levy', '4109',
                True, {
                    'payment_term_type': 'full_upfront',
                    'minimum_required_percent': 100,
                    'full_access_at_percent': 100,
                    'grace_period_days': 14,
                    'allowed_services': ['school_facilities'],
                },
            ),
            'Practical': (
                'SVC-PRACTICAL', 'Practical Classes Fee',
                'CAT-SCH-PRACTICAL', 'Practical and Laboratory Fees', '4115',
                True, {
                    'payment_term_type': 'full_upfront',
                    'minimum_required_percent': 100,
                    'full_access_at_percent': 100,
                    'grace_period_days': 7,
                    'allowed_services': ['practical_classes'],
                },
            ),
            'PTA': (
                'SVC-PTA', 'PTA Levy',
                'CAT-SCH-PTA', 'Parent-Teacher Association Levy', '4114',
                True, {
                    'payment_term_type': 'full_upfront',
                    'minimum_required_percent': 100,
                    'full_access_at_percent': 100,
                    'grace_period_days': 30,
                    'allowed_services': ['pta_membership'],
                },
            ),
            'Transport': (
                'SVC-TRANSPORT', 'Transportation Fee',
                'CAT-SCH-TRANSPORT', 'Transportation and School Bus Fees', '4113',
                True, {
                    'payment_term_type': 'full_upfront',
                    'minimum_required_percent': 100,
                    'full_access_at_percent': 100,
                    'grace_period_days': 7,
                    'allowed_services': ['school_bus'],
                },
            ),
            'BECE & NECO': (
                'SVC-EXAM', 'BECE & NECO Examination Fee',
                'CAT-SCH-EXAM', 'BECE and NECO Examination Fees', '4116',
                True, {
                    'payment_term_type': 'full_upfront',
                    'minimum_required_percent': 100,
                    'full_access_at_percent': 100,
                    'grace_period_days': 0,
                    'allowed_services': ['exam_registration'],
                },
            ),
            'Supplies': (
                'SVC-SUPPLIES', 'School Supplies Fee',
                'CAT-SCH-SUPPLIES', 'School Supplies Income', '4117',
                False, {
                    'payment_term_type': 'full_upfront',
                    'minimum_required_percent': 100,
                    'full_access_at_percent': 100,
                    'grace_period_days': 0,
                    'allowed_services': [],
                },
            ),
            'E-Portal': (
                'SVC-EPORTAL', 'E-Portal Fee',
                'CAT-SCH-EPORTAL', 'E-Portal and Digital Learning Income', '4118',
                True, {
                    'payment_term_type': 'full_upfront',
                    'minimum_required_percent': 100,
                    'full_access_at_percent': 100,
                    'grace_period_days': 7,
                    'allowed_services': ['eportal_access'],
                },
            ),
            'Lunch': (
                'SVC-LUNCH', 'Lunch Fee',
                'CAT-SCH-LUNCH', 'Lunch and Cafeteria Income', '4119',
                False, {
                    'payment_term_type': 'full_upfront',
                    'minimum_required_percent': 100,
                    'full_access_at_percent': 100,
                    'grace_period_days': 0,
                    'allowed_services': [],
                },
            ),
            'Lesson': (
                'SVC-LESSON', 'Extra Lesson Fee',
                'CAT-SCH-LESSON', 'Extra Lessons Income', '4120',
                True, {
                    'payment_term_type': 'full_upfront',
                    'minimum_required_percent': 100,
                    'full_access_at_percent': 100,
                    'grace_period_days': 7,
                    'allowed_services': ['extra_lessons'],
                },
            ),
            'Project': (
                'SVC-PROJECT', 'Project Fee',
                'CAT-SCH-PROJECT', 'Project and Assignment Fees', '4121',
                False, {
                    'payment_term_type': 'full_upfront',
                    'minimum_required_percent': 100,
                    'full_access_at_percent': 100,
                    'grace_period_days': 0,
                    'allowed_services': [],
                },
            ),
            'Textbook': (
                'SVC-TEXTBOOK', 'Textbook Fee',
                'CAT-SCH-TEXTBOOK', 'Textbook and Learning Materials Income', '4122',
                False, {
                    'payment_term_type': 'full_upfront',
                    'minimum_required_percent': 100,
                    'full_access_at_percent': 100,
                    'grace_period_days': 0,
                    'allowed_services': [],
                },
            ),
            'Uniforms': (
                'SVC-UNIFORMS', 'Uniforms Fee',
                'CAT-SCH-UNIFORMS', 'School Uniforms Income', '4123',
                False, {
                    'payment_term_type': 'full_upfront',
                    'minimum_required_percent': 100,
                    'full_access_at_percent': 100,
                    'grace_period_days': 0,
                    'allowed_services': [],
                },
            ),
            'Admission': (
                'SVC-ADMISSION', 'Admission Fee',
                'CAT-SCH-ADMISSION', 'Admission and Registration Fees', '4124',
                False, {
                    'payment_term_type': 'full_upfront',
                    'minimum_required_percent': 100,
                    'full_access_at_percent': 100,
                    'grace_period_days': 0,
                    'allowed_services': [],
                },
            ),
            'Graduation': (
                'SVC-GRADUATION', 'Graduation Fee',
                'CAT-SCH-GRADUATION', 'Graduation and Ceremony Fees', '4125',
                False, {
                    'payment_term_type': 'full_upfront',
                    'minimum_required_percent': 100,
                    'full_access_at_percent': 100,
                    'grace_period_days': 0,
                    'allowed_services': [],
                },
            ),
            'Graduation Photo Frame': (
                'SVC-GRAD-PHOTO', 'Graduation Photo Frame Fee',
                'CAT-SCH-GRAD-PHOTO', 'Graduation Photo and Frame Fees', '4126',
                False, {
                    'payment_term_type': 'full_upfront',
                    'minimum_required_percent': 100,
                    'full_access_at_percent': 100,
                    'grace_period_days': 0,
                    'allowed_services': [],
                },
            ),
        }

        # Maps any Excel column header variant (normalised to lowercase) to a
        # FEE_SERVICE_MAP key.  New header spellings can be added here without
        # touching any other code.
        HEADER_TO_FEE_MAP = {
            'tuition':          'Tuition',
            'special events':   'Special Events',
            'special event':    'Special Events',
            'coding':           'Coding',
            'maintenance':      'Maintenance',
            'maintenance fee':  'Maintenance',
            'maintenance fees': 'Maintenance',
            'development levy': 'Maintenance',
            'development':      'Maintenance',
            'practical':        'Practical',
            'pta':              'PTA',
            'transport':        'Transport',
            'transportation':   'Transport',
            'bece & neco':      'BECE & NECO',
            'bece':             'BECE & NECO',
            'supplies':         'Supplies',
            'supply':           'Supplies',
            'e-portal':         'E-Portal',
            'eportal':          'E-Portal',
            'e portal':         'E-Portal',
            'lunch':            'Lunch',
            'lesson':           'Lesson',
            'lessons':          'Lesson',
            'extra lesson':     'Lesson',
            'extra lessons':    'Lesson',
            'project':          'Project',
            'roject':           'Project',   # common typo seen in uploaded sheets
            'textbook':         'Textbook',
            'textbooks':        'Textbook',
            'uniforms':         'Uniforms',
            'uniform':          'Uniforms',
            'admission fee':          'Admission',
            'admission fees':         'Admission',
            'admission':              'Admission',
            # Tuition typo
            'tution':                 'Tuition',
            # Prize giving / Special events aliases
            'prize giving day':       'Special Events',
            'prize giving':           'Special Events',
            # Graduation fees
            'graduation':             'Graduation',
            'graduation photo frame': 'Graduation Photo Frame',
            'graduation photo':       'Graduation Photo Frame',
        }

        # Now that HEADER_TO_FEE_MAP exists, resolve fees for header-aware rows.
        # Each entry carries a temporary _row + _col_map from its own worksheet.
        resolved = []
        zero_fee_names = []
        for entry in students_data:
            raw_row = entry.pop('_row', None)
            entry_col_map = entry.pop('_col_map', {})
            if raw_row is None:
                # Legacy-mode rows already have 'fees' resolved — keep as-is
                if entry.get('fees'):
                    resolved.append(entry)
                else:
                    zero_fee_names.append(entry.get('full_name', '?'))
                continue
            fees = {}
            for hdr, col_idx in entry_col_map.items():
                fee_name = HEADER_TO_FEE_MAP.get(hdr)
                if fee_name and len(raw_row) > col_idx:
                    v = parse_amount(raw_row[col_idx])
                    if v > 0:
                        fees[fee_name] = v
            if fees:
                entry['fees'] = fees
                resolved.append(entry)
            else:
                zero_fee_names.append(entry.get('full_name', '?'))
        students_data = resolved

        if not students_data:
            sample = zero_fee_names[:5]
            more = len(zero_fee_names) - 5
            names_str = ', '.join(sample) + (f' … and {more} more' if more > 0 else '')
            return Response(
                {
                    'error': (
                        f'{len(zero_fee_names)} student row(s) were detected '
                        f'({names_str}) but every fee amount resolved to ₦0. '
                        'Please check that the fee columns contain numeric values '
                        '(not dashes or empty cells) and that the column headers '
                        'match one of the accepted names: TUITION, SUPPLIES, '
                        'E-PORTAL, LUNCH, TRANSPORT, LESSON, SPECIAL EVENT, '
                        'CODING, PTA, PROJECT.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Phase 1: ensure required GL accounts exist (auto-create if missing) ──
        # All school-fee income accounts sit under parent 4100 (School Fees Income).
        # child_code = 4100 + suffix  e.g.  4104 → suffix 4, 4117 → suffix 17
        from accounts.utils.account_creation import get_or_create_child_account as _get_acct

        INCOME_PARENT_CODE = '4100'
        INCOME_PARENT_NAME = 'School Fees Income'

        logger.info(
            'school_fees_import: tenant=%s (id=%s), ensuring GL accounts exist',
            tenant, getattr(tenant, 'id', '?')
        )

        for _fee_key, (_, _, _, _cat_name, _acct_code, _, _) in FEE_SERVICE_MAP.items():
            try:
                _suffix = str(int(_acct_code) - int(INCOME_PARENT_CODE))
                _get_acct(
                    parent_code=INCOME_PARENT_CODE,
                    child_suffix=_suffix,
                    name=_cat_name,
                    account_type='INCOME',
                    owner=user,
                    branch=branch,
                    parent_name=INCOME_PARENT_NAME,
                )
                logger.debug('school_fees_import: GL account %s OK', _acct_code)
            except Exception as exc:
                return Response(
                    {'error': f'Failed to create GL account {_acct_code} ({_cat_name}): {exc}'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        # ── Phase 2: build service catalog (idempotent) ───────────────────────
        # Use explicit tenant-scoped filter instead of relying on the manager's
        # thread-local auto-filter so this is safe regardless of how the request
        # middleware sets up the tenant context.
        service_items = {}  # fee_name → ServiceItem

        try:
            with db_transaction.atomic():
                category_cache = {}  # cat_code → IncomeCategory

                for fee_name, (
                    svc_code, svc_name, cat_code, cat_name, acct_code,
                    creates_ent, ent_config,
                ) in FEE_SERVICE_MAP.items():

                    # 1. Resolve GL account — guaranteed to exist after Phase 1
                    _suffix = str(int(acct_code) - int(INCOME_PARENT_CODE))
                    account = _get_acct(
                        parent_code=INCOME_PARENT_CODE,
                        child_suffix=_suffix,
                        name=cat_name,
                        account_type='INCOME',
                        owner=user,
                        branch=branch,
                        parent_name=INCOME_PARENT_NAME,
                    )

                    # 2. Get-or-create IncomeCategory — filter by tenant explicitly
                    if cat_code not in category_cache:
                        income_cat = (
                            IncomeCategory.objects
                            .filter(tenant=tenant, branch=branch, code=cat_code)
                            .first()
                        )
                        if income_cat is None:
                            income_cat = IncomeCategory.objects.create(
                                name=cat_name,
                                code=cat_code,
                                income_account=account,
                                tenant=tenant,
                                owner=user,
                                branch=branch,
                                created_by=user,
                                description='Auto-created for school fee imports',
                            )
                        category_cache[cat_code] = income_cat
                    income_cat = category_cache[cat_code]

                    # 3. Get-or-create ServiceItem — filter by tenant explicitly
                    svc_item = (
                        ServiceItem.objects
                        .filter(tenant=tenant, branch=branch, code=svc_code)
                        .first()
                    )
                    if svc_item is None:
                        svc_item = ServiceItem.objects.create(
                            name=svc_name,
                            code=svc_code,
                            category=income_cat,
                            default_price=Decimal('0.00'),
                            service_type='standard',
                            creates_entitlement=creates_ent,
                            entitlement_config=ent_config,
                            tenant=tenant,
                            owner=user,
                            branch=branch,
                            created_by=user,
                            description=f'School fee service: {svc_name}',
                        )
                    service_items[fee_name] = svc_item

        except Exception as exc:
            return Response(
                {'error': f'Failed to set up service catalog: {exc}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # ── Phase 3: process each student ─────────────────────────────────────
        results = {
            'students_created': 0,
            'students_existing': 0,
            'invoices_created': 0,
            'invoices_skipped': 0,
            'classes_created': 0,
            'entitlements_created': 0,
            'errors': [],
            'details': [],
        }

        class_cache = {}  # raw_class_name → ClientClassification

        # ── Sequential student ID generation ──────────────────────────────────
        # JSS 1-3 and SS 1-3  → prefix MMC  (e.g. MMC0001)
        # All other classes   → prefix MMIA (e.g. MMIA0001)
        import re as _re_id
        _JSS_SS_RE = _re_id.compile(r'^(jss|ss)\s*[1-9]', _re_id.IGNORECASE)

        def _id_prefix_for_class(class_name):
            if _JSS_SS_RE.match((class_name or '').strip()):
                return 'MMC'
            return 'MMIA'

        def _seed_counter(prefix):
            pat = r'^' + _re_id.escape(prefix) + r'(\d+)$'
            high = 0
            for cid in (
                Client.objects.all_tenants()
                .filter(tenant=tenant, client_id__iregex=pat)
                .values_list('client_id', flat=True)
            ):
                m = _re_id.match(pat, cid, _re_id.IGNORECASE)
                if m:
                    high = max(high, int(m.group(1)))
            return high + 1

        _id_counter = {'MMC': _seed_counter('MMC'), 'MMIA': _seed_counter('MMIA')}

        def _next_student_id(class_name):
            prefix = _id_prefix_for_class(class_name)
            num = _id_counter[prefix]
            _id_counter[prefix] += 1
            return f'{prefix}{num:04d}'

        for student in students_data:
            try:
                with db_transaction.atomic():
                    payment_date = student['payment_date']

                    # ── 4a. Class (ClientClassification) ──────────────────────
                    raw_class = student['class_name']
                    class_obj = None
                    if raw_class:
                        if raw_class not in class_cache:
                            class_code = raw_class.upper().replace(' ', '-')[:20]
                            # Use all_tenants() to bypass thread-local tenant filter
                            # (same issue as student dedup — see 4b below).
                            class_obj = (
                                ClientClassification.objects.all_tenants()
                                .filter(tenant=tenant, branch=branch, code=class_code)
                                .first()
                            )
                            if class_obj is None:
                                class_obj = ClientClassification.objects.create(
                                    name=raw_class,
                                    code=class_code,
                                    tenant=tenant,
                                    owner=user,
                                    branch=branch,
                                    created_by=user,
                                    description='Auto-created from school fees import',
                                )
                                results['classes_created'] += 1
                            class_cache[raw_class] = class_obj
                        else:
                            class_obj = class_cache[raw_class]

                    # ── 4b. Student (Client) ───────────────────────────────────
                    # Deduplicate by name — ignore Excel Ref entirely.
                    # System-generated sequential IDs (MMC / MMIA) are assigned
                    # to new students; existing ones are matched by first+last name.
                    client = (
                        Client.objects.all_tenants()
                        .filter(
                            tenant=tenant,
                            first_name__iexact=student['first_name'],
                            last_name__iexact=student['last_name'],
                        )
                        .order_by('-created_at')
                        .first()
                    )
                    if client is not None:
                        if class_obj and client.classification_id != class_obj.pk:
                            client.classification = class_obj
                            client.save(update_fields=['classification'])
                        created = False
                    else:
                        new_id = _next_student_id(student['class_name'])
                        # Guard against collisions from prior partial imports
                        while Client.objects.all_tenants().filter(
                            tenant=tenant, client_id=new_id
                        ).exists():
                            new_id = _next_student_id(student['class_name'])
                        client = Client.objects.create(
                            client_id=new_id,
                            first_name=student['first_name'],
                            last_name=student['last_name'],
                            class_name=student['class_name'],
                            classification=class_obj,
                            usage_context='student',
                            gender='other',
                            phone_primary='0000000000',
                            status='active',
                            student_status='enrolled',
                            owner=user,
                            branch=branch,
                            tenant=tenant,
                            created_by=user,
                        )
                        created = True

                    results['students_created' if created else 'students_existing'] += 1

                    # ── 4c. Invoice ────────────────────────────────────────────
                    invoice_number = None
                    total_fees = Decimal('0')
                    invoice_created = False
                    student_entitlements = 0

                    if not student['fees']:
                        results['invoices_skipped'] += 1
                    else:
                        total_fees = sum(student['fees'].values())

                        # Unique invoice number: FEE-{ref}-{YYYYMMDD}[-N]
                        base_ref = (
                            f"FEE-{client.client_id}-"
                            f"{payment_date.strftime('%Y%m%d')}"
                        )
                        invoice_number = base_ref
                        counter = 0
                        while Invoice.objects.filter(invoice_number=invoice_number).exists():
                            counter += 1
                            invoice_number = f"{base_ref}-{counter}"

                        # The Excel date is both the invoice date and the payment
                        # date — we record everything on that date so the books
                        # reflect the actual transaction history.
                        invoice = Invoice.objects.create(
                            client=client,
                            invoice_number=invoice_number,
                            invoice_date=payment_date,
                            due_date=payment_date,
                            description=(
                                f"School Fees – {student['class_name']} – {student['term']}"
                            ),
                            status='draft',
                            owner=user,
                            branch=branch,
                            tenant=tenant,
                            subtotal=total_fees,
                            total_amount=total_fees,
                            amount=total_fees,
                            created_by=user,
                        )

                        # ── 4d. Invoice line items (always SERVICE) ────────────
                        for fee_name, amount in student['fees'].items():
                            svc_item = service_items.get(fee_name)
                            if svc_item:
                                InvoiceItem.objects.create(
                                    invoice=invoice,
                                    item_type='service',
                                    service_item=svc_item,
                                    description=svc_item.name,
                                    quantity=Decimal('1'),
                                    unit_price=amount,
                                    line_total=amount,
                                )
                            else:
                                # Fallback (should never happen after Phase 2)
                                InvoiceItem.objects.create(
                                    invoice=invoice,
                                    item_type='custom',
                                    description=fee_name,
                                    quantity=Decimal('1'),
                                    unit_price=amount,
                                    line_total=amount,
                                )

                        # Recalculate totals from line items
                        invoice.update_totals()

                        # ── 4e. POST invoice ───────────────────────────────────
                        # Dr Accounts Receivable / Cr Revenue-by-GL-account
                        # Journal entry is dated on payment_date (the Excel date).
                        # invoice.post() uses self.invoice_date for the JE date,
                        # which we set to payment_date above.
                        invoice.post(user)

                        # ── 4g. FEE ENTITLEMENTS ───────────────────────────────
                        # Create one FeeEntitlement per service that carries
                        # creates_entitlement=True.  Status starts as 'pending'
                        # because payment has not been recorded yet — staff must
                        # record payment through the normal invoice payment flow,
                        # which will activate the entitlement automatically.
                        for fee_name, amount in student['fees'].items():
                            svc_item = service_items.get(fee_name)
                            if not svc_item or not svc_item.creates_entitlement:
                                continue
                            ent_cfg = FEE_SERVICE_MAP[fee_name][6]
                            min_pct = Decimal(
                                str(ent_cfg.get('minimum_required_percent', 100))
                            )
                            minimum_required = (amount * min_pct / Decimal('100')).quantize(
                                Decimal('0.01')
                            )
                            ent = FeeEntitlement.objects.create(
                                client=client,
                                invoice=invoice,
                                service_item=svc_item,
                                fee_structure=None,
                                academic_period={'term': student['term']},
                                payment_term_type=ent_cfg.get(
                                    'payment_term_type', 'full_upfront'
                                ),
                                total_amount=amount,
                                amount_paid=Decimal('0'),   # no payment yet
                                minimum_required=minimum_required,
                                current_access_level='none',
                                access_rules=ent_cfg,
                                status='pending',           # awaiting payment
                                valid_from=payment_date,
                                owner=user,
                                branch=branch,
                                tenant=tenant,
                                created_by=user,
                            )
                            # Link the invoice line item to this entitlement so
                            # the normal record_payment flow can update it later.
                            invoice.items.filter(
                                service_item=svc_item, creates_entitlement=True, entitlement__isnull=True
                            ).update(entitlement=ent)
                            student_entitlements += 1

                        results['invoices_created'] += 1
                        results['entitlements_created'] += student_entitlements
                        invoice_created = True

                    results['details'].append({
                        'ref': client.client_id,
                        'name': student['full_name'],
                        'class': student['class_name'],
                        'term': student['term'],
                        'payment_date': payment_date.isoformat(),
                        'student_created': created,
                        'invoice_created': invoice_created,
                        'invoice_number': invoice_number,
                        'invoice_status': 'sent' if invoice_created else None,
                        'total': str(total_fees),
                        'entitlements': student_entitlements,
                        'fees': {k: str(v) for k, v in student['fees'].items()},
                    })

            except Exception as exc:
                logger.exception(
                    'school_fees_import: error processing student %s',
                    student.get('ref', '?'),
                )
                results['errors'].append({
                    'ref': student.get('ref', '?'),
                    'name': student.get('full_name', '?'),
                    'error': str(exc),
                })

        return Response(results, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def export_template(self, request):
        """Download CSV template for bulk import"""
        from django.http import HttpResponse
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="client_import_template.csv"'
        
        writer = csv.writer(response)
        writer.writerow([
            'client_id', 'first_name', 'middle_name', 'last_name', 'gender',
            'date_of_birth', 'phone_primary', 'phone_secondary', 'email',
            'address_street', 'address_city', 'address_state', 'usage_context',
            'status'
        ])
        writer.writerow([
            '', 'John', 'Middle', 'Doe', 'male',
            '1990-01-15', '08012345678', '08098765432', 'john@example.com',
            '123 Main St', 'Lagos', 'Lagos', 'student',
            'active'
        ])
        
        return response

    # ------------------------------------------------------------------
    # Feature #6 — NIN duplicate check
    # ------------------------------------------------------------------
    @action(detail=False, methods=['get'], url_path='nin-check',
            permission_classes=[permissions.IsAuthenticated])
    def nin_check(self, request):
        """
        GET /clients/nin-check/?nin=<11-digit-number>
        Returns whether a NIN is already registered and on which branch.
        No sensitive data returned — safe for all authenticated users.
        """
        nin = request.query_params.get('nin', '').strip()
        if not nin:
            return Response({'detail': 'nin query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            client = Client.objects.select_related('branch').get(nin=nin)
            return Response({
                'exists': True,
                'branch': client.branch.name if client.branch else None,
                'client_name': client.full_name,
            })
        except Client.DoesNotExist:
            return Response({'exists': False})

    # ------------------------------------------------------------------
    # Feature #4 — Customer audit trail
    # ------------------------------------------------------------------
    @action(detail=True, methods=['get'], url_path='audit-log',
            permission_classes=[permissions.IsAuthenticated])
    def audit_log(self, request, pk=None):
        """
        GET /clients/{id}/audit-log/
        Paginated audit trail for a client. Restricted to branch managers and above.
        """
        if not (request.user.is_staff or request.user.has_perm('clients.view_customerauditlog')):
            return Response({'detail': 'You do not have permission to view audit logs.'},
                            status=status.HTTP_403_FORBIDDEN)

        client = self.get_object()
        logs = CustomerAuditLog.objects.filter(client=client).order_by('-timestamp')
        page = self.paginate_queryset(logs)
        if page is not None:
            serializer = CustomerAuditLogSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = CustomerAuditLogSerializer(logs, many=True)
        return Response(serializer.data)

    # ------------------------------------------------------------------
    # Feature #6 — Cross-branch loan history via NIN
    # ------------------------------------------------------------------
    @action(detail=True, methods=['get'], url_path='cross-branch-history',
            permission_classes=[permissions.IsAuthenticated])
    def cross_branch_history(self, request, pk=None):
        """
        GET /clients/{id}/cross-branch-history/
        Returns loan history across ALL branches for the client (matched by NIN).
        Restricted to branch managers and above.
        """
        if not (request.user.is_staff or request.user.has_perm('clients.view_all_branches')):
            return Response({'detail': 'You do not have permission to view cross-branch history.'},
                            status=status.HTTP_403_FORBIDDEN)

        client = self.get_object()
        if not client.nin:
            return Response({'detail': 'Client has no NIN recorded; cannot perform cross-branch lookup.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # All clients sharing this NIN (other branches)
        same_nin_clients = Client.objects.filter(nin=client.nin)

        try:
            from loans.models import LoanAccount
            from loans.serializers import LoanAccountListSerializer
            loans = LoanAccount.objects.filter(client__in=same_nin_clients).select_related('branch', 'client')
            serializer = LoanAccountListSerializer(loans, many=True)
            return Response({
                'nin': client.nin,
                'branches_found': same_nin_clients.values_list('branch__name', flat=True).distinct(),
                'loans': serializer.data,
            })
        except Exception as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ClientClassificationViewSet(ScopedModelViewSet):
    permission_module = 'clients'
    permission_page = 'client-classifications'
    queryset = ClientClassification.objects.all()
    serializer_class = ClientClassificationSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]


class ClientDocumentViewSet(ScopedModelViewSet):
    permission_module = 'clients'
    permission_page = 'client-documents'
    queryset = ClientDocument.objects.all()
    serializer_class = ClientDocumentSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]
    officer_client_lookup = 'client__assigned_officer'

    def get_queryset(self):
        queryset = super().get_queryset()
        client_id = self.request.query_params.get('client')
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        return queryset
    
    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        """Verify a document"""
        document = self.get_object()
        verify_status = request.data.get('status', 'verified')
        notes = request.data.get('notes', '')
        
        document.verify(request.user, verify_status, notes)
        
        return Response({
            'success': True,
            'verification_status': document.verification_status,
            'verified_at': document.verified_at,
        })


class ClientRelationshipViewSet(ScopedModelViewSet):
    permission_module = 'clients'
    permission_page = 'client-relationships'
    queryset = ClientRelationship.objects.all()
    serializer_class = ClientRelationshipSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]
    # Relationships link two clients — officer scope applied via from_client;
    # the base _apply_officer_scope handles this side; the to_client side is
    # also implicitly included because the record is visible if either client
    # is accessible (at branch level the full record is already narrowed).
    officer_client_lookup = 'from_client__assigned_officer'

    def get_queryset(self):
        queryset = super().get_queryset()
        client_id = self.request.query_params.get('client')
        if client_id:
            queryset = queryset.filter(
                Q(from_client_id=client_id) | Q(to_client_id=client_id)
            )
        return queryset


class ClientNoteViewSet(ScopedModelViewSet):
    permission_module = 'clients'
    permission_page = 'client-notes'
    queryset = ClientNote.objects.all()
    serializer_class = ClientNoteSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]
    officer_client_lookup = 'client__assigned_officer'

    def get_queryset(self):
        queryset = super().get_queryset()
        client_id = self.request.query_params.get('client')
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        return queryset


class ClientGroupViewSet(ScopedModelViewSet):
    """
    CRUD for Ajo / loan groups.

    Query params:
      - is_active: true/false
      - search: matches name or code

    Credit officers see only groups assigned to them (assigned_officer = current staff).
    Groups with no assigned_officer are visible to everyone in the branch.
    """
    permission_module = 'clients'
    permission_page = 'client-groups'
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]
    queryset = ClientGroup.objects.all()
    officer_client_lookup = 'assigned_officer'

    def get_serializer_class(self):
        if self.action == 'list':
            return ClientGroupListSerializer
        return ClientGroupSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        is_active = self.request.query_params.get('is_active')
        search = self.request.query_params.get('search', '').strip()
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(code__icontains=search)
            )
        return queryset

    @action(detail=True, methods=['get'])
    def members(self, request, pk=None):
        """List clients that belong to this group."""
        group = self.get_object()
        clients = group.members.filter(is_deleted=False).order_by('last_name', 'first_name')
        serializer = ClientListSerializer(clients, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='assign-officer')
    def assign_officer(self, request, pk=None):
        """
        Assign a credit officer to this group and cascade to all member clients.

        Body: { "officer_id": <Staff PK> }  or  { "officer_id": null }  to unassign.
        """
        from hr.models import Staff
        from django.db import transaction as db_tx

        group = self.get_object()
        officer_id = request.data.get('officer_id')

        if officer_id is None:
            # Unassign — clear the group and all members
            with db_tx.atomic():
                group.assigned_officer = None
                group.save(update_fields=['assigned_officer'])
                updated = Client.objects.filter(group=group, is_deleted=False).update(assigned_officer=None)
            return Response({
                'detail': f'Officer unassigned from group and {updated} member client(s).',
                'updated_clients': updated,
            })

        try:
            officer = Staff.objects.get(pk=officer_id, tenant=request.user.tenant)
        except Staff.DoesNotExist:
            raise DRFValidationError({'officer_id': 'Staff member not found in this tenant.'})

        with db_tx.atomic():
            group.assigned_officer = officer
            group.save(update_fields=['assigned_officer'])
            updated = Client.objects.filter(group=group, is_deleted=False).update(assigned_officer=officer)

        return Response({
            'detail': f'Officer "{officer}" assigned to group and {updated} member client(s) updated.',
            'updated_clients': updated,
            'officer_id': officer.pk,
            'officer_name': getattr(officer, 'full_name', str(officer)),
        })


class ClientRegistrationConfigViewSet(ScopedModelViewSet):
    """
    Branch-scoped registration + ID fee configuration by client type.
    """
    permission_module = 'clients'
    permission_page = 'clients'
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]
    queryset = ClientRegistrationConfig.objects.all()
    serializer_class = ClientRegistrationConfigSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        return qs


class ProspectPublicRegistrationView(APIView):
    """
    Public endpoint that creates prospects only.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        branch_code = (request.data.get('branch_code') or '').strip()
        if not branch_code:
            return Response(
                {'branch_code': 'branch_code is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from branches.models import Branch

        branch = Branch.objects.filter(code__iexact=branch_code, is_active=True).first()
        if not branch:
            return Response(
                {'branch_code': 'Invalid or inactive branch code.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not branch.owner_id:
            return Response(
                {'detail': 'Branch owner is not configured. Contact support.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ProspectPublicRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        client = serializer.save(
            owner=branch.owner,
            branch=branch,
            tenant=branch.tenant,
        )

        return Response(
            {
                'detail': 'Prospect registration submitted successfully.',
                'client_id': client.client_id,
                'client_type': client.client_type,
            },
            status=status.HTTP_201_CREATED,
        )
