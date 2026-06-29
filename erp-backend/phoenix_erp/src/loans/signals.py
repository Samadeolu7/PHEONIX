# loans/signals.py
"""
Auto-create LoanVerificationRequest when a LoanAccount is created.
Auto-create LoanDisbursement when a LoanAccount is approved.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender='loans.LoanAccount')
def _handle_loan_account_post_save(sender, instance, created, **kwargs):
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

    # On approval: auto-create a LoanDisbursement request.
    # The loan creator is the disbursement creator so the loan approver can
    # also serve as the disbursement approver (3-person flow: creator → approver → disburser).
    if not created and instance.status == 'approved':
        LoanDisbursement.objects.get_or_create(
            loan=instance,
            defaults={
                'requested_by': instance.created_by or instance.owner,
                'owner': instance.owner,
                'branch': instance.branch,
                'created_by': instance.created_by or instance.approved_by,
            },
        )
