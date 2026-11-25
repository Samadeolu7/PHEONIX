"""
CASH CUSTODY RULE — project standard for every feature that handles cash.

Cash sits in a physical till in a physical branch. So:

    Staff may only receive cash from, or pay cash to, a customer of the
    branch they are ACTING in, and it always goes through their own till in
    that branch.

"Acting branch" = the branch selected in the branch switcher (X-Branch-ID)
when the user is allowed to act there (directors: any branch; other staff:
their home branch or a temporarily granted one), otherwise their assigned
home branch. Staff are moved between branches temporarily while their home
branch stays the same, so never use ``request.user.branch`` for this.

This keeps cash, till and the customer's records in ONE branch — no cash
ever sits in one branch's drawer but in another branch's books. (Money that
genuinely moves between branches through banks is handled separately, via
Due To / Due From: interbranch.services.add_entry.)

How to follow it in new code:
  * Get the till through PaymentRoutingService.resolve_cashier_gl_account()
    or IncomeAccountingService.get_cash_account(). Both REQUIRE
    ``acting_branch=acting_branch(request)`` and enforce this rule.
  * Anything else that touches a CashierAccount for a customer must call
    require_cash_custody() first.
"""
from django.core.exceptions import ValidationError


def acting_branch(request):
    """The branch ``request``'s user is working in right now (see module doc).

    Returns None for a director who has not selected a branch ("all branches"
    mode) — they must pick one before handling cash.
    """
    from common.views import resolve_effective_branch
    return resolve_effective_branch(request)


def require_cash_custody(acting, customer_branch, customer=None):
    """Raise ValidationError unless cash for a customer of ``customer_branch``
    may be handled by staff acting in ``acting``."""
    if customer_branch is None:
        return
    who = getattr(customer, 'full_name', None) or 'This customer'
    if acting is None:
        raise ValidationError(
            f"Select {customer_branch.name} in the branch switcher before handling "
            f"cash for {who}."
        )
    if acting.pk != customer_branch.pk:
        raise ValidationError(
            f"{who} belongs to {customer_branch.name}, but you are working in "
            f"{acting.name}. Cash can only be handled in the customer's own branch: "
            f"switch to {customer_branch.name} in the branch switcher (if you have "
            f"been given access) to continue."
        )
