"""
Reconciliation resolution cases — maker (officer / branch manager) →
checker (branch manager recommends) → final approval (director).

See ReconciliationResolution (banks/models.py) for the lifecycle. Rules here:

  * Nothing touches reconciliation state until a director approves, and
    every matching rule is re-checked at that moment, not only at propose.
  * Proposer, reviewer and approver are three different people; the
    officer who posted the ERP payment can never review or approve it.
  * Officers below branch manager may only propose for ERP payments they
    posted themselves.
  * Disputes need the reference / session ID from the client's transfer
    receipt (checked automatically against the bank line; a receipt upload
    is optional), notify the officer whose payment currently holds the bank
    line, and can't be approved until that officer answers or 24h pass.
  * A director can reject at any open stage, and dissolve an approved
    link/dispute if it later looks dubious.
"""
import logging
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace

from django.core.exceptions import ValidationError
from django.db import transaction as db_transaction
from django.db.models import Q
from django.utils import timezone

from common.approval_permissions import can_user_approve, can_user_edit

from .models import (
    DailyReconciliation,
    ReconciliationBankTransaction,
    ReconciliationException,
    ReconciliationResolution as Case,
)
from .reconciliation_utils import MIN_REASON_LENGTH, reason_too_short
from .officer_attribution import payment_officer

logger = logging.getLogger(__name__)

PERMISSION_MODULE = 'banks'
PERMISSION_PAGE = 'bank-reconciliation-exceptions'
CLEAN_MAX_DATE_GAP_DAYS = 2


# ── Who is who ───────────────────────────────────────────────────────────────

def is_recon_manager(user):
    """
    Branch manager or above for reconciliation.

    Primarily the page grant that set_bank_recon_resolve_policy gives branch
    managers (edit) and directors/principals (approve), configurable in
    Permission Setup. That command is run by hand, so a tenant where it never
    ran would otherwise treat real branch managers as officers — so also
    accept the same role-name rule the command uses ("branch manager"), plus
    owners and global-scope (director) roles.
    """
    if can_user_edit(user, module=PERMISSION_MODULE, page=PERMISSION_PAGE) or \
            can_user_approve(user, module=PERMISSION_MODULE, page=PERMISSION_PAGE):
        return True
    if callable(getattr(user, 'is_owner', None)) and user.is_owner():
        return True
    try:
        for name, scope in user.roles.filter(is_active=True).values_list('name', 'default_scope'):
            lowered = (name or '').lower()
            if scope == 'global' or 'branch manager' in lowered or 'branch_manager' in lowered:
                return True
    except Exception:
        pass
    return False


def is_recon_director(user):
    return bool(can_user_approve(user, module=PERMISSION_MODULE, page=PERMISSION_PAGE))


def _display(user):
    if not user:
        return None
    return user.get_full_name() or getattr(user, 'username', None) or getattr(user, 'email', '')


def _normalize_ref(text):
    """Letters/digits only, lower-case — receipts and statements format
    references differently (spaces, dashes, slashes)."""
    return ''.join(ch for ch in (text or '').lower() if ch.isalnum())


def _require_reason(text, what):
    if reason_too_short(text):
        raise ValidationError(f'{what} is required (at least {MIN_REASON_LENGTH} characters).')


# ── Scoping ──────────────────────────────────────────────────────────────────

def visible_exception_filter(user, header_branch=None):
    """
    Which reconciliation exceptions belong to this user's branch(es).

    A bank line belongs to the branch that owns the bank ACCOUNT (its
    reconciliation's branch). A "Recorded, not in bank" payment belongs to
    the branch of the LOAN it was posted for (the repayment Transaction's
    branch) — and also to the bank account's branch, since that's whose
    statement it is missing from. Without the loan-branch half, a branch
    whose repayment was posted into another branch's bank account never
    sees its own gap.

    Branch scope itself comes from for_user (own branch + temporary grants;
    directors/owners see every branch), optionally narrowed by a director's
    topbar branch.
    """
    from transactions.models import Transaction

    recons = DailyReconciliation.objects.for_user(user)
    # Branchless payments fall back to the bank account's branch only, so
    # they don't leak to every branch's managers.
    payments = Transaction.objects.for_user(user).exclude(branch__isnull=True)
    if header_branch is not None:
        recons = recons.filter(branch=header_branch)
        payments = payments.filter(branch=header_branch)
    return Q(reconciliation__in=recons) | Q(
        exception_type='erp_only', loan_payment_id__in=payments.values('id'),
    )


def scoped_exceptions(user, header_branch=None):
    """Exceptions this user may see — see visible_exception_filter."""
    return ReconciliationException.objects.filter(visible_exception_filter(user, header_branch))


def payment_branch_map(payment_ids):
    """{transaction id: (branch_id, branch_name)} for repayment transactions."""
    from transactions.models import Transaction

    ids = [i for i in set(payment_ids) if i]
    if not ids:
        return {}
    return {
        row['id']: (row['branch_id'], row['branch__name'])
        for row in Transaction.all_objects.filter(pk__in=ids).values('id', 'branch_id', 'branch__name')
    }


