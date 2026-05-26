# automations/management/commands/transaction_processors/income_payments.py
from decimal import Decimal
from transactions.models import TransactionEntry
from .base_processor import BaseTransactionProcessor
import re
import difflib
import logging

logger = logging.getLogger(__name__)

class IncomePaymentProcessor(BaseTransactionProcessor):
    """Process income payment transactions (explicit + bank rows that are income-like)"""
    
    def __init__(self, context, account_manager):
        super().__init__(context, account_manager)

    # ---- helpers ----
    def _norm(self, s):
        if not s:
            return ''
        try:
            s = self.context.norm_str(s)
        except Exception:
            s = str(s).strip()
        s = re.sub(r'[^\w\s]', ' ', s)
        s = re.sub(r'\s+', ' ', s).strip().lower()
        return s

    def _is_income_like(self, desc_norm: str) -> bool:
        kws = [
            "income", "fee", "interest", "premium", "registration", "admin", "administrative", "id fee",
            "sms", "daily contribution", "dc income", "registration fee", "loan registration"
        ]
        return any(k in desc_norm for k in kws)

    def _find_income_fixture_pk(self, desc_norm: str):
        incomes = (self.context.fixtures_by_app_model_pk or {}).get('income.income', {}) or {}
        if not incomes:
            return None
        # prepare candidates as (pk, normalized_name)
        cand = []
        for pk, obj in incomes.items():
            name = (obj.get('fields') or {}).get('name') or ''
            name_norm = self._norm(name)
            if name_norm:
                cand.append((pk, name_norm))
        if not cand:
            return None
        # quick inclusion match
        for pk, name_norm in cand:
            if name_norm in desc_norm or desc_norm in name_norm:
                return pk
        # fuzzy match fallback
        best = max(cand, key=lambda x: difflib.SequenceMatcher(None, x[1], desc_norm).ratio(), default=None)
        if best and difflib.SequenceMatcher(None, best[1], desc_norm).ratio() >= 0.65:
            return best[0]
        return None

    def _income_account_from_entry_or_desc(self, fields, desc):
        # prefer explicit income id in fields
        income_id = (fields or {}).get('income')
        if income_id:
            try:
                return self._income_gl(income_id)
            except Exception:
                pass
        # try to map desc -> income fixture
        pk = self._find_income_fixture_pk(self._norm(desc or ""))
        if pk:
            try:
                return self._income_gl(pk)
            except Exception:
                pass
        # fallback: rely on _income_gl handling of None or None -> suspense
        try:
            return self._income_gl(income_id)
        except Exception:
            return getattr(self.context, 'suspense_acc', None)

    # ---- main ----
    def process_income_payments(self):
        """income.incomepayment → DR Bank/Cash, CR Income GL.
           Also: process bank.bankpayment rows that look like incomes by description.
        """
        key = 'income.incomepayment'
        objs = self.context.by_model.get(key, []) or []

        # explicit income payments (original behavior, with abs(amount))
        for obj in objs:
            pk = obj['pk']
            f = obj.get('fields') or {}
            amount = abs(self.context.to_dec(f.get('amount') or 0))
            bank_id = f.get('bank')

            bank_name = self.context.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name')
            bank_acct = self.account_manager.get_or_create_bank_account(bank_id, bank_name) if bank_id else self.context.cash_acc

            income_acc = self._income_account_from_entry_or_desc(f, f.get('description'))

            date, base_dt = self.context.parse_date(f, 'payment_date', 'created_at')

            entries = [
                {'account': bank_acct,  'side': TransactionEntry.DEBIT,  'amount': amount},
                {'account': income_acc, 'side': TransactionEntry.CREDIT, 'amount': amount},
            ]

            desc = self.context.norm_str(f.get('description')) or f"Income payment #{pk}"
            # defensive create_transaction signature
            try:
                txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:{key}:{pk}", date=date)
            except TypeError:
                txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:{key}:{pk}")

            try:
                self.context.register_tx(key, pk, txobj)
            except Exception:
                logger.exception("Failed to register income payment mapping %s:%s", key, pk)
            obj['processed'] = True

        # --------------------------------------
        # Now scan bank.bankpayment items that are unprocessed and look income-like
        # --------------------------------------
        bank_key = 'bank.bankpayment'
        bank_objs = self.context.by_model.get(bank_key, []) or []

        for obj in bank_objs:
            if obj.get('processed'):
                continue
            pk = obj.get('pk')
            legacy_map = (self.context.import_map or {}).get('legacy_to_new', {}).get(f"{bank_key}:{pk}")
            if legacy_map:
                # already mapped elsewhere
                obj['processed'] = True
                continue

            f = obj.get('fields') or {}
            desc_raw = f.get('description') or f.get('narration') or ''
            desc_norm = self._norm(desc_raw)

            if not desc_norm:
                continue

            if not self._is_income_like(desc_norm):
                continue

            # amount (use absolute)
            amount = abs(self.context.to_dec(f.get('amount') or 0))

            # skip creating transactions for zero amounts to avoid odd zero-value TXs;
            # log & mark processed for manual review
            if amount == 0:
                logger.info("bank.bankpayment %s classified as income (zero amount) — logging and marking processed", pk)
                self.context.reconciliation.append({
                    'legacy_model': bank_key,
                    'legacy_pk': pk,
                    'reason': 'income_zero_amount_classified',
                    'desc': desc_raw,
                    'amount': str(amount)
                })
                obj['processed'] = True
                continue

            bank_id = f.get('bank')
            bank_name = self.context.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name')
            bank_acct = self.account_manager.get_or_create_bank_account(bank_id, bank_name) if bank_id else self.context.cash_acc

            income_acc = self._income_account_from_entry_or_desc(f, desc_raw) or getattr(self.context, 'suspense_acc', None)

            date, base_dt = self.context.parse_date(f, 'payment_date', 'created_at')

            entries = [
                {'account': bank_acct,  'side': TransactionEntry.DEBIT,  'amount': amount},
                {'account': income_acc, 'side': TransactionEntry.CREDIT, 'amount': amount},
            ]

            desc = self.context.norm_str(desc_raw) or f"Bank income (classified) #{pk}"

            try:
                txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:{bank_key}:{pk}", date=date)
            except TypeError:
                txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:{bank_key}:{pk}")

            try:
                self.context.register_tx(bank_key, pk, txobj)
            except Exception:
                logger.exception("Failed to register bank-as-income mapping %s:%s", bank_key, pk)
                # if register failed, do not mark processed
                continue

            obj['processed'] = True
            logger.info("bank.bankpayment %s classified -> income tx %s", pk, getattr(txobj, 'id', txobj))

