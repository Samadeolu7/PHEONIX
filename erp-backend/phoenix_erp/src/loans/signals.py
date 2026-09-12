# loans/signals.py
"""
Auto-create LoanVerificationRequest when a LoanAccount is created.
Auto-create LoanDisbursement when a LoanAccount is approved.

3-person disbursement flow:
  1. Creator  (loan officer) — creates the loan application
  2. Approver (BM)          — approves the loan; this IS the disbursement approval
  3. Disburser (finance)    — executes the fund release (≠ approver, ≠ creator)

The LoanDisbursement is therefore created in 'approved' status at loan approval time
so the Disburser can execute it directly without a separate approve action.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender='loans.LoanAccount')
def _handle_loan_account_post_save(sender, instance, created, **kwargs):
    from django.utils import timezone as tz
    from .models import LoanVerificationRequest, LoanDisbursement

    # On creation: auto-create a LoanVerificationRequest
    if created:
        nin_used = ''
        if instance.client_id:
            try:
                nin_used = instance.client.nin or ''
            except Exception:
                pass
        LoanVerificationRequest.objects.get_or_create(
            loan=instance,
            defaults={
                'nin_used': nin_used,
                'owner': instance.owner,
                'branch': instance.branch,
                'created_by': instance.created_by,
            },
        )

    # On approval: auto-create a LoanDisbursement already in 'approved' state.
    # The BM who approved the loan IS the disbursement approver — no separate step needed.
    if not created and instance.status == 'approved':
        disbursement, was_created = LoanDisbursement.objects.get_or_create(
            loan=instance,
            defaults={
                'requested_by': instance.created_by or instance.owner,
                'approved_by': instance.approved_by,
                'approved_at': tz.now(),
                'status': 'approved',
                'owner': instance.owner,
                'branch': instance.branch,
                'tenant': instance.tenant,
                'created_by': instance.created_by or instance.approved_by,
            },
        )

        # This — not DisbursementService.approve() — is the real place a
        # disbursement enters "approved, awaiting execution" for this
        # business's 3-person flow (see module docstring): the BM's loan
        # approval IS the disbursement approval, so DisbursementService.approve()
        # is never actually called in practice. The only alert that fired
        # before this was the post-execution "loan_disbursed" one — too late
        # to prompt the Disburser into acting. Only alert on first creation,
        # not on every subsequent post_save of an already-approved loan.
        if was_created:
            try:
                from notifications.telegram_alerts import notify_pending_disbursements
                notify_pending_disbursements(
                    'loan_disbursement_awaiting_execution',
                    f'⏳ Loan Disbursement Awaiting Execution — {instance.loan_number}',
                    (
                        f"₦{instance.principal_amount:,.2f} approved for disbursement to "
                        f"{instance.client} — approved by "
                        f"{instance.approved_by.get_full_name() or instance.approved_by.username if instance.approved_by else 'unknown'} "
                        f"— needs a different, authorised person to execute it."
                    ),
                    owner=instance.owner, branch=instance.branch, related_object=disbursement,
                )
            except Exception:
                import logging
                logging.getLogger(__name__).exception(
                    "Failed to send loan-disbursement-awaiting-execution Telegram alert for %s",
                    instance.loan_number,
                )