def scoped_cases(user, header_branch=None):
    """Cases this user may see. Managers see their branch(es); officers see
    cases they raised, cases on their own payments, and disputes against them."""
    qs = Case.objects.filter(
        erp_exception__in=scoped_exceptions(user, header_branch),
    ).select_related(
        'erp_exception__reconciliation__bank_account', 'erp_exception__reconciliation__branch',
        'erp_exception__officer', 'bank_transaction', 'proposed_by', 'reviewed_by',
        'approved_by', 'rejected_by', 'dissolved_by', 'respondent', 'loan_repayment_reversal',
    )
    if not is_recon_manager(user):
        qs = qs.filter(
            Q(proposed_by=user) | Q(erp_exception__officer=user) | Q(respondent=user)
        )
    return qs


# ── ERP payment details ──────────────────────────────────────────────────────

def _erp_transaction(exc):
    from transactions.models import Transaction
    if not exc.loan_payment_id:
        return None
    return Transaction.objects.select_related('created_by', 'series').filter(pk=exc.loan_payment_id).first()


def _loan_for_transaction(txn):
    """The loan a repayment belongs to — allocation rows first, then the
    loan number embedded in the description."""
    if txn is None:
        return None
    from loans.models import LoanAccount, LoanRepaymentAllocation
    alloc = LoanRepaymentAllocation.objects.filter(journal_entry=txn).select_related('loan__client').first()
    if alloc:
        return alloc.loan
    from .reconciliation_utils import _LOAN_NUMBER_RE
    m = _LOAN_NUMBER_RE.search(txn.description or '')
    if m:
        return LoanAccount.objects.select_related('client').filter(loan_number=m.group(1).strip()).first()
    return None


def _client_name(loan):
    client = getattr(loan, 'client', None)
    if not client:
        return ''
    name = getattr(client, 'full_name', None)
    return name if isinstance(name, str) else f'{client.first_name} {client.last_name}'


def _erp_reference(txn):
    from .reconciliation_utils import _BANK_REFERENCE_RE
    m = _BANK_REFERENCE_RE.search((txn.description if txn else '') or '')
    return m.group(1).strip() if m else ''


# ── Facts the director sees ──────────────────────────────────────────────────

def build_facts(case):
    """Everything an approver needs in one place. Frozen on the case at
    propose time and refreshed at review, so the director sees what the
    branch manager saw."""
    from .reconciliation_utils import narration_relationship

    exc = case.erp_exception
    txn = _erp_transaction(exc)
    loan = _loan_for_transaction(txn)
    client_name = _client_name(loan)
    tx = case.bank_transaction
    officer = exc.officer

    facts = {
        'erp': {
            'payment_id': exc.loan_payment_id,
            'amount': str(exc.erp_amount or Decimal('0')),
            'date_claimed': str(txn.date) if txn else (str(exc.erp_date) if exc.erp_date else None),
            'posted_at': txn.created_at.isoformat() if txn and txn.created_at else None,
            'description': (txn.description if txn else exc.erp_narration) or '',
            'reference': _erp_reference(txn),
            'loan_number': getattr(loan, 'loan_number', None),
            'client_name': client_name,
            'officer_id': exc.officer_id,
            'officer_name': _display(officer),
        },
        'bank': None,
        'checks': {},
        'officer_record': {},
        'flags': [],
    }

    if tx is not None:
        facts['bank'] = {
            'transaction_id': str(tx.pk),
            'date': str(tx.value_date),
            'amount': str(tx.amount),
            'narration': tx.narration,
            'bank_ref': tx.bank_ref,
            'account': getattr(tx.bank_account, 'account_name', '') or str(tx.bank_account),
            'currently_matched': tx.matched,
            'previously_unmatched_at': tx.unmatched_at.isoformat() if tx.unmatched_at else None,
            'previously_unmatched_reason': tx.unmatched_reason,
        }
        if tx.matched and tx.matched_erp_payment_id and tx.matched_erp_payment_id != exc.loan_payment_id:
            from transactions.models import Transaction
            holder = Transaction.objects.select_related('created_by').filter(pk=tx.matched_erp_payment_id).first()
            facts['bank']['matched_to'] = {
                'payment_id': tx.matched_erp_payment_id,
                'description': holder.description if holder else '',
                'date': str(holder.date) if holder else None,
                'officer_name': _display(payment_officer(holder)) if holder else _display(tx.matched_erp_officer),
            }

        relationship = narration_relationship(tx.narration or '', f'{client_name} {facts["erp"]["description"]}')
        erp_date = txn.date if txn else exc.erp_date
        date_gap = abs((tx.value_date - erp_date).days) if erp_date else None
        posted_after = bool(txn and txn.created_at and timezone.localtime(txn.created_at).date() > tx.value_date)
        ref = facts['erp']['reference']
        bank_text = f'{tx.narration or ""} {tx.bank_ref or ""}'.lower()
        ref_in_bank = bool(ref and len(ref) >= 5 and ref.lower() in bank_text)
        payer_ref = _normalize_ref(case.payer_reference)
        payer_ref_found = None
        if payer_ref:
            payer_ref_found = payer_ref in _normalize_ref(f'{tx.narration or ""} {tx.bank_ref or ""}')
            if not payer_ref_found:
                facts['flags'].append("The reference from the client's receipt is NOT on this bank line.")
        facts['checks'] = {
            'payer_reference': case.payer_reference or None,
            'payer_reference_in_bank_line': payer_ref_found,
            'amount_equal': (exc.erp_amount or Decimal('0')) == tx.amount,
            'name_check': relationship,
            'date_gap_days': date_gap,
            'posted_after_bank_line': posted_after,
            'reference_in_bank_line': ref_in_bank,
            'same_bank_account': tx.bank_account_id == exc.reconciliation.bank_account_id,
        }
        if relationship == 'CONTRADICTED':
            facts['flags'].append("The bank narration names a different person from the loan's client.")
        if posted_after:
            facts['flags'].append('The payment was entered in the ERP after the money had already hit the bank.')
        if date_gap is not None and date_gap > CLEAN_MAX_DATE_GAP_DAYS:
            facts['flags'].append(f'Bank date and ERP date are {date_gap} days apart.')
        if tx.unmatched_at:
            facts['flags'].append('This bank line was matched before and later unmatched.')
        if case.kind == Case.KIND_DISPUTE:
            facts['flags'].append('Dispute: this bank line is currently matched to another payment.')

    if officer is not None:
        since = timezone.now() - timedelta(days=30)
        officer_cases = Case.objects.filter(erp_exception__officer=officer)
        facts['officer_record'] = {
            'open_not_in_bank': ReconciliationException.objects.filter(
                officer=officer, exception_type='erp_only', direction='CREDIT', resolved=False,
            ).count(),
            'disputes_raised': officer_cases.filter(kind=Case.KIND_DISPUTE).count(),
            'disputes_rejected_30d': officer_cases.filter(
                kind=Case.KIND_DISPUTE, status=Case.REJECTED, rejected_at__gte=since,
            ).count(),
            'cases_dissolved': officer_cases.filter(status=Case.DISSOLVED).count(),
        }
        if facts['officer_record']['disputes_rejected_30d']:
            facts['flags'].append('This officer had a dispute rejected in the last 30 days.')

    facts['is_clean'] = _is_clean(case, facts)
    facts['built_at'] = timezone.now().isoformat()
    return facts


