# assets/views.py
from decimal import Decimal
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.db import transaction
from django.db.models import Q

from common.views import ScopedModelViewSet

from .models import AssetCategory, FixedAsset, AssetDepreciation, AssetMaintenance, AssetAcquisition, AssetAcquisitionLine, AssetRequisition, AssetRequisitionLine, AssetTransfer, AssetAssignment
from .serializers import (
    AssetCategorySerializer, 
    FixedAssetSerializer, 
    AssetDepreciationSerializer,
    AssetMaintenanceSerializer,
    AssetAcquisitionSerializer,
    AssetRequisitionSerializer,
    AssetTransferSerializer,
    AssetAssignmentSerializer,
)


class AssetCategoryViewSet(ScopedModelViewSet):
    """ViewSet for asset categories"""
    permission_module = 'assets'
    permission_page = 'asset-categories'
    serializer_class = AssetCategorySerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['code', 'is_deleted']
    search_fields = ['name', 'code', 'description']
    ordering_fields = ['name', 'code', 'created_at']
    ordering = ['name']
    
    def get_queryset(self):
        return AssetCategory.objects.filter(
            owner=self.request.user,
            branch=self.request.user.branch
        )


class FixedAssetViewSet(ScopedModelViewSet):
    """ViewSet for fixed assets"""
    permission_module = 'assets'
    permission_page = 'fixed-assets'
    serializer_class = FixedAssetSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'status', 'is_deleted', 'supplier']
    search_fields = ['asset_number', 'name', 'serial_number', 'registration_number', 'make', 'model']
    ordering_fields = ['asset_number', 'name', 'purchase_date', 'purchase_price', 'created_at']
    ordering = ['asset_number']

    def get_queryset(self):
        return FixedAsset.objects.filter(
            owner=self.request.user,
            branch=self.request.user.branch
        ).select_related('supplier', 'purchase_order', 'accounts_payable', 'category')

    def perform_create(self, serializer):
        """
        Register a new asset in the system (asset register step).

        This creates a FixedAsset SHELL with:
          - purchase_price = 0
          - status = 'draft'
          - No GL entry, no PO, no AP

        The asset's financial value is added ONLY when an AssetRequisition or
        AssetAcquisition is approved and posted, which activates the asset.
        """
        user, branch, tenant = self._resolve_create_scope()
        serializer.save(owner=user, branch=branch, tenant=tenant, status='draft')

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def dispose(self, request, pk=None):
        """
        Dispose of an asset and post the corresponding GL journal entry.

        POST /api/assets/assets/{id}/dispose/
        Body: {
            "disposal_date": "2024-06-30",   // optional, defaults to today
            "disposal_amount": 5000.00,       // cash proceeds; 0 = write-off / scrap
            "disposal_notes": "Sold at auction"
        }

        Journal entry logic (via Asset Disposal clearing account):
          Dr  Asset Disposal A/c         (cost)
          Cr  Fixed Asset Account        (cost)       — derecognise at cost
          Dr  Accumulated Depreciation   (acc_dep)    — clear contra-asset
          Cr  Asset Disposal A/c         (acc_dep)
          Dr  Cash / Bank                (proceeds)   — if sold with proceeds
          Cr  Asset Disposal A/c         (proceeds)
          -OR- (for theft/loss with insurance claim pending):
          Dr  Insurance Claims Receivable (insurance_amount)
          Cr  Asset Disposal A/c          (insurance_amount)
          Dr  Asset Disposal A/c         (gain)       — if proceeds/insurance > book value
          Cr  Gain on Disposal           (gain)
          Dr  Loss on Disposal           (loss)       — if book value > proceeds/insurance
          Cr  Asset Disposal A/c         (loss)
        The Asset Disposal A/c nets to zero after all entries.
        """
        asset = self.get_object()

        if asset.status == 'disposed':
            return Response(
                {'error': 'Asset is already disposed'},
                status=status.HTTP_400_BAD_REQUEST
            )

        disposal_date    = request.data.get('disposal_date', timezone.now().date())
        disposal_amount  = Decimal(str(request.data.get('disposal_amount', 0) or 0))
        disposal_notes   = request.data.get('disposal_notes', '')
        bank_account_id  = request.data.get('bank_account_id')   # explicit proceeds account
        insurance_claim  = request.data.get('insurance_claim', False)  # True = Dr Insurance Receivable instead of Bank

        # ── Accounting figures ─────────────────────────────────────────
        purchase_price = asset.purchase_price
        accum_depr     = asset.accumulated_depreciation
        book_value     = purchase_price - accum_depr
        proceeds       = disposal_amount                      # cash received (0 = scrap/write-off)
        net_result     = proceeds - book_value                # +ve = gain; -ve = loss

        # ── Build journal entry ────────────────────────────────────────
        # Gap D: validate required GL accounts are configured before touching the GL
        if not asset.category.asset_account_id:
            return Response(
                {'error': 'Asset account not configured for this asset category'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not asset.category.accumulated_depreciation_account_id:
            return Response(
                {'error': 'Accumulated depreciation account not configured for this asset category'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )
        from accounts.utils.account_creation import get_system_account

        series, _ = TransactionSeries.objects.get_or_create(
            code='DISP',
            defaults={
                'name': 'Asset Disposal',
                'description': 'Asset Disposal Entries',
            },
        )

        journal_entry = JournalEntry.objects.create(
            series=series,
            date=disposal_date,
            description=f'Disposal — {asset.name} ({asset.asset_number})',
            owner=asset.owner,
            branch=asset.branch,
            created_by=request.user,
        )

        # ── Obtain the Asset Disposal clearing account ──────────────────
        disposal_clearing_account = get_system_account('asset_disposal', asset.owner, asset.branch)

        # ── Entry 1: Transfer cost to Asset Disposal clearing account ────
        #   Dr  Asset Disposal A/c  (cost)
        #   Cr  Fixed Asset Account (cost)  — derecognise at original cost
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=disposal_clearing_account,
            side=JournalEntryLine.DEBIT,
            amount=purchase_price,
        )
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=asset.category.asset_account,
            side=JournalEntryLine.CREDIT,
            amount=purchase_price,
        )

        # ── Entry 2: Clear accumulated depreciation via disposal account ─
        #   Dr  Accumulated Depreciation A/c  (acc_dep)
        #   Cr  Asset Disposal A/c            (acc_dep)
        if accum_depr > 0:
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=asset.category.accumulated_depreciation_account,
                side=JournalEntryLine.DEBIT,
                amount=accum_depr,
            )
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=disposal_clearing_account,
                side=JournalEntryLine.CREDIT,
                amount=accum_depr,
            )

        # ── Entry 3: Record proceeds received ───────────────────────────
        #   Normal sale:  Dr  Cash / Bank A/c           (proceeds)
        #   Theft/claim:  Dr  Insurance Claims Receivable (proceeds)
        #                 Cr  Asset Disposal A/c          (proceeds)
        if proceeds > 0:
            if insurance_claim:
                # Theft/total loss with pending insurance payout — Dr Insurance Receivable
                proceeds_account = get_system_account('insurance_receivable', asset.owner, asset.branch)
            elif bank_account_id:
                from accounts.models import Account as AccountModel
                try:
                    proceeds_account = AccountModel.objects.get(
                        id=bank_account_id,
                        owner=asset.owner,
                        branch=asset.branch,
                    )
                except AccountModel.DoesNotExist:
                    return Response(
                        {'error': 'Selected bank account not found or not accessible.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                proceeds_account = get_system_account('bank', asset.owner, asset.branch)
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=proceeds_account,
                side=JournalEntryLine.DEBIT,
                amount=proceeds,
            )
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=disposal_clearing_account,
                side=JournalEntryLine.CREDIT,
                amount=proceeds,
            )

        # ── Entry 4: Close the Asset Disposal account to P&L ────────────
        # After entries 1-3, the Asset Disposal A/c balance equals:
        #   purchase_price − accum_depr − proceeds  = book_value − proceeds
        # Positive balance (book_value > proceeds) → LOSS
        # Negative balance (proceeds > book_value)  → GAIN

        if net_result > 0:
            # Gain: Dr Asset Disposal A/c, Cr Gain on Disposal
            gain_account = get_system_account('gain_on_disposal', asset.owner, asset.branch)
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=disposal_clearing_account,
                side=JournalEntryLine.DEBIT,
                amount=net_result,
            )
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=gain_account,
                side=JournalEntryLine.CREDIT,
                amount=net_result,
            )
        elif net_result < 0:
            # Loss: Dr Loss on Disposal, Cr Asset Disposal A/c
            loss_account = get_system_account('loss_on_disposal', asset.owner, asset.branch)
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=loss_account,
                side=JournalEntryLine.DEBIT,
                amount=abs(net_result),
            )
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=disposal_clearing_account,
                side=JournalEntryLine.CREDIT,
                amount=abs(net_result),
            )

        journal_entry.post()

        # ── Update asset record ────────────────────────────────────────
        asset.status         = 'disposed'
        asset.disposal_date  = disposal_date
        asset.disposal_amount = disposal_amount
        asset.disposal_notes = disposal_notes
        asset.disposal_journal_entry = journal_entry   # Gap 7: traceability FK
        asset.save()

        serializer = self.get_serializer(asset)
        return Response({
            **serializer.data,
            'journal_entry_id': journal_entry.id,
            'disposal_summary': {
                'purchase_price':            float(purchase_price),
                'accumulated_depreciation':  float(accum_depr),
                'book_value':                float(book_value),
                'proceeds':                  float(proceeds),
                'net_result':                float(net_result),
                'net_result_type': (
                    'gain' if net_result > 0 else ('loss' if net_result < 0 else 'break_even')
                ),
            },
        })
    
    @action(detail=True, methods=['get'])
    def depreciation_schedule(self, request, pk=None):
        """Get posted depreciation entries for an asset (from the database)."""
        asset = self.get_object()
        entries = asset.depreciation_entries.all()
        serializer = AssetDepreciationSerializer(entries, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def depreciation_schedule_preview(self, request, pk=None):
        """
        Return the full calculated depreciation schedule for an asset without
        creating any database records.  Useful for reviewing before generating.

        GET /api/assets/assets/{id}/depreciation_schedule_preview/
        """
        asset = self.get_object()
        from assets.services.depreciation import DepreciationService
        from django.core.exceptions import ValidationError as DjValidationError
        try:
            schedule = DepreciationService.calculate_schedule(asset)
        except NotImplementedError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except DjValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'asset_number': asset.asset_number,
            'name': asset.name,
            'depreciation_method': asset.depreciation_method,
            'useful_life_years': asset.useful_life_years,
            'purchase_price': float(asset.purchase_price),
            'salvage_value': float(asset.salvage_value),
            'depreciable_amount': float(asset.purchase_price - asset.salvage_value),
            'period_count': len(schedule),
            'schedule': [
                {
                    'period_number':       p['period_number'],
                    'period_start':        p['period_start'],
                    'period_end':          p['period_end'],
                    'depreciation_amount': float(p['depreciation_amount']),
                    'accumulated':         float(p['accumulated']),
                    'book_value':          float(p['book_value']),
                }
                for p in schedule
            ],
        })

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def generate_depreciation(self, request, pk=None):
        """
        Generate (and optionally post) the depreciation entry for the
        requested period.

        POST /api/assets/assets/{id}/generate_depreciation/
        Body (all optional):
        {
            "period_date": "2026-03-01",   // default: today
            "post": true                   // default: false  — create only, do not post
        }

        Returns the new (or existing) AssetDepreciation record.
        """
        asset = self.get_object()
        from assets.services.depreciation import DepreciationService
        from django.core.exceptions import ValidationError as DjValidationError

        period_date_str = request.data.get('period_date')
        auto_post       = request.data.get('post', False)

        if period_date_str:
            from django.utils.dateparse import parse_date
            period_date = parse_date(period_date_str)
            if not period_date:
                return Response(
                    {'error': f"Invalid period_date: '{period_date_str}'. Use YYYY-MM-DD."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            period_date = timezone.now().date()

        try:
            if auto_post:
                entry = DepreciationService.generate_and_post_current_period(
                    asset=asset,
                    period_date=period_date,
                    posted_by=request.user,
                )
            else:
                entry = DepreciationService.generate_current_period(
                    asset=asset,
                    period_date=period_date,
                    posted_by=request.user,
                )
        except NotImplementedError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except DjValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if entry is None:
            return Response({
                'message': 'No depreciation to generate for this period (already exists, fully depreciated, or not yet started).',
                'skipped': True,
            }, status=status.HTTP_200_OK)

        serializer = AssetDepreciationSerializer(entry)
        return Response({
            **serializer.data,
            'skipped': False,
            'auto_posted': auto_post and entry.is_posted,
        }, status=status.HTTP_201_CREATED)
    
    @action(detail=False, methods=['post'])
    @transaction.atomic
    def run_depreciation_batch(self, request):
        """
        Run depreciation for all active assets in a single batch call.

        POST /api/assets/assets/run_depreciation_batch/
        Body:
        {
            "period_date": "2026-03-01",  // optional, default: today
            "post": false,                // optional, default: false — generate only, do not post
            "category_id": 3              // optional — restrict to one category
        }

        Returns:
        {
            "period_date": "2026-03-01",
            "total": 12,
            "succeeded": 10,
            "skipped": 1,
            "failed": 1,
            "results": [
                {"asset_id": 1, "asset_name": "Laptop #1", "status": "created", "entry_id": 45},
                {"asset_id": 2, "asset_name": "Bus #3",    "status": "skipped", "reason": "Already exists"},
                {"asset_id": 3, "asset_name": "Desk",      "status": "error",   "error": "..."},
                ...
            ]
        }
        """
        from assets.services.depreciation import DepreciationService
        from django.core.exceptions import ValidationError as DjValidationError
        from django.utils.dateparse import parse_date

        period_date_str = request.data.get('period_date')
        auto_post = request.data.get('post', False)
        category_id = request.data.get('category_id')

        if period_date_str:
            period_date = parse_date(period_date_str)
            if not period_date:
                return Response(
                    {'error': f"Invalid period_date: '{period_date_str}'. Use YYYY-MM-DD."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            period_date = timezone.now().date()

        # Scope assets to owner/branch and filter to depreciable, active ones
        queryset = self.filter_queryset(self.get_queryset()).filter(status='active')
        if category_id:
            queryset = queryset.filter(category_id=category_id)

        results = []
        succeeded = 0
        skipped = 0
        failed = 0

        for asset in queryset:
            try:
                if auto_post:
                    entry = DepreciationService.generate_and_post_current_period(
                        asset=asset,
                        period_date=period_date,
                        posted_by=request.user,
                    )
                else:
                    entry = DepreciationService.generate_current_period(
                        asset=asset,
                        period_date=period_date,
                        posted_by=request.user,
                    )

                if entry is None:
                    skipped += 1
                    results.append({
                        'asset_id': asset.id,
                        'asset_name': asset.name,
                        'asset_number': asset.asset_number,
                        'status': 'skipped',
                        'reason': 'Already exists, fully depreciated, or not yet started.',
                    })
                else:
                    succeeded += 1
                    results.append({
                        'asset_id': asset.id,
                        'asset_name': asset.name,
                        'asset_number': asset.asset_number,
                        'status': 'created',
                        'entry_id': entry.id,
                        'depreciation_amount': str(entry.depreciation_amount),
                        'auto_posted': auto_post and entry.is_posted,
                    })
            except (NotImplementedError, DjValidationError, Exception) as exc:
                failed += 1
                results.append({
                    'asset_id': asset.id,
                    'asset_name': asset.name,
                    'asset_number': asset.asset_number,
                    'status': 'error',
                    'error': str(exc),
                })

        return Response({
            'period_date': period_date.isoformat(),
            'auto_posted': auto_post,
            'total': queryset.count(),
            'succeeded': succeeded,
            'skipped': skipped,
            'failed': failed,
            'results': results,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def maintenance_history(self, request, pk=None):
        """Get maintenance history for an asset"""
        asset = self.get_object()
        records = asset.maintenance_records.all()
        serializer = AssetMaintenanceSerializer(records, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """Get asset statistics"""
        queryset = self.filter_queryset(self.get_queryset())
        
        total_assets = queryset.count()
        total_value = sum(asset.current_value for asset in queryset)
        total_purchase_price = sum(asset.purchase_price for asset in queryset)
        total_accumulated_depreciation = sum(asset.accumulated_depreciation for asset in queryset)
        
        by_status = {}
        for status_choice in FixedAsset.STATUS_CHOICES:
            status_code = status_choice[0]
            count = queryset.filter(status=status_code).count()
            by_status[status_code] = count
        
        by_category = {}
        for category in AssetCategory.objects.all():
            count = queryset.filter(category=category).count()
            if count > 0:
                by_category[category.name] = count
        
        return Response({
            'total_assets': total_assets,
            'total_value': total_value,
            'total_purchase_price': total_purchase_price,
            'total_accumulated_depreciation': total_accumulated_depreciation,
            'by_status': by_status,
            'by_category': by_category,
        })

    @action(detail=False, methods=['get'])
    def fleet_summary(self, request):
        """
        Get resource consumption summary for all tracked assets (vehicles/fleet/generators).
        Returns per-asset efficiency metrics, anomaly flags, and period totals.

        GET /api/assets/assets/fleet_summary/?days=30&category=5&status=active&resource_type=fuel

        resource_type values: fuel | electricity | water | gas | (blank = all)
        """
        days          = int(request.query_params.get('days', 30))
        category_id   = request.query_params.get('category')
        status_filter = request.query_params.get('status', 'active')
        resource_type = request.query_params.get('resource_type', 'fuel')

        queryset = self.filter_queryset(self.get_queryset())
        if status_filter and status_filter != 'all':
            queryset = queryset.filter(status=status_filter)
        if category_id:
            queryset = queryset.filter(category_id=category_id)

        fleet_data = []
        total_fleet_cost = 0
        total_fleet_quantity = 0
        anomaly_count = 0

        for asset in queryset:
            efficiency = asset.get_consumption_efficiency()
            totals = asset.get_total_consumption(days=days)
            has_anomalies = asset.has_irregular_consumptions(days=days)
            consumption_count = asset.consumption_count(days=days)

            period_cost = float(totals['total_cost']) if totals['total_cost'] else 0
            period_quantity = float(totals['total_quantity']) if totals['total_quantity'] else 0

            total_fleet_cost += period_cost
            total_fleet_quantity += period_quantity
            if has_anomalies:
                anomaly_count += 1

            # Determine anomaly severity
            anomaly_status = 'none'
            if has_anomalies:
                anomaly_status = 'warning'

            # Check if current efficiency is outside resource-defined thresholds
            # (requires at least one consumption recorded)
            efficiency_status = 'ok'
            if efficiency['current'] and efficiency['average']:
                avg = efficiency['average']
                curr = efficiency['current']
                if avg > 0:
                    deviation = abs(curr - avg) / avg * 100
                    if deviation > 25:
                        efficiency_status = 'critical'
                    elif deviation > 15:
                        efficiency_status = 'warning'

            fleet_data.append({
                'id': asset.id,
                'asset_number': asset.asset_number,
                'name': asset.name,
                'registration_number': asset.registration_number or '',
                'make': asset.make or '',
                'model': asset.model or '',
                'year': asset.year,
                'status': asset.status,
                'current_location': asset.current_location or '',
                'assigned_to': asset.assigned_to or '',
                'current_reading': (
                    float(asset.current_meter_reading)
                    if asset.current_meter_reading is not None else None
                ),
                'efficiency': {
                    'current': float(efficiency['current']) if efficiency['current'] else None,
                    'average': float(efficiency['average']) if efficiency['average'] else None,
                    'best': float(efficiency['best']) if efficiency['best'] else None,
                    'worst': float(efficiency['worst']) if efficiency['worst'] else None,
                    'status': efficiency_status,
                },
                'period_totals': {
                    'quantity': period_quantity,
                    'cost': period_cost,
                    'usage': float(totals['total_usage']) if totals['total_usage'] else 0,
                    'fill_count': consumption_count,
                },
                'has_anomalies': has_anomalies,
                'anomaly_status': anomaly_status,
            })

        # Sort: anomalies first, then by cost descending
        fleet_data.sort(key=lambda x: (-int(x['has_anomalies']), -x['period_totals']['cost']))

        return Response({
            'count': len(fleet_data),
            'period_days': days,
            'resource_type': resource_type,
            'summary': {
                'total_fleet_cost': total_fleet_cost,
                'total_fleet_quantity': total_fleet_quantity,
                'anomaly_count': anomaly_count,
                'active_assets': queryset.filter(status='active').count(),
            },
            'fleet': fleet_data,
        })

    # ── Transfer ──────────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def transfer(self, request, pk=None):
        """
        Initiate an asset transfer to a new staff member / location.

        POST /api/assets/assets/{id}/transfer/
        {
          "to_staff": 12,
          "to_location": "Warehouse B",
          "reason": "Redeployment",
          "notes": "...",
          "transfer_date": "2025-01-15"   # optional – defaults to today
        }
        """
        asset  = self.get_object()
        user   = request.user
        branch = user.branch
        tenant = getattr(user, 'tenant', None)

        if asset.status == 'disposed':
            return Response(
                {'error': 'Cannot transfer a disposed asset.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        to_staff_id   = request.data.get('to_staff')
        to_location   = request.data.get('to_location', '')
        reason        = request.data.get('reason', '')
        notes         = request.data.get('notes', '')
        transfer_date = request.data.get('transfer_date', timezone.now().date())

        # Snapshot current custodian
        from_staff = asset.assigned_to_staff
        from_location = asset.current_location or ''

        # Build the transfer record
        xfer = AssetTransfer(
            asset          = asset,
            from_staff     = from_staff,
            from_location  = from_location,
            to_location    = to_location,
            reason         = reason,
            notes          = notes,
            transfer_date  = transfer_date,
            transferred_by = user,
            status         = AssetTransfer.STATUS_PENDING,
            owner          = user,
            branch         = branch,
            tenant         = tenant,
        )
        if to_staff_id:
            try:
                from hr.models import Staff
                xfer.to_staff = Staff.objects.get(pk=to_staff_id)
            except Exception:
                return Response(
                    {'error': f'Staff with id {to_staff_id} not found.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        xfer.save()

        # Close out the previous current assignment if any
        AssetAssignment.objects.filter(
            asset=asset, is_current=True, owner=user, branch=branch
        ).update(is_current=False, unassigned_date=transfer_date)

        # Write a new assignment record (is_current=True until acknowledged)
        to_staff_name = ''
        if xfer.to_staff_id:
            s = xfer.to_staff
            to_staff_name = f'{s.first_name} {s.last_name}'.strip()

        AssetAssignment.objects.create(
            asset         = asset,
            staff         = xfer.to_staff,
            staff_name    = to_staff_name,
            location      = to_location,
            assigned_date = transfer_date,
            assigned_by   = user,
            is_current    = True,
            owner         = user,
            branch        = branch,
            tenant        = tenant,
        )

        # Update asset's current custodian fields
        asset.assigned_to_staff = xfer.to_staff
        asset.current_location  = to_location or asset.current_location
        asset.save(update_fields=['assigned_to_staff', 'current_location'])

        return Response(AssetTransferSerializer(xfer).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='acknowledge_transfer')
    @transaction.atomic
    def acknowledge_transfer(self, request, pk=None):
        """
        Mark the latest pending transfer for this asset as acknowledged.

        POST /api/assets/assets/{id}/acknowledge_transfer/
        {
          "transfer_id": 7   # optional – defaults to the most recent pending transfer
        }
        """
        asset  = self.get_object()
        user   = request.user

        transfer_id = request.data.get('transfer_id')
        qs = AssetTransfer.objects.filter(
            asset=asset,
            status=AssetTransfer.STATUS_PENDING,
            owner=user,
            branch=user.branch,
        )
        if transfer_id:
            qs = qs.filter(pk=transfer_id)
        xfer = qs.order_by('-created_at').first()

        if not xfer:
            return Response(
                {'error': 'No pending transfer found for this asset.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        xfer.status         = AssetTransfer.STATUS_ACKNOWLEDGED
        xfer.acknowledged_by = user
        xfer.acknowledged_at = timezone.now()
        xfer.save(update_fields=['status', 'acknowledged_by', 'acknowledged_at'])

        return Response(AssetTransferSerializer(xfer).data)

    @action(detail=True, methods=['get'], url_path='assignment_history')
    def assignment_history(self, request, pk=None):
        """
        Return the full custody / assignment history for this asset.

        GET /api/assets/assets/{id}/assignment_history/
        """
        asset = self.get_object()
        assignments = AssetAssignment.objects.filter(
            asset=asset,
            owner=request.user,
            branch=request.user.branch,
        ).order_by('-assigned_date', '-created_at')
        serializer = AssetAssignmentSerializer(assignments, many=True)
        return Response({'results': serializer.data, 'count': assignments.count()})

    @action(detail=True, methods=['get'], url_path='transfers')
    def transfers(self, request, pk=None):
        """
        Return the transfer history for this asset.

        GET /api/assets/assets/{id}/transfers/
        """
        asset = self.get_object()
        transfers = AssetTransfer.objects.filter(
            asset=asset,
            owner=request.user,
            branch=request.user.branch,
        ).order_by('-transfer_date', '-created_at')
        serializer = AssetTransferSerializer(transfers, many=True)
        return Response({'results': serializer.data, 'count': transfers.count()})

    @action(detail=True, methods=['get'], url_path='consumption_history')
    def consumption_history(self, request, pk=None):
        """
        Get full consumption history for an asset with efficiency trend.
        GET /api/assets/assets/{id}/consumption_history/?days=90
        """
        asset = self.get_object()
        days = int(request.query_params.get('days', 90))
        resource_type = request.query_params.get('resource_type', 'fuel')

        from expenses.models import ResourceConsumption
        from datetime import timedelta

        cutoff = timezone.now().date() - timedelta(days=days)
        consumptions = ResourceConsumption.objects.filter(
            asset=asset,
            resource__resource_type=resource_type,
            consumption_date__gte=cutoff,
        ).select_related('resource', 'prepaid_voucher').order_by('-consumption_date')

        history = []
        for c in consumptions:
            history.append({
                'id': c.id,
                'consumption_number': c.consumption_number,
                'consumption_date': c.consumption_date,
                'quantity_consumed': float(c.quantity_consumed),
                'unit_cost': float(c.unit_cost) if c.unit_cost else None,
                'total_cost': float(c.total_cost),
                'previous_reading': float(c.previous_reading) if c.previous_reading else None,
                'current_reading': float(c.current_reading) if c.current_reading else None,
                'usage_since_last': float(c.usage_since_last) if c.usage_since_last else 0,
                'consumption_rate': float(c.consumption_rate) if c.consumption_rate else None,
                'payment_flow': c.payment_flow,
                'operator_name': c.operator_name,
                'consumption_location': c.consumption_location,
                'is_irregular': c.is_irregular,
                'irregularity_type': c.irregularity_type,
                'irregularity_notes': c.irregularity_notes,
                'status': c.status,
                'resource_name': c.resource.name,
                'resource_unit': c.resource.unit_of_measure,
            })

        efficiency = asset.get_consumption_efficiency()
        totals = asset.get_total_consumption(days=days)

        return Response({
            'asset': {
                'id': asset.id,
                'asset_number': asset.asset_number,
                'name': asset.name,
                'registration_number': asset.registration_number,
                'make': asset.make,
                'model': asset.model,
                'year': asset.year,
                'current_reading': (
                    float(asset.current_meter_reading)
                    if asset.current_meter_reading is not None else None
                ),
            },
            'period_days': days,
            'totals': {
                'quantity': float(totals['total_quantity']) if totals['total_quantity'] else 0,
                'cost': float(totals['total_cost']) if totals['total_cost'] else 0,
                'usage': float(totals['total_usage']) if totals['total_usage'] else 0,
            },
            'efficiency': {
                'current': float(efficiency['current']) if efficiency['current'] else None,
                'average': float(efficiency['average']) if efficiency['average'] else None,
                'best': float(efficiency['best']) if efficiency['best'] else None,
                'worst': float(efficiency['worst']) if efficiency['worst'] else None,
            },
            'history': history,
        })


class AssetDepreciationViewSet(ScopedModelViewSet):
    """ViewSet for asset depreciation entries"""
    permission_module = 'assets'
    permission_page = 'asset-depreciation'
    serializer_class = AssetDepreciationSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['asset', 'is_posted']
    ordering_fields = ['period_start', 'period_end', 'created_at']
    ordering = ['-period_start']
    
    def get_queryset(self):
        return AssetDepreciation.objects.filter(
            owner=self.request.user,
            branch=self.request.user.branch
        )
    
    @action(detail=True, methods=['post'])
    @transaction.atomic
    def post(self, request, pk=None):
        """Post a depreciation entry"""
        entry = self.get_object()
        
        if entry.is_posted:
            return Response(
                {'error': 'Depreciation entry already posted'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Gap 11: validate required GL accounts are configured
        if not entry.asset.category.depreciation_account_id:
            return Response(
                {'error': 'Depreciation expense account not configured for this asset category'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not entry.asset.category.accumulated_depreciation_account_id:
            return Response(
                {'error': 'Accumulated depreciation account not configured for this asset category'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Create journal entry for depreciation
        from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine, TransactionSeries
        
        series, _ = TransactionSeries.objects.get_or_create(
            code='DEPR',
            defaults={
                'name': 'Depreciation',
                'description': 'Depreciation Entries'
            }
        )
        
        journal_entry = JournalEntry.objects.create(
            series=series,
            date=entry.period_end,
            description=f"Depreciation - {entry.asset.name} ({entry.period_start} to {entry.period_end})",
            owner=entry.owner,
            branch=entry.branch,
            created_by=request.user
        )
        
        # Dr: Depreciation Expense
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=entry.asset.category.depreciation_account,
            side=JournalEntryLine.DEBIT,
            amount=entry.depreciation_amount
        )
        
        # Cr: Accumulated Depreciation (contra-asset)
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=entry.asset.category.accumulated_depreciation_account,
            side=JournalEntryLine.CREDIT,
            amount=entry.depreciation_amount
        )
        
        # POST the journal entry to update account balances
        journal_entry.post()
        
        # Mark depreciation entry as posted and store GL link (Gap 5)
        entry.is_posted = True
        entry.posted_at = timezone.now()
        entry.posted_by = request.user
        entry.journal_entry = journal_entry
        entry.save()
        
        # Update asset accumulated depreciation (redundant but kept for model-level tracking)
        entry.asset.accumulated_depreciation += entry.depreciation_amount
        entry.asset.save()
        
        serializer = self.get_serializer(entry)
        return Response(serializer.data)


class AssetMaintenanceViewSet(ScopedModelViewSet):
    """ViewSet for asset maintenance records"""
    permission_module = 'assets'
    permission_page = 'asset-maintenance'
    serializer_class = AssetMaintenanceSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['asset', 'maintenance_type', 'is_posted']
    search_fields = ['description', 'performed_by', 'vendor']
    ordering_fields = ['maintenance_date', 'cost', 'created_at']
    ordering = ['-maintenance_date']
    
    def get_queryset(self):
        return AssetMaintenance.objects.filter(
            owner=self.request.user,
            branch=self.request.user.branch
        )
    
    @action(detail=True, methods=['post'])
    @transaction.atomic
    def post(self, request, pk=None):
        """Post a maintenance entry to accounting"""
        maintenance = self.get_object()
        
        if maintenance.is_posted:
            return Response(
                {'error': 'Maintenance entry already posted'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if maintenance.cost <= 0:
            return Response(
                {'error': 'Cannot post maintenance with zero or negative cost'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if maintenance expense account is configured
        if not maintenance.asset.category.maintenance_expense_account:
            return Response(
                {'error': 'Maintenance expense account not configured for this asset category'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create journal entry for maintenance
        from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine, TransactionSeries
        
        series, _ = TransactionSeries.objects.get_or_create(
            code='MAINT',
            defaults={
                'name': 'Maintenance',
                'description': 'Asset Maintenance Expenses'
            }
        )
        
        journal_entry = JournalEntry.objects.create(
            series=series,
            date=maintenance.maintenance_date,
            description=f"Maintenance - {maintenance.asset.name}: {maintenance.description[:50]}",
            owner=maintenance.owner,
            branch=maintenance.branch,
            created_by=request.user
        )
        
        # Dr: Maintenance Expense
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=maintenance.asset.category.maintenance_expense_account,
            side=JournalEntryLine.DEBIT,
            amount=maintenance.cost
        )
        
        # Cr: credit account depends on payment_method (Gap I)
        from accounts.utils.account_creation import get_system_account

        if maintenance.payment_method in ('cash', 'petty_cash'):
            credit_account = get_system_account('cash', maintenance.owner, maintenance.branch)
        elif maintenance.payment_method in ('bank', 'bank_transfer', 'cheque'):
            credit_account = get_system_account('bank', maintenance.owner, maintenance.branch)
        else:
            # 'credit', 'credit_card', or default — use system-wide AP account for consistency
            credit_account = get_system_account(
                'accounts_payable',
                maintenance.owner,
                maintenance.branch,
            )
        
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=credit_account,
            side=JournalEntryLine.CREDIT,
            amount=maintenance.cost
        )
        
        # POST the journal entry to update account balances
        journal_entry.post()
        
        # Mark maintenance entry as posted and store GL link (Gap 6)
        maintenance.is_posted = True
        maintenance.posted_at = timezone.now()
        maintenance.posted_by = request.user
        maintenance.journal_entry = journal_entry
        maintenance.save()
        
        serializer = self.get_serializer(maintenance)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def upcoming(self, request):
        """Get upcoming maintenance"""
        today = timezone.now().date()
        upcoming = self.get_queryset().filter(
            next_maintenance_date__gte=today,
            next_maintenance_date__isnull=False
        ).order_by('next_maintenance_date')
        
        serializer = self.get_serializer(upcoming, many=True)
        return Response(serializer.data)


# ═══════════════════════════════════════════════════════════════════════════════
#  Asset Acquisition (multi-line bulk purchase)
# ═══════════════════════════════════════════════════════════════════════════════

class AssetAcquisitionViewSet(ScopedModelViewSet):
    """
    ViewSet for bulk asset acquisition (one PO → multiple asset types/quantities).

    Workflow
    --------
    1. POST /api/assets/acquisitions/                   → create draft with lines
    2. PATCH /api/assets/acquisitions/{id}/             → edit draft lines
    3. POST /api/assets/acquisitions/{id}/post/         → post (creates PO, AP,
                                                           GL entry, FixedAssets)
    """

    permission_module = 'assets'
    permission_page = 'asset-acquisitions'
    serializer_class = AssetAcquisitionSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'supplier', 'is_deleted']
    search_fields = ['reference_number', 'supplier__name', 'notes']
    ordering_fields = ['purchase_date', 'reference_number', 'total_amount', 'created_at']
    ordering = ['-purchase_date', '-reference_number']

    def get_queryset(self):
        user = self.request.user
        return AssetAcquisition.objects.filter(
            branch=user.branch,
        ).filter(
            Q(owner=user)
            | Q(status__in=[
                AssetAcquisition.STATUS_SUBMITTED,
                AssetAcquisition.STATUS_APPROVED,
                AssetAcquisition.STATUS_POSTED,
            ])
        ).select_related(
            'supplier', 'purchase_order', 'accounts_payable', 'posted_by'
        ).prefetch_related('lines__asset_category', 'lines__fixed_assets')

    def perform_create(self, serializer):
        import random
        from django.utils import timezone as tz

        user, branch, tenant = self._resolve_create_scope()

        # Auto-generate a unique reference number
        for _attempt in range(10):
            date_str = tz.now().strftime('%Y%m%d')
            seq      = random.randint(1, 9999)
            ref      = f"ACQ-{date_str}-{seq:04d}"
            if not AssetAcquisition.objects.filter(reference_number=ref).exists():
                break

        instance = serializer.save(
            reference_number=ref,
            owner=user,
            branch=branch,
            tenant=tenant,
        )
        # Auto-submit for approval immediately on creation
        instance.status = AssetAcquisition.STATUS_SUBMITTED
        instance.submitted_by = user
        instance.submitted_at = timezone.now()
        instance.save(update_fields=['status', 'submitted_by', 'submitted_at'])

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def post_acquisition(self, request, pk=None):
        """
        Post a draft AssetAcquisition:
          1. Create a PurchaseOrder for the supplier.
          2. Create an AccountsPayable record.
          3. Post the GL journal entry (DR each asset account / CR AP).
          4. Create FixedAsset records for each line × quantity.
          5. Mark acquisition as posted.
        """
        import logging
        import random
        from datetime import timedelta
        from decimal import Decimal
        from django.contrib.contenttypes.models import ContentType
        from accounts.utils.account_creation import get_system_account
        from procurement.models import Supplier, PurchaseOrder
        from inventory.models import Location
        from liabilities.models import AccountsPayable
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )

        logger = logging.getLogger(__name__)
        user   = request.user
        branch = user.branch
        tenant = getattr(user, 'tenant', None)

        acquisition = self.get_object()

        if acquisition.status != AssetAcquisition.STATUS_APPROVED:
            return Response(
                {'error': 'Only approved acquisitions can be posted.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        lines = list(acquisition.lines.filter(is_deleted=False).select_related('asset_category'))
        if not lines:
            return Response(
                {'error': 'Acquisition has no line items.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate each category has its asset GL account configured
        for line in lines:
            if not line.asset_category.asset_account_id:
                return Response(
                    {
                        'error': (
                            f"Category '{line.asset_category.name}' has no asset GL account "
                            f"configured. Please set it in asset categories before posting."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        supplier = acquisition.supplier

        # ── Pre-compute totals from live line data ────────────────────────────
        # Always derive the monetary amounts from the fetched line items rather
        # than from acquisition.total_amount, which can be stale (e.g. if
        # recalculate_total() ran in a context where the OwnerBranchManager's
        # tenant filter excluded lines that lacked a tenant_id).
        from collections import defaultdict
        category_totals = defaultdict(Decimal)
        category_accounts = {}
        for line in lines:
            category_totals[line.asset_category_id] += line.total_price
            category_accounts[line.asset_category_id] = line.asset_category.asset_account
        total_credit = sum(category_totals.values())

        # ── 1.  Create PurchaseOrder ──────────────────────────────────────────
        delivery_location = Location.objects.filter(branch=branch).first()
        po = None
        if delivery_location:
            for _attempt in range(10):
                date_str  = timezone.now().strftime('%Y%m%d')
                po_number = f"PO-ASSET-{date_str}-{random.randint(1000, 9999)}"
                if not PurchaseOrder.objects.filter(po_number=po_number).exists():
                    break

            po = PurchaseOrder.objects.create(
                po_number=po_number,
                supplier=supplier,
                order_date=acquisition.purchase_date,
                delivery_location=delivery_location,
                payment_terms=acquisition.payment_terms or supplier.payment_terms,
                status='approved',
                requires_approval=False,
                total_amount=total_credit,
                subtotal=total_credit,
                notes=f"Auto-created for asset acquisition {acquisition.reference_number}",
                owner=user,
                branch=branch,
                tenant=tenant,
            )
            logger.info(f"Acquisition {acquisition.reference_number}: created PO {po.po_number}")
        else:
            logger.warning(
                f"Acquisition {acquisition.reference_number}: no Location found – PO skipped."
            )

        # ── 2.  Create AccountsPayable ────────────────────────────────────────
        ap_gl_account = get_system_account('accounts_payable', user, branch)

        _TERM_DAYS = {'cash': 0, 'net_15': 15, 'net_30': 30, 'net_60': 60, 'net_90': 90}
        terms    = acquisition.payment_terms or supplier.payment_terms or 'net_30'
        days_due = _TERM_DAYS.get(terms, 30)
        due_date = acquisition.purchase_date + timedelta(days=days_due)

        supplier_ct = ContentType.objects.get_for_model(Supplier)
        ap = AccountsPayable.objects.create(
            content_type=supplier_ct,
            object_id=supplier.pk,
            account=ap_gl_account,
            invoice_number=acquisition.reference_number,
            invoice_date=acquisition.purchase_date,
            due_date=due_date,
            amount=total_credit,
            description=f"Asset acquisition {acquisition.reference_number} – {supplier.name}",
            purchase_order=po,
            posted_by=user,
            posted_at=timezone.now(),
            posting_notes="Auto-posted on asset acquisition",
            owner=user,
            branch=branch,
            tenant=tenant,
        )
        logger.info(f"Acquisition {acquisition.reference_number}: created AP {ap.reference_number}")

        # ── 3.  Post GL journal entry ─────────────────────────────────────────
        #  DR  each category's asset account (grouped by category)
        #  CR  Accounts Payable GL account (single credit line)
        series, _ = TransactionSeries.objects.get_or_create(
            code='ASACQ',
            defaults={
                'description': 'GL entries for fixed-asset purchases on credit',
            },
        )

        journal = JournalEntry.objects.create(
            series=series,
            date=acquisition.purchase_date,
            description=(
                f"Asset acquisition {acquisition.reference_number} "
                f"from {supplier.name}"
            ),
            workflow_reference=f"ACQ-{acquisition.reference_number}",
            branch=branch,
            owner=user,
            created_by=user,
        )

        for cat_id, debit_amount in category_totals.items():
            JournalEntryLine.objects.create(
                transaction=journal,
                account=category_accounts[cat_id],
                side=JournalEntryLine.DEBIT,
                amount=debit_amount,
            )

        JournalEntryLine.objects.create(
            transaction=journal,
            account=ap_gl_account,
            side=JournalEntryLine.CREDIT,
            amount=total_credit,
        )

        journal.post()
        logger.info(f"Acquisition {acquisition.reference_number}: posted GL entry {journal.pk}")

        # ── 4.  Create / Activate FixedAsset records ─────────────────────────
        # For each line:
        #   • If line.registered_asset is set → ACTIVATE that existing shell
        #     (sets purchase_price, purchase_date, supplier, status=active).
        #     If quantity > 1, clone additional shells from the same template.
        #   • If registered_asset is None (direct acquisition, no prior register step)
        #     → create brand-new FixedAsset records (legacy / bypass path).
        # All activated/created assets share the acquisition's reference_number as
        # their depreciation_batch_id so they can be grouped in reports, but each
        # asset depreciates individually based on its own depreciation_start_date.
        created_assets = []
        batch_id = acquisition.reference_number

        for line in lines:
            cat = line.asset_category

            # Depreciation overrides (fall back to category defaults)
            dep_method  = line.depreciation_method or cat.default_depreciation_method
            useful_life = line.useful_life_years    or cat.default_useful_life_years
            salvage_pct = (
                line.salvage_value_percentage
                if line.salvage_value_percentage is not None
                else cat.default_salvage_value_percentage
            )
            salvage_value = (Decimal(str(salvage_pct)) / 100) * line.unit_price

            if line.registered_asset_id:
                # ── PATH A: activate the registered shell ─────────────────
                primary = line.registered_asset
                primary.purchase_price        = line.unit_price
                primary.purchase_date         = acquisition.purchase_date
                primary.salvage_value         = salvage_value
                primary.depreciation_method   = dep_method
                primary.useful_life_years     = useful_life
                primary.depreciation_start_date = acquisition.purchase_date
                primary.supplier              = supplier
                primary.purchase_order        = po
                primary.accounts_payable      = ap
                primary.acquisition_line      = line
                primary.status                = 'active'
                primary.depreciation_batch_id = batch_id
                primary.save()
                created_assets.append(primary)

                # Clone extra units if quantity > 1
                for seq in range(2, line.quantity + 1):
                    for _attempt in range(10):
                        date_str     = timezone.now().strftime('%Y%m%d')
                        rand_suffix  = random.randint(1000, 9999)
                        asset_number = f"AST-{date_str}-{rand_suffix}"
                        if not FixedAsset.objects.filter(asset_number=asset_number).exists():
                            break
                    clone = FixedAsset.objects.create(
                        asset_number=asset_number,
                        category=cat,
                        name=f"{primary.name} #{seq}",
                        description=primary.description,
                        registered_at=acquisition.purchase_date,
                        purchase_date=acquisition.purchase_date,
                        purchase_price=line.unit_price,
                        salvage_value=salvage_value,
                        depreciation_method=dep_method,
                        useful_life_years=useful_life,
                        depreciation_start_date=acquisition.purchase_date,
                        status='active',
                        supplier=supplier,
                        purchase_order=po,
                        accounts_payable=ap,
                        acquisition_line=line,
                        depreciation_batch_id=batch_id,
                        owner=user,
                        branch=branch,
                        tenant=tenant,
                    )
                    created_assets.append(clone)
            else:
                # ── PATH B: no prior registration — create new FixedAsset records
                for seq in range(1, line.quantity + 1):
                    for _attempt in range(10):
                        date_str     = timezone.now().strftime('%Y%m%d')
                        rand_suffix  = random.randint(1000, 9999)
                        asset_number = f"AST-{date_str}-{rand_suffix}"
                        if not FixedAsset.objects.filter(asset_number=asset_number).exists():
                            break

                    asset_name = (
                        f"{line.name} #{seq}" if line.quantity > 1 else line.name
                    )

                    asset = FixedAsset.objects.create(
                        asset_number=asset_number,
                        category=cat,
                        name=asset_name,
                        description=line.description,
                        registered_at=acquisition.purchase_date,
                        purchase_date=acquisition.purchase_date,
                        purchase_price=line.unit_price,
                        salvage_value=salvage_value,
                        current_value=line.unit_price,
                        depreciation_method=dep_method,
                        useful_life_years=useful_life,
                        depreciation_start_date=acquisition.purchase_date,
                        status='active',
                        supplier=supplier,
                        purchase_order=po,
                        accounts_payable=ap,
                        acquisition_line=line,
                        depreciation_batch_id=batch_id,
                        owner=user,
                        branch=branch,
                        tenant=tenant,
                    )
                    created_assets.append(asset)

        logger.info(
            f"Acquisition {acquisition.reference_number}: activated/created "
            f"{len(created_assets)} FixedAsset record(s)"
        )

        # ── 5.  Mark acquisition as posted ────────────────────────────────────
        acquisition.purchase_order  = po
        acquisition.accounts_payable = ap
        acquisition.journal_entry   = journal
        acquisition.status          = AssetAcquisition.STATUS_POSTED
        acquisition.posted_by       = user
        acquisition.posted_at       = timezone.now()
        acquisition.save()

        # If this acquisition came from an AssetRequisition, close that requisition state too.
        linked_requisition = getattr(acquisition, 'requisition', None)
        linked_requisition_id = None
        if linked_requisition and linked_requisition.status != AssetRequisition.STATUS_CONVERTED:
            linked_requisition.status = AssetRequisition.STATUS_CONVERTED
            linked_requisition.acquisition = acquisition
            linked_requisition.save(update_fields=['status', 'acquisition'])
        if linked_requisition:
            linked_requisition_id = linked_requisition.id

        serializer = self.get_serializer(acquisition)
        return Response(
            {
                **serializer.data,
                'posted_successfully': True,
                'assets_activated': len(created_assets),
                'asset_ids': [a.id for a in created_assets],
                'depreciation_batch_id': batch_id,
                'linked_requisition_id': linked_requisition_id,
            },
            status=status.HTTP_200_OK,
        )

    # ── Acquisition approval workflow ─────────────────────────────────────────

    @action(detail=True, methods=['post'])
    def submit_acquisition(self, request, pk=None):
        """Submit a draft or rejected acquisition for approval."""
        acq = self.get_object()
        if acq.status not in (AssetAcquisition.STATUS_DRAFT, AssetAcquisition.STATUS_REJECTED):
            return Response(
                {'error': 'Only draft or rejected acquisitions can be submitted for approval.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not acq.lines.filter(is_deleted=False).exists():
            return Response(
                {'error': 'Add at least one line item before submitting.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        acq.status = AssetAcquisition.STATUS_SUBMITTED
        acq.submitted_by = request.user
        acq.submitted_at = timezone.now()
        acq.save(update_fields=['status', 'submitted_by', 'submitted_at'])
        return Response(self.get_serializer(acq).data)

    @action(detail=True, methods=['post'])
    def approve_acquisition(self, request, pk=None):
        """Approve a submitted acquisition and immediately post it."""
        acq = self.get_object()
        if acq.status != AssetAcquisition.STATUS_SUBMITTED:
            return Response(
                {'error': 'Only submitted acquisitions can be approved.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        acq.status = AssetAcquisition.STATUS_APPROVED
        acq.approved_by_acquisition = request.user
        acq.approved_at_acquisition = timezone.now()
        acq.rejection_reason = ''
        acq.save(update_fields=[
            'status', 'approved_by_acquisition', 'approved_at_acquisition', 'rejection_reason'
        ])
        # Immediately post the acquisition now that it is approved
        return self.post_acquisition(request, pk)

    @action(detail=True, methods=['post'])
    def reject_acquisition(self, request, pk=None):
        """Reject a submitted acquisition back to draft (with a reason)."""
        acq = self.get_object()
        if acq.status != AssetAcquisition.STATUS_SUBMITTED:
            return Response(
                {'error': 'Only submitted acquisitions can be rejected.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reason = request.data.get('reason', '').strip()
        acq.status = AssetAcquisition.STATUS_REJECTED
        acq.rejection_reason = reason
        acq.save(update_fields=['status', 'rejection_reason'])
        return Response(self.get_serializer(acq).data)


import logging
logger_req = logging.getLogger(__name__)


class AssetRequisitionViewSet(ScopedModelViewSet):
    """
    Asset Requisition API

    Lifecycle:
      POST   /api/assets/requisitions/                    – create draft
      PATCH  /api/assets/requisitions/{id}/               – edit draft
      POST   /api/assets/requisitions/{id}/submit/        – submit for approval
      POST   /api/assets/requisitions/{id}/approve/       – approve (approver role)
      POST   /api/assets/requisitions/{id}/reject/        – reject  (approver role)
      POST   /api/assets/requisitions/{id}/convert/       – create AssetAcquisition draft
      DELETE /api/assets/requisitions/{id}/               – soft-delete draft/rejected
    """

    permission_module = 'assets'
    permission_page = 'asset-requisitions'
    serializer_class = AssetRequisitionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'department']
    search_fields = ['ar_number', 'purpose', 'department']
    ordering_fields = ['request_date', 'created_at', 'estimated_total']
    ordering = ['-request_date']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return AssetRequisition.objects.none()
        return AssetRequisition.objects.filter(
            branch=self.request.user.branch
        ).select_related(
            'requested_by', 'approved_by', 'acquisition'
        ).prefetch_related('items', 'items__asset_category')

    def get_permissions(self):
        if self.action in ('approve', 'reject'):
            from common.approval_permissions import IsApprover
            return [IsAuthenticated(), IsApprover()]
        return super().get_permissions()

    def perform_create(self, serializer):
        import random
        from datetime import datetime
        from django.db import IntegrityError
        from rest_framework.exceptions import ValidationError

        for attempt in range(10):
            date_str = datetime.now().strftime('%Y%m%d')
            ar_number = f"AR-{date_str}-{random.randint(1000, 9999)}"
            if not AssetRequisition.objects.filter(ar_number=ar_number).exists():
                try:
                    serializer.save(
                        ar_number=ar_number,
                        requested_by=self.request.user,
                        owner=self.request.user,
                        branch=self.request.user.branch,
                        tenant=getattr(self.request.user, 'tenant', None),
                    )
                    return
                except IntegrityError as e:
                    if 'ar_number' in str(e) and attempt < 9:
                        continue
                    raise ValidationError({'ar_number': 'Failed to generate unique AR number.'})

        raise ValidationError({'ar_number': 'Unable to generate unique AR number.'})

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """Submit draft for approval."""
        req = self.get_object()
        if req.status != AssetRequisition.STATUS_DRAFT:
            return Response(
                {'error': 'Only draft requisitions can be submitted.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not req.items.exists():
            return Response(
                {'error': 'At least one line item is required before submitting.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        req.status = AssetRequisition.STATUS_SUBMITTED
        req.save(update_fields=['status'])

        # Notify approvers (non-blocking)
        try:
            from notifications.services import NotificationService
            NotificationService().send_from_template(
                template_code='asset_requisition_submitted',
                recipient=req.requested_by,
                context={'ar_number': req.ar_number},
                owner=request.user,
                branch=getattr(request.user, 'branch', None),
                related_object=req,
                channels=['in_app'],
            )
        except Exception as e:
            logger_req.warning(f"AR submit notification failed (non-blocking): {e}")

        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a submitted requisition."""
        req = self.get_object()
        if req.status != AssetRequisition.STATUS_SUBMITTED:
            return Response(
                {'error': 'Only submitted requisitions can be approved.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        req.status = AssetRequisition.STATUS_APPROVED
        req.approved_by = request.user
        req.approved_at = timezone.now()
        req.approval_chain = req.approval_chain + [{
            'user': request.user.username,
            'action': 'approved',
            'at': timezone.now().isoformat(),
        }]
        req.save()

        try:
            from notifications.services import NotificationService
            NotificationService().send_from_template(
                template_code='asset_requisition_approved',
                recipient=req.requested_by,
                context={
                    'ar_number': req.ar_number,
                    'approved_by': request.user.get_full_name() or request.user.username,
                },
                owner=request.user,
                branch=getattr(request.user, 'branch', None),
                related_object=req,
                channels=['in_app'],
            )
        except Exception as e:
            logger_req.warning(f"AR approval notification failed (non-blocking): {e}")

        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject a submitted requisition."""
        req = self.get_object()
        if req.status != AssetRequisition.STATUS_SUBMITTED:
            return Response(
                {'error': 'Only submitted requisitions can be rejected.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reason = request.data.get('reason', '').strip()
        req.status = AssetRequisition.STATUS_REJECTED
        req.rejection_reason = reason
        req.approval_chain = req.approval_chain + [{
            'user': request.user.username,
            'action': 'rejected',
            'reason': reason,
            'at': timezone.now().isoformat(),
        }]
        req.save()

        try:
            from notifications.services import NotificationService
            NotificationService().send_from_template(
                template_code='asset_requisition_rejected',
                recipient=req.requested_by,
                context={
                    'ar_number': req.ar_number,
                    'rejected_by': request.user.get_full_name() or request.user.username,
                    'reason': reason or 'No reason provided',
                },
                owner=request.user,
                branch=getattr(request.user, 'branch', None),
                related_object=req,
                channels=['in_app'],
            )
        except Exception as e:
            logger_req.warning(f"AR rejection notification failed (non-blocking): {e}")

        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=['post'])
    def convert(self, request, pk=None):
        """
        Convert an approved requisition to an AssetAcquisition draft.

        The resulting acquisition is a DRAFT — Finance still needs to
        confirm the supplier / prices on each line and then post it.
        The registered FixedAsset shells from each requisition line are
        linked to the corresponding acquisition line so that posting
        ACTIVATES them rather than creating duplicate FixedAsset records.
        """
        req = self.get_object()
        if req.status != AssetRequisition.STATUS_APPROVED:
            return Response(
                {'error': 'Only approved requisitions can be converted to an acquisition.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if hasattr(req, 'acquisition') and req.acquisition_id:
            return Response(
                {'error': 'This requisition has already been converted.',
                 'acquisition_id': req.acquisition_id},
                status=status.HTTP_400_BAD_REQUEST,
            )

        import random
        from datetime import datetime as dt

        with transaction.atomic():
            # Generate unique ACQ reference
            for _ in range(10):
                ref = f"ACQ-{dt.now().strftime('%Y%m%d')}-{random.randint(1000, 9999)}"
                if not AssetAcquisition.objects.filter(reference_number=ref).exists():
                    break

            acq = AssetAcquisition.objects.create(
                reference_number=ref,
                supplier=None,          # Finance will fill this in
                purchase_date=req.required_by_date or timezone.now().date(),
                notes=(
                    f"Created from Asset Requisition {req.ar_number}.\n"
                    + (req.purpose or '')
                ).strip(),
                total_amount=req.estimated_total,
                status=AssetAcquisition.STATUS_DRAFT,
                owner=request.user,
                branch=request.user.branch,
                tenant=getattr(request.user, 'tenant', None),
            )

            for item in req.items.filter(is_deleted=False):
                AssetAcquisitionLine.objects.create(
                    acquisition=acq,
                    asset_category=item.asset_category,
                    # Link the already-registered FixedAsset shell
                    registered_asset=item.asset,
                    name=item.asset.name,
                    description=item.description or item.asset.description,
                    quantity=item.quantity,
                    unit_price=item.actual_unit_price,
                    total_price=item.actual_unit_price * item.quantity,
                    tenant=getattr(request.user, 'tenant', None),
                )

            req.status = AssetRequisition.STATUS_CONVERTED
            req.acquisition = acq
            req.save()

        return Response(
            {
                'success': True,
                'ar_number': req.ar_number,
                'acquisition_id': acq.id,
                'acquisition_reference': acq.reference_number,
                'message': (
                    'Asset Acquisition draft created. Finance should now set a supplier, '
                    'confirm prices, and post it to activate the assets.'
                ),
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def activate(self, request, pk=None):
        """
        Directly activate an approved requisition WITHOUT converting to an
        AssetAcquisition first.  Use this when:
          - The supplier and prices are already confirmed on the requisition lines.
          - You want a single-step approve-and-activate flow.

        For each requisition line this action:
          1. Sets purchase_price, purchase_date, supplier on the linked FixedAsset.
          2. Calculates salvage_value from the category default percentage.
          3. Sets depreciation_start_date = purchase_date.
          4. Updates status → 'active'.
          5. Sets depreciation_batch_id so all lines from this requisition share a batch.
          6. If quantity > 1, clones additional FixedAsset shells (inherit all
             category/depreciation settings from the primary shell).
          7. Posts the GL journal entry:
               DR  Asset Account (category.asset_account) × unit_price
               CR  Accounts Payable                       × total
          8. Creates AccountsPayable record per supplier on the requisition.

        POST /api/assets/requisitions/{id}/activate/
        Body:
        {
            "purchase_date": "2026-04-10",  // optional – defaults to today
            "payment_terms": "net_30"       // optional – overrides supplier default
        }
        """
        import logging
        import random
        from datetime import timedelta
        from decimal import Decimal as D
        from django.contrib.contenttypes.models import ContentType
        from accounts.utils.account_creation import get_system_account
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )
        from liabilities.models import AccountsPayable

        logger = logging.getLogger(__name__)
        user   = request.user
        branch = user.branch
        tenant = getattr(user, 'tenant', None)

        req = self.get_object()

        if req.status != AssetRequisition.STATUS_APPROVED:
            return Response(
                {'error': 'Only approved requisitions can be activated.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        items = list(req.items.filter(is_deleted=False, is_activated=False).select_related(
            'asset', 'asset__category', 'supplier'
        ))
        if not items:
            return Response(
                {'error': 'No pending (unactivated) line items found on this requisition.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate: every line must have a supplier and a non-zero price
        errors = []
        for item in items:
            if not item.supplier_id:
                errors.append(f"Line '{item.asset.name}': supplier is required before activation.")
            if not item.actual_unit_price or item.actual_unit_price <= 0:
                errors.append(f"Line '{item.asset.name}': actual_unit_price must be > 0.")
            if not item.asset.category.asset_account_id:
                errors.append(
                    f"Category '{item.asset.category.name}' has no asset GL account configured."
                )
        if errors:
            return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

        purchase_date_str = request.data.get('purchase_date')
        if purchase_date_str:
            from django.utils.dateparse import parse_date
            purchase_date = parse_date(purchase_date_str) or timezone.now().date()
        else:
            purchase_date = timezone.now().date()

        payment_terms_override = request.data.get('payment_terms', '')

        # Batch ID ties all assets from this requisition together for depreciation reports
        batch_id = req.ar_number

        # Group lines by supplier to produce one AP record per supplier
        from collections import defaultdict
        supplier_line_map = defaultdict(list)
        for item in items:
            supplier_line_map[item.supplier_id].append(item)

        _TERM_DAYS = {'cash': 0, 'net_15': 15, 'net_30': 30, 'net_60': 60, 'net_90': 90}
        ap_gl_account = get_system_account('accounts_payable', user, branch)

        series, _ = TransactionSeries.objects.get_or_create(
            code='ASACQ',
            defaults={
                'description': 'GL entries for fixed-asset purchases on credit',
            },
        )

        activated_assets = []

        for supplier_id, supplier_items in supplier_line_map.items():
            from procurement.models import Supplier
            supplier = Supplier.objects.get(pk=supplier_id)

            # Determine due date
            terms = payment_terms_override or supplier.payment_terms or 'net_30'
            days_due = _TERM_DAYS.get(terms, 30)
            due_date = purchase_date + timedelta(days=days_due)

            supplier_total = sum(D(str(si.actual_unit_price)) * si.quantity for si in supplier_items)

            # ── GL journal (one per supplier) ──────────────────────────────
            from django.contrib.contenttypes.models import ContentType
            journal = JournalEntry.objects.create(
                series=series,
                date=purchase_date,
                description=(
                    f"Asset acquisition via {req.ar_number} "
                    f"from {supplier.name}"
                ),
                workflow_reference=f"AR-{req.ar_number}",
                branch=branch,
                owner=user,
                created_by=user,
            )

            for si in supplier_items:
                cat = si.asset.category
                salvage_pct = D(str(cat.default_salvage_value_percentage)) / 100
                salvage_val = salvage_pct * D(str(si.actual_unit_price))

                dep_method  = si.asset.depreciation_method or cat.default_depreciation_method
                useful_life = si.asset.useful_life_years or cat.default_useful_life_years

                # ── Activate the primary registered asset shell ──────────────
                primary = si.asset
                primary.purchase_price       = si.actual_unit_price
                primary.purchase_date        = purchase_date
                primary.salvage_value        = salvage_val
                primary.depreciation_method  = dep_method
                primary.useful_life_years    = useful_life
                primary.depreciation_start_date = purchase_date
                primary.supplier             = supplier
                primary.status               = 'active'
                primary.depreciation_batch_id = batch_id
                primary.save()
                activated_assets.append(primary)

                # ── Clone additional units (quantity > 1) ───────────────────
                for seq in range(2, si.quantity + 1):
                    for _attempt in range(10):
                        rand_suffix  = random.randint(1000, 9999)
                        asset_number = f"AST-{purchase_date.strftime('%Y%m%d')}-{rand_suffix}"
                        if not FixedAsset.objects.filter(asset_number=asset_number).exists():
                            break

                    clone = FixedAsset.objects.create(
                        asset_number=asset_number,
                        category=cat,
                        name=f"{primary.name} #{seq}",
                        description=primary.description,
                        registered_at=purchase_date,
                        purchase_date=purchase_date,
                        purchase_price=si.actual_unit_price,
                        salvage_value=salvage_val,
                        depreciation_method=dep_method,
                        useful_life_years=useful_life,
                        depreciation_start_date=purchase_date,
                        supplier=supplier,
                        status='active',
                        depreciation_batch_id=batch_id,
                        owner=user,
                        branch=branch,
                        tenant=tenant,
                    )
                    activated_assets.append(clone)

                # ── DR: Asset Account (one line per asset category × qty × price)
                JournalEntryLine.objects.create(
                    transaction=journal,
                    account=cat.asset_account,
                    side=JournalEntryLine.DEBIT,
                    amount=D(str(si.actual_unit_price)) * si.quantity,
                )

                si.is_activated = True
                si.save(update_fields=['is_activated'])

            # ── CR: Accounts Payable (one line per supplier)
            JournalEntryLine.objects.create(
                transaction=journal,
                account=ap_gl_account,
                side=JournalEntryLine.CREDIT,
                amount=supplier_total,
            )
            journal.post()
            logger.info(
                f"Requisition {req.ar_number}: posted GL entry {journal.pk} "
                f"for supplier {supplier.name} total={supplier_total}"
            )

            # ── AccountsPayable record ──────────────────────────────────────
            supplier_ct = ContentType.objects.get_for_model(Supplier)
            ap = AccountsPayable.objects.create(
                content_type=supplier_ct,
                object_id=supplier.pk,
                account=ap_gl_account,
                invoice_number=req.ar_number,
                invoice_date=purchase_date,
                due_date=due_date,
                amount=supplier_total,
                description=f"Asset acquisition via {req.ar_number}",
                posted_by=user,
                posted_at=timezone.now(),
                posting_notes="Auto-posted on asset requisition activation",
                owner=user,
                branch=branch,
                tenant=tenant,
            )
            logger.info(
                f"Requisition {req.ar_number}: created AP {ap.reference_number}"
            )

        req.status = AssetRequisition.STATUS_CONVERTED
        req.save(update_fields=['status'])

        return Response(
            {
                'success': True,
                'ar_number': req.ar_number,
                'assets_activated': len(activated_assets),
                'asset_ids': [a.id for a in activated_assets],
                'depreciation_batch_id': batch_id,
                'message': (
                    f'{len(activated_assets)} asset(s) activated. GL entries and '
                    'Accounts Payable records created per supplier.'
                ),
            },
            status=status.HTTP_200_OK,        )