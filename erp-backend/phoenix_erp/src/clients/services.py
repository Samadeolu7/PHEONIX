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

    # Mirrors SavingsAccount.deposit()'s FinancialAuditLog call: Transaction
    # has no client FK, so without this a per-client collections report
    # (e.g. daily collection sheet) has no reliable way to attribute a
    # CLREG journal entry back to which client paid what.
    from common.models import FinancialAuditLog, log_financial_event
    log_financial_event(
        FinancialAuditLog.CLIENT_REGISTRATION_FEE,
        acted_by=transacted_by,
        record_type='Client',
        record_id=str(client.pk),
        amount=total,
        description=f"Registration + ID fee – {client.client_id} ({client.full_name})",
        extra={
            'client_id': str(client.pk),
            'journal_entry_id': str(journal.pk),
            'registration_fee': str(registration_fee),
            'id_fee': str(id_fee),
        },
    )

    return journal


@db_transaction.atomic
def collect_client_reactivation_fee(
    *,
    client: Client,
    cashier_account,
    transacted_by,
    config: ClientRegistrationConfig,
):
    """
    Post the client reactivation fee as a cash transaction.

    Entry:
      Dr Cashier Account (ASSET)
      Cr Reactivation Income (INCOME) — falls back to the registration
         income account when the config doesn't set a dedicated one.
    """
    if not cashier_account:
        raise ValidationError('cashier_account is required to collect the reactivation fee.')

    fee = Decimal(str(config.reactivation_fee or 0))
    if fee <= 0:
        return None

    income_account = config.reactivation_income_account or config.registration_income_account

    from transactions.models import (
        Transaction as JournalEntry,
        TransactionEntry as JournalEntryLine,
        TransactionSeries,
    )

    series, _ = TransactionSeries.objects.get_or_create(
        code='CLRAC',
        defaults={'description': 'Client Reactivation Fee Collection'},
    )

    journal = JournalEntry.objects.create(
        series=series,
        date=timezone.now().date(),
        description=(
            f"Client reactivation fee - {client.client_id} "
            f"({client.full_name})"
        ),
        owner=client.owner,
        branch=client.branch,
        created_by=transacted_by,
        tenant=client.tenant,
    )

    JournalEntryLine.objects.create(
        transaction=journal,
        account=cashier_account,
        side=JournalEntryLine.DEBIT,
        amount=fee,
    )
    JournalEntryLine.objects.create(
        transaction=journal,
        account=income_account,
        side=JournalEntryLine.CREDIT,
        amount=fee,
    )

    journal.post()

    from common.models import FinancialAuditLog, log_financial_event
    log_financial_event(
        FinancialAuditLog.CLIENT_REACTIVATION_FEE,
        acted_by=transacted_by,
        record_type='Client',
        record_id=str(client.pk),
        amount=fee,
        description=f"Reactivation fee – {client.client_id} ({client.full_name})",
        extra={
            'client_id': str(client.pk),
            'journal_entry_id': str(journal.pk),
            'reactivation_fee': str(fee),
        },
    )

    return journal
