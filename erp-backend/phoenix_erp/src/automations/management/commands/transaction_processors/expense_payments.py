# automations/management/commands/transaction_processors/expense_payments.py
from decimal import Decimal
from transactions.models import TransactionEntry
from .base_processor import BaseTransactionProcessor
import re
import difflib
import logging

logger = logging.getLogger(__name__)

class ExpensePaymentProcessor(BaseTransactionProcessor):
    """Process expense payment transactions (explicit + bank rows that are expense-like)"""
    
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

    def _is_expense_like(self, desc_norm: str) -> bool:
        kws = [
            "salary", "nepa", "electricity", "water", "bank charge", "bank charges", "expenses",
            "weekly", "payment", "software", "computer", "contractor", "rent", "allowance", "transport",
            "bank charges", "bank charge", "weekly expenses", "salary payment", "bank transfer"
        ]
        return any(k in desc_norm for k in kws)

    def _find_expense_fixture_pk(self, desc_norm: str):
        # try expensetype first, then expense fixtures
        fixtures = self.context.fixtures_by_app_model_pk or {}
        candidates = {}
        for model_key in ('expenses.expensetype', 'expenses.expense'):
            items = fixtures.get(model_key, {}) or {}
            for pk, obj in items.items():
                name = (obj.get('fields') or {}).get('name') or (obj.get('fields') or {}).get('description') or ''
                name_norm = self._norm(name)
                if name_norm:
                    candidates[pk] = name_norm
        if not candidates:
            return None
        # inclusion pass
        for pk, name_norm in candidates.items():
            if name_norm in desc_norm or desc_norm in name_norm:
                return pk
        # fuzzy match fallback
        best = max(candidates.items(), key=lambda x: difflib.SequenceMatcher(None, x[1], desc_norm).ratio(), default=(None, None))
        if best[0] and difflib.SequenceMatcher(None, best[1], desc_norm).ratio() >= 0.65:
            return best[0]
        return None

    def _expense_account_from_entry_or_desc(self, fields, desc):
        expense_id = (fields or {}).get('expense')
        if expense_id:
            try:
                return self._expense_gl(expense_id)
            except Exception:
                pass
        pk = self._find_expense_fixture_pk(self._norm(desc or ""))
        if pk:
            try:
                return self._expense_gl(pk)
            except Exception:
                pass
        # fallback to _expense_gl(None) if implemented; otherwise use suspense
        try:
            return self._expense_gl(expense_id)
        except Exception:
            return getattr(self.context, 'suspense_acc', None)

    # ---- main ----
    def process_expense_payments(self):
        """expenses.expensepayment → DR Expense, CR Bank/Cash.
           Also: detect bank.bankpayment rows that are expense-like and create expense TXs.
        """
        key = 'expenses.expensepayment'
        objs = self.context.by_model.get(key, []) or []

        # explicit expense payments (original behavior)
        for obj in objs:
            pk = obj['pk']
            f = obj.get('fields') or {}
            amount = abs(self.context.to_dec(f.get('amount') or 0))

            exp_acc = self._expense_account_from_entry_or_desc(f, f.get('description'))

            bank_id = f.get('bank')
            bank_name = self.context.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name')
            bank_acct = self.context.account_manager.get_or_create_bank_account(bank_id, bank_name) if bank_id else self.context.cash_acc

            date, base_dt = self.context.parse_date(f, 'payment_date', 'created_at')

            entries = [
                {'account': exp_acc,  'side': TransactionEntry.DEBIT,  'amount': amount},
                {'account': bank_acct, 'side': TransactionEntry.CREDIT, 'amount': amount},
            ]

            desc = self.context.norm_str(f.get('description')) or f"Expense payment #{pk}"
            try:
                txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:{key}:{pk}", date=date)
            except TypeError:
                txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:{key}:{pk}")

            try:
                self.context.register_tx(key, pk, txobj)
            except Exception:
                logger.exception("Failed to register expense payment mapping %s:%s", key, pk)
            obj['processed'] = True

        # --------------------------------------
        # Scan bank.bankpayment for expense-like rows
        # --------------------------------------
        bank_key = 'bank.bankpayment'
        bank_objs = self.context.by_model.get(bank_key, []) or []

        for obj in bank_objs:
            if obj.get('processed'):
                continue
            pk = obj.get('pk')
            legacy_map = (self.context.import_map or {}).get('legacy_to_new', {}).get(f"{bank_key}:{pk}")
            if legacy_map:
                obj['processed'] = True
                continue

            f = obj.get('fields') or {}
            desc_raw = f.get('description') or f.get('narration') or ''
            desc_norm = self._norm(desc_raw)
            if not desc_norm:
                continue

            if not self._is_expense_like(desc_norm):
                continue

            amount = abs(self.context.to_dec(f.get('amount') or 0))
            # skip zero amounts (log & classify) to avoid zero-value TXs
            if amount == 0:
                logger.info("bank.bankpayment %s classified as expense (zero amount) — logging and marking processed", pk)
                self.context.reconciliation.append({
                    'legacy_model': bank_key,
                    'legacy_pk': pk,
                    'reason': 'expense_zero_amount_classified',
                    'desc': desc_raw,
                    'amount': str(amount)
                })
                obj['processed'] = True
                continue

            bank_id = f.get('bank')
            bank_name = self.context.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name')
            bank_acct = self.context.account_manager.get_or_create_bank_account(bank_id, bank_name) if bank_id else self.context.cash_acc

            exp_acc = self._expense_account_from_entry_or_desc(f, desc_raw) or getattr(self.context, 'suspense_acc', None)

            date, base_dt = self.context.parse_date(f, 'payment_date', 'created_at')

            entries = [
                {'account': exp_acc,  'side': TransactionEntry.DEBIT,  'amount': amount},
                {'account': bank_acct, 'side': TransactionEntry.CREDIT, 'amount': amount},
            ]

            desc = self.context.norm_str(desc_raw) or f"Bank expense (classified) #{pk}"

            try:
                txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:{bank_key}:{pk}", date=date)
            except TypeError:
                txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:{bank_key}:{pk}")

            try:
                self.context.register_tx(bank_key, pk, txobj)
            except Exception:
                logger.exception("Failed to register bank-as-expense mapping %s:%s", bank_key, pk)
                continue

            obj['processed'] = True
            logger.info("bank.bankpayment %s classified -> expense tx %s", pk, getattr(txobj, 'id', txobj))
