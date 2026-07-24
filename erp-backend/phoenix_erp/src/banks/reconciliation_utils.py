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

from .tasks import run_pool_reconciliation_match

_LOAN_NUMBER_RE = re.compile(r'Loan repayment\s*[–-]\s*([^|]+)')
_BANK_REFERENCE_RE = re.compile(r'\|\s*Ref:\s*(.+)$')

# Tokens this short ("FIP", "CHARGES", "Transfer") recur across dozens of
# unrelated transactions and would make every same-amount coincidence look
# like a match — 8+ chars is long enough to only really match on an actual
# shared transaction id / reference number (mirrors Bank-Recon's own
# BankReferenceMatcher.TOKEN, minus its 5-char floor, which is too loose for
# this narration-vs-narration comparison rather than reference-vs-narration).
#
# Length alone isn't enough, though: found in production generating exactly
# the noise this exists to avoid — "CPWInward" (9 chars) and "repayment"
# (9 chars) are structural boilerplate that recurs across every inward-
# transfer narration or every loan-repayment description respectively, not
# a genuine shared identifier between two specific transactions. A real
# bank transaction id/reference number is overwhelmingly digits (the
# examples that DID matter — "166034176614", "100004260722085236..." — are
# all-digit or digit-dominant), so a token only counts as a shared
# identifier if most of it is digits.
_LONG_TOKEN_RE = re.compile(r'[A-Za-z0-9]{8,}')
_MIN_DIGITS_IN_TOKEN = 6


def _long_tokens(text):
    return {
        t.upper() for t in _LONG_TOKEN_RE.findall(text or '')
        if sum(c.isdigit() for c in t) >= _MIN_DIGITS_IN_TOKEN
    }


def extract_embedded_reference(description):
    """
    Returns the trimmed "Ref: ..." fragment LoanAccount.record_payment()
    embeds in a Transaction.description (see _BANK_REFERENCE_RE), or None
    if the description has no such segment at all.
    """
    match = _BANK_REFERENCE_RE.search(description or '')
    return match.group(1).strip() if match else None


def _normalized_for_reference_compare(text):
    """
    Uppercase + collapse every run of whitespace to a single space.

    Bank narrations routinely pad with double spaces ("EPHRAIM DEE  Trf
    for Custo", "SERAH OLALEYE  /...") while the same text stored into a
    Transaction.description's "| Ref:" segment comes back with runs
    collapsed — an exact substring test then reports a perfectly correct
    match as a mismatch on nothing but a swallowed space. Found live: a
    find_reference_mismatched_matches run flagged dozens of correct
    matches whose embedded reference differed from the bank narration
    only by consecutive-whitespace collapsing.
    """
    return re.sub(r'\s+', ' ', (text or '')).upper()


# Words that appear in the reference/narration of nearly every transaction
# on these bank feeds — channel prefixes, the institution's own name,
# transfer-speak. Never evidence that two specific transactions correspond.
# Mirrors Bank-Recon's BankReferenceMatcher.STRUCTURAL_TOKENS.
_REF_STRUCTURAL_TOKENS = frozenset({
    'CPWINWARD', 'INWARD', 'TRANSFER', 'KRYSTAR', 'TRUST', 'INVESTMENT',
    'INVESTMEN', 'LIMITED', 'CUSTO', 'CUSTOM', 'CUSTOMER', 'MONIEPOINT',
    'USSD', 'MOBILE', 'PAYMENT', 'REPAYMENT', 'KRYSTA', 'FROM',
})
_REF_WORD_RE = re.compile(r'[A-Za-z0-9]{4,}')


def _reference_found_in(embedded_ref, haystack):
    """
    True if `embedded_ref` corresponds to `haystack` (both already
    whitespace-normalized/uppercased by the callers below): either as a
    verbatim substring, or — failing that — every meaningful word of the
    reference individually present. The fallback exists because officers
    often type the customer's name as the reference in a different order
    than the bank prints it ("Adewola Adeife Roseline" vs narration
    "ROSELINE ADEIFE ADEWOLA") or with connective prefixes the bank
    doesn't use ("TRF FRM MAMUDU TAIBAT" vs "FROM MAMUDU TAIBAT") — the
    same customer, not a mismatch. Structural boilerplate words are
    excluded so a reference consisting of nothing but them never matches.
    """
    if embedded_ref in haystack:
        return True
    meaningful = [
        w for w in _REF_WORD_RE.findall(embedded_ref)
        if w not in _REF_STRUCTURAL_TOKENS
    ]
    if not meaningful:
        return False
    return all(w in haystack for w in meaningful)


