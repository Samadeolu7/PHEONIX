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
        LoanDisbursement.objects.get_or_create(
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
