"""
Bank borrowing lifecycle: create (schedule + per-branch shares), receive funds,
branch share transfers, and instalment payment.

Accounting model (Option B - each branch pays for the money it used):

  Receive   debit branch D:  Dr D bank / Cr Borrowing liability   (full principal)
            for each other branch B with allocation A:
                inter-branch transfer D -> B of A
                  (D: Dr Due-from-B / Cr D bank ; B: Dr B bank / Cr Due-to-D)
  Share     branch B sends its share (principal_part + interest_part) to D:
                inter-branch transfer B -> D
                  (B: Dr Due-from-D / Cr B bank ; D: Dr D bank / Cr Due-to-B)
            interest recharge so B (not D) bears B's interest:
                  B: Dr Interest expense / Cr Due-to-D
                  D: Dr Due-from-B       / Cr Interest expense
  Instalment D pays the bank:  Dr Liability (principal) + Dr Interest expense
                               / Cr D bank (total)

After every share is sent and the instalment is paid, D's net interest cost is only
its own share, and the inter-branch balances between D and each B equal B's
remaining share of the principal.
"""
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from dateutil.relativedelta import relativedelta
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from accounts.models import Account
from accounts.utils.account_creation import (
    _find_available_child_code,
    get_or_create_system_account,
    get_system_account,
)
from common.models import FinancialAuditLog, log_financial_event
from interbranch.models import InterBranchClearingAccount
from interbranch.services import create_interbranch_transfer, get_or_create_clearing_account
from loans.schedule_service import reducing_balance_schedule
from transactions.models import Transaction, TransactionEntry, TransactionSeries
from treasury.models import (
    BankBorrowing,
    BorrowingAllocation,
    BorrowingContribution,
    BorrowingInstalment,
    TreasurySettings,
)

CENT = Decimal('0.01')
DR = TransactionEntry.DEBIT
CR = TransactionEntry.CREDIT


def _q(value) -> Decimal:
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def _posting_date(value, label, not_before=None):
    """Default to today; refuse future dates (and dates before the loan was received)."""
    today = timezone.localdate()
    value = value or today
    if value > today:
        raise ValidationError(f"The {label} date cannot be in the future.")
    if not_before is not None and value < not_before:
        raise ValidationError(f"The {label} date cannot be before the funds were received ({not_before:%d %b %Y}).")
    return value


def _settle_if_complete(borrowing):
    """
    Paid off only when every instalment is recorded AND every branch share has been sent.
    (If the last instalment is recorded before a branch sends its final share, the borrowing
    stays active so that share can still be sent and stays visible as an obligation.)
    """
    pending_instalments = borrowing.instalments.filter(status=BorrowingInstalment.STATUS_PENDING).exists()
    pending_shares = BorrowingContribution.objects.filter(
        instalment__borrowing=borrowing, status=BorrowingContribution.STATUS_PENDING).exists()
    if not pending_instalments and not pending_shares and borrowing.status == BankBorrowing.STATUS_ACTIVE:
        borrowing.status = BankBorrowing.STATUS_PAID_OFF
        borrowing.save(update_fields=['status', 'updated_at'])


def _gl_account(bank_account, label):
    gl = getattr(bank_account, 'gl_account', None)
    if gl is None:
        raise ValidationError(f"{label} has no linked GL account.")
    return gl


def _post_journal(*, series_code, series_description, branch, date, description, entries, user, reference=None):
    """Create + post a balanced single-branch journal. entries: [(account, side, amount)]; zero lines are skipped."""
    series, _ = TransactionSeries.objects.get_or_create(
        code=series_code, defaults={'description': series_description})
    txn = Transaction.objects.create(
        series=series, date=date, description=description,
        workflow_reference=(reference or '')[:50] or None,
        branch=branch, owner=user, created_by=user, tenant=branch.tenant,
    )
    for account, side, amount in entries:
        if amount and amount > 0:
            TransactionEntry.objects.create(transaction=txn, account=account, side=side, amount=amount)
    txn.post()
    return txn