def _is_clean(case, facts):
    """Clean = safe enough for a director to bulk-approve."""
    if case.kind != Case.KIND_LINK or not facts.get('bank'):
        return False
    c = facts['checks']
    if not c.get('amount_equal') or c.get('name_check') != 'CONFIRMED':
        return False
    if c.get('date_gap_days') is None or c['date_gap_days'] > CLEAN_MAX_DATE_GAP_DAYS:
        return False
    if facts['bank'].get('previously_unmatched_at'):
        return False
    if case.proposed_by_id == case.erp_exception.officer_id and not c.get('reference_in_bank_line'):
        return False
    if facts.get('officer_record', {}).get('disputes_rejected_30d'):
        return False
    return True


# ── Rule checks (run at propose AND approve) ─────────────────────────────────

def _bank_line_for(exc):
    if not exc or not exc.bank_transaction_id:
        return None
    return ReconciliationBankTransaction.objects.select_related('bank_account').filter(
        pk=exc.bank_transaction_id,
    ).first()


def _check_erp_side(exc):
    if exc.exception_type != 'erp_only' or exc.direction != 'CREDIT':
        raise ValidationError('Only "Recorded, not in bank" repayments can go through this workflow.')
    if exc.resolved or exc.netted_with_id or exc.pending_bank_payment_id:
        raise ValidationError('This ERP payment is already resolved or being handled another way.')
    if not exc.loan_payment_id:
        raise ValidationError('This exception has no ERP payment attached.')
    if ReconciliationBankTransaction.objects.filter(matched=True, matched_erp_payment_id=exc.loan_payment_id).exists():
        raise ValidationError('This ERP payment is already matched to a bank line.')


def _check_pairing(kind, erp_exc, bank_exc, tx):
    """The same rules as manual linking in normal reconciliation."""
    _check_erp_side(erp_exc)
    if kind == Case.KIND_REVERSAL:
        return
    if tx is None:
        raise ValidationError('Pick the bank line this payment matches.')
    if tx.direction != 'CREDIT':
        raise ValidationError('Only money coming into the bank can be matched to a repayment.')
    if tx.bank_account_id != erp_exc.reconciliation.bank_account_id:
        raise ValidationError('The bank line must be on the same bank account the payment was posted to.')
    if tx.amount != erp_exc.erp_amount:
        raise ValidationError('The bank line and the ERP payment must have exactly the same amount.')

    if kind == Case.KIND_LINK:
        if tx.matched:
            raise ValidationError(
                'That bank line is already matched to another payment. Raise a dispute instead.'
            )
        if bank_exc is None or bank_exc.exception_type != 'bank_only' or bank_exc.bank_transaction_id != tx.pk:
            raise ValidationError('The bank line has no open "In bank, not recorded" entry to link to.')
        if bank_exc.resolved or bank_exc.netted_with_id or bank_exc.pending_bank_payment_id:
            raise ValidationError('That bank line is already resolved or being handled another way.')
    elif kind == Case.KIND_DISPUTE:
        if not tx.matched or not tx.matched_erp_payment_id:
            raise ValidationError('That bank line is not matched to anyone. Use a normal link instead.')
        if tx.matched_erp_payment_id == erp_exc.loan_payment_id:
            raise ValidationError('That bank line is already matched to this payment.')
    else:
        raise ValidationError('Unknown resolution type.')


