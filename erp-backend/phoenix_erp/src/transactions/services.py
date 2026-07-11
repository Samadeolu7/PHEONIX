from decimal import Decimal
from typing import Optional, Dict

from django.conf import settings
from django.db import transaction as db_transaction
from django.core.exceptions import ValidationError
from django.utils import timezone

from transactions.models import Transaction, TransactionEntry, TransactionSeries
from accounts.models import Account


class TransactionService:
    """Service layer for creating and managing financial transactions.

    Design goals:
    - Single place to create balanced transactions and post entries atomically.
    - Centralised validation and error messages (period checks, balancing, accounts exist).
    - Safe concurrent posting using DB-level updates and select_for_update where appropriate.

    Note: This service expects the accounting rules (which side to debit / credit)
    to be provided by the caller (or configured in settings). Keeping the mapping
    outside the model keeps the models generic and the business rules flexible.
    """

    @staticmethod
    def _get_series(series_code: Optional[str]) -> TransactionSeries:
        """Return a TransactionSeries by code or the default series from settings.
        Raises ValidationError if no series available.
        """
        code = series_code or getattr(settings, "DEFAULT_TRANSACTION_SERIES", None)
        if not code:
            raise ValidationError("No transaction series provided and no default configured.")
        try:
            return TransactionSeries.objects.get(code=code)
        except TransactionSeries.DoesNotExist:
            raise ValidationError(f"Transaction series '{code}' does not exist")

    @staticmethod
    def _resolve_counter_account(counter_account_id: Optional[int], transaction_type: Optional[str]):
        """Resolve the counter account id for this transaction.

        Rules:
        - If caller supplied counter_account_id, use it (must exist).
        - Else try to map transaction_type to an account id via settings.TRANSACTION_TYPE_ACCOUNT_MAP.
        - Else raise.
        """
        if counter_account_id:
            try:
                return Account.objects.get(pk=counter_account_id)
            except Account.DoesNotExist:
                raise ValidationError("Counter account does not exist")

        # mapping example in settings: {'receipt': 100, 'payment': 101}
        mapping = getattr(settings, "TRANSACTION_TYPE_ACCOUNT_MAP", {})
        if transaction_type and transaction_type in mapping:
            try:
                return Account.objects.get(pk=mapping[transaction_type])
            except Account.DoesNotExist:
                raise ValidationError("Mapped counter account does not exist")

        raise ValidationError("No counter account could be resolved for this transaction")

    @classmethod
    def create_transaction(
        cls,
        account_id: int,
        amount: Decimal,
        transaction_type: str,
        description: str,
        reference: Optional[str] = None,
        owner=None,
        branch=None,
        tenant=None,
        series_code: Optional[str] = None,
        counter_account_id: Optional[int] = None,
        approve: bool = False,
        created_by=None,
    ) -> Transaction:
        """Create, validate, and post a balanced transaction.

        Parameters
        ----------
        account_id: int
            Primary account involved in the business action (e.g. Cash on hand)
        amount: Decimal
            Positive Decimal amount
        transaction_type: str
            A semantic type used to look up the counter account if none supplied.
        description: str
            Transaction narrative shown on the journal
        reference: Optional[str]
            Optional external reference string (e.g. invoice id). Will be stored on workflow_reference.
        owner, branch, tenant
            Required for multi‑tenant/branch scoping. If omitted, caller must ensure defaults.
        series_code: Optional[str]
            If provided selects a TransactionSeries. Otherwise uses settings.DEFAULT_TRANSACTION_SERIES.
        counter_account_id: Optional[int]
            Explicit counter-account. If omitted, resolved via settings.TRANSACTION_TYPE_ACCOUNT_MAP.
        approve: bool
            If True the transaction will be marked approved after posting (optional).
        created_by: User
            Who created the transaction (useful for audit fields)

        Returns
        -------
        Transaction
            The created Transaction (already posted). Raises ValidationError on problems.
        """
        if amount <= 0:
            raise ValidationError("Amount must be a positive value")

        # resolve objects
        try:
            account = Account.objects.get(pk=account_id)
        except Account.DoesNotExist:
            raise ValidationError("Primary account does not exist")

        counter_account = cls._resolve_counter_account(counter_account_id, transaction_type)
        series = cls._get_series(series_code)

        # Decide sides: caller business rule determines whether primary account is DR or CR
        # We use a small helper mapping in settings: TRANSACTION_PRIMARY_SIDE, e.g. {'receipt': 'DR', 'payment': 'CR'}
        primary_side = getattr(settings, "TRANSACTION_PRIMARY_SIDE", {}).get(transaction_type)
        if primary_side not in (TransactionEntry.DEBIT, TransactionEntry.CREDIT):
            raise ValidationError("Unable to determine which side the primary account should be booked on for this transaction_type")

        opposite_side = TransactionEntry.CREDIT if primary_side == TransactionEntry.DEBIT else TransactionEntry.DEBIT

        # Persist everything atomically and safely
        with db_transaction.atomic():
            tx = Transaction.objects.create(
                series=series,
                date=timezone.localdate(),
                workflow_reference=reference,
                description=description,
                owner=owner,
                branch=branch,
                tenant=tenant,
                created_by=created_by,
            )

            # create entries
            primary_entry = TransactionEntry.objects.create(
                transaction=tx,
                account=account,
                side=primary_side,
                amount=amount,
            )

            counter_entry = TransactionEntry.objects.create(
                transaction=tx,
                account=counter_account,
                side=opposite_side,
                amount=amount,
            )

            # run model validation (this will ensure balancing and period closure)
            tx.full_clean()

            # Post entries safely: lock affected accounts to avoid race conditions
            # Select and update balances with F expressions performed inside the transaction
            Account.objects.select_for_update().filter(pk__in=[account.pk, counter_account.pk])

            # call post on each entry (entry.post() uses F expressions)
            primary_entry.post()
            counter_entry.post()

            if approve:
                tx.approved = True
                tx.approved_by = created_by
                tx.approved_at = timezone.now()
                tx.save(update_fields=["approved", "approved_by", "approved_at"])

            # return the created transaction (entries are available via tx.entries.all())
            return tx

    @classmethod
    def reverse_transaction(cls, tx: Transaction, user, reason: str = "") -> Transaction:
        """Convenience wrapper around Transaction.reverse to keep business logic in the service layer."""
        return tx.reverse(user=user, reason=reason)

    @classmethod
    def void_transaction(cls, tx: Transaction, user, reason: str = "") -> None:
        """Convenience wrapper around Transaction.void."""
        return tx.void(user=user, reason=reason)