def reference_mismatches_bank_line(tx, payment):
    """
    True if `payment` (a transactions.Transaction) has an explicit embedded
    bank reference that does NOT appear anywhere in `tx`'s (a
    ReconciliationBankTransaction) own bank_ref/narration — the Django-side
    equivalent of Bank-Recon's BankReferenceMatcher.tier() scoring NONE for
    this pair. Used to verify an ALREADY-committed match after the fact
    (find_reference_mismatched_matches, unmatch_recent_reference_mismatches).

    Returns False (no mismatch) when there's no embedded reference to check
    at all — absence of a reference is not evidence of a wrong match, only
    an explicit contradiction is. Comparison is whitespace-normalized —
    see _normalized_for_reference_compare.
    """
    embedded_ref = extract_embedded_reference(payment.description)
    if not embedded_ref:
        return False
    haystack = _normalized_for_reference_compare(f'{tx.bank_ref or ""} {tx.narration or ""}')
    return not _reference_found_in(_normalized_for_reference_compare(embedded_ref), haystack)


def reference_confirms_bank_line(tx, payment):
    """
    True only when `payment` has an explicit embedded bank reference AND
    that reference actually appears in `tx`'s own bank_ref/narration — a
    positive confirmation, not merely the absence of a contradiction (see
    reference_mismatches_bank_line, which returns False in both the
    "confirmed" and "nothing to check" cases). Used to pick the genuinely
    correct claimant out of a group of bank lines all pointing at the same
    ERP payment (find_duplicate_claimed_payments /
    unmatch_duplicate_claimed_payments) — an absent reference can't settle
    which of several claimants is right, so this only counts a real match.
    Comparison is whitespace-normalized — see
    _normalized_for_reference_compare.
    """
    embedded_ref = extract_embedded_reference(payment.description)
    if not embedded_ref:
        return False
    haystack = _normalized_for_reference_compare(f'{tx.bank_ref or ""} {tx.narration or ""}')
    return _reference_found_in(_normalized_for_reference_compare(embedded_ref), haystack)


def _bank_line_reference_token_in_erp_text(tx, erp_text):
    """
    Reverse direction: a digit-dominant id token from the BANK LINE itself
    (bank_ref/narration) appearing verbatim in the ERP payment's own text —
    the mirror of the forward reference check, for a payment with no
    "| Ref:" segment whose description doesn't wholly correspond to the
    line's narration word-for-word. Found live: an expense entry described
    "Bank Payment: EXP-2026-000018 - FIP CHARGES Ref002278932824" against
    bank line "FIP CHARGES Ref002278932824" — same amount, same unique
    reference, but the description-as-a-whole check failed on "BANK",
    "PAYMENT", "EXP", "000018" not being in the (much shorter) bank
    narration. Restricted to _long_tokens' digit-dominant ids only —
    letting names/boilerplate flow this way would reopen the structural-
    token hole reference_confirms_bank_line's forward check closes.
    Mirrors Bank-Recon's BankReferenceMatcher.tier() reverse branch.
    """
    tokens = _long_tokens(f'{tx.bank_ref or ""} {tx.narration or ""}')
    if not tokens:
        return False
    haystack = (erp_text or '').upper()
    return any(t in haystack for t in tokens)


# Pure letters only (no digits at all) — deliberately a DIFFERENT
# extraction from _REF_WORD_RE (which is alnum and feeds the existing,
# already-deployed reference_confirms_bank_line/reference_mismatches_
# bank_line — left untouched here to avoid touching their tested
# behavior). A name-vs-name contradiction must be judged on actual name
# text, never on a shared/unshared digit blob: found live, "CPWInward:
# 100004260720134408165871030330/GOD IS GO" against "Transfer: God is
# good" was wrongly ruled CONTRADICTED, because the only "words" the old
# alnum extraction found on the bank side were the structural "CPWInward"
# token and the long digit blob itself — neither is a name, but the digit
# blob still counted as "a meaningful word" with nothing to match on the
# erp side, forcing a false conflict verdict. Every bank narration on
# this feed embeds a transaction-timestamp-derived digit run of this kind
# (varying length, multiple channel prefixes — CPWInward/ISW/FIP/QS894 —
# so no single fixed prefix could be stripped instead); excluding ALL
# digits from the name-comparison words, generally, is what actually
# closes this rather than special-casing one prefix string.
_NAME_WORD_RE = re.compile(r'[A-Za-z]{4,}')