def _create_liability_account(borrowing, user):
    """One dedicated GL liability account per borrowing, in the debit branch's books."""
    branch = borrowing.debit_branch
    owner = borrowing.owner or user
    tenant = branch.tenant
    if borrowing.tenor_months <= 12:
        parent_code, parent_name = '2110', 'Short-term Borrowings and Overdrafts'
    else:
        parent_code, parent_name = '2200', 'Long-term Borrowings'

    scope = {'branch': branch}
    if tenant is not None:
        scope['tenant'] = tenant

    with transaction.atomic():
        parent = Account.objects.select_for_update().filter(
            **scope, code=parent_code, account_level='PARENT').first()
        if parent is None:
            parent = get_or_create_system_account(
                parent_code, parent_name, 'LIABILITY', owner, branch, account_level='PARENT')
            parent = Account.objects.select_for_update().get(pk=parent.pk)
        child_code = _find_available_child_code(owner, branch, parent.code, tenant)
        label = f"{borrowing.lender_name} {borrowing.reference}".strip()
        return Account.objects.create(
            **scope, code=child_code, name=f"Bank Loan Payable - {label}"[:100],
            account_type='LIABILITY', account_level='CHILD', parent=parent,
            allow_manual_entries=True, is_system_account=True,
            balance=Decimal('0.00'), owner=owner,
        )


# ── Schedule ────────────────────────────────────────────────────────────────

def preview_schedule(principal, monthly_rate, tenor_months, first_due_date, allocations=None, debit_branch_id=None,
                     lead_days=3):
    """
    Pure preview (no DB writes). Returns instalment rows and, when allocations are given,
    each non-debit branch's share of every instalment.

    allocations: [{'branch_id': int, 'amount': Decimal}]
    """
    principal = Decimal(principal)
    rows = reducing_balance_schedule(principal, Decimal(monthly_rate), int(tenor_months))
    out = []
    cum_principal = {}
    for i, row in enumerate(rows):
        due = first_due_date + relativedelta(months=i)
        inst = {
            'number': i + 1,
            'due_date': due,
            'principal_due': row['principal_due'],
            'interest_due': row['interest_due'],
            'total_due': row['total_due'],
            'contributions': [],
        }
        for alloc in (allocations or []):
            if alloc['branch_id'] == debit_branch_id:
                continue
            amount = Decimal(alloc['amount'])
            share = amount / principal
            interest_part = _q(row['interest_due'] * share)
            if i == len(rows) - 1:
                principal_part = amount - cum_principal.get(alloc['branch_id'], Decimal('0'))
            else:
                principal_part = _q(row['principal_due'] * share)
            cum_principal[alloc['branch_id']] = cum_principal.get(alloc['branch_id'], Decimal('0')) + principal_part
            inst['contributions'].append({
                'branch_id': alloc['branch_id'],
                'principal_part': principal_part,
                'interest_part': interest_part,
                'amount': principal_part + interest_part,
                'due_date': due - timedelta(days=lead_days),
            })
        out.append(inst)
    return out


