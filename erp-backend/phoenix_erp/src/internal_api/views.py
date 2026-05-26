"""
internal_api/views.py
=====================
Internal REST endpoints consumed by Java microservices.
NOT exposed to the browser frontend — protected by DRF Token authentication
with a dedicated service-account token.

App 1 – Loan Portfolio Batch Processor (Spring Boot)
App 2 – Statutory Compliance Service   (Spring Boot)
App 3 – Bank Feed Reconciliation        (Spring Boot)

Usage (Java side):
    Authorization: Token <service_account_token>
"""
from __future__ import annotations

import logging
from decimal import Decimal

from django.db import transaction as db_transaction
from django.utils import timezone
from rest_framework import permissions, serializers as drf_serializers, status
from rest_framework.authentication import TokenAuthentication
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Permission helper
# ---------------------------------------------------------------------------

class IsInternalServiceUser(permissions.BasePermission):
    """
    Allows access only to users whose profile is flagged as a service account.
    Falls back to superuser so admins can test easily.
    """
    message = "Access restricted to internal service accounts."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        # Service accounts are marked via a boolean on the user profile.
        # If the profile model doesn't have this field yet we degrade to
        # is_staff so the feature still works without a migration.
        profile = getattr(user, 'profile', None)
        if profile is not None and hasattr(profile, 'is_service_account'):
            return profile.is_service_account
        return user.is_staff


_INTERNAL_AUTH = [TokenAuthentication]
_INTERNAL_PERMS = [IsInternalServiceUser]


# ===========================================================================
# App 1 – Loan Portfolio Batch Processor
# ===========================================================================

class LoanBatchPendingView(APIView):
    """
    GET /api/internal/loans/batch-pending/

    Returns active LoanAccounts that have NOT yet been processed by the
    current batch run (batch_accrual_posted=False).

    Java App 1 calls this on startup of each nightly batch.
    """
    authentication_classes = _INTERNAL_AUTH
    permission_classes = _INTERNAL_PERMS

    def get(self, request):
        from loans.models import LoanAccount
        qs = LoanAccount.objects.filter(
            status__in=['active', 'disbursed'],
            batch_accrual_posted=False,
            is_deleted=False,
        ).values(
            'id', 'loan_number', 'client_id',
            'outstanding_principal', 'outstanding_interest',
            'outstanding_fees', 'outstanding_penalties',
            'arrears_amount', 'days_in_arrears',
            'repayment_frequency', 'risk_classification',
            'last_batch_processed_at', 'batch_accrual_posted',
        )
        return Response(list(qs))


class LoanBatchCompleteView(APIView):
    """
    POST /api/internal/loans/<pk>/batch-complete/

    Body (optional):
        {
          "accrual_amount": "12500.00",   # informational only – stored in notes
          "notes": "..."
        }

    Marks the loan's batch cycle as done. Java App 1 calls this after posting
    the accrual journal entry on its side.
    """
    authentication_classes = _INTERNAL_AUTH
    permission_classes = _INTERNAL_PERMS

    def post(self, request, pk):
        from loans.models import LoanAccount
        try:
            loan = LoanAccount.objects.get(pk=pk, is_deleted=False)
        except LoanAccount.DoesNotExist:
            return Response({'detail': 'LoanAccount not found.'}, status=status.HTTP_404_NOT_FOUND)

        loan.last_batch_processed_at = timezone.now()
        loan.batch_accrual_posted = True
        loan.save(update_fields=['last_batch_processed_at', 'batch_accrual_posted', 'updated_at'])

        return Response({
            'id': loan.pk,
            'loan_number': loan.loan_number,
            'last_batch_processed_at': loan.last_batch_processed_at,
            'batch_accrual_posted': loan.batch_accrual_posted,
        })


class LoanBatchResetView(APIView):
    """
    POST /api/internal/loans/batch-reset/

    Resets batch_accrual_posted=False for all active loans so the next
    nightly run can process them.  Called by the scheduler on Java App 1
    at the START of each cycle (before processing).
    """
    authentication_classes = _INTERNAL_AUTH
    permission_classes = _INTERNAL_PERMS

    def post(self, request):
        from loans.models import LoanAccount
        updated = LoanAccount.objects.filter(
            status='active',
            is_deleted=False,
        ).update(batch_accrual_posted=False)
        return Response({'reset_count': updated})


# ===========================================================================
# App 2 – Statutory Compliance Service (NHF / NSITF)
# ===========================================================================