def narration_relationship(bank_text, erp_text):
    """
    Tri-state read on whether two pieces of free text (a bank line's own
    narration and an ERP payment's narration/description — NOT restricted
    to an embedded "| Ref:" segment, unlike the stricter helpers above)
    look like the same real-world event, for callers that want a soft
    preference/safety-net rather than a hard verification gate:

      'CONFIRMED'    — they share a meaningful NAME word or a digit-
                       dominant id token (positive evidence of
                       correspondence — either is enough on its own).
      'CONTRADICTED' — both sides have at least one identifiable NAME
                       word, and they share NONE at all — positive
                       evidence they name two different things (e.g. bank
                       narration says "KAFILAT A", payment narration says
                       "MARVELLOU" — different customers, different
                       transactions). A shared/unshared digit token is
                       NEVER enough on its own to call this — see
                       _NAME_WORD_RE's docstring for why.
      'NEUTRAL'      — not enough identifiable name text on one or both
                       sides to say anything either way (e.g. one side is
                       blank, or all its words are structural boilerplate
                       or bare transaction-id digits).

    Built for bulk_match_by_amount_and_date: an amount+date-only bulk
    match is deliberately allowed to proceed on a NEUTRAL pair (that's the
    whole point of the tool), but a CONTRADICTED pair — two specific,
    named, different things — should never be silently paired just
    because they happen to share an amount and land near each other in
    time.
    """
    bank_norm = _normalized_for_reference_compare(bank_text)
    erp_norm = _normalized_for_reference_compare(erp_text)
    bank_names = {w for w in _NAME_WORD_RE.findall(bank_norm) if w not in _REF_STRUCTURAL_TOKENS}
    erp_names = {w for w in _NAME_WORD_RE.findall(erp_norm) if w not in _REF_STRUCTURAL_TOKENS}
    bank_tokens = _long_tokens(bank_text)
    erp_tokens = _long_tokens(erp_text)

    if (bank_names & erp_names) or (bank_tokens & erp_tokens):
        return 'CONFIRMED'
    if bank_names and erp_names:
        return 'CONTRADICTED'
    return 'NEUTRAL'


def match_is_reference_and_amount_verified(tx, payment):
    """
    The director's auto-match acceptance policy, checkable after the fact:
    a committed match only counts as verified when the AMOUNT genuinely
    corresponds (the claimed payment is approved, not deleted, and has an
    entry on this line's own GL account at exactly this line's amount —
    claimed_payment_visible_in_trace) AND the REFERENCE genuinely
    corresponds:

      - if the payment embeds an explicit "| Ref:" reference, that
        reference must appear in the line (reference_confirms_bank_line,
        whitespace-normalized with token-subset fallback);
      - if it doesn't (savings deposits/transfers whose description IS the
        raw narration, or a name-only description), any of: the payment's
        own description corresponds to the line the same way; one of them
        is a literal, contiguous substring of the other (either direction —
        e.g. BankPayment.post_payment() builds an expense description as
        "Bank Payment: {ref} - " + the bank narration verbatim, so the
        line's whole narration is embedded in the payment's, not the other
        way the word-subset check above assumes); or — a further fallback —
        a digit-dominant id token from the LINE's own narration appears
        verbatim inside the payment's description
        (_bank_line_reference_token_in_erp_text).

    Anything else — amount+date coincidences, tolerance matches, fuzzy
    guesses — is unverified: Bank-Recon no longer auto-commits such pairs
    (MatchScorer's autoCommitEligible), and unmatch_unverified_matches
    frees the historical ones so only reference+amount-verified matches
    remain in the books.
    """
    if payment is None or not claimed_payment_visible_in_trace(tx):
        return False
    embedded_ref = extract_embedded_reference(payment.description)
    if embedded_ref:
        return reference_confirms_bank_line(tx, payment)
    description = _normalized_for_reference_compare(payment.description)
    if not description:
        return False
    haystack = _normalized_for_reference_compare(f'{tx.bank_ref or ""} {tx.narration or ""}')
    if _reference_found_in(description, haystack):
        return True
    # Reverse containment — mirrors Bank-Recon's FuzzyReferenceMatcher
    # containment check (MIN_CONTAINMENT_LENGTH=10 there too). Narration
    # only, not narration+bank_ref like `haystack` above: bank_ref is a
    # separate identifier field that was never part of the descriptive
    # text a director's post_payment() copies verbatim, so including it
    # here would break the containment check on its own prefix.
    narration_only = _normalized_for_reference_compare(tx.narration or '')
    if len(narration_only) >= 10 and narration_only in description:
        return True
    return _bank_line_reference_token_in_erp_text(tx, payment.description)


