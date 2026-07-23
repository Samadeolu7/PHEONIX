# transactions/signals.py
"""
Signals for the transactions app.

Key signal:
  post_save on Transaction → whenever a Transaction that's currently
  claimed by a matched ReconciliationBankTransaction is soft-deleted
  (is_deleted=True) or reversed (is_reversed=True), automatically
  unmatch() every bank line still pointing at it.

Why this exists: ReconciliationBankTransaction.matched_erp_payment_id is a
plain IntegerField, not a real foreign key (see its own field comment,
banks/models.py) — nothing clears or reopens the bank-side claim
automatically when the Transaction it points to stops being a valid
payment. Confirmed in production: 20 bank lines still showing "Matched"
while claiming a payment that had since been deleted or reversed —
invisible to every tool that looks for genuinely unmatched (matched=False)
rows, silently blocking the correct pairing from ever being made (see
banks/management/commands/unmatch_double_blocked_matches.py, built to
clean up the existing backlog this signal now prevents from recurring).

There is no single call site to hook instead: is_deleted gets set both by
the generic ScopedModelViewSet.perform_destroy (common/views.py, shared by
every soft-deletable model's DELETE endpoint) and by a fallback path in
InvoiceViewSet.reject_payment_reversal (incomes/views.py); is_reversed
gets set by Transaction.reverse()/.void() (called from several places —
phantom-transfer resolution, LoanDisbursementCorrection, direct API use).
A model-level signal is the only place that reliably sees all of them.
"""
import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender='transactions.Transaction')
def auto_unmatch_reconciliation_claims_on_invalidation(sender, instance, **kwargs):
    """
    Runs on every Transaction save, but the is_deleted/is_reversed check
    below is a cheap in-memory attribute read — the database query for
    matched bank lines only ever runs on the rare save where one of those
    is actually True, so this adds no overhead to ordinary transaction
    saves (approvals, new entries, etc.).
    """
    if not (instance.is_deleted or instance.is_reversed):
        return

    from django.core.exceptions import ValidationError

    from banks.models import ReconciliationBankTransaction

    # Deliberately NOT excluding match_confidence='MANUAL' here (unlike the
    # bulk cleanup commands, e.g. unmatch_double_blocked_matches) — those
    # exclusions exist because a heuristic guess might be wrong and a
    # director's confirmed judgment deserves the benefit of the doubt. This
    # trigger is a hard fact, not a heuristic: the payment itself no longer
    # exists as approved/valid, so the match is wrong regardless of how
    # confidently it was made.
    claims = ReconciliationBankTransaction.objects.filter(
        matched=True, matched_erp_payment_id=instance.id,
    )
    if not claims:
        return

    invalidation = 'deleted' if instance.is_deleted else 'reversed'
    reason = (
        f'Automated: the ERP payment this line was matched to was {invalidation} '
        f'(Transaction {instance.pk}) — freed so the correct pairing can be made.'
    )
    for tx in claims:
        try:
            tx.unmatch(None, reason)
        except ValidationError:
            # Already unmatched by a concurrent process — nothing to do.
            continue
        except Exception:
            # Never let a signal crash the save that triggered it.
            logger.exception(
                "auto_unmatch_reconciliation_claims_on_invalidation: failed to "
                "unmatch ReconciliationBankTransaction %s claiming invalidated "
                "Transaction %s", tx.pk, instance.pk,
            )