@transaction.atomic
def create_borrowing(*, user, lender_name, reference, principal, monthly_rate, tenor_months, first_due_date,
                     debit_branch, debit_bank_account, allocations, contribution_lead_days=None, notes=''):
    """
    allocations: [{'branch': Branch, 'amount': Decimal, 'bank_account': BankAccount}]
    The allocation total must equal the principal. Branches that get nothing are simply omitted.
    """
    principal = _q(principal)
    monthly_rate = Decimal(monthly_rate)
    if principal <= 0:
        raise ValidationError("Principal must be greater than zero.")
    if tenor_months < 1:
        raise ValidationError("Tenor must be at least one month.")
    if monthly_rate < 0:
        raise ValidationError("Interest rate cannot be negative.")
    if debit_bank_account.branch_id != debit_branch.pk:
        raise ValidationError("The debit bank account must belong to the debit branch.")
    _gl_account(debit_bank_account, "Debit bank account")

    if not allocations:
        raise ValidationError("Allocate the proceeds to at least one branch.")
    seen = set()
    total = Decimal('0.00')
    for a in allocations:
        branch, amount, bank = a['branch'], _q(a['amount']), a['bank_account']
        if branch.pk in seen:
            raise ValidationError(f"Branch {branch.name} appears more than once in the allocation.")
        seen.add(branch.pk)
        if amount <= 0:
            raise ValidationError(f"Allocation for {branch.name} must be greater than zero.")
        if bank.branch_id != branch.pk:
            raise ValidationError(f"The bank account chosen for {branch.name} belongs to another branch.")
        if branch.tenant_id != debit_branch.tenant_id:
            raise ValidationError("All branches must belong to the same tenant.")
        _gl_account(bank, f"{branch.name} bank account")
        total += amount
    if total != principal:
        raise ValidationError(
            f"Allocations total {total:,.2f} but the borrowing is {principal:,.2f}. They must match exactly.")

    settings_row = TreasurySettings.get_for(debit_branch.tenant)
    lead = settings_row.default_contribution_lead_days if contribution_lead_days is None else contribution_lead_days

    borrowing = BankBorrowing.objects.create(
        tenant=debit_branch.tenant, owner=user, created_by=user,
        lender_name=lender_name, reference=reference or '', principal=principal,
        monthly_rate=monthly_rate, tenor_months=tenor_months, first_due_date=first_due_date,
        debit_branch=debit_branch, debit_bank_account=debit_bank_account,
        contribution_lead_days=lead, notes=notes or '',
    )
    alloc_objs = {}
    for a in allocations:
        alloc_objs[a['branch'].pk] = BorrowingAllocation.objects.create(
            tenant=debit_branch.tenant, owner=user, created_by=user,
            borrowing=borrowing, branch=a['branch'], amount=_q(a['amount']), bank_account=a['bank_account'])

    plan = preview_schedule(
        principal, monthly_rate, tenor_months, first_due_date,
        allocations=[{'branch_id': a['branch'].pk, 'amount': _q(a['amount'])} for a in allocations],
        debit_branch_id=debit_branch.pk, lead_days=lead,
    )
    for row in plan:
        inst = BorrowingInstalment.objects.create(
            tenant=debit_branch.tenant, owner=user, created_by=user, borrowing=borrowing,
            number=row['number'], due_date=row['due_date'], principal_due=row['principal_due'],
            interest_due=row['interest_due'], total_due=row['total_due'])
        for c in row['contributions']:
            BorrowingContribution.objects.create(
                tenant=debit_branch.tenant, owner=user, created_by=user, instalment=inst,
                branch=alloc_objs[c['branch_id']].branch, bank_account=alloc_objs[c['branch_id']].bank_account,
                principal_part=c['principal_part'], interest_part=c['interest_part'],
                amount=c['amount'], due_date=c['due_date'])
    return borrowing


# ── Receive funds ───────────────────────────────────────────────────────────

