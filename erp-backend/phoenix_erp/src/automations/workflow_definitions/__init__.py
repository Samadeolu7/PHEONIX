"""School workflow definitions package.

This package exposes a single helper `initialize_school_workflows()` which
delegates to the individual workflow creator functions. The actual workflow
definitions live in `school_workflows.py` and are re-exported via the small
wrapper modules in this package to provide better organization.
"""
from . import (
    school_auto_invoicing as auto_invoicing,
    school_debtor_management as debtor_management,
    school_purchase_request as purchase_request,
    school_accounts_payable as accounts_payable,
    school_cash_reconciliation as cash_recon,
    school_payroll as payroll,
    school_asset_management as asset_mgmt,
    school_inventory_reorder as inventory_reorder,
)

def initialize_school_workflows():
    """Create or return all school workflows.

    Returns a list of created WorkflowTemplate instances. This function keeps
    the same high-level behavior as the previous single-file initializer but
    composes it from the split modules.
    """
    workflows = []

    # Auto invoicing
    workflows.append(auto_invoicing.create_auto_invoice_workflow())

    # Debtor management
    workflows.append(debtor_management.create_debtor_management_workflow())

    # Purchase request approval
    workflows.append(purchase_request.create_purchase_request_workflow())

    # Accounts payable (3-way match)
    workflows.append(accounts_payable.create_accounts_payable_workflow())

    # Cash reconciliation
    workflows.append(cash_recon.create_cash_reconciliation_workflow())

    # Payroll
    workflows.append(payroll.create_payroll_workflow())

    # Asset management may return a tuple (acquisition, movement)
    asset_workflows = asset_mgmt.create_asset_management_workflows()
    if isinstance(asset_workflows, (list, tuple)):
        workflows.extend(asset_workflows)
    else:
        workflows.append(asset_workflows)

    # Inventory reorder
    workflows.append(inventory_reorder.create_inventory_reorder_workflow())

    return workflows

__all__ = ["initialize_school_workflows"]