def find_duplicate_claimed_payments():
    """
    Returns {payment_id: [ReconciliationBankTransaction, ...]} for every ERP
    payment currently claimed (matched=True, matched_erp_payment_id set) by
    more than one bank line at once — structurally impossible under one-to-
    one matching, yet possible in practice because matched_erp_payment_id is
    a plain IntegerField with no DB-level uniqueness guard, and
    run_reconciliation_match's locking only covers the DailyReconciliation
    row itself, not the ERP payment side (see banks/tasks.py's persist-time
    race guard, added after this was confirmed live: 21 payments each
    claimed by 2-3 different bank lines simultaneously).
    """
    from collections import defaultdict

    from django.db.models import Count

    from .models import ReconciliationBankTransaction

    dupe_ids = (
        ReconciliationBankTransaction.objects.filter(
            matched=True, matched_erp_payment_id__isnull=False,
        )
        .values('matched_erp_payment_id')
        .annotate(n=Count('id'))
        .filter(n__gt=1)
        .values_list('matched_erp_payment_id', flat=True)
    )
    dupe_ids = list(dupe_ids)
    if not dupe_ids:
        return {}

    groups = defaultdict(list)
    for tx in (
        ReconciliationBankTransaction.objects.filter(
            matched=True, matched_erp_payment_id__in=dupe_ids,
        ).select_related('bank_account').order_by('value_date')
    ):
        groups[tx.matched_erp_payment_id].append(tx)
    return dict(groups)


def claimed_payment_visible_in_trace(tx):
    """
    True if tx.matched_erp_payment_id points to a Transaction that would
    actually appear in PaymentTraceView's own "payments" search (banks/
    views.py) for tx's own amount — i.e. approved, not deleted, with an
    entry on tx's bank account's GL account AND an entry equal to tx.amount.

    This is the precise, general (non-search-specific) replica of what
    Payment Trace's frontend actually checks (PaymentTracePage.tsx's
    unattachedLines filter: !line.matched_erp_payment_id ||
    !paymentIds.has(line.matched_erp_payment_id)) — a currently matched=True
    line whose claim fails this predicate is exactly the "double blocking"
    shape spotted live: it shows as Matched, yet also surfaces under
    Payment Trace's own Unattached Statement Lines panel for any search on
    its amount, because the payment it claims would never come back from
    that search itself. Since matched_erp_payment_id is a plain IntegerField
    (not a real FK — nothing clears it automatically), the most likely
    cause is the claimed Transaction having since been corrected/deleted/
    unapproved while the stale reference on the bank line was never
    updated.

    Returns True (visible — not disqualified) when there's no
    matched_erp_payment_id at all, since there's nothing to check.
    """
    from transactions.models import Transaction

    if tx.matched_erp_payment_id is None:
        return True
    gl_account_id = tx.bank_account.gl_account_id
    if not gl_account_id:
        return True  # nothing to check against — never flag on a data gap
    return Transaction.objects.filter(
        id=tx.matched_erp_payment_id, approved=True, is_deleted=False,
        entries__account_id=gl_account_id,
    ).filter(entries__amount=tx.amount).exists()

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


