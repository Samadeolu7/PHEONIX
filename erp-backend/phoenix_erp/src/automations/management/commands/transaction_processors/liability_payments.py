# automations/management/commands/transaction_processors/liability_payments.py
from decimal import Decimal
from transactions.models import TransactionEntry

from .base_processor import BaseTransactionProcessor
from accounts.models import Account, AccountCategory

# inside LiabilityPaymentProcessor (automations/.../transaction_processors/liability_payments.py)
import os, csv
from decimal import Decimal
from transactions.models import TransactionEntry
from accounts.models import Account, AccountCategory

import logging


logger = logging.getLogger(__name__)


# automations/.../transaction_processors/liability_payments.py
import os
import csv
import logging
from decimal import Decimal
from transactions.models import TransactionEntry
from .base_processor import BaseTransactionProcessor
from accounts.models import Account, AccountCategory

logger = logging.getLogger(__name__)

class LiabilityPaymentProcessor(BaseTransactionProcessor):
    """Process liability payment transactions (and attempt to pair related bank rows)."""
    def __init__(self, context, account_manager):
        super().__init__(context, account_manager)

    def _register_bank_counterparts_for_liability_tx(self, liability_obj, txobj, tolerance=Decimal('0.01')):
        """
        When we create a tx for a liability payment fixture, look for bank.bankpayment(s)
        that share the same 'transaction' id and register them to the same txobj if the amounts align.
        """
        if not liability_obj or not txobj:
            return

        lfields = (liability_obj.get('fields') or {})
        txid = lfields.get('transaction')
        if not txid:
            return

        # find bank rows with same txid
        bank_objs = [b for b in (self.context.by_model.get('bank.bankpayment') or []) if (b.get('fields') or {}).get('transaction') == txid]
        for b in bank_objs:
            if b.get('processed'):
                continue
            b_amt = self.context.to_dec((b.get('fields') or {}).get('amount') or 0)
            # Compare magnitudes: liability fixture amount vs bank amount (signs may differ depending on convention)
            # Use tolerance to avoid tiny rounding issues
            try:
                # Attempt to use amount(s) from liability fixture
                l_amt = self.context.to_dec(lfields.get('amount') or 0)
            except Exception:
                l_amt = Decimal('0.00')

            # Accept either exact opposite sign or same sign with same magnitude
            if abs(abs(b_amt) - abs(l_amt)) <= tolerance:
                try:
                    # register and mark processed
                    self.context.register_tx('bank.bankpayment', b.get('pk'), txobj)
                except Exception:
                    logger.exception("Failed to register bank counterpart %s to liability tx", b.get('pk'))
                b['processed'] = True
            else:
                # If amounts differ significantly, do not auto-register; leave it for other logic or reconciliation
                continue

    def process_unmatched_bank_as_liability(self, bank_obj, audit_path='liability_bank_matches.csv'):
        """
        Conservative helper: if a bank row looks like a liability (keyword strategy),
        create a liability-style TX: debit bank (money in) / credit liability (or reverse for outflow).
        Returns the created txobj or None.
        """
        if not bank_obj or bank_obj.get('processed'):
            return None

        key = 'bank.bankpayment'
        pk = bank_obj.get('pk')
        f = bank_obj.get('fields') or {}
        amount = self.context.to_dec(f.get('amount') or 0)
        if amount == 0:
            return None

        desc = (f.get('description') or '').strip()
        desc_lower = desc.lower()

        # Conservative indicators: require strong phrases (adjust to your dataset)
        indicators = [
            'loan received', 'loan disbursement', 'capital to', 'capital contribution',
            'loan proceeds', 'loan received to', 'loan disburs', 'loan:',
        ]
        # quick match: if none, bail out
        if not any(k in desc_lower for k in indicators):
            return None

        # Build / find liability GL
        liability_cat, _ = self._branch_category(2, "Liabilities")
        # try to find matching liability fixture name
        liab_id = None
        liab_name = None
        for lid, lobj in (self.context.fixtures_by_app_model_pk.get('liability.liability') or {}).items():
            ln = (lobj.get('fields') or {}).get('name') or ''
            if ln and ln.lower() in desc_lower:
                liab_id = lid
                liab_name = ln
                break

        if liab_id and str(liab_id).isdigit():
            code = f"L{int(liab_id) % 100:02d}"
        else:
            code = "L99"
        liab_name = liab_name or (desc or f"Liability {pk}")

        liab_acc, _ = Account.objects.get_or_create(
            branch=self.context.branch,
            code=code,
            defaults={
                'category': liability_cat,
                'name': liab_name,
                'owner': self.context.owner,
                'created_by': self.context.owner,
                'classification': self.context.classification
            }
        )

        # Bank account
        bank_id = f.get('bank')
        bank_name = self.context.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name')
        bank_acct = self.context.account_manager.get_or_create_bank_account(bank_id, bank_name) if bank_id else (getattr(self.context, 'cash_acc', None) or getattr(self.context, 'suspense_acc', None))

        amt_abs = abs(amount)

        if amount >= 0:
            entries = [
                {'account': bank_acct, 'side': getattr(TransactionEntry, 'DEBIT', 'D'), 'amount': amt_abs},
                {'account': liab_acc, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': amt_abs},
            ]
        else:
            entries = [
                {'account': liab_acc, 'side': getattr(TransactionEntry, 'DEBIT', 'D'), 'amount': amt_abs},
                {'account': bank_acct, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': amt_abs},
            ]

        date, _ = self.context.parse_date(f, 'payment_date', 'created_at')
        desc_tx = self.context.norm_str(desc) if hasattr(self.context, 'norm_str') else desc or f"Liability inferred #{pk}"

        # create transaction defensively
        try:
            txobj = self.create_transaction(entries, desc_tx, workflow_reference=f"legacy:liability_infer:{pk}", date=date)
        except TypeError:
            txobj = self.create_transaction(entries, desc_tx, workflow_reference=f"legacy:liability_infer:{pk}")

        # Register mapping for bank payment to this tx
        try:
            self.context.register_tx('bank.bankpayment', pk, txobj)
        except Exception:
            logger.exception("Failed to register tx mapping for inferred liability bank row %s", pk)

        bank_obj['processed'] = True

        # audit CSV (so you can review all the rows that were auto-classified)
        try:
            write_header = not os.path.exists(audit_path)
            with open(audit_path, 'a', newline='', encoding='utf-8') as fh:
                w = csv.writer(fh)
                if write_header:
                    w.writerow(['bank_pk', 'bank_desc', 'bank_amount', 'liability_pk', 'liability_name', 'tx_ref'])
                w.writerow([pk, desc, str(amount), liab_id or '', liab_name or '', getattr(txobj, 'id', str(txobj))])
        except Exception:
            logger.exception("Failed to write liability audit CSV row for bank %s", pk)

        return txobj

    def process_liability_payments(self):
        """
        liability.liabilitypayment → sign-aware postings.
        Additionally: try to attach bank.bankpayment entries that share transaction id to the same tx.
        """
        key = 'liability.liabilitypayment'
        objs = self.context.by_model.get(key, []) or []
        liability_cat, _ = self._branch_category(2, "Liabilities")
        created_tx_map = {}  # txid -> txobj (for mapping bank rows afterwards)

        # First: process explicit liability.payment fixtures as before
        for obj in objs:
            if obj.get('processed'):
                continue
            pk = obj['pk']
            f = obj.get('fields') or {}
            amt_raw = f.get('amount')
            # re-use your context.abs_dec helper (if present)
            try:
                amount_abs, is_positive = self.context.abs_dec(amt_raw)
            except Exception:
                # fallback
                amount_abs = abs(self.context.to_dec(amt_raw or 0))
                is_positive = (self.context.to_dec(amt_raw or 0) >= 0)

            liab_id = f.get('liability')
            # account creation as before
            code = f"L{int(liab_id) % 100:02d}" if str(liab_id).isdigit() else "L99"
            liab_name = self.context.norm_str(self.context.fixtures_by_app_model_pk.get('liability.liability', {}).get(liab_id, {}).get('fields', {}).get('name')) or f"Liability {liab_id}"
            liab_acc, _ = Account.objects.get_or_create(
                branch=self.context.branch, code=code,
                defaults={
                    'category': liability_cat,
                    'name': liab_name,
                    'owner': self.context.owner,
                    'created_by': self.context.owner,
                    'classification': self.context.classification
                }
            )

            # Bank account (if provided on the liability payment)
            bank_id = f.get('bank')
            bank_name = self.context.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name')
            bank_acct = self.context.account_manager.get_or_create_bank_account(bank_id, bank_name) if bank_id else self.context.cash_acc

            date, base_dt = self.context.parse_date(f, 'payment_date', 'created_at')

            if is_positive:
                entries = [
                    {'account': liab_acc, 'side': TransactionEntry.DEBIT,  'amount': amount_abs},
                    {'account': bank_acct, 'side': TransactionEntry.CREDIT, 'amount': amount_abs},
                ]
            else:
                entries = [
                    {'account': bank_acct, 'side': TransactionEntry.DEBIT,  'amount': amount_abs},
                    {'account': liab_acc,  'side': TransactionEntry.CREDIT, 'amount': amount_abs},
                ]

            desc = self.context.norm_str(f.get('description')) or f"Liability entry #{pk}"
            try:
                txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:{key}:{pk}", date=date)
            except TypeError:
                txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:{key}:{pk}")

            try:
                self.context.register_tx(key, pk, txobj)
            except Exception:
                logger.exception("Failed to register tx for liability.payment %s", pk)

            obj['processed'] = True

            # If liability fixture has a transaction id, remember it so we can attach bank rows
            txid = (f or {}).get('transaction')
            if txid:
                created_tx_map[txid] = txobj

        # Second: try to attach bank rows to the liability-created TXs (best-effort)
        bank_items = (self.context.by_model.get('bank.bankpayment') or [])
        for b in bank_items:
            if b.get('processed'):
                continue
            bf = b.get('fields') or {}
            btxid = bf.get('transaction')
            if btxid and btxid in created_tx_map:
                # try to attach if amounts align
                txobj = created_tx_map[btxid]
                try:
                    # register mapping
                    self.context.register_tx('bank.bankpayment', b.get('pk'), txobj)
                    b['processed'] = True
                except Exception:
                    logger.exception("Failed to register bank counterpart %s for liability tx", b.get('pk'))

        # Third: for any remaining unprocessed bank rows that strongly look like liabilities,
        # create conservative inferred liability TXs (audit them) so they are not left as single-sided reconciliation.
        for b in bank_items:
            if b.get('processed'):
                continue
            # if bank row has a transaction and we already have a liability object with same txid but wasn't processed,
            # add reconciliation breadcrumb for that liability too (we add symmetric reconciliation entries later - see import-level pass).
            res = self.process_unmatched_bank_as_liability(b)
            if res:
                logger.info("Inferred liability transaction created for bank pk %s -> tx %s", b.get('pk'), getattr(res, 'id', res))

        # done

    def process_bank_liability(self, bank_obj, audit_path='liability_bank_matches.csv'):
        """
        Create a liability-style transaction from a bank.bankpayment row when
        the bank row represents a liability (loan received, liability increase, capital, etc).

        Returns txobj if created, None otherwise.

        Notes: This is a conservative helper — only called when bank row is judged likely
        to be a liability. It registers the mapping (bank.bankpayment -> tx).
        """
        if not bank_obj:
            return None
        # guard: already handled or already mapped
        if bank_obj.get('processed'):
            return None
        key = 'bank.bankpayment'
        pk = bank_obj.get('pk')
        f = bank_obj.get('fields') or {}
        try:
            amount = self.context.to_dec(f.get('amount') or 0)
        except Exception:
            amount = Decimal('0.00')
        if amount == 0:
            return None

        # Bank account
        bank_id = f.get('bank')
        bank_name = self.context.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name')
        bank_acct = self.context.account_manager.get_or_create_bank_account(bank_id, bank_name) if bank_id else getattr(self.context, 'cash_acc', None) or getattr(self.context, 'suspense_acc', None)

        amt_abs = abs(amount)

        # Try to match an existing liability fixture by name if present (best-effort)
        desc_guess = (f.get('description') or '').strip()
        liab_id = None
        liab_name = None
        for lid, lobj in (self.context.fixtures_by_app_model_pk.get('liability.liability') or {}).items():
            ln = (lobj.get('fields') or {}).get('name') or ''
            if ln and ln.lower() in desc_guess.lower():
                liab_id = lid
                liab_name = ln
                break

        # Create / get a liability GL account
        liability_cat, _ = self._branch_category(2, "Liabilities")
        if liab_id and str(liab_id).isdigit():
            code = f"L{int(liab_id) % 100:02d}"
        else:
            code = "L99"
        liab_name = liab_name or (desc_guess or f"Liability {pk}")

        liab_acc, _ = Account.objects.get_or_create(
            branch=self.context.branch,
            code=code,
            defaults={
                'category': liability_cat,
                'name': liab_name,
                'owner': self.context.owner,
                'created_by': self.context.owner,
                'classification': self.context.classification
            }
        )

        # Build entries: standard behaviour for bank inflow = debit bank, credit liability
        if amount >= 0:
            entries = [
                {'account': bank_acct, 'side': getattr(TransactionEntry, 'DEBIT', 'D'),  'amount': amt_abs},
                {'account': liab_acc,  'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': amt_abs},
            ]
        else:
            # negative bank amount = bank outflow -> paying down liability
            entries = [
                {'account': liab_acc,  'side': getattr(TransactionEntry, 'DEBIT', 'D'),  'amount': amt_abs},
                {'account': bank_acct, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': amt_abs},
            ]

        desc = self.context.norm_str(desc_guess) if hasattr(self.context, 'norm_str') else (desc_guess or f"Liability (inferred) #{pk}")
        date, _ = self.context.parse_date(f, 'payment_date', 'created_at')

        # defensive create_transaction signature usage
        try:
            txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:bank.liability:{pk}", date=date)
        except TypeError:
            txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:bank.liability:{pk}")

        # register mapping and mark processed
        try:
            self.context.register_tx(key, pk, txobj)
        except Exception:
            logger.exception("Failed to register bank->liability tx mapping for bank %s", pk)

        bank_obj['processed'] = True

        # optional: append a tiny audit CSV row so we can inspect matches later
        try:
            write_header = not os.path.exists(audit_path)
            with open(audit_path, 'a', newline='', encoding='utf-8') as fh:
                w = csv.writer(fh)
                if write_header:
                    w.writerow(['bank_pk', 'bank_desc', 'bank_amount', 'liability_pk', 'liability_name', 'tx_ref'])
                w.writerow([pk, desc_guess, str(amount), liab_id or '', liab_name or '', getattr(txobj, 'id', str(txobj))])
        except Exception:
            logger.exception("Failed to write liability audit CSV row for bank %s", pk)

        return txobj
