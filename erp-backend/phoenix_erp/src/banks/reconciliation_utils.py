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
from decimal import Decimal

from django.db.models import F

from .tasks import run_reconciliation_match

_LOAN_NUMBER_RE = re.compile(r'Loan repayment\s*[–-]\s*([^|]+)')
_BANK_REFERENCE_RE = re.compile(r'\|\s*Ref:\s*(.+)$')

# Applies to the three mandatory-reason fields introduced alongside the
# resolve-flexibility features: ResolveExceptionView's resolution_notes
# (amount-mismatch case), ReconciliationBankTransaction.unmatch()'s reason,
# and LinkResolveExceptionsView's resolution_notes. Deliberately NOT applied
# to older reason fields elsewhere (BankTransfer.reject, BankPayment.
# reject_payment) — this threshold was requested specifically for these
# three, not as a codebase-wide change.
MIN_REASON_LENGTH = 10


def reason_too_short(reason: str) -> bool:
    """True if `reason` is empty/whitespace or shorter than MIN_REASON_LENGTH
    once stripped — the single check shared by all three mandatory-reason
    fields above, so the threshold only needs to change in one place."""
    return not reason or len(reason.strip()) < MIN_REASON_LENGTH


def is_valid_exception_pairing(exc_a, exc_b):
    """
    Whether two ReconciliationException rows can be manually linked together
    via LinkResolveExceptionsView — either:
      - both bank_only, OPPOSITE direction — the compensating-transfer/
        netting case (money left the account one way, e.g. sent to the
        wrong bank, and a manual transfer brought it back the other way).
      - one bank_only and one erp_only, SAME direction — the missed-
        auto-match case (the bank line and the ERP payment are very
        plausibly the same real transaction that just failed to fuzzy-match
        on reference/narration; both describe money moving the same way).
    erp_only+erp_only is never valid (neither side has a bank line to
    anchor the pairing to), and amount_diff is never linkable — it already
    has its own ERP-side match with a captured discrepancy, not a "no match
    at all" case. Amount equality (resolve_amount) is checked separately by
    the caller.
    """
    types = {exc_a.exception_type, exc_b.exception_type}
    if types == {'bank_only'}:
        return exc_a.direction != exc_b.direction
    if types == {'bank_only', 'erp_only'}:
        return exc_a.direction == exc_b.direction
    return False


# The BankTransfer/MOVEB-series inter-bank transfer pattern found in the
# missing-money gap analysis: the sending bank deducts a transfer fee that
# was never recorded in the ERP, so the same real event produces a bank_only
# DEBIT exception (the full amount including the fee) and a separate
# erp_only DEBIT exception (the amount actually recorded) that differ by a
# small, plausible fee rather than matching exactly. LinkResolveExceptionsView
# requires an exact amount match by design, so this pattern needs its own
# pathway — see LinkResolveBankChargeView (banks/views.py).
FEE_LINK_MAX_AMOUNT = Decimal('75.00')


def bank_charge_fee(exc_a, exc_b):
    """
    Returns the Decimal fee amount if `exc_a`/`exc_b` fit the "same transfer,
    bank deducted a fee never recorded in the ERP" shape — one bank_only and
    one erp_only exception, both DEBIT, with the bank_only amount larger than
    the erp_only amount. Returns None for any other shape (wrong types,
    directions, or the erp_only side being the larger one — a shortfall, not
    a fee). Does NOT enforce FEE_LINK_MAX_AMOUNT — the caller checks that
    separately so it can surface a clear "too large for this pathway"
    message instead of a silent None.
    """
    types = {exc_a.exception_type, exc_b.exception_type}
    if types != {'bank_only', 'erp_only'}:
        return None
    bank_exc, erp_exc = (exc_a, exc_b) if exc_a.exception_type == 'bank_only' else (exc_b, exc_a)
    if bank_exc.direction != 'DEBIT' or erp_exc.direction != 'DEBIT':
        return None
    if bank_exc.bank_amount is None or erp_exc.erp_amount is None:
        return None
    fee = bank_exc.bank_amount - erp_exc.erp_amount
    return fee if fee > 0 else None