def find_same_amount_erp_candidates(tx, window_days=None):
    """
    Returns ERP payments with EXACTLY tx.amount, within ±window_days of
    tx.value_date on tx.bank_account, excluding payments some OTHER
    currently-matched bank line already claims — i.e. the same candidate
    pool run_pool_reconciliation_match would offer Java for this line,
    filtered down to an exact amount match.

    Shared by audit_unattached_statement_lines (report-only) and
    confirm_unambiguous_ghost_matches (which acts on a len()==1 result) so
    both tools agree on exactly what counts as a "candidate" — a command
    that DECIDES to auto-commit a match must search with identical logic
    to the command that only REPORTS how many candidates exist, or the two
    could disagree about which lines are actually unambiguous.

    window_days defaults to RECONCILIATION_MATCH_WINDOW_DAYS (the same
    setting run_pool_reconciliation_match itself uses) when not given.
    """
    from datetime import timedelta

    from django.conf import settings

    from .models import ReconciliationBankTransaction

    if window_days is None:
        window_days = getattr(settings, 'RECONCILIATION_MATCH_WINDOW_DAYS', 7)

    window_start = tx.value_date - timedelta(days=window_days)
    window_end = tx.value_date + timedelta(days=window_days)
    already_matched_ids = list(
        ReconciliationBankTransaction.objects.filter(
            bank_account_id=tx.bank_account_id,
            matched=True,
            matched_erp_payment_id__isnull=False,
        ).values_list('matched_erp_payment_id', flat=True)
    )
    direction = 'CREDIT' if tx.direction == 'CREDIT' else 'DEBIT'
    payments = fetch_erp_payments(
        tx.bank_account, window_start, window_end,
        direction=direction, exclude_payment_ids=already_matched_ids,
    )
    return [p for p in payments if Decimal(p['amount']) == tx.amount]


def find_occupied_erp_candidates(tx, window_days=None):
    """
    Same search as find_same_amount_erp_candidates, but WITHOUT excluding
    payments some other currently-matched line already claims — then
    returns only the ones THAT other line is occupying (the ones excluded
    from the normal candidate pool for exactly that reason).

    This is the "the correct payment wasn't showing up as a link candidate
    because it was already matched to something else" case: a bank line
    with zero normal candidates may still have its true counterpart sitting
    right there, just currently held by a different (possibly wrongly-
    matched) bank transaction. Surfacing it requires a second, unrestricted
    search — find_same_amount_erp_candidates deliberately can't do this
    itself, since every other caller (audit_unattached_statement_lines,
    confirm_unambiguous_ghost_matches) needs the exclusion to stay accurate
    about what Java would actually be offered.

    Same amount alone is far too weak a filter once there's any volume of
    recurring identical-amount transactions (daily bank charges, round-
    number thrift contributions) — confirmed live: a single ₦2,000 line
    "conflicted" with 29 completely unrelated payments. Results are
    therefore additionally required to share a long (8+ char) alphanumeric
    token between tx's own narration and the candidate payment's narration/
    embedded reference — in practice, an actual shared transaction id or
    name fragment, not a coincidental amount. This mirrors why Bank-Recon's
    own BankReferenceMatcher treats a verbatim reference hit as authoritative
    over amount+date (see MatchScorer.java): a short shared word ("FIP",
    "CHARGES", "Transfer") recurs across dozens of unrelated rows and proves
    nothing, but a matching transaction-id-length token essentially never
    collides by chance.

    Returns a list of (payment_dict, occupying_tx) tuples — occupying_tx is
    the ReconciliationBankTransaction currently holding that payment, so a
    human can judge whether ITS match is the wrong one and should be freed
    (see unmatch_transaction_by_id) before this line can claim it instead.
    """
    from datetime import timedelta

    from django.conf import settings

    from .models import ReconciliationBankTransaction

    if window_days is None:
        window_days = getattr(settings, 'RECONCILIATION_MATCH_WINDOW_DAYS', 7)

    window_start = tx.value_date - timedelta(days=window_days)
    window_end = tx.value_date + timedelta(days=window_days)
    direction = 'CREDIT' if tx.direction == 'CREDIT' else 'DEBIT'

    unrestricted = fetch_erp_payments(
        tx.bank_account, window_start, window_end,
        direction=direction, exclude_payment_ids=(),
    )
    same_amount = [p for p in unrestricted if Decimal(p['amount']) == tx.amount]
    normally_available_ids = {p['paymentId'] for p in find_same_amount_erp_candidates(tx, window_days)}

    occupying_txs = {
        occ.matched_erp_payment_id: occ
        for occ in ReconciliationBankTransaction.objects.filter(
            bank_account_id=tx.bank_account_id,
            matched=True,
            matched_erp_payment_id__in=[
                p['paymentId'] for p in same_amount if p['paymentId'] not in normally_available_ids
            ],
        ).exclude(pk=tx.pk)
    }

    tx_tokens = _long_tokens(tx.narration) | _long_tokens(tx.bank_ref)

    results = []
    for p in same_amount:
        if p['paymentId'] not in occupying_txs:
            continue
        payment_tokens = _long_tokens(p.get('narration')) | _long_tokens(p.get('bankReference'))
        if tx_tokens & payment_tokens:
            results.append((p, occupying_txs[p['paymentId']]))
    return results


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
    date present in the transactions — used by StatementUploadView.post
    after it has parsed the uploaded file. Every touched row flips to
    status='processing' synchronously here (the frontend polls on this),
    but only ONE banks.tasks.run_pool_reconciliation_match is dispatched
    for the whole upload (this function is already scoped to a single
    bank_account) rather than one per date — the pool task re-queries
    which rows are actually processing once it holds that account's lock,
    so it doesn't matter that multiple dates were flipped before it runs.

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
            existing.refresh_from_db()
            rerun.append(existing)

    if created or rerun:
        run_pool_reconciliation_match.delay(bank_account.id)

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