def _check_reversal_possible(erp_exc, reason, user):
    """Dry-run LoanRepaymentReversal.submit() so a proposal that can never
    be executed is refused up front."""
    from loans.models import LoanRepaymentReversal

    txn = _erp_transaction(erp_exc)
    loan = _loan_for_transaction(txn)
    if txn is None or loan is None:
        raise ValidationError('Could not find the loan this payment belongs to, so it cannot be reversed here.')

    class _Rollback(Exception):
        pass

    try:
        with db_transaction.atomic():
            LoanRepaymentReversal.submit(loan, txn, reason, user)
            raise _Rollback()
    except _Rollback:
        pass
    return txn, loan


# ── Actions ──────────────────────────────────────────────────────────────────

def _log(event, case, user, extra=None):
    try:
        from common.models import FinancialAuditLog, log_financial_event
        log_financial_event(
            FinancialAuditLog.RECON_RESOLUTION,
            acted_by=user,
            record_type='ReconciliationResolution',
            record_id=str(case.pk),
            amount=case.amount,
            description=f'{case.reference_number} {case.kind} — {event}',
            extra={'event': event, 'status': case.status, **(extra or {})},
        )
    except Exception:
        logger.exception('Failed to audit-log resolution case %s', case.pk)


@db_transaction.atomic
def propose(user, *, erp_exception, kind, reason, bank_exception=None, bank_transaction=None,
            evidence=None, payer_reference='', header_branch=None, auto_recommend=False):
    """Raise a case. `auto_recommend` is used when a director links from the
    old reconciliation screens: they act as maker AND checker, so a second,
    different director must still approve."""
    _require_reason(reason, 'A reason')
    if kind not in dict(Case.KIND_CHOICES):
        raise ValidationError('Unknown resolution type.')

    manager = is_recon_manager(user)
    if not manager and erp_exception.officer_id != user.pk:
        raise ValidationError('You can only raise a case for payments you posted yourself.')

    if bank_exception is not None and bank_transaction is None:
        bank_transaction = _bank_line_for(bank_exception)
    _check_pairing(kind, erp_exception, bank_exception, bank_transaction)

    payer_reference = (payer_reference or '').strip()
    if kind == Case.KIND_DISPUTE and len(_normalize_ref(payer_reference)) < 6:
        raise ValidationError(
            "A dispute needs the reference / session ID from the client's transfer receipt (at least 6 letters or digits)."
        )
    if kind == Case.KIND_REVERSAL:
        _check_reversal_possible(erp_exception, reason, user)

    if Case.objects.filter(erp_exception=erp_exception, status__in=Case.OPEN_STATUSES).exists():
        raise ValidationError('There is already an open case for this payment.')
    if bank_transaction is not None and Case.objects.filter(
        bank_transaction=bank_transaction, status__in=Case.OPEN_STATUSES,
    ).exists():
        raise ValidationError('Someone already has an open case for that bank line.')

    respondent = None
    displaced = None
    if kind == Case.KIND_DISPUTE:
        displaced = bank_transaction.matched_erp_payment_id
        from transactions.models import Transaction
        holder = Transaction.objects.select_related('created_by').filter(pk=displaced).first()
        respondent = payment_officer(holder) or bank_transaction.matched_erp_officer
        if respondent and respondent.pk == user.pk:
            respondent = None

    recon = erp_exception.reconciliation
    # The case belongs to the loan's branch (its branch manager reviews it),
    # even if the money was posted into another branch's bank account.
    payment = _erp_transaction(erp_exception)
    case_branch = getattr(payment, 'branch', None) or recon.branch
    case = Case(
        kind=kind,
        erp_exception=erp_exception,
        bank_exception=bank_exception,
        bank_transaction=bank_transaction,
        displaced_erp_payment_id=displaced,
        amount=erp_exception.erp_amount or Decimal('0'),
        reason=reason.strip(),
        payer_reference=payer_reference[:100],
        proposed_by=user,
        respondent=respondent,
        branch=case_branch,
        tenant=getattr(recon, 'tenant', None) or getattr(user, 'tenant', None),
        owner=user,
        created_by=user,
    )
    if evidence:
        case.evidence = evidence
    if auto_recommend:
        case.status = Case.RECOMMENDED
        case.reviewed_by = user
        case.reviewed_at = timezone.now()
        case.review_notes = reason.strip()
    case.save()
    case.facts = build_facts(case)
    case.save(update_fields=['facts'])

    _log('proposed' if not auto_recommend else 'proposed+recommended', case, user)
    _notify_after(case, 'proposed' if not auto_recommend else 'recommended', user)
    return case