def get_or_create_bank_charges_category(branch, tenant, owner):
    """
    The fixed ExpenseCategory LinkResolveBankChargeView books fee expenses
    against — auto-provisioned per branch/tenant on first use (mirrors
    get_system_account()'s auto-create-on-first-use pattern) rather than
    requiring a director to pick a category, since this pathway is
    specifically and only for bank-deducted transfer fees.
    """
    from accounts.utils.account_creation import get_system_account
    from expenses.models import ExpenseCategory

    expense_account = get_system_account('bank_charges', owner, branch)
    category, _ = ExpenseCategory.objects.get_or_create(
        code='BANKCHG', branch=branch, tenant=tenant,
        defaults={'name': 'Bank Charges', 'expense_account': expense_account, 'owner': owner},
    )
    return category


# Safety margin for find_bank_charge_pairs' automatic pairing only — the
# manual single-pair candidate picker (LinkCandidatesView) has no date
# filter since a human reviews the narration/reference directly before
# confirming. A bulk auto-pairer has no human in that loop per-pair, so it
# additionally requires the two dates to be plausibly the same event (an
# officer may log a repayment a day or two early, and the bank may not post
# for several days — see fetch_erp_payments' docstring for the same reasoning).
FEE_LINK_DATE_WINDOW_DAYS = 10


def find_bank_charge_pairs(bank_account_id, scoped_qs):
    """
    Finds unambiguous bank_only DEBIT / erp_only DEBIT exception pairs on
    `bank_account_id` that fit bank_charge_fee's shape, for
    BulkLinkResolveBankChargeView. `scoped_qs` is a caller-supplied
    ReconciliationException queryset already filtered to the requesting
    user's visible reconciliations (DailyReconciliation.objects.for_user()),
    so this never needs its own authorization check.

    Deliberately conservative: a pair is only returned if each side is the
    OTHER's single viable candidate — a bank_only with two erp_only
    candidates within tolerance (or an erp_only claimed by two bank_onlys)
    is never guessed at, since a wrong auto-link would misfile real money.
    Ambiguous and unmatched bank_only exceptions are returned separately so
    the caller can report them — those still need the manual Link picker,
    where a human reviewing narration/reference can actually tell them apart.

    Returns (pairs, ambiguous_bank_only, unmatched_bank_only):
      pairs                — list of (bank_exc, erp_exc, fee) tuples
      ambiguous_bank_only  — bank_only exceptions with >1 viable candidate
      unmatched_bank_only  — bank_only exceptions with 0 viable candidates
    """
    bank_onlys = list(scoped_qs.filter(
        reconciliation__bank_account_id=bank_account_id,
        exception_type='bank_only', direction='DEBIT', resolved=False,
    ).select_related('reconciliation').order_by('bank_date'))
    erp_onlys = list(scoped_qs.filter(
        reconciliation__bank_account_id=bank_account_id,
        exception_type='erp_only', direction='DEBIT', resolved=False,
    ).select_related('reconciliation').order_by('erp_date'))

    def within_date_window(bank_exc, erp_exc):
        if not bank_exc.bank_date or not erp_exc.erp_date:
            return True
        return abs((bank_exc.bank_date - erp_exc.erp_date).days) <= FEE_LINK_DATE_WINDOW_DAYS

    bank_viable = {}
    erp_viable_count = {}
    for bank_exc in bank_onlys:
        viable = []
        for erp_exc in erp_onlys:
            fee = bank_charge_fee(bank_exc, erp_exc)
            if fee is None or fee > FEE_LINK_MAX_AMOUNT:
                continue
            if not within_date_window(bank_exc, erp_exc):
                continue
            viable.append((erp_exc, fee))
        bank_viable[bank_exc.id] = viable
        for erp_exc, _fee in viable:
            erp_viable_count[erp_exc.id] = erp_viable_count.get(erp_exc.id, 0) + 1

    pairs, ambiguous, unmatched = [], [], []
    for bank_exc in bank_onlys:
        viable = bank_viable[bank_exc.id]
        if not viable:
            unmatched.append(bank_exc)
        elif len(viable) == 1 and erp_viable_count[viable[0][0].id] == 1:
            erp_exc, fee = viable[0]
            pairs.append((bank_exc, erp_exc, fee))
        else:
            ambiguous.append(bank_exc)

    return pairs, ambiguous, unmatched