def get_or_create_erp_only_exception(recon, tx):
    """
    Ensure an ``erp_only`` ReconciliationException exists for ``tx``'s
    matched ERP payment against ``recon`` — natural-key dedup on
    (reconciliation, exception_type, loan_payment_id).

    If the found row was previously resolved, it is reopened.  If it was
    link-resolved (``netted_with`` set), the link is broken on both sides
    so neither exception is stuck in an unresolved-but-linked state.

    If no erp_only exception exists (e.g. the ERP payment's date had no
    DailyReconciliation when ``_persist_outcome`` ran), one is created
    using Transaction details.

    Used by ``ReconciliationBankTransaction.unmatch()`` so the ERP payment
    reappears as a link candidate immediately.
    """
    from .models import ReconciliationException
    from transactions.models import Transaction, TransactionEntry

    if tx.matched_erp_payment_id is None:
        return None

    exc_obj, created = ReconciliationException.objects.get_or_create(
        reconciliation=recon,
        exception_type='erp_only',
        loan_payment_id=tx.matched_erp_payment_id,
        defaults={
            'direction': tx.direction,
            'bank_transaction_id': tx.id,
            'bank_amount': tx.amount,
            'bank_narration': tx.narration,
            'bank_date': tx.value_date,
            'loan_payment_id': tx.matched_erp_payment_id,
            'is_high_priority': True,
        },
    )

    save_fields = []

    if created:
        txn = Transaction.objects.filter(
            id=tx.matched_erp_payment_id,
            is_deleted=False,
        ).select_related('created_by', 'created_by__branch').first()
        if txn:
            entry = TransactionEntry.objects.filter(transaction=txn).first()
            exc_obj.erp_amount = entry.amount if entry else None
            exc_obj.erp_narration = (txn.description or '')[:500]
            exc_obj.erp_date = txn.date
            exc_obj.officer = txn.created_by
            exc_obj.erp_branch = getattr(txn.created_by, 'branch', None)
            save_fields.extend([
                'erp_amount', 'erp_narration', 'erp_date', 'officer', 'erp_branch',
            ])
    elif exc_obj.resolved:
        exc_obj.resolved = False
        save_fields.append('resolved')

    if exc_obj.netted_with_id:
        partner_id = exc_obj.netted_with_id
        exc_obj.netted_with = None
        save_fields.append('netted_with')
        ReconciliationException.objects.filter(
            pk=partner_id, netted_with=exc_obj,
        ).update(netted_with=None)

    if save_fields:
        exc_obj.save(update_fields=save_fields)

    return exc_obj