@transaction.atomic
def receive_borrowing(borrowing, user, received_on=None):
    """Record that the bank has paid the loan into the debit bank account, then distribute shares."""
    borrowing = BankBorrowing.objects.select_for_update().get(pk=borrowing.pk)
    if borrowing.status != BankBorrowing.STATUS_DRAFT:
        raise ValidationError("Funds for this borrowing have already been received.")
    received_on = _posting_date(received_on, "received")
    debit_branch = borrowing.debit_branch
    debit_gl = _gl_account(borrowing.debit_bank_account, "Debit bank account")

    liability = _create_liability_account(borrowing, user)
    borrowing.liability_account = liability

    receipt = _post_journal(
        series_code='BRWRC', series_description='Bank Borrowing Receipt', branch=debit_branch,
        date=received_on, user=user, reference=f"BRW-{borrowing.pk}",
        description=f"Bank loan received - {borrowing.lender_name} {borrowing.reference}".strip(),
        entries=[(debit_gl, DR, borrowing.principal), (liability, CR, borrowing.principal)],
    )

    for alloc in borrowing.allocations.select_related('branch', 'bank_account__gl_account'):
        if alloc.branch_id == debit_branch.pk:
            continue
        transfer = create_interbranch_transfer(
            from_branch=debit_branch, to_branch=alloc.branch,
            from_account=debit_gl, to_account=_gl_account(alloc.bank_account, f"{alloc.branch.name} bank account"),
            amount=alloc.amount,
            description=f"Bank loan proceeds - {borrowing.lender_name} {borrowing.reference} -> {alloc.branch.name}".strip(),
            date=received_on, user=user,
        )
        alloc.proceeds_transfer = transfer
        alloc.save(update_fields=['proceeds_transfer', 'updated_at'])

    borrowing.status = BankBorrowing.STATUS_ACTIVE
    borrowing.received_on = received_on
    borrowing.receipt_transaction = receipt
    borrowing.save(update_fields=['liability_account', 'status', 'received_on', 'receipt_transaction', 'updated_at'])

    log_financial_event(
        FinancialAuditLog.BORROWING_RECEIVE, acted_by=user, record_type='BankBorrowing',
        record_id=str(borrowing.pk), amount=borrowing.principal,
        description=f"Bank loan received: {borrowing.lender_name} {borrowing.reference}",
        extra={'allocations': {str(a.branch_id): str(a.amount) for a in borrowing.allocations.all()}},
    )
    return borrowing


# ── Branch share ────────────────────────────────────────────────────────────

@transaction.atomic
def send_contribution(contribution, user, sent_on=None):
    """A non-debit branch pays its share of one instalment to the debit branch."""
    contribution = BorrowingContribution.objects.select_for_update(of=('self',)).select_related(
        'instalment__borrowing__debit_branch', 'instalment__borrowing__debit_bank_account__gl_account',
        'branch', 'bank_account__gl_account',
    ).get(pk=contribution.pk)
    borrowing = contribution.instalment.borrowing
    if borrowing.status != BankBorrowing.STATUS_ACTIVE:
        raise ValidationError("This borrowing is not active (funds not received yet, or already paid off).")
    if contribution.status != BorrowingContribution.STATUS_PENDING:
        raise ValidationError("This share has already been sent.")
    sent_on = _posting_date(sent_on, "transfer", not_before=borrowing.received_on)
    debit_branch = borrowing.debit_branch
    branch = contribution.branch
    label = f"{borrowing.lender_name} {borrowing.reference} instalment {contribution.instalment.number}".strip()

    transfer = create_interbranch_transfer(
        from_branch=branch, to_branch=debit_branch,
        from_account=_gl_account(contribution.bank_account, f"{branch.name} bank account"),
        to_account=_gl_account(borrowing.debit_bank_account, "Debit bank account"),
        amount=contribution.amount,
        description=f"Share of {label} - {branch.name} -> {debit_branch.name}",
        date=sent_on, user=user,
    )

    source_txn = dest_txn = None
    if contribution.interest_part > 0:
        due_to = get_or_create_clearing_account(branch, debit_branch, InterBranchClearingAccount.DUE_TO)
        due_from = get_or_create_clearing_account(debit_branch, branch, InterBranchClearingAccount.DUE_FROM)
        interest_b = get_system_account('interest_on_borrowings', user, branch)
        interest_d = get_system_account('interest_on_borrowings', user, debit_branch)
        source_txn = _post_journal(
            series_code='BRWIC', series_description='Bank Borrowing Interest Recharge', branch=branch,
            date=sent_on, user=user, reference=f"BRW-{borrowing.pk}-{contribution.pk}",
            description=f"Interest on {label} charged to {branch.name}",
            entries=[(interest_b, DR, contribution.interest_part), (due_to, CR, contribution.interest_part)],
        )
        dest_txn = _post_journal(
            series_code='BRWIC', series_description='Bank Borrowing Interest Recharge', branch=debit_branch,
            date=sent_on, user=user, reference=source_txn.reference_number,
            description=f"Interest on {label} recharged to {branch.name}",
            entries=[(due_from, DR, contribution.interest_part), (interest_d, CR, contribution.interest_part)],
        )

    contribution.status = BorrowingContribution.STATUS_SENT
    contribution.transfer = transfer
    contribution.recharge_source_transaction = source_txn
    contribution.recharge_destination_transaction = dest_txn
    contribution.sent_by = user
    contribution.sent_at = timezone.now()
    contribution.save()

    log_financial_event(
        FinancialAuditLog.BORROWING_CONTRIBUTION, acted_by=user, record_type='BorrowingContribution',
        record_id=str(contribution.pk), amount=contribution.amount,
        description=f"{branch.name} sent its share of {label}",
        extra={'transfer_id': transfer.pk, 'borrowing_id': borrowing.pk},
    )
    _settle_if_complete(borrowing)
    return contribution