def find_stranded_resolved_pairs(scoped_qs):
    """
    Finds bank_only/erp_only exception pairs where one side was resolved
    STANDALONE — the plain per-row Resolve action, with netted_with and
    pending_bank_payment both still None — while its real counterpart on
    the same bank account is still sitting unresolved. This is the
    production pattern that motivated it: a director resolved an erp_only
    exception with a generic note like "Inter bank" instead of Linking it
    to the bank_only line it actually belonged to, permanently consuming
    the one valid match and stranding the other side with nothing left to
    pair against.

    `scoped_qs` is a caller-supplied ReconciliationException queryset
    already filtered to the requesting user's visible reconciliations, so
    this never needs its own authorization check. Unlike
    find_bank_charge_pairs, this scans every bank account represented in
    that queryset at once (no bank_account_id parameter) — the caller is
    global (BulkCleanUpStrandedPairsView), not per-account.

    Two pairing shapes, both same-direction bank_only+erp_only:
      - EXACT resolve_amount match — nets with no fee, like plain Link.
      - DEBIT only, bank_only up to FEE_LINK_MAX_AMOUNT higher than
        erp_only — nets with a real "Bank Charges" fee for the difference,
        like LinkResolveBankChargeView.
    Deliberately conservative, same philosophy as find_bank_charge_pairs: a
    standalone-resolved exception is only paired if it has exactly one
    viable unresolved candidate, AND that candidate has exactly one viable
    standalone-resolved partner in return — anything else is left alone and
    reported as ambiguous rather than guessed at.

    Returns (pairs, ambiguous):
      pairs      — list of (resolved_exc, unresolved_exc, fee_or_None) tuples
      ambiguous  — standalone-resolved exceptions with 0 or >1 viable candidates
    """
    standalone_resolved_qs = scoped_qs.filter(
        exception_type__in=('bank_only', 'erp_only'), resolved=True,
        netted_with__isnull=True, pending_bank_payment__isnull=True,
    ).select_related('reconciliation')
    bank_account_ids = set(
        standalone_resolved_qs.values_list('reconciliation__bank_account_id', flat=True)
    )

    def viable_candidates(resolved_exc, unresolved_pool):
        candidates = []
        for other in unresolved_pool:
            if other.exception_type == resolved_exc.exception_type:
                continue
            if other.direction != resolved_exc.direction:
                continue
            if resolved_exc.resolve_amount is None or other.resolve_amount is None:
                continue
            if resolved_exc.resolve_amount == other.resolve_amount:
                candidates.append((other, None))
                continue
            if resolved_exc.direction == 'DEBIT':
                fee = bank_charge_fee(resolved_exc, other)
                if fee is not None and fee <= FEE_LINK_MAX_AMOUNT:
                    candidates.append((other, fee))
        return candidates

    pairs, ambiguous = [], []
    for bank_account_id in bank_account_ids:
        standalone = list(standalone_resolved_qs.filter(reconciliation__bank_account_id=bank_account_id))
        unresolved = list(scoped_qs.filter(
            reconciliation__bank_account_id=bank_account_id,
            exception_type__in=('bank_only', 'erp_only'), resolved=False,
        ).select_related('reconciliation'))

        resolved_viable = {}
        unresolved_viable_count = {}
        for resolved_exc in standalone:
            viable = viable_candidates(resolved_exc, unresolved)
            resolved_viable[resolved_exc.id] = viable
            for other, _fee in viable:
                unresolved_viable_count[other.id] = unresolved_viable_count.get(other.id, 0) + 1

        for resolved_exc in standalone:
            viable = resolved_viable[resolved_exc.id]
            if len(viable) == 1 and unresolved_viable_count[viable[0][0].id] == 1:
                other, fee = viable[0]
                pairs.append((resolved_exc, other, fee))
            elif viable:
                ambiguous.append(resolved_exc)
            # No viable candidate at all: nothing to clean up, left alone —
            # not reported, since this is the ordinary/expected case for
            # the vast majority of legitimately standalone-resolved exceptions.

    return pairs, ambiguous


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