class StatutoryFilingListView(APIView):
    """
    GET /api/internal/hr/statutory-filings/

    Query params:
      - status: draft / submitted / remitted / rejected / cancelled
      - filing_type: nhf / nsitf

    Java App 2 polls this to discover filings it should submit to NSITF/NHF.
    """
    authentication_classes = _INTERNAL_AUTH
    permission_classes = _INTERNAL_PERMS

    def get(self, request):
        from hr.models import PayrollStatutoryFiling
        qs = PayrollStatutoryFiling.objects.filter(is_deleted=False)

        filing_type = request.query_params.get('filing_type')
        if filing_type:
            qs = qs.filter(filing_type=filing_type)

        filing_status = request.query_params.get('status')
        if filing_status:
            qs = qs.filter(status=filing_status)

        data = list(qs.values(
            'id', 'reference_number', 'filing_type', 'status',
            'period_start', 'period_end', 'filing_date',
            'remittance_date', 'total_amount', 'agency_reference',
            'last_submitted_at', 'owner_id', 'branch_id',
        ))
        return Response(data)


class StatutoryFilingUpdateView(APIView):
    """
    PATCH /api/internal/hr/statutory-filings/<pk>/

    Body (any subset of):
        {
          "status": "submitted",
          "agency_reference": "NHF-2025-00123",
          "last_submission_payload": {...},
          "last_submission_response": {...}
        }

    Java App 2 calls this after submitting the filing to the regulatory portal.
    """
    authentication_classes = _INTERNAL_AUTH
    permission_classes = _INTERNAL_PERMS

    def patch(self, request, pk):
        from hr.models import PayrollStatutoryFiling

        try:
            filing = PayrollStatutoryFiling.objects.get(pk=pk, is_deleted=False)
        except PayrollStatutoryFiling.DoesNotExist:
            return Response({'detail': 'PayrollStatutoryFiling not found.'}, status=status.HTTP_404_NOT_FOUND)

        allowed_fields = {
            'status', 'agency_reference',
            'last_submission_payload', 'last_submission_response',
            'remittance_date',
        }
        update_fields = ['updated_at']

        for field in allowed_fields:
            if field in request.data:
                setattr(filing, field, request.data[field])
                update_fields.append(field)

        if 'last_submission_payload' in request.data or 'last_submission_response' in request.data:
            filing.last_submitted_at = timezone.now()
            update_fields.append('last_submitted_at')

        filing.save(update_fields=list(set(update_fields)))

        return Response({
            'id': filing.pk,
            'reference_number': filing.reference_number,
            'status': filing.status,
            'agency_reference': filing.agency_reference,
            'last_submitted_at': filing.last_submitted_at,
        })


# ===========================================================================
# App 3 – Bank Feed Reconciliation Service
# ===========================================================================

class BankFeedConsentListView(APIView):
    """
    GET /api/internal/banks/feed-consents/

    Query params:
      - status: pending / active / expired / revoked / failed
      - bank_code: e.g. "044" (Access Bank)

    Java App 3 calls this to discover which consents it should reconcile.
    NOTE: consent_token and refresh_token ARE included here (internal only).
    """
    authentication_classes = _INTERNAL_AUTH
    permission_classes = _INTERNAL_PERMS

    def get(self, request):
        from banks.models import BankFeedConsent
        qs = BankFeedConsent.objects.filter(is_deleted=False)

        consent_status = request.query_params.get('status')
        if consent_status:
            qs = qs.filter(status=consent_status)

        bank_code = request.query_params.get('bank_code')
        if bank_code:
            qs = qs.filter(bank_code=bank_code)

        data = list(qs.values(
            'id', 'client_id', 'bank_name', 'bank_code',
            'account_number', 'account_name', 'status',
            'consent_granted_at', 'consent_expires_at',
            'consent_token', 'refresh_token',
            'last_sync_at', 'last_sync_status',
            'phoenix_bank_account_id', 'owner_id', 'branch_id',
        ))
        return Response(data)


class BankFeedConsentSyncView(APIView):
    """
    PATCH /api/internal/banks/feed-consents/<pk>/sync/

    Body:
        {
          "last_sync_at": "2025-07-14T02:00:00Z",   # optional, defaults to now
          "last_sync_status": "success",              # success / failed / partial
          "sync_error_detail": "...",                 # optional
          "consent_token": "...",                     # optional, rotated token
          "refresh_token": "...",                     # optional, rotated token
          "status": "active"                          # optional status update
        }

    Java App 3 calls this after each reconciliation cycle.
    """
    authentication_classes = _INTERNAL_AUTH
    permission_classes = _INTERNAL_PERMS

    def patch(self, request, pk):
        from banks.models import BankFeedConsent

        try:
            consent = BankFeedConsent.objects.get(pk=pk, is_deleted=False)
        except BankFeedConsent.DoesNotExist:
            return Response({'detail': 'BankFeedConsent not found.'}, status=status.HTTP_404_NOT_FOUND)

        allowed_fields = {
            'last_sync_status', 'sync_error_detail',
            'consent_token', 'refresh_token', 'status',
        }
        update_fields = ['updated_at']

        for field in allowed_fields:
            if field in request.data:
                setattr(consent, field, request.data[field])
                update_fields.append(field)

        # Use provided timestamp or default to now
        consent.last_sync_at = request.data.get('last_sync_at') or timezone.now()
        update_fields.append('last_sync_at')

        consent.save(update_fields=list(set(update_fields)))

        return Response({
            'id': consent.pk,
            'status': consent.status,
            'last_sync_at': consent.last_sync_at,
            'last_sync_status': consent.last_sync_status,
        })


