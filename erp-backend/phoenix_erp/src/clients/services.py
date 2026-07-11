from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction as db_transaction
from django.utils import timezone

from .models import Client, ClientRegistrationConfig


def get_active_registration_config(owner, branch=None) -> ClientRegistrationConfig | None:
    """
    Resolve active config for this branch first, then tenant-wide fallback.

    Configs are shared tenant resources — any user in the tenant can see them
    regardless of who created them.  The ``owner`` param is a User and is used
    only to derive the tenant; it is NOT used as a filter condition.
    """
    tenant = getattr(owner, 'tenant', None)
    if not tenant:
        return None
    qs = ClientRegistrationConfig.objects.filter(tenant=tenant, is_active=True)
    if branch:
        cfg = qs.filter(branch=branch).order_by('-updated_at').first()
        if cfg:
            return cfg
    return qs.filter(branch__isnull=True).order_by('-updated_at').first()


@db_transaction.atomic
def collect_client_registration_fees(
    *,
    client: Client,
    cashier_account,
    transacted_by,
    config: ClientRegistrationConfig,
):
    """
    Post client registration + ID fee collection as a cash transaction.

    Entry:
      Dr Cashier Account (ASSET)
      Cr Registration Income (INCOME)
      Cr ID Fee Income (INCOME)
    """
    if not cashier_account:
        raise ValidationError('cashier_account is required to collect registration fees.')

    registration_fee, id_fee = config.get_fees_for_client_type(client.client_type)
    registration_fee = Decimal(str(registration_fee or 0))
    id_fee = Decimal(str(id_fee or 0))
    total = registration_fee + id_fee

    if total <= 0:
        return None

    from transactions.models import (
        Transaction as JournalEntry,
        TransactionEntry as JournalEntryLine,
        TransactionSeries,
    )

    series, _ = TransactionSeries.objects.get_or_create(
        code='CLREG',
        defaults={'description': 'Client Registration Fee Collection'},
    )

    journal = JournalEntry.objects.create(
        series=series,
        date=timezone.now().date(),
        description=(
            f"Client registration fees - {client.client_id} "
            f"({client.full_name})"
        ),
        owner=client.owner,
        branch=client.branch,
        created_by=transacted_by,
        tenant=client.tenant,
    )

    # Cash received at counter
    JournalEntryLine.objects.create(
        transaction=journal,
        account=cashier_account,
        side=JournalEntryLine.DEBIT,
        amount=total,
    )

    if registration_fee > 0:
        JournalEntryLine.objects.create(
            transaction=journal,
            account=config.registration_income_account,
            side=JournalEntryLine.CREDIT,
            amount=registration_fee,
        )

    if id_fee > 0:
        JournalEntryLine.objects.create(
            transaction=journal,
            account=config.id_fee_income_account,
            side=JournalEntryLine.CREDIT,
            amount=id_fee,
        )

    journal.post()
    return journal
