# automations/management/commands/transaction_processors/savings_payment_processor.py
import logging
import re
from decimal import Decimal
from transactions.models import TransactionEntry

from .base_processor import BaseTransactionProcessor

logger = logging.getLogger(__name__)

# Prefer using the project's collapse_spaced_letters if available; fallback to a local impl
try:
    from automations.management.commands.import_legacy_financials import collapse_spaced_letters
except Exception:
    collapse_spaced_letters = None


def _collapse_spaced_letters_local(text):
    """
    Collapse spaced-letter artifacts like:
      "S a v i n g s   P a y m e n t   b y   Y e m i"
    into normal words "Savings Payment by Yemi".
    """
    if not text:
        return text
    s = str(text)
    # collapse repeated whitespace
    s = re.sub(r'\s+', ' ', s).strip()
    tokens = s.split(' ')
    out = []
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if len(t) == 1 and t.isalpha():
            # collect run of single-letter alphabetic tokens
            run = [t]
            j = i + 1
            while j < len(tokens) and len(tokens[j]) == 1 and tokens[j].isalpha():
                run.append(tokens[j])
                j += 1
            if len(run) > 1:
                out.append(''.join(run))
                i = j
                continue
            else:
                out.append(t)
                i += 1
                continue
        else:
            out.append(t)
            i += 1
    return ' '.join(out)


def collapse_spaced_letters_safe(text):
    if collapse_spaced_letters:
        try:
            return collapse_spaced_letters(text)
        except Exception:
            return _collapse_spaced_letters_local(text)
    return _collapse_spaced_letters_local(text)


