# accounts/views_ledger.py
"""
Ledger Report Views
Provides detailed transaction ledgers for accounts with running balances
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q, Sum, F, Case, When, DecimalField, Value
from django.utils import timezone
from decimal import Decimal
from datetime import datetime, timedelta

from common.views import ScopedModelViewSet
from .models import Account
from .serializers import AccountReadSerializer
from transactions.models import Transaction, TransactionEntry


class AccountLedgerSerializer:
    """Serializer for account ledger data"""
    
    @staticmethod
    def serialize_ledger_entry(entry, running_balance, client_name=None):
        """Serialize a single ledger entry"""
        side = (getattr(entry, 'side', '') or '').upper()
        amt = float(entry.amount) if getattr(entry, 'amount', None) is not None else 0.0
        debit_val = amt if side == TransactionEntry.DEBIT else 0.0
        credit_val = amt if side == TransactionEntry.CREDIT else 0.0
        return {
            'date': entry.transaction.date.isoformat(),
            'transaction_id': entry.transaction.id,
            'reference_number': entry.transaction.reference_number,
            'description': entry.transaction.description,
            'debit': debit_val,
            'credit': credit_val,
            'balance': float(running_balance),
            'amount': amt,
            'side': entry.side,
            'client_name': client_name,
            'created_by': entry.transaction.owner.get_full_name() if entry.transaction.owner else None,
            'created_by_id': entry.transaction.owner.id if entry.transaction.owner else None,
            'approved': entry.transaction.approved,
            'is_reversed': entry.transaction.is_reversed,
            'transaction': {
                'id': entry.transaction.id,
                'reference_number': entry.transaction.reference_number,
                'series': getattr(entry.transaction.series, 'code', None),
                'date': entry.transaction.date.isoformat(),
                'description': entry.transaction.description,
                'workflow_reference': entry.transaction.workflow_reference,
                'approved': entry.transaction.approved,
                'is_reversal': getattr(entry.transaction, 'is_reversal', False),
                'total_amount': float(entry.transaction.get_total_amount()) if hasattr(entry.transaction, 'get_total_amount') else None,
            },
        }


class AccountLedgerViewSet(ScopedModelViewSet):
    """
    ViewSet for Account Ledger Reports
    
    Provides detailed transaction history for accounts with running balances
    """
    queryset = Account.objects.all()
    # Use the read serializer for Account list/retrieve operations.
    serializer_class = AccountReadSerializer
    permission_classes = [IsAuthenticated]
    
    @action(detail=True, methods=['get'])
    def ledger(self, request, pk=None):
        """
        Get ledger report for a specific account
        
        Query Parameters:
        - date_from: Start date (YYYY-MM-DD)
        - date_to: End date (YYYY-MM-DD)
        - include_unapproved: Include unapproved transactions (default: false)
        - page_size: Number of entries per page
        """
        account = self.get_object()
        
        # Get query parameters
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        include_unapproved = request.query_params.get('include_unapproved', 'false').lower() == 'true'
        
        # Build query
        # TransactionEntry does not implement soft-delete; filter on parent Transaction
        entries_query = TransactionEntry.objects.filter(
            account=account,
            transaction__is_deleted=False
        ).select_related('transaction', 'transaction__owner')
        
        # Filter by approved status
        if not include_unapproved:
            entries_query = entries_query.filter(transaction__approved=True)
        
        # Filter by date range
        if date_from:
            entries_query = entries_query.filter(transaction__date__gte=date_from)
        if date_to:
            entries_query = entries_query.filter(transaction__date__lte=date_to)
        
        # Order by date and created time
        entries_query = entries_query.order_by('transaction__date', 'transaction__created_at')
        
        # Calculate opening balance (sum of all entries before date_from)
        opening_balance = Decimal('0.00')
        if date_from:
            opening_entries = TransactionEntry.objects.filter(
                account=account,
                transaction__date__lt=date_from,
                transaction__is_deleted=False
            )
            if not include_unapproved:
                opening_entries = opening_entries.filter(transaction__approved=True)
            
            for entry in opening_entries:
                side = (getattr(entry, 'side', '') or '').upper()
                if side == TransactionEntry.DEBIT:
                    if account.account_type in ['ASSET', 'EXPENSE']:
                        opening_balance += entry.amount
                    else:
                        opening_balance -= entry.amount
                elif side == TransactionEntry.CREDIT:
                    if account.account_type in ['ASSET', 'EXPENSE']:
                        opening_balance -= entry.amount
                    else:
                        opening_balance += entry.amount
        
        # Process entries and calculate running balance
        # Pre-fetch client/student names using multiple lookup strategies so that
        # every type of transaction (invoice posting, payment, income receipt, etc.)
        # shows the associated client name.
        from incomes.models import Invoice, Income, FeeEntitlement, InvoiceItemPayment
        import re as _re

        transaction_ids = [e.transaction_id for e in entries_query]
        client_by_txn: dict = {}

        def _build_name(first, last):
            return f"{first or ''} {last or ''}".strip() or None

        if transaction_ids:
            # ── Strategy 1: Invoice *posting* entries ─────────────────────────
            # Invoice.journal_entry FK points to the Dr-AR / Cr-Income transaction.
            inv_qs = (
                Invoice.objects.all_tenants()
                .filter(journal_entry_id__in=transaction_ids, is_deleted=False)
                .values('journal_entry_id', 'client__first_name', 'client__last_name')
            )
            for row in inv_qs:
                client_by_txn[row['journal_entry_id']] = _build_name(
                    row.get('client__first_name'), row.get('client__last_name')
                )

            # ── Fetch workflow_references for transactions not yet covered ────
            uncovered_ids = [tid for tid in transaction_ids if tid not in client_by_txn]
            if uncovered_ids:
                tx_wf_refs: dict = dict(
                    Transaction.objects.filter(id__in=uncovered_ids)
                    .values_list('id', 'workflow_reference')
                )
                # Reverse map: workflow_reference → transaction_id
                wf_to_tx_id: dict = {v: k for k, v in tx_wf_refs.items() if v}

                # ── Strategy 2: Invoice *payment* entries ─────────────────────
                # InvoiceItemPayment.journal_entry_reference stores the
                # workflow_reference of the payment journal entry.
                if wf_to_tx_id:
                    item_pmt_qs = (
                        InvoiceItemPayment.objects.filter(
                            journal_entry_reference__in=list(wf_to_tx_id.keys())
                        )
                        .values(
                            'journal_entry_reference',
                            'invoice__client__first_name',
                            'invoice__client__last_name',
                        )
                    )
                    for row in item_pmt_qs:
                        ref = row['journal_entry_reference']
                        tx_id = wf_to_tx_id.get(ref)
                        if tx_id and tx_id not in client_by_txn:
                            client_by_txn[tx_id] = _build_name(
                                row.get('invoice__client__first_name'),
                                row.get('invoice__client__last_name'),
                            )

                # ── Strategy 3: Income *payment* entries ──────────────────────
                # Pattern: workflow_reference = "{income.reference_number}-PMT"
                # or "{income.reference_number}-PMT-{uuid8}"
                still_uncovered = {
                    tid: tx_wf_refs.get(tid)
                    for tid in uncovered_ids
                    if tid not in client_by_txn and tx_wf_refs.get(tid)
                }
                base_ref_to_tx_ids: dict = {}
                for tx_id, wref in still_uncovered.items():
                    if wref and '-PMT' in wref:
                        base_ref = wref.rsplit('-PMT', 1)[0]
                        base_ref_to_tx_ids.setdefault(base_ref, []).append(tx_id)

                if base_ref_to_tx_ids:
                    income_qs = (
                        Income.objects.all_tenants()
                        .filter(reference_number__in=list(base_ref_to_tx_ids.keys()))
                        .values('reference_number', 'client__first_name', 'client__last_name')
                    )
                    for row in income_qs:
                        for tx_id in base_ref_to_tx_ids.get(row['reference_number'], []):
                            if tx_id not in client_by_txn:
                                client_by_txn[tx_id] = _build_name(
                                    row.get('client__first_name'),
                                    row.get('client__last_name'),
                                )

                # ── Strategy 4: FeeEntitlement *payment* entries ──────────────
                # Pattern: workflow_reference = "ENT-{entitlement.id}-PMT"
                ent_id_to_tx_ids: dict = {}
                for tx_id, wref in still_uncovered.items():
                    if tx_id not in client_by_txn and wref:
                        m = _re.match(r'^ENT-(\d+)-PMT$', wref)
                        if m:
                            ent_id_to_tx_ids.setdefault(int(m.group(1)), []).append(tx_id)

                if ent_id_to_tx_ids:
                    ent_qs = (
                        FeeEntitlement.objects.all_tenants()
                        .filter(id__in=list(ent_id_to_tx_ids.keys()))
                        .values('id', 'client__first_name', 'client__last_name')
                    )
                    for row in ent_qs:
                        for tx_id in ent_id_to_tx_ids.get(row['id'], []):
                            if tx_id not in client_by_txn:
                                client_by_txn[tx_id] = _build_name(
                                    row.get('client__first_name'),
                                    row.get('client__last_name'),
                                )

        ledger_entries = []
        running_balance = opening_balance
        
        for entry in entries_query:
            # Update running balance based on account type and entry side
            side = (getattr(entry, 'side', '') or '').upper()
            if side == TransactionEntry.DEBIT:
                if account.account_type in ['ASSET', 'EXPENSE']:
                    running_balance += entry.amount
                else:
                    running_balance -= entry.amount
            elif side == TransactionEntry.CREDIT:
                if account.account_type in ['ASSET', 'EXPENSE']:
                    running_balance -= entry.amount
                else:
                    running_balance += entry.amount
            
            ledger_entries.append(
                AccountLedgerSerializer.serialize_ledger_entry(
                    entry, running_balance,
                    client_name=client_by_txn.get(entry.transaction_id),
                )
            )
        
        # Calculate totals
        total_debits = sum(e['debit'] for e in ledger_entries)
        total_credits = sum(e['credit'] for e in ledger_entries)
        
        return Response({
            'account': {
                'id': account.id,
                'code': account.code,
                'name': account.name,
                'account_type': account.account_type,
                'current_balance': float(account.balance),
            },
            'period': {
                'date_from': date_from,
                'date_to': date_to,
            },
            'opening_balance': float(opening_balance),
            'closing_balance': float(running_balance),
            'total_debits': total_debits,
            'total_credits': total_credits,
            'entries': ledger_entries,
            'entry_count': len(ledger_entries),
        })
    
    @action(detail=False, methods=['get'])
    def multi_account_ledger(self, request):
        """
        Get ledger reports for multiple accounts
        
        Query Parameters:
        - account_ids: Comma-separated list of account IDs
        - date_from: Start date
        - date_to: End date
        """
        account_ids = request.query_params.get('account_ids', '')
        if not account_ids:
            return Response(
                {'error': 'account_ids parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        account_ids = [int(id.strip()) for id in account_ids.split(',')]
        accounts = Account.objects.filter(id__in=account_ids, branch=request.user.default_branch)
        
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        
        ledgers = []
        for account in accounts:
            # Reuse the ledger logic
            entries_query = TransactionEntry.objects.filter(
                account=account,
                transaction__approved=True,
                transaction__is_deleted=False
            )
            
            if date_from:
                entries_query = entries_query.filter(transaction__date__gte=date_from)
            if date_to:
                entries_query = entries_query.filter(transaction__date__lte=date_to)
            
            entries_query = entries_query.order_by('transaction__date', 'transaction__created_at')
            
            # Calculate balances
            running_balance = Decimal('0.00')
            entry_count = 0
            
            for entry in entries_query:
                entry_count += 1
                if entry.side == TransactionEntry.DEBIT:
                    if account.account_type in ['ASSET', 'EXPENSE']:
                        running_balance += entry.amount
                    else:
                        running_balance -= entry.amount
                elif entry.side == TransactionEntry.CREDIT:
                    if account.account_type in ['ASSET', 'EXPENSE']:
                        running_balance -= entry.amount
                    else:
                        running_balance += entry.amount
            
            ledgers.append({
                'account': {
                    'id': account.id,
                    'code': account.code,
                    'name': account.name,
                    'account_type': account.account_type,
                },
                'entry_count': entry_count,
                'closing_balance': float(running_balance),
            })
        
        return Response({
            'period': {
                'date_from': date_from,
                'date_to': date_to,
            },
            'ledgers': ledgers,
        })
