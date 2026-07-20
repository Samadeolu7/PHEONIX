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
    via LinkResolveExceptionsView — one of:
      - both bank_only, OPPOSITE direction — the compensating-transfer/
        netting case (money left the account one way, e.g. sent to the
        wrong bank, and a manual transfer brought it back the other way).
      - one bank_only and one erp_only, SAME direction — the missed-
        auto-match case (the bank line and the ERP payment are very
        plausibly the same real transaction that just failed to fuzzy-match
        on reference/narration; both describe money moving the same way).
      - both erp_only, OPPOSITE direction — the internal-movement case: an
        ERP-side correction (e.g. a petty-cash relink) posts two opposite
        legs of the same amount against the bank's GL that net to zero, so
        NO bank statement line will ever exist for either. Found in
        production as an unlinkable stranded pair (a "Transfer: Reversal"
        CREDIT and its "relink" DEBIT, same amount, same day) that the old
        rules left permanently open.
    Same-direction erp_only+erp_only stays invalid (two payments out, or
    two in, don't cancel each other), and amount_diff is never linkable —
    it already has its own ERP-side match with a captured discrepancy, not
    a "no match at all" case. Amount equality (resolve_amount) is checked
    separately by the caller.
    """
    types = {exc_a.exception_type, exc_b.exception_type}
    if types == {'bank_only'} or types == {'erp_only'}:
        return exc_a.direction != exc_b.direction
    if types == {'bank_only', 'erp_only'}:
        return exc_a.direction == exc_b.direction
    return False


def phantom_transfer_transactions(exc_a, exc_b):
    """
    For a CROSS-bank-account erp_only+erp_only opposite-direction pair — a
    recorded inter-bank transfer where NEITHER leg appears in its bank
    statement (the movement never actually went through these banks) —
    returns the distinct underlying GL Transaction(s) that must be REVERSED
    when the pair is link-resolved, or raises ValidationError if the pair
    doesn't verifiably have that shape.

    Why reversal is mandatory here and not for the same-account pair: a
    same-account pair's two legs hit the SAME bank GL (one CR, one DR, same
    amount) and already net to zero, so resolving the exceptions is enough.
    A cross-account pair leaves EACH bank GL misstated by the amount — the
    "sending" GL shows money that never left, the "receiving" GL money that
    never arrived — so closing the exceptions without counter entries would
    freeze both GLs permanently out of step with the real banks.

    Verification (evidence-based, not assumed): each exception's own
    transaction must contain a GL entry that exactly mirrors that
    exception — on that exception's bank account's GL, on the expected side
    (DEBIT-direction exception = CR entry/money out; CREDIT = DR/money in),
    for exactly the exception's amount — and must be approved, un-reversed,
    and not itself a reversal. A transfer recorded as one transaction with
    both legs passes both checks and is returned once; two separately
    recorded transactions are each validated and both returned.
    """
    from django.core.exceptions import ValidationError

    from transactions.models import Transaction, TransactionEntry

    txns = {}
    for exc in (exc_a, exc_b):
        if not exc.loan_payment_id:
            raise ValidationError(
                'Both exceptions must reference their recorded ERP transaction to be '
                'resolved as a phantom transfer.'
            )
        txn = Transaction.objects.filter(pk=exc.loan_payment_id).first()
        if txn is None:
            raise ValidationError(f'ERP transaction {exc.loan_payment_id} no longer exists.')
        if txn.is_reversal:
            raise ValidationError(f'{txn.reference_number} is itself a reversal and cannot be reversed again.')
        if txn.is_reversed:
            raise ValidationError(f'{txn.reference_number} has already been reversed.')
        if not txn.approved:
            raise ValidationError(f'{txn.reference_number} is not approved — nothing posted to correct.')

        gl_account_id = exc.reconciliation.bank_account.gl_account_id
        expected_side = TransactionEntry.CREDIT if exc.direction == 'DEBIT' else TransactionEntry.DEBIT
        mirrors = txn.entries.filter(
            account_id=gl_account_id, side=expected_side, amount=exc.resolve_amount,
        ).exists()
        if not mirrors:
            raise ValidationError(
                f'{txn.reference_number} has no {"credit" if expected_side == TransactionEntry.CREDIT else "debit"} '
                f'entry of ₦{exc.resolve_amount} against {exc.reconciliation.bank_account} — this pair '
                f'does not verifiably describe that transfer, so it needs manual review instead.'
            )
        txns[txn.pk] = txn

    # Transaction.reverse() is a pure-GL operation: it restores ledger
    # balances but knows nothing about domain records. A loan repayment's
    # schedule installments, a loan's balance, a savings account's
    # passbook balance all live OUTSIDE the GL and would be left saying
    # "paid"/"received" for money that never moved — the loans module has
    # its own LoanCorrection workflow (dual-approval, reversal +
    # re-disbursement) for exactly that reason. So auto-reversal here is
    # confined to transactions whose entries touch ONLY bank GL accounts —
    # the pure inter-bank movement shape, where the journal entry IS the
    # whole story. Anything else must go through its own module's
    # correction flow.
    from .models import BankAccount

    bank_gl_ids = set(
        BankAccount.objects.filter(gl_account_id__isnull=False).values_list('gl_account_id', flat=True)
    )
    for txn in txns.values():
        non_bank = [e for e in txn.entries.select_related('account') if e.account_id not in bank_gl_ids]
        if non_bank:
            names = ', '.join(sorted({e.account.name for e in non_bank}))
            raise ValidationError(
                f'{txn.reference_number} also posts to non-bank ledgers ({names}) — e.g. a loan '
                f'repayment or savings movement. Reversing only the GL here would leave those '
                f'records out of step with the money; correct it through its own module '
                f'(e.g. Loan Correction) instead.'
            )

    return list(txns.values())


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
      ambiguous  — list of (resolved_exc, [(candidate_exc, fee_or_None), ...])
                   tuples — standalone-resolved exceptions with >1 viable
                   candidate, each with the full candidate list so a director
                   can review and manually pick the right one (see
                   BulkCleanUpStrandedPairsView's dry-run response)
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
                ambiguous.append((resolved_exc, viable))
            # No viable candidate at all: nothing to clean up, left alone —
            # not reported, since this is the ordinary/expected case for
            # the vast majority of legitimately standalone-resolved exceptions.

    return pairs, ambiguous


def find_unexplained_erp_only_by_officer(scoped_qs):
    """
    Groups unresolved erp_only exceptions that have NO plausible bank_only
    counterpart anywhere on their bank account — same candidate shapes as
    find_bank_charge_pairs/find_stranded_resolved_pairs (exact resolve_amount
    match, or DEBIT bank_only up to FEE_LINK_MAX_AMOUNT higher) — by the
    officer who recorded them, for BulkCreateOfficerEvidenceThreadsView.

    Deliberately excludes anything an ambiguous/exact/fee-tolerant pair would
    cover: those already have real bank money sitting nearby and just need a
    human (or Clean Up) to match them, which isn't evidence of a missing
    payment. What's left after excluding those is the set genuinely worth an
    evidence request — no bank-side transaction found anywhere close.

    Unattributed exceptions (officer is None) are always excluded — there is
    no user to address a thread to; those need the attribution backfill
    work instead (see backfill_exception_officer_attribution).

    Returns a dict keyed by officer_id: {'officer': User, 'exceptions': [...]}.
    """
    erp_only_qs = scoped_qs.filter(
        exception_type='erp_only', resolved=False, officer__isnull=False,
    ).select_related('officer', 'officer__branch', 'reconciliation')

    bank_account_ids = set(erp_only_qs.values_list('reconciliation__bank_account_id', flat=True))
    bank_onlys_by_account = {
        bank_account_id: list(scoped_qs.filter(
            reconciliation__bank_account_id=bank_account_id,
            exception_type='bank_only', resolved=False,
        ))
        for bank_account_id in bank_account_ids
    }

    result = {}
    for erp_exc in erp_only_qs:
        bank_onlys = bank_onlys_by_account.get(erp_exc.reconciliation.bank_account_id, [])
        has_candidate = False
        for bank_exc in bank_onlys:
            if bank_exc.direction != erp_exc.direction:
                continue
            if bank_exc.resolve_amount == erp_exc.resolve_amount:
                has_candidate = True
                break
            if erp_exc.direction == 'DEBIT':
                fee = bank_charge_fee(bank_exc, erp_exc)
                if fee is not None and fee <= FEE_LINK_MAX_AMOUNT:
                    has_candidate = True
                    break
        if not has_candidate:
            bucket = result.setdefault(erp_exc.officer_id, {'officer': erp_exc.officer, 'exceptions': []})
            bucket['exceptions'].append(erp_exc)

    return result


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

    from .models import ReconciliationException

    if not bank_account.gl_account_id:
        return []  # no GL account linked — nothing to reconcile against

    # A repayment debits the receiving account (asset increase); a
    # disbursement/expense/withdrawal credits it (asset decrease).
    side = TransactionEntry.DEBIT if direction == 'CREDIT' else TransactionEntry.CREDIT

    # Fee payments created by the bank-charge Link pathway
    # (_resolve_bank_charge_pair, banks/views.py — pending_bank_payment set
    # AND netted_with set) must never enter the candidate pool: their fee
    # was embedded inside the bigger bank line the link already consumed,
    # so no separate statement line for the fee exists or ever will — every
    # rerun would otherwise resurface them as false erp_only exceptions.
    # Resolve-to-expense payments (pending_bank_payment set, netted_with
    # None) are deliberately NOT excluded — their bank line is still
    # unmatched and the payment must be offered so the match can close it.
    fee_link_txn_ids = ReconciliationException.objects.filter(
        pending_bank_payment__isnull=False,
        netted_with__isnull=False,
        pending_bank_payment__journal_entry_id__isnull=False,
    ).values_list('pending_bank_payment__journal_entry_id', flat=True)

    entries = (
        TransactionEntry.objects
        .filter(
            account_id=bank_account.gl_account_id,
            side=side,
            transaction__date__range=(date_from, date_to),
            transaction__approved=True,
            transaction__is_deleted=False,
            # A reversed transaction and its reversal cancel each other on
            # the GL — neither should expect a bank statement line, so
            # offering either to Java only mints phantom erp_only
            # exceptions (confirmed with the phantom-transfer link flow,
            # whose Transaction.reverse() posts approved counter entries
            # against both bank GLs that would otherwise resurface as two
            # brand-new exceptions on the very next rerun). A bank line
            # already matched to a later-reversed transaction keeps its
            # match — this only shapes the future candidate pool.
            transaction__is_reversed=False,
            transaction__is_reversal=False,
        )
        .exclude(transaction_id__in=exclude_payment_ids)
        .exclude(transaction_id__in=fee_link_txn_ids)
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

    If the found row was previously auto-resolved (e.g. by a later rerun that
    matched this bank line), it is reopened so the exception reappears in the
    exception pool and becomes a valid link candidate again.

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
    if not _created and exc_obj.resolved:
        exc_obj.resolved = False
        exc_obj.save(update_fields=['resolved'])
    return exc_obj