def _locked(case):
    return Case.objects.select_for_update(of=('self',)).select_related(
        'erp_exception__reconciliation', 'bank_exception', 'bank_transaction',
    ).get(pk=case.pk)


@db_transaction.atomic
def review(user, case, *, recommend, notes):
    """Branch manager's decision: recommend to a director, or reject."""
    case = _locked(case)
    if case.status != Case.PROPOSED:
        raise ValidationError('Only proposed cases can be reviewed.')
    if not is_recon_manager(user):
        raise ValidationError('Only a branch manager (or above) can review a case.')
    if user.pk == case.proposed_by_id:
        raise ValidationError('You cannot review a case you raised yourself (maker-checker).')
    if user.pk == case.erp_exception.officer_id:
        raise ValidationError('You cannot review a case about a payment you posted.')
    _require_reason(notes, 'Review notes')

    now = timezone.now()
    if recommend:
        if case.bank_exception_id:
            case.bank_exception.refresh_from_db()
        if case.bank_transaction_id:
            case.bank_transaction.refresh_from_db()
        _check_pairing(case.kind, case.erp_exception, case.bank_exception, case.bank_transaction)
        case.status = Case.RECOMMENDED
        case.reviewed_by = user
        case.reviewed_at = now
        case.review_notes = notes.strip()
        case.facts = build_facts(case)
        case.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'review_notes', 'facts', 'updated_at'])
        _log('recommended', case, user)
        _notify_after(case, 'recommended', user)
    else:
        case.status = Case.REJECTED
        case.rejected_by = user
        case.rejected_at = now
        case.rejection_reason = notes.strip()
        case.save(update_fields=['status', 'rejected_by', 'rejected_at', 'rejection_reason', 'updated_at'])
        _log('rejected_by_reviewer', case, user)
        _notify_after(case, 'rejected', user)
    return case


def _check_approver(user, case):
    if not is_recon_director(user):
        raise ValidationError('Only a director can give final approval.')
    if case.status != Case.RECOMMENDED:
        raise ValidationError('Only cases recommended by a branch manager can be approved.')
    if user.pk in (case.proposed_by_id, case.reviewed_by_id):
        raise ValidationError('The approver must be different from whoever raised and reviewed the case.')
    if user.pk == case.erp_exception.officer_id:
        raise ValidationError('You cannot approve a case about a payment you posted.')
    if not case.dispute_wait_over:
        raise ValidationError(
            'This dispute is waiting for the other officer to respond (or 24 hours to pass) before it can be approved.'
        )


def _close_exception(exc, user, partner, notes, now):
    exc.resolved = True
    exc.resolved_by = user
    exc.resolved_at = now
    exc.resolution_notes = notes
    exc.netted_with = partner
    exc.save(update_fields=['resolved', 'resolved_by', 'resolved_at', 'resolution_notes', 'netted_with'])


def _link(case, user, notes, now):
    """Pair the ERP gap with the bank line and mark the line matched. Also
    closes duplicate copies of either side left on other days' runs."""
    from .reconciliation_utils import recompute_reconciliation_counts

    erp_exc = case.erp_exception
    tx = ReconciliationBankTransaction.objects.select_for_update().get(pk=case.bank_transaction_id)
    bank_exc = case.bank_exception
    if bank_exc is None:
        bank_exc = ReconciliationException.objects.filter(
            exception_type='bank_only', bank_transaction_id=tx.pk, resolved=False,
        ).order_by('id').first()
    if bank_exc is None:
        # e.g. a disputed line whose own day has no reconciliation run —
        # file the bank side on the payment's reconciliation (same account).
        from .reconciliation_utils import get_or_create_bank_only_exception
        bank_exc = get_or_create_bank_only_exception(erp_exc.reconciliation, tx)

    note =f'{case.reference_number}: {notes}'
    _close_exception(erp_exc, user, bank_exc, note, now)
    _close_exception(bank_exc, user, erp_exc, note, now)

    dup_ids = []
    for dup in ReconciliationException.objects.filter(resolved=False).filter(
        Q(exception_type='erp_only', loan_payment_id=erp_exc.loan_payment_id,
          reconciliation__bank_account_id=tx.bank_account_id)
        | Q(exception_type='bank_only', bank_transaction_id=tx.pk)
    ).exclude(pk__in=[erp_exc.pk, bank_exc.pk]):
        _close_exception(dup, user, None, f'{note} (duplicate copy)', now)
        dup_ids.append(dup.pk)

    tx.matched = True
    tx.match_confidence = 'MANUAL'
    tx.matched_erp_payment_id = erp_exc.loan_payment_id
    tx.matched_at = now
    tx.matched_erp_officer_id = erp_exc.officer_id
    tx.save(update_fields=['matched', 'match_confidence', 'matched_erp_payment_id', 'matched_at', 'matched_erp_officer'])

    for recon_id in {erp_exc.reconciliation_id, bank_exc.reconciliation_id} | set(
        ReconciliationException.objects.filter(pk__in=dup_ids).values_list('reconciliation_id', flat=True)
    ):
        recompute_reconciliation_counts(DailyReconciliation.objects.get(pk=recon_id))

    return {
        'closed_exception_ids': [erp_exc.pk, bank_exc.pk, *dup_ids],
        'bank_transaction_id': str(tx.pk),
        'bank_exception_id': bank_exc.pk,
    }