class SavingsPaymentProcessor(BaseTransactionProcessor):
    """Process savings payment transactions (individual & grouped)."""

    def __init__(self, ctx, account_manager):
        super().__init__(ctx, account_manager)
        # friendly aliases
        self.context = ctx
        self.ctx = ctx
        self.account_manager = account_manager

    def process_savings_payments(self):
        """
        Fallback processing for savings.savingspayment → DR Bank/Cash, CR Client Savings.
        Skips already-processed or already-mapped items.
        """
        key = 'savings.savingspayment'
        objs = self.context.by_model.get(key, []) or []

        for obj in objs:
            # Skip if already processed by grouping or already mapped in import_map
            if obj.get('processed'):
                continue
            if self.context.import_map.get('legacy_to_new', {}).get(f"{key}:{obj['pk']}"):
                obj['processed'] = True
                continue

            pk = obj['pk']
            f = obj.get('fields') or {}
            amount = self.context.to_dec(f.get('amount'))
            client_legacy_id = f.get('client')

            # bank / cash
            bank_id = f.get('bank')
            if bank_id:
                bank_name = self.context.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name')
                bank_acct = self.account_manager.get_or_create_bank_account(bank_id, bank_name)
            else:
                # fallback cash/suspense
                bank_acct = getattr(self.context, 'cash_acc', None) or self.context.suspense_acc

            # client GL account
            client_name = self.context.fixtures_by_app_model_pk.get('client.client', {}).get(client_legacy_id, {}).get('fields', {}).get('name')
            client_acct = self.account_manager.get_or_create_client_account(client_legacy_id, client_name or f"client_{client_legacy_id}")

            # parse date & description
            date, base_dt = self.context.parse_date(f, 'payment_date', 'created_at')
            raw_desc = f.get('description') or f.get('payment_note') or f"Savings payment #{pk}"
            desc = self.context.norm_str(collapse_spaced_letters_safe(raw_desc))

            # Build entries (use absolute amounts)
            amt = abs(amount)
            entries = [
                {'account': bank_acct,   'side': getattr(TransactionEntry, 'DEBIT', 'D'),  'amount': amt},
                {'account': client_acct, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': amt},
            ]

            # create transaction (use context helper; signature may vary so try defensively)
            try:
                txobj = self.context.create_transaction(entries, desc, workflow_reference=f"legacy:{key}:{pk}", date=date)
            except TypeError:
                # older signature fallback
                txobj = self.context.create_transaction(entries, desc, workflow_reference=f"legacy:{key}:{pk}")

            # register mapping & mark processed (register_tx handles dry-run vs commit)
            try:
                self.context.register_tx(key, pk, txobj)
            except Exception:
                logger.exception("Failed to register tx mapping for savings %s", pk)

            obj['processed'] = True

    def process_savings_group(self, full_group, tx_id):
        """
        Called by the grouping stage to create one canonical transaction for a group
        that includes savings entries and their bank counterpart.

        Behavior:
          - debit bank (first bank account if present, else cash/suspense)
          - credit each client for their savings component
          - if mapped_total != bank_total:
              * if abs(diff) <= tolerance -> ignore small rounding diffs
              * else create a suspense posting with the correct side (debit or credit) to balance
              * add a reconciliation row describing the group mismatch
        """
        if not full_group:
            return None

        # Identify bank and savings entries (be robust to model key variations)
        bank_entries = [o for o in full_group if (o.get('model') or '').lower() == 'bank.bankpayment' or (o.get('model') or '').lower().endswith('bankpayment')]
        savings_entries = [o for o in full_group if 'saving' in ((o.get('model') or '').lower())]

        if not bank_entries and not savings_entries:
            # nothing for this processor
            return None

        # choose representative (prefer bank)
        rep = bank_entries[0] if bank_entries else savings_entries[0]
        date, base_dt = self.context.parse_date(rep.get('fields', {}), 'payment_date', 'created_at')

        # compute bank_total (sum bank entries). If no bank entries, bank_total = sum(savings amounts)
        bank_total = Decimal('0.00')
        if bank_entries:
            for b in bank_entries:
                bank_total += self.context.to_dec(b.get('fields', {}).get('amount') or 0)
        else:
            for s in savings_entries:
                bank_total += self.context.to_dec(s.get('fields', {}).get('amount') or 0)

        # Build transaction: DR bank -> CR each client
        if bank_entries:
            bank_id = bank_entries[0].get('fields', {}).get('bank')
            bank_name = self.context.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name')
            bank_acct = self.account_manager.get_or_create_bank_account(bank_id, bank_name)
        else:
            bank_acct = getattr(self.context, 'cash_acc', None) or self.context.suspense_acc

        entries = []
        entries.append({'account': bank_acct, 'side': getattr(TransactionEntry, 'DEBIT', 'D'), 'amount': abs(bank_total)})

        mapped_total = Decimal('0.00')

        for s in savings_entries:
            amt = self.context.to_dec(s.get('fields', {}).get('amount') or 0)
            mapped_total += amt
            client_id = s.get('fields', {}).get('client')
            client_name = None
            if client_id:
                client_obj = self.context.fixtures_by_app_model_pk.get('client.client', {}).get(client_id, {})
                client_name = client_obj.get('fields', {}).get('name') if client_obj else None

            if client_id:
                cr_acc = self.account_manager.get_or_create_client_account(client_id, client_name or f"client_{client_id}")
                entries.append({'account': cr_acc, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': abs(amt)})
            else:
                # credit suspense for unmapped client savings
                entries.append({'account': self.context.suspense_acc, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': abs(amt)})
                self.context.reconciliation.append({
                    'legacy_model': s.get('model'),
                    'legacy_pk': s.get('pk'),
                    'reason': 'savings_component_unmapped_in_group',
                    'desc': s.get('fields', {}).get('description'),
                    'amount': str(amt)
                })
        # Include explicit income components present in the group (so they don't become "mismatch")
        mapped_total, _added_income = self._include_income_components(full_group, entries, mapped_total)




        # Decide on diff handling (tolerance)
        diff = (bank_total - mapped_total)
                # try to convert leftover diff into inscome (based on description) before suspense
        rep_desc = (rep.get('fields', {}) or {}).get('description') or ""
        diff = self._abs_diff_to_income_if_likely(diff, rep_desc, entries)
        tolerance = Decimal('5.00')  # allow small differences (configurable here)

        if abs(diff) > tolerance:
            # sign-aware balancing: if bank_total > mapped_total -> need CREDIT suspense of diff
            # if bank_total < mapped_total -> need DEBIT suspense of abs(diff)
            if diff > 0:
                # bank_total bigger than client credits => credit suspense to balance
                entries.append({'account': self.context.suspense_acc, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': abs(diff)})
            else:
                # bank_total smaller than client credits => debit suspense to balance
                entries.append({'account': self.context.suspense_acc, 'side': getattr(TransactionEntry, 'DEBIT', 'D'), 'amount': abs(diff)})
            self.context.reconciliation.append({
                'legacy_model': 'savings_group',
                'legacy_pk': f"group:{tx_id}",
                'reason': 'savings_group_mismatch',
                'desc': rep.get('fields', {}).get('description'),
                'amount': str(diff)
            })
        else:
            # small rounding diffs — ignore (but log at debug level)
            logger.debug("Savings group tx %s: small diff %s within tolerance %s — not recording reconciliation", tx_id, diff, tolerance)

        # normalize desc
        raw_desc = rep.get('fields', {}).get('description') or f"Savings group {tx_id}"
        desc = self.context.norm_str(collapse_spaced_letters_safe(raw_desc))

        # create transaction (defensive create_transaction signature)
        try:
            txobj = self.context.create_transaction(entries, desc, workflow_reference=f"legacy:savings.group:{tx_id}", date=date)
        except TypeError:
            txobj = self.context.create_transaction(entries, desc, workflow_reference=f"legacy:savings.group:{tx_id}")

        # Register tx for all items in group (idempotent where register_tx handles dry-run)
        for o in full_group:
            try:
                self.context.register_tx(o.get('model'), o.get('pk'), txobj)
            except Exception:
                logger.exception("Failed to register mapping for savings group item %s:%s", o.get('model'), o.get('pk'))
            o['processed'] = True

        return txobj