# ===========================================================================
# App 1 (continued) – Bulk Accrual Posting & Batch Run Summary
# ===========================================================================

_VALID_RISK_CLASSIFICATIONS = {'performing', 'watch', 'substandard', 'doubtful', 'loss'}


class BulkLoanAccrualView(APIView):
    """
    POST /api/internal/batch/loan-accrual/bulk/

    Accepts the nightly accrual results computed by Java App 1 and:
      1. Posts a GL journal entry (LN-ACCR series) per loan:
             Dr. Loan Receivable (loan.account)    — interest earned, not yet received
             Cr. Interest Income  (product account) — income recognised
      2. Updates LoanAccount: outstanding_interest, risk_classification,
         days_in_arrears, batch_accrual_posted, last_batch_processed_at.
      3. Records a LoanAccrualRecord row for idempotency.

    Entries already present (same idempotency_key) are silently skipped — the
    batch is safe to replay on the same run_date without double-posting.

    Expected body — array of accrual objects:
    [
      {
        "loanId": 1042,
        "accrualAmount": "1250.00",
        "provisionAmount": "625.00",
        "newRiskClassification": "watch",
        "daysInArrears": 35,
        "runDate": "2026-05-25",
        "idempotencyKey": "1042-2026-05-25"
      },
      ...
    ]

    Returns:
    {
      "processed": 98,
      "skipped": 2,
      "errors": [{"loanId": 5, "detail": "LoanAccount not found."}]
    }
    """
    authentication_classes = _INTERNAL_AUTH
    permission_classes = _INTERNAL_PERMS

    def post(self, request):
        from loans.models import LoanAccount
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )
        from .models import LoanAccrualRecord

        entries = request.data
        if not isinstance(entries, list):
            return Response(
                {'detail': 'Expected a JSON array of accrual entries.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        processed = 0
        skipped = 0
        errors = []

        # Fetch the LN-ACCR series once outside the loop
        accrual_series, _ = TransactionSeries.objects.get_or_create(
            code='LN-ACCR',
            defaults={'description': 'Loan Interest Accruals (Batch)'},
        )

        for entry in entries:
            loan_id = entry.get('loanId')
            idempotency_key = entry.get('idempotencyKey', '')

            # ── Idempotency check ─────────────────────────────────────────
            if LoanAccrualRecord.objects.filter(idempotency_key=idempotency_key).exists():
                skipped += 1
                continue

            # ── Basic validation ──────────────────────────────────────────
            risk_value = (entry.get('newRiskClassification') or 'performing').lower()
            if risk_value not in _VALID_RISK_CLASSIFICATIONS:
                errors.append({
                    'loanId': loan_id,
                    'detail': f"Invalid newRiskClassification: '{risk_value}'.",
                })
                continue

            # ── Process each entry atomically so one bad loan doesn't roll
            #    back the whole batch ────────────────────────────────────
            try:
                with db_transaction.atomic():
                    loan = LoanAccount.objects.select_related(
                        'product', 'account', 'owner', 'branch'
                    ).get(pk=loan_id, is_deleted=False)

                    accrual_amount = Decimal(str(entry.get('accrualAmount', '0')))
                    provision_amount = Decimal(str(entry.get('provisionAmount', '0')))
                    days_in_arrears = int(entry.get('daysInArrears', 0))
                    run_date = entry.get('runDate')

                    journal_entry_id = None

                    # ── GL Journal Entry ──────────────────────────────────
                    # Only post a GL entry when there is actual accrual to book.
                    if accrual_amount > Decimal('0.00'):
                        interest_income_account = loan.product.interest_income_account

                        journal_entry = JournalEntry.objects.create(
                            series=accrual_series,
                            date=run_date,
                            description=f"Interest accrual – {loan.loan_number}",
                            workflow_reference=f"ACCR-{idempotency_key}",
                            owner=loan.owner,
                            branch=loan.branch,
                            # Service-account postings have no human created_by
                            created_by=None,
                        )

                        # Debit: Loan Receivable — interest earned, owed by borrower
                        JournalEntryLine.objects.create(
                            transaction=journal_entry,
                            account=loan.account,
                            side=JournalEntryLine.DEBIT,
                            amount=accrual_amount,
                            description=f"Accrued interest – {loan.loan_number}",
                        )

                        if interest_income_account:
                            # Credit: Interest Income account from the loan product
                            JournalEntryLine.objects.create(
                                transaction=journal_entry,
                                account=interest_income_account,
                                side=JournalEntryLine.CREDIT,
                                amount=accrual_amount,
                                description=f"Interest income recognised – {loan.loan_number}",
                            )
                        else:
                            # Fallback: credit back to Loan Receivable (self-balancing).
                            # Keeps the transaction balanced when the product has no
                            # interest_income_account configured yet.
                            logger.warning(
                                "LoanProduct %s has no interest_income_account; "
                                "accrual for loan %s posted without income split.",
                                loan.product_id,
                                loan.loan_number,
                            )
                            JournalEntryLine.objects.create(
                                transaction=journal_entry,
                                account=loan.account,
                                side=JournalEntryLine.CREDIT,
                                amount=accrual_amount,
                                description=f"Accrued interest (no income account) – {loan.loan_number}",
                            )

                        journal_entry.post()
                        journal_entry_id = journal_entry.pk

                    # ── Update LoanAccount fields ─────────────────────────
                    update_fields = [
                        'risk_classification',
                        'days_in_arrears',
                        'batch_accrual_posted',
                        'last_batch_processed_at',
                        'updated_at',
                    ]
                    loan.risk_classification = risk_value
                    loan.days_in_arrears = days_in_arrears
                    loan.batch_accrual_posted = True
                    loan.last_batch_processed_at = timezone.now()

                    if accrual_amount > Decimal('0.00'):
                        loan.outstanding_interest = (
                            loan.outstanding_interest + accrual_amount
                        )
                        update_fields.append('outstanding_interest')

                    loan.save(update_fields=update_fields)

                    # ── Idempotency record ────────────────────────────────
                    LoanAccrualRecord.objects.create(
                        loan_id=loan_id,
                        idempotency_key=idempotency_key,
                        run_date=run_date,
                        accrual_amount=accrual_amount,
                        provision_amount=provision_amount,
                        risk_classification_applied=risk_value,
                        days_in_arrears_at_run=days_in_arrears,
                        journal_entry_id=journal_entry_id,
                    )

                    processed += 1

            except LoanAccount.DoesNotExist:
                errors.append({'loanId': loan_id, 'detail': 'LoanAccount not found.'})
            except Exception as exc:
                logger.exception(
                    "Failed to post accrual entry for loan %s (key=%s): %s",
                    loan_id, idempotency_key, exc,
                )
                errors.append({'loanId': loan_id, 'detail': str(exc)})

        return Response(
            {'processed': processed, 'skipped': skipped, 'errors': errors},
            status=status.HTTP_200_OK,
        )


class BatchRunSummaryView(APIView):
    """
    POST /api/internal/batch/run-summary/

    Called by Java App 1 (LoanBatchListener.afterJob) regardless of success
    or failure.  Stores the run in BatchRunLog for ops visibility.

    Body:
    {
      "runDate": "2026-05-25",
      "status": "COMPLETED",           # COMPLETED | FAILED | STOPPED
      "loansProcessed": 145,
      "loansSkipped": 3,
      "durationSeconds": 42
    }
    """
    authentication_classes = _INTERNAL_AUTH
    permission_classes = _INTERNAL_PERMS

    def post(self, request):
        from .models import BatchRunLog

        run_date = request.data.get('runDate')
        batch_status = request.data.get('status', '').upper()
        loans_processed = int(request.data.get('loansProcessed', 0))
        loans_skipped = int(request.data.get('loansSkipped', 0))
        duration_seconds = int(request.data.get('durationSeconds', 0))

        if not run_date:
            return Response(
                {'detail': 'runDate is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        valid_statuses = {'COMPLETED', 'FAILED', 'STOPPED'}
        if batch_status not in valid_statuses:
            return Response(
                {'detail': f"Invalid status '{batch_status}'. Must be one of {sorted(valid_statuses)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        log = BatchRunLog.objects.create(
            run_date=run_date,
            status=batch_status,
            loans_processed=loans_processed,
            loans_skipped=loans_skipped,
            duration_seconds=duration_seconds,
        )

        return Response(
            {
                'id': log.pk,
                'run_date': log.run_date,
                'status': log.status,
                'loans_processed': log.loans_processed,
                'loans_skipped': log.loans_skipped,
                'duration_seconds': log.duration_seconds,
                'received_at': log.received_at,
            },
            status=status.HTTP_201_CREATED,
        )

