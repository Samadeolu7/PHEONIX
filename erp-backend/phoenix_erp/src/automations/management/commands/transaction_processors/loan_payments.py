# automations/management/commands/transaction_processors/loan_payments.py
import logging
from decimal import Decimal
from transactions.models import TransactionEntry

from .base_processor import BaseTransactionProcessor

logger = logging.getLogger(__name__)


class LoanPaymentProcessor(BaseTransactionProcessor):
    """Process loan payment transactions"""

    def __init__(self, context, account_manager):
        super().__init__(context, account_manager)

    def process_loan_payments(self):
        """loan.loanpayment → DR Bank/Cash, CR Loans Receivable (principal-only by default)."""
        key = 'loan.loanpayment'
        objs = self.context.by_model.get(key, []) or []

        for obj in objs:
            # skip already-processed or already-mapped objects
            if obj.get('processed'):
                continue
            if self.context.import_map.get('legacy_to_new', {}).get(f"{key}:{obj['pk']}"):
                obj['processed'] = True
                continue

            pk = obj['pk']
            f = obj.get('fields') or {}
            amount = self.context.to_dec(f.get('amount') or 0)

            # Get bank account
            bank_id = f.get('bank')
            bank_name = self.context.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name')
            dr_acct = self.account_manager.get_or_create_bank_account(bank_id, bank_name) if bank_id else getattr(self.context, 'cash_acc', None)

            # Parse date
            date, base_dt = self.context.parse_date(f, 'payment_date', 'created_at')

            # Create transaction entries
            entries = [
                {'account': dr_acct, 'side': TransactionEntry.DEBIT, 'amount': amount},
                {'account': self.context.loans_receivable_acc, 'side': TransactionEntry.CREDIT, 'amount': amount},
            ]

            desc = self.context.norm_str(f.get('description') or f.get('payment_note')) or f"Loan payment #{pk}"

            # defensive create_transaction signature
            try:
                txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:{key}:{pk}", date=date)
            except TypeError:
                txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:{key}:{pk}")

            try:
                self.context.register_tx(key, pk, txobj)
            except Exception:
                logger.exception("Failed to register loan payment mapping %s:%s", key, pk)
                # don't mark processed if register failed
                continue

            obj['processed'] = True

    # --- group handler expected by the TransactionGrouper ---
    def process_loan_payment_group(self, full_group, tx_id):
        """
        Create one canonical transaction for a group containing loan payments
        (and optionally bank.bankpayment rows). Returns the created tx object or None.
        Behaviour mirrors other group processors: credit each loan component to client
        (or suspense if unmapped), debit bank (first bank account if present, else cash/suspense).
        """
        if not full_group:
            return None

        # identify bank & loan entries
        bank_entries = [o for o in full_group if (o.get('model') or '').lower().endswith('bankpayment')]
        loan_entries = [o for o in full_group if (o.get('model') or '').lower().startswith('loan') or 'loan' in (o.get('model') or '').lower()]

        if not loan_entries:
            # nothing for this processor
            return None

        # representative (prefer bank for date/desc)
        rep = bank_entries[0] if bank_entries else loan_entries[0]
        date, base_dt = self.context.parse_date(rep.get('fields', {}), 'payment_date', 'created_at')

        # compute bank_total (sum bank entries). If no bank entries, bank_total = sum(loan amounts)
        bank_total = Decimal('0.00')
        if bank_entries:
            for b in bank_entries:
                bank_total += self.context.to_dec((b.get('fields') or {}).get('amount') or 0)
        else:
            for l in loan_entries:
                bank_total += self.context.to_dec((l.get('fields') or {}).get('amount') or 0)

        # bank account to debit/credit
        if bank_entries:
            bank_id = bank_entries[0].get('fields', {}).get('bank')
            bank_name = self.context.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name')
            bank_acct = self.account_manager.get_or_create_bank_account(bank_id, bank_name)
        else:
            bank_acct = getattr(self.context, 'cash_acc', None) or self.context.suspense_acc

        # prepare entries: sign-aware bank side
        entries = []
        if bank_total >= 0:
            bank_side = getattr(TransactionEntry, 'DEBIT', 'D')
        else:
            bank_side = getattr(TransactionEntry, 'CREDIT', 'C')
        entries.append({'account': bank_acct, 'side': bank_side, 'amount': abs(bank_total)})

        mapped_total = Decimal('0.00')

        # credit each loan component to client account (or suspense)
        for l in loan_entries:
            f = l.get('fields') or {}
            amt = self.context.to_dec(f.get('amount') or 0)
            mapped_total += amt
            client_id = f.get('client')
            client_name = None
            if client_id:
                client_name = self.context.fixtures_by_app_model_pk.get('client.client', {}).get(client_id, {}).get('fields', {}).get('name')
            if client_id:
                cr_acc = self.account_manager.get_or_create_client_account(client_id, client_name or f"client_{client_id}")
                entries.append({'account': cr_acc, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': abs(amt)})
            else:
                entries.append({'account': self.context.suspense_acc, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': abs(amt)})
                self.context.reconciliation.append({
                    'legacy_model': l.get('model'),
                    'legacy_pk': l.get('pk'),
                    'reason': 'loan_component_unmapped_in_group',
                    'desc': (l.get('fields') or {}).get('description'),
                    'amount': str(amt)
                })

        # decide on diff handling
        diff = (bank_total - mapped_total)
        tolerance = Decimal('5.00')

        # NOTE: conservative approach — try to detect "interest"/"fee" words in rep desc and, if present,
        # consider converting the diff to income (best-effort). If you want a stronger rule, we can expand it.
        rep_desc = (rep.get('fields') or {}).get('description') or ''
        rep_desc_norm = (rep_desc or '').lower()
        if abs(diff) > tolerance and ('interest' in rep_desc_norm or 'fee' in rep_desc_norm or 'registration' in rep_desc_norm):
            # best-effort income GL; attempt to map via fixtures (if available) else fallback to suspense
            try:
                # try to find an income GL by name if you have fixtures (this is best-effort)
                incomes = (self.context.fixtures_by_app_model_pk or {}).get('income.income', {}) or {}
                income_acc = None
                if incomes:
                    # pick the income fixture with the highest fuzzy similarity to the rep desc
                    import difflib
                    best_pk = None
                    best_score = 0.0
                    for pk, obj in incomes.items():
                        name = (obj.get('fields') or {}).get('name') or ''
                        score = difflib.SequenceMatcher(None, (name or '').lower(), rep_desc_norm).ratio()
                        if score > best_score:
                            best_score = score
                            best_pk = pk
                    if best_pk and best_score >= 0.55:
                        income_acc = self._income_gl(best_pk)
                if not income_acc:
                    # no fixture match -> try generic _income_gl(None) (may raise or return default)
                    try:
                        income_acc = self._income_gl(None)
                    except Exception:
                        income_acc = getattr(self.context, 'suspense_acc', None)
                # if we have an income account, use it
                if income_acc:
                    entries.append({'account': income_acc, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': abs(diff)})
                    logger.info("Loan group %s: converted leftover diff %s into income (desc=%s)", tx_id, diff, rep_desc)
                    diff = Decimal('0.00')
            except Exception:
                # ignore mapping failures — fallback to suspense below
                logger.debug("Loan group %s: income mapping attempt failed for desc=%s", tx_id, rep_desc)

        # final fallback: sign-aware suspense
        if abs(diff) > tolerance:
            if diff > 0:
                entries.append({'account': self.context.suspense_acc, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': abs(diff)})
            else:
                entries.append({'account': self.context.suspense_acc, 'side': getattr(TransactionEntry, 'DEBIT', 'D'), 'amount': abs(diff)})
            # record reconciliation (use safe desc fallback)
            self.context.reconciliation.append({
                'legacy_model': 'loan.group',
                'legacy_pk': f"group:{tx_id}",
                'reason': 'loan_group_mismatch',
                'desc': rep_desc or f"legacy:loan.group:{tx_id}",
                'amount': str(diff)
            })

        # normalize desc & create tx (defensive to accept different create_transaction signatures)
        desc = self.context.norm_str(rep_desc) if rep_desc else f"Loan group {tx_id}"
        try:
            txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:loan.group:{tx_id}", date=date)
        except TypeError:
            txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:loan.group:{tx_id}")

        # register mapping & mark processed (only for included items)
        included_items = []
        included_items.extend(loan_entries)
        included_items.extend(bank_entries)  # include bank entries if they were present

        for o in included_items:
            try:
                self.context.register_tx(o.get('model'), o.get('pk'), txobj)
            except Exception:
                logger.exception("Failed to register mapping for loan group item %s:%s", o.get('model'), o.get('pk'))
                # don't mark processed on registration failure
                continue
            o['processed'] = True

        return txobj
