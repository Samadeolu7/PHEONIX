# banks/reconciliation_utils.py
"""
Shared logic for the Bank-Recon (Java) integration.

fetch_erp_payments() used to be exposed as an internal HTTP endpoint that
Java called (internal_api.ErpPaymentsListView) — now that Java is a fully
stateless compute service with no outbound calls of its own, Django gathers
this data itself and sends it to Java as part of the single ingest-and-match
request. Kept as a plain function (not a view) so StatementUploadView can
call it directly with no HTTP round-trip.
"""
import re

_LOAN_NUMBER_RE = re.compile(r'Loan repayment\s*[–-]\s*([^|]+)')
_BANK_REFERENCE_RE = re.compile(r'\|\s*Ref:\s*(.+)$')


def fetch_erp_payments(bank_account, date_from, date_to, direction='CREDIT', exclude_payment_ids=()):
    """
    Returns ERP-recorded payments for a bank account within [date_from,
    date_to] inclusive, in the camelCase shape Java's ErpPayment/
    RawErpPayment DTOs expect.

    The range (rather than a single exact date) exists because postings lag
    in both directions: an officer may log a repayment a day or two before
    it settles, and the bank may not post a transaction for several days
    after it was collected. exclude_payment_ids lets a caller omit payments
    another date's reconciliation run in the same window already claimed,
    so the same ERP payment isn't offered to two different runs at once.

    direction:
      CREDIT = money the ERP recorded as received into this bank account
               (a DR journal entry against the account's GL — an asset
               increase). This is what a loan repayment looks like.
      DEBIT  = money the ERP recorded as paid out of this bank account
               (a CR journal entry — an asset decrease: disbursements,
               expense payments, withdrawals, transfers out, etc.)

    Neither the loan number nor any cashier-entered bank reference is a
    structured column — both are embedded as free text inside
    Transaction.description by LoanAccount.record_payment() in the form
    "Loan repayment – <loan_number> | Ref: <bank_reference>", so they are
    extracted here with a regex against that known format.
    """
    from transactions.models import TransactionEntry

    if not bank_account.gl_account_id:
        return []  # no GL account linked — nothing to reconcile against

    # A repayment debits the receiving account (asset increase); a
    # disbursement/expense/withdrawal credits it (asset decrease).
    side = TransactionEntry.DEBIT if direction == 'CREDIT' else TransactionEntry.CREDIT

    entries = (
        TransactionEntry.objects
        .filter(
            account_id=bank_account.gl_account_id,
            side=side,
            transaction__date__range=(date_from, date_to),
            transaction__approved=True,
            transaction__is_deleted=False,
        )
        .exclude(transaction_id__in=exclude_payment_ids)
        .select_related('transaction', 'transaction__created_by', 'transaction__created_by__branch')
    )

    payments = []
    for entry in entries:
        txn = entry.transaction
        description = txn.description or ''

        loan_match = _LOAN_NUMBER_RE.search(description)
        ref_match = _BANK_REFERENCE_RE.search(description)

        officer = txn.created_by
        officer_name = f"{officer.first_name} {officer.last_name}".strip() if officer else ''

        payments.append({
            'paymentId': txn.id,
            'amount': str(entry.amount),
            'narration': description,
            'paymentDate': txn.date.isoformat(),
            'officerName': officer_name,
            'loanNumber': loan_match.group(1).strip() if loan_match else None,
            'bankReference': ref_match.group(1).strip() if ref_match else None,
        })

    return payments


def recompute_reconciliation_counts(recon):
    """
    Recompute matched_count/unmatched_bank_count/unmatched_erp_count/
    total_bank_transactions for a single DailyReconciliation from current
    ReconciliationBankTransaction/ReconciliationException state, and save.

    unmatched_bank_count/unmatched_erp_count are counted from unresolved
    exceptions, not raw ReconciliationBankTransaction.matched=False rows —
    resolving (or auto-resolving) an exception doesn't retroactively flip
    matched, so a bank line whose exception has been closed out should stop
    counting as outstanding even though the underlying line is still
    genuinely unmatched.

    Shared by banks/tasks.py's _persist_outcome (after every Java match run),
    dedupe_reconciliation_exceptions (after merging duplicate exceptions),
    and the unmatch/link-resolve views (after a manual override changes
    matched/resolved state directly). Does NOT touch `status` — callers that
    need to mark a reconciliation 'completed' do that themselves.
    """
    from django.db.models import Count, Q
    from .models import ReconciliationBankTransaction

    tx_agg = ReconciliationBankTransaction.objects.filter(
        bank_account=recon.bank_account,
        value_date=recon.reconciliation_date,
    ).aggregate(
        total=Count('id'),
        matched=Count('id', filter=Q(matched=True)),
    )
    exc_agg = recon.exceptions.aggregate(
        bank_only=Count('id', filter=Q(exception_type='bank_only', resolved=False)),
        erp_only=Count('id', filter=Q(exception_type='erp_only', resolved=False)),
    )

    recon.matched_count = tx_agg['matched']
    recon.total_bank_transactions = tx_agg['total']
    recon.unmatched_bank_count = exc_agg['bank_only']
    recon.unmatched_erp_count = exc_agg['erp_only']
    recon.save(update_fields=[
        'matched_count', 'unmatched_bank_count', 'unmatched_erp_count',
        'total_bank_transactions', 'updated_at',
    ])


def get_or_create_bank_only_exception(recon, tx):
    """
    Ensure a `bank_only` ReconciliationException exists for `tx` (a
    ReconciliationBankTransaction) against `recon` — natural-key dedup on
    (reconciliation, exception_type, bank_transaction_id), matching the same
    pattern _persist_outcome uses for Java-reported exceptions (banks/tasks.py),
    deliberately not filtered by resolved so an already-resolved row is found
    and reused rather than duplicated.

    Used by the unmatch action (ReconciliationBankTransaction.unmatch()) so a
    line that's manually unmatched reappears as an outstanding exception
    immediately, rather than waiting for the next scheduled rerun.
    """
    from .models import ReconciliationException

    exc_obj, _created = ReconciliationException.objects.get_or_create(
        reconciliation=recon,
        exception_type='bank_only',
        bank_transaction_id=tx.id,
        defaults={
            'direction': tx.direction,
            'bank_transaction_id': tx.id,
            'bank_amount': tx.amount,
            'bank_narration': tx.narration,
            'bank_date': tx.value_date,
            'is_high_priority': True,
        },
    )
    return exc_obj
