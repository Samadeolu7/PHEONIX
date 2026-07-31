# inventory/services/inter_branch_clearing.py
"""
GL posting for cross-branch (and same-branch short-receipt) stock transfers.

The Due-from/Due-to clearing account PAIR itself is not provisioned here —
it's reused from the `interbranch` app (`interbranch.services.
get_or_create_clearing_account`), which already implements exactly this
account-pairing mechanism (registry model `InterBranchClearingAccount`,
race-safe lazy provisioning) for generic inter-branch fund transfers. Only
the "Transfer Shrinkage" expense account (inventory-specific, outside
interbranch's scope) is provisioned here.

TransactionEntry.clean() (transactions/models.py) forbids a single journal
entry from mixing accounts across branches, so every cross-branch step below
posts as its own single-branch Transaction — never combined:

    dispatch (from_branch):      Dr Due-from-<to_branch>       / Cr source category.inventory_account
    acknowledge (to_branch):     Dr destination category.inventory_account [+ Dr Transfer Shrinkage
                                  if short] / Cr Due-to-<from_branch> (for the FULL dispatched value,
                                  so the clearing pair always nets to zero regardless of variance)
    same-branch short receipt:   Dr Transfer Shrinkage / Cr category.inventory_account (shortfall only)
"""
from django.utils import timezone

from interbranch.models import InterBranchClearingAccount
from interbranch.services import get_or_create_clearing_account
from transactions.models import (
    Transaction as JournalEntry,
    TransactionEntry as JournalEntryLine,
    TransactionSeries,
)

TRANSFER_SERIES_CODE = 'TRF'


def get_or_create_shrinkage_account(branch):
    """
    Find or lazily provision this branch's single 'Transfer Shrinkage'
    expense account, via the canonical SYSTEM_ACCOUNTS registry
    (accounts/utils/account_creation.py) rather than a bespoke
    account-allocation mechanism.
    """
    from accounts.utils.account_creation import get_system_account

    return get_system_account('transfer_shrinkage', owner=branch.owner, branch=branch)


def _post_leg(branch, description, workflow_reference, owner, created_by, lines):
    """lines: list of (account, side, amount) tuples."""
    series, _ = TransactionSeries.objects.get_or_create(
        code=TRANSFER_SERIES_CODE, defaults={'description': 'Stock Transfers'}
    )
    journal = JournalEntry.objects.create(
        series=series,
        date=timezone.now().date(),
        description=description,
        workflow_reference=workflow_reference,
        branch=branch,
        owner=owner,
        created_by=created_by,
        tenant=branch.tenant,
    )
    for account, side, amount in lines:
        JournalEntryLine.objects.create(
            transaction=journal, account=account, side=side, amount=amount
        )
    journal.post()
    return journal


def build_dispatch_entry(transfer_request, user):
    """
    Cross-branch dispatch: Dr Due-from-<to_branch> (source's asset) /
    Cr source category.inventory_account, for quantity * unit_cost.
    """
    from_branch = transfer_request.from_branch
    to_branch = transfer_request.to_branch
    amount = transfer_request.quantity * transfer_request.unit_cost

    due_from_account = get_or_create_clearing_account(
        from_branch, to_branch, InterBranchClearingAccount.DUE_FROM
    )
    inventory_account = transfer_request.item.category.inventory_account

    return _post_leg(
        branch=from_branch,
        description=f"Transfer dispatch – {transfer_request.request_number}",
        workflow_reference=transfer_request.request_number,
        owner=user, created_by=user,
        lines=[
            (due_from_account, JournalEntryLine.DEBIT, amount),
            (inventory_account, JournalEntryLine.CREDIT, amount),
        ],
    )


def build_acknowledgment_entry(transfer_request, actual_quantity_received, unit_cost, user):
    """
    Cross-branch acknowledgment: Dr destination category.inventory_account
    (actual received value) [+ Dr Transfer Shrinkage (shortfall value) if
    short] / Cr Due-to-<from_branch> (FULL dispatched value) — always fully
    clears the Due-to/Due-from pair regardless of variance; the destination
    branch absorbs any shortfall via its own Transfer Shrinkage expense line.
    """
    from_branch = transfer_request.from_branch
    to_branch = transfer_request.to_branch

    full_value = transfer_request.quantity * unit_cost
    received_value = actual_quantity_received * unit_cost
    shortfall_qty = transfer_request.quantity - actual_quantity_received
    shortfall_value = shortfall_qty * unit_cost

    due_to_account = get_or_create_clearing_account(
        to_branch, from_branch, InterBranchClearingAccount.DUE_TO
    )
    destination_inventory_account = transfer_request.destination_item.category.inventory_account

    lines = [(destination_inventory_account, JournalEntryLine.DEBIT, received_value)]
    if shortfall_value > 0:
        shrinkage_account = get_or_create_shrinkage_account(to_branch)
        lines.append((shrinkage_account, JournalEntryLine.DEBIT, shortfall_value))
    lines.append((due_to_account, JournalEntryLine.CREDIT, full_value))

    return _post_leg(
        branch=to_branch,
        description=f"Transfer acknowledgment – {transfer_request.request_number}",
        workflow_reference=transfer_request.request_number,
        owner=user, created_by=user,
        lines=lines,
    )


def build_same_branch_shrinkage_entry(transfer_request, shortfall_qty, unit_cost, user):
    """
    Same-branch short receipt only: Dr Transfer Shrinkage / Cr
    category.inventory_account, for the shortfall value only — a full
    same-branch transfer posts no GL entry at all (nothing left the branch's
    own inventory asset account), so only the missing portion needs writing
    off here.
    """
    branch = transfer_request.to_branch
    shortfall_value = shortfall_qty * unit_cost
    inventory_account = transfer_request.destination_item.category.inventory_account
    shrinkage_account = get_or_create_shrinkage_account(branch)

    return _post_leg(
        branch=branch,
        description=f"Transfer shrinkage – {transfer_request.request_number}",
        workflow_reference=transfer_request.request_number,
        owner=user, created_by=user,
        lines=[
            (shrinkage_account, JournalEntryLine.DEBIT, shortfall_value),
            (inventory_account, JournalEntryLine.CREDIT, shortfall_value),
        ],
    )