# ── Instalment ──────────────────────────────────────────────────────────────

@transaction.atomic
def record_instalment(instalment, user, paid_on=None):
    """The bank debited the instalment from the debit branch account: post it."""
    instalment = BorrowingInstalment.objects.select_for_update(of=('self',)).select_related(
        'borrowing__debit_branch', 'borrowing__debit_bank_account__gl_account', 'borrowing__liability_account',
    ).get(pk=instalment.pk)
    borrowing = instalment.borrowing
    if borrowing.status != BankBorrowing.STATUS_ACTIVE:
        raise ValidationError("This borrowing is not active.")
    if instalment.status != BorrowingInstalment.STATUS_PENDING:
        raise ValidationError("This instalment has already been recorded.")
    earlier_unpaid = borrowing.instalments.filter(
        number__lt=instalment.number, status=BorrowingInstalment.STATUS_PENDING).exists()
    if earlier_unpaid:
        raise ValidationError("Record the earlier instalments first.")

    paid_on = _posting_date(paid_on, "payment", not_before=borrowing.received_on)
    interest_exp = get_system_account('interest_on_borrowings', user, borrowing.debit_branch)
    debit_gl = _gl_account(borrowing.debit_bank_account, "Debit bank account")
    txn = _post_journal(
        series_code='BRWPM', series_description='Bank Borrowing Instalment', branch=borrowing.debit_branch,
        date=paid_on, user=user, reference=f"BRW-{borrowing.pk}-{instalment.number}",
        description=f"Bank loan instalment {instalment.number}/{borrowing.tenor_months} - "
                    f"{borrowing.lender_name} {borrowing.reference}".strip(),
        entries=[
            (borrowing.liability_account, DR, instalment.principal_due),
            (interest_exp, DR, instalment.interest_due),
            (debit_gl, CR, instalment.total_due),
        ],
    )
    instalment.status = BorrowingInstalment.STATUS_PAID
    instalment.paid_transaction = txn
    instalment.paid_by = user
    instalment.paid_at = timezone.now()
    instalment.save()

    _settle_if_complete(borrowing)

    log_financial_event(
        FinancialAuditLog.BORROWING_INSTALMENT, acted_by=user, record_type='BorrowingInstalment',
        record_id=str(instalment.pk), amount=instalment.total_due,
        description=f"Instalment {instalment.number} of {borrowing.lender_name} {borrowing.reference} paid",
        extra={'borrowing_id': borrowing.pk, 'journal_entry_id': txn.pk},
    )
    return instalment


# ── Draft deletion ──────────────────────────────────────────────────────────

@transaction.atomic
def delete_draft_borrowing(borrowing, user):
    """A borrowing entered by mistake can be deleted while funds have not been received (nothing posted yet)."""
    borrowing = BankBorrowing.objects.select_for_update().get(pk=borrowing.pk)
    if borrowing.status != BankBorrowing.STATUS_DRAFT:
        raise ValidationError(
            "Only a borrowing whose funds have not been received can be deleted. "
            "Once funds are received the entries are in the books and must be reversed by journal.")
    BorrowingContribution.objects.filter(instalment__borrowing=borrowing).update(is_deleted=True)
    borrowing.instalments.update(is_deleted=True)
    borrowing.allocations.update(is_deleted=True)
    borrowing.is_deleted = True
    borrowing.save(update_fields=['is_deleted', 'updated_at'])