@db_transaction.atomic
def approve(user, case, *, notes):
    case = _locked(case)
    _check_approver(user, case)
    _require_reason(notes, 'Approval notes')
    contradicted = case.facts.get('checks', {}).get('name_check') == 'CONTRADICTED'
    if contradicted and len(notes.strip()) < 30:
        raise ValidationError(
            "The bank narration names a different person from the client — explain why you're approving (at least 30 characters)."
        )

    # Re-check everything against the live state.
    case.erp_exception.refresh_from_db()
    if case.bank_exception_id:
        case.bank_exception.refresh_from_db()
    if case.bank_transaction_id:
        case.bank_transaction.refresh_from_db()
    _check_pairing(case.kind, case.erp_exception, case.bank_exception, case.bank_transaction)
    if case.kind == Case.KIND_DISPUTE and case.bank_transaction.matched_erp_payment_id != case.displaced_erp_payment_id:
        raise ValidationError('The bank line has been re-matched since this dispute was raised. Reject and raise a new one.')

    now = timezone.now()
    applied = {}
    if case.kind == Case.KIND_LINK:
        applied = _link(case, user, notes.strip(), now)
    elif case.kind == Case.KIND_DISPUTE:
        tx = case.bank_transaction
        tx.unmatch(user, f'{case.reference_number} dispute approved: {notes.strip()}')
        case.bank_exception = None  # unmatch() reopened/created the bank_only entry
        applied = _link(case, user, notes.strip(), now)
        applied['displaced_erp_payment_id'] = case.displaced_erp_payment_id
    elif case.kind == Case.KIND_REVERSAL:
        applied = _reverse(case, user, notes.strip(), now)
    if applied.get('bank_exception_id'):
        case.bank_exception_id = applied['bank_exception_id']

    case.status = Case.APPROVED
    case.approved_by = user
    case.approved_at = now
    case.approval_notes = notes.strip()
    case.applied = applied
    case.save(update_fields=[
        'status', 'approved_by', 'approved_at', 'approval_notes', 'applied',
        'bank_exception', 'loan_repayment_reversal', 'updated_at',
    ])
    _log('approved', case, user, {'applied': applied})
    _notify_after(case, 'approved', user)
    return case


def _reverse(case, user, notes, now):
    """Run the existing two-approval repayment reversal with the case's three
    people: requester = proposer, first approver = reviewer, second = director."""
    from loans.models import LoanRepaymentReversal
    from .reconciliation_utils import recompute_reconciliation_counts

    erp_exc = case.erp_exception
    txn = _erp_transaction(erp_exc)
    loan = _loan_for_transaction(txn)
    if txn is None or loan is None:
        raise ValidationError('Could not find the loan this payment belongs to.')

    reason = f'{case.reference_number}: money never reached the bank — {case.reason}'
    reversal = LoanRepaymentReversal.submit(loan, txn, reason, case.proposed_by)
    reversal.first_approve(case.reviewed_by, case.review_notes or reason)
    reversal.second_approve(user, notes)
    case.loan_repayment_reversal = reversal

    note = f'{case.reference_number}: payment reversed ({reversal.reference_number}). {notes}'
    closed = []
    for exc in ReconciliationException.objects.filter(
        exception_type='erp_only', loan_payment_id=erp_exc.loan_payment_id, resolved=False,
    ):
        _close_exception(exc, user, None, note, now)
        closed.append(exc.pk)
        recompute_reconciliation_counts(exc.reconciliation)
    return {'closed_exception_ids': closed, 'reversal': reversal.reference_number}


@db_transaction.atomic
def reject(user, case, *, reason):
    """Director rejects at any open stage (branch managers reject via review)."""
    case = _locked(case)
    if case.status not in Case.OPEN_STATUSES:
        raise ValidationError('Only open cases can be rejected.')
    if not is_recon_director(user):
        if not (case.status == Case.PROPOSED and is_recon_manager(user) and user.pk != case.proposed_by_id):
            raise ValidationError('You are not allowed to reject this case.')
    _require_reason(reason, 'A rejection reason')
    case.status = Case.REJECTED
    case.rejected_by = user
    case.rejected_at = timezone.now()
    case.rejection_reason = reason.strip()
    case.save(update_fields=['status', 'rejected_by', 'rejected_at', 'rejection_reason', 'updated_at'])
    _log('rejected', case, user)
    _notify_after(case, 'rejected', user)
    return case