def ingest_reconciliation_transactions(bank_account, statement_file, parsed_transactions, *, include_debits, user):
    """
    Store `parsed_transactions` into ReconciliationBankTransaction (deduped
    by bank_ref), then create or re-run one DailyReconciliation per distinct
    date present in the transactions, dispatching
    banks.tasks.run_reconciliation_match for each — used by
    StatementUploadView.post after it has parsed the uploaded file.

    Returns (created, rerun, skipped_dates):
      created       — list of newly-created DailyReconciliation instances
      rerun         — list of existing DailyReconciliation instances re-run
      skipped_dates — list of ISO date strings whose reconciliation is
                      currently in flight ('processing') and was left alone
    """
    from .models import DailyReconciliation, ReconciliationBankTransaction

    # --- store parsed lines, deduped by (bank_account, bank_ref) ---
    for t in parsed_transactions:
        ReconciliationBankTransaction.objects.get_or_create(
            bank_account=bank_account,
            bank_ref=t.bank_ref,
            defaults={
                'value_date': t.value_date,
                'direction': t.direction,
                'amount': Decimal(t.amount),
                'narration': t.narration,
                'balance_after': Decimal(t.balance_after) if t.balance_after else None,
            },
        )

    # --- one DailyReconciliation per distinct date actually present in
    # the file — the whole point is the caller shouldn't have to know
    # or care whether this statement covers one day or thirty. A date
    # that already has a reconciliation is re-run (not skipped) — a
    # reconciled day is never really "closed": postings lag, and late-
    # arriving transactions must still be matchable against it. Only a
    # date whose reconciliation is *currently in flight* is skipped, to
    # avoid a racing duplicate task. ---
    dates = sorted({t.value_date for t in parsed_transactions})

    created = []
    rerun = []
    skipped_dates = []
    for d in dates:
        # .for_user(), not a plain .filter() — OwnerBranchManager's
        # default queryset relies on a thread-local tenant set by
        # middleware, which isn't reliably populated in time for a
        # DRF-authenticated request (see for_user()'s own docstring).
        # A plain .filter() here would risk not finding an existing
        # reconciliation and creating a duplicate instead of re-running it.
        existing = DailyReconciliation.objects.for_user(user).filter(
            bank_account=bank_account, reconciliation_date=d,
        ).first()

        candidates = list(ReconciliationBankTransaction.objects.filter(
            bank_account=bank_account,
            value_date=d,
            matched=False,
        ))

        # The same uploaded file is attached to every reconciliation
        # created from it; its stream must be rewound before each save
        # or every FileField after the first ends up empty.
        statement_file.seek(0)

        if existing is None:
            recon = DailyReconciliation.objects.create(
                bank_account=bank_account,
                reconciliation_date=d,
                uploaded_by=user,
                statement_file=statement_file,
                status='processing',
                total_bank_transactions=len(candidates),
                include_debits=include_debits,
                owner=user,
                branch=getattr(user, 'branch', None),
                # Explicit, not left to TimeStampedModel.save()'s
                # thread-local fallback — that fallback only fills in
                # when the middleware-set thread-local happens to be
                # populated in time, which isn't reliable for a
                # DRF-authenticated request. An unset tenant here would
                # make this row invisible to every tenant-scoped query
                # (including the list/detail views) forever.
                tenant=getattr(user, 'tenant', None),
            )
            run_reconciliation_match.delay(recon.id, include_debits)
            created.append(recon)
        elif existing.status == 'processing':
            skipped_dates.append(str(d))
        else:
            existing.uploaded_by = user
            existing.statement_file = statement_file
            existing.status = 'processing'
            existing.total_bank_transactions = len(candidates)
            existing.include_debits = include_debits
            existing.rerun_count = F('rerun_count') + 1
            existing.save(update_fields=[
                'uploaded_by', 'statement_file', 'status',
                'total_bank_transactions', 'include_debits', 'rerun_count', 'updated_at',
            ])
            run_reconciliation_match.delay(existing.id, include_debits)
            existing.refresh_from_db()
            rerun.append(existing)

    return created, rerun, skipped_dates


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