@db_transaction.atomic
def cancel(user, case):
    case = _locked(case)
    if case.status != Case.PROPOSED or case.proposed_by_id != user.pk:
        raise ValidationError('You can only withdraw your own case before it is reviewed.')
    case.status = Case.CANCELLED
    case.save(update_fields=['status', 'updated_at'])
    _log('cancelled', case, user)
    return case


@db_transaction.atomic
def respond(user, case, *, response):
    case = _locked(case)
    if case.kind != Case.KIND_DISPUTE or case.respondent_id != user.pk:
        raise ValidationError('Only the officer named in this dispute can respond.')
    if case.status not in Case.OPEN_STATUSES:
        raise ValidationError('This dispute is already closed.')
    _require_reason(response, 'A response')
    case.respondent_response = response.strip()
    case.respondent_responded_at = timezone.now()
    case.save(update_fields=['respondent_response', 'respondent_responded_at', 'updated_at'])
    _log('respondent_answered', case, user)
    _notify_after(case, 'responded', user)
    return case


@db_transaction.atomic
def dissolve(user, case, *, reason):
    """Director undoes an approved link/dispute that turned out dubious.
    Both sides reopen and the bank line is unmatched; nothing is silently
    restored — the director decides afresh."""
    from .reconciliation_utils import recompute_reconciliation_counts

    case = _locked(case)
    if not is_recon_director(user):
        raise ValidationError('Only a director can dissolve a resolution.')
    if case.status != Case.APPROVED:
        raise ValidationError('Only approved cases can be dissolved.')
    if case.kind == Case.KIND_REVERSAL:
        raise ValidationError(
            'A completed reversal cannot be dissolved — record the payment again if it was reversed in error.'
        )
    _require_reason(reason, 'A reason')

    now = timezone.now()
    closed_ids = case.applied.get('closed_exception_ids', [])
    recon_ids = set()
    for exc in ReconciliationException.objects.select_for_update().filter(pk__in=closed_ids):
        exc.resolved = False
        exc.netted_with = None
        exc.unresolved_by = user
        exc.unresolved_at = now
        exc.unresolved_reason = f'{case.reference_number} dissolved: {reason.strip()}'
        exc.save(update_fields=['resolved', 'netted_with', 'unresolved_by', 'unresolved_at', 'unresolved_reason'])
        recon_ids.add(exc.reconciliation_id)

    if case.bank_transaction_id:
        tx = ReconciliationBankTransaction.objects.select_for_update().get(pk=case.bank_transaction_id)
        if tx.matched and tx.matched_erp_payment_id == case.erp_exception.loan_payment_id:
            tx.matched = False
            tx.unmatched_by = user
            tx.unmatched_at = now
            tx.unmatched_reason = f'{case.reference_number} dissolved: {reason.strip()}'
            tx.save(update_fields=['matched', 'unmatched_by', 'unmatched_at', 'unmatched_reason'])

    for recon in DailyReconciliation.objects.filter(pk__in=recon_ids):
        recompute_reconciliation_counts(recon)

    case.status = Case.DISSOLVED
    case.dissolved_by = user
    case.dissolved_at = now
    case.dissolve_reason = reason.strip()
    case.save(update_fields=['status', 'dissolved_by', 'dissolved_at', 'dissolve_reason', 'updated_at'])
    _log('dissolved', case, user)
    _notify_after(case, 'dissolved', user)
    return case


def bulk_approve_clean(user, cases, *, notes):
    """Approve many clean link cases in one go. Each is re-checked; anything
    not clean any more (or a dispute/reversal) is skipped, not approved."""
    _require_reason(notes, 'Approval notes')
    approved, skipped = [], []
    for case in cases:
        try:
            fresh = build_facts(case)
            if case.kind != Case.KIND_LINK or not fresh.get('is_clean'):
                skipped.append({'id': case.pk, 'reference': case.reference_number, 'reason': 'Not a clean case — open it and approve individually.'})
                continue
            case.facts = fresh
            case.save(update_fields=['facts'])
            approve(user, case, notes=notes)
            approved.append(case.reference_number)
        except ValidationError as exc:
            skipped.append({'id': case.pk, 'reference': case.reference_number, 'reason': ' '.join(exc.messages)})
    return {'approved': approved, 'skipped': skipped}


# ── Candidates for "Find match" ──────────────────────────────────────────────

def find_candidates(erp_exception):
    """Bank lines this ERP payment could be: unmatched ones (link) and
    already-matched ones (dispute). Same account, money in, exact amount,
    within the reconciliation match window. Who holds a matched line is not
    revealed here."""
    from django.conf import settings
    from .reconciliation_utils import narration_relationship

    window = getattr(settings, 'RECONCILIATION_MATCH_WINDOW_DAYS', 7)
    txn = _erp_transaction(erp_exception)
    anchor = (txn.date if txn else None) or erp_exception.erp_date or erp_exception.reconciliation.reconciliation_date
    loan = _loan_for_transaction(txn)
    erp_text = f'{_client_name(loan)} {(txn.description if txn else erp_exception.erp_narration) or ""}'

    lines = ReconciliationBankTransaction.objects.filter(
        bank_account_id=erp_exception.reconciliation.bank_account_id,
        direction='CREDIT',
        amount=erp_exception.erp_amount,
        value_date__gte=anchor - timedelta(days=window),
        value_date__lte=anchor + timedelta(days=window),
    )
    open_case_lines = set(
        Case.objects.filter(status__in=Case.OPEN_STATUSES, bank_transaction__isnull=False)
        .values_list('bank_transaction_id', flat=True)
    )
    bank_excs = {
        e.bank_transaction_id: e for e in ReconciliationException.objects.filter(
            exception_type='bank_only', resolved=False, netted_with__isnull=True,
            pending_bank_payment__isnull=True, bank_transaction_id__in=lines.values('id'),
        ).order_by('id')
    }

    rank = {'CONFIRMED': 0, 'UNKNOWN': 1, 'CONTRADICTED': 2}
    unmatched, matched = [], []
    for tx in lines:
        if tx.pk in open_case_lines:
            continue
        relationship = narration_relationship(tx.narration or '', erp_text)
        row = {
            'bank_transaction_id': str(tx.pk),
            'date': str(tx.value_date),
            'amount': str(tx.amount),
            'narration': tx.narration,
            'name_check': relationship,
            'date_gap_days': abs((tx.value_date - anchor).days),
        }
        if tx.matched:
            if tx.matched_erp_payment_id == erp_exception.loan_payment_id:
                continue
            matched.append(row)
        else:
            exc = bank_excs.get(tx.pk)
            if exc is None:
                continue
            row['bank_exception_id'] = exc.pk
            unmatched.append(row)

    key = lambda r: (rank.get(r['name_check'], 1), r['date_gap_days'])
    return {'unmatched': sorted(unmatched, key=key), 'matched': sorted(matched, key=key)}


# ── Notifications ────────────────────────────────────────────────────────────

def _notify(users, case, subject, message, actor):
    try:
        from django.contrib.contenttypes.models import ContentType
        from notifications.models import Notification
        from notifications.services import get_in_app_channel
        from notifications.realtime import push_notification_event

        channel = get_in_app_channel()
        if not channel:
            return
        ct = ContentType.objects.get_for_model(Case)
        rows, ids = [], []
        for u in {u.pk: u for u in users if u and u.pk != getattr(actor, 'pk', None)}.values():
            rows.append(Notification(
                channel=channel, recipient_user=u, recipient_name=_display(u) or '', recipient_contact='',
                subject=subject, message=message, priority='high', status='pending',
                owner=case.owner, branch=case.branch, created_by=actor, tenant=case.tenant,
                content_type=ct, object_id=str(case.pk),
            ))
            ids.append(u.pk)
        if rows:
            Notification.objects.bulk_create(rows, ignore_conflicts=True)
            for uid in ids:
                push_notification_event(uid)
    except Exception:
        logger.exception('Failed to send notification for resolution case %s', case.pk)


def _notify_after(case, event, actor):
    from threads.permissions import branch_managers_for_branch, directors_for_tenant

    amount = f'₦{case.amount:,.2f}'
    who = _display(actor)
    label = dict(Case.KIND_CHOICES).get(case.kind, case.kind)
    if event == 'proposed':
        _notify(branch_managers_for_branch(case.tenant, case.branch), case,
                'Reconciliation case to review', f'{who} raised {case.reference_number} ({label}, {amount}). Please review.', actor)
        if case.kind == Case.KIND_DISPUTE and case.respondent:
            _notify([case.respondent], case, 'A payment of yours is being disputed',
                    f'{who} says the bank line matched to your payment ({amount}) is theirs ({case.reference_number}). '
                    f'Respond within 24 hours.', actor)
    elif event == 'recommended':
        _notify(directors_for_tenant(case.tenant), case, 'Reconciliation case awaiting your approval',
                f'{case.reference_number} ({label}, {amount}) was recommended by {_display(case.reviewed_by)}.', actor)
        if case.kind == Case.KIND_DISPUTE and case.respondent and not case.respondent_responded_at:
            _notify([case.respondent], case, 'A payment of yours is being disputed',
                    f'{case.reference_number}: the bank line matched to your payment ({amount}) is claimed by someone else. '
                    f'Respond within 24 hours.', actor)
    elif event == 'responded':
        _notify([case.proposed_by, case.reviewed_by], case, 'Dispute response received',
                f'{who} responded to dispute {case.reference_number}.', actor)
    elif event in ('approved', 'rejected', 'dissolved'):
        _notify([case.proposed_by, case.reviewed_by, case.respondent], case, f'Reconciliation case {event}',
                f'{case.reference_number} ({label}, {amount}) was {event} by {who}.', actor)
        if event == 'dissolved':
            try:
                from notifications.telegram_alerts import notify_directors
                notify_directors(
                    'recon_resolution_dissolved', f'{case.reference_number} dissolved',
                    f'{who} dissolved {case.reference_number} ({label}, {amount}): {case.dissolve_reason}',
                    owner=case.owner, branch=case.branch, related_object=case,
                )
            except Exception:
                logger.exception('Telegram alert failed for %s', case.pk)
