# automations/management/commands/transaction_processors/bank_payments.py
import logging
import re
from decimal import ROUND_HALF_UP, Decimal
from collections import defaultdict
from datetime import timedelta
from time import time

from automations.management.commands.transaction_processors.transaction_grouper import _audit_tx_group, _quant
from transactions.models import TransactionEntry
from .base_processor import BaseTransactionProcessor
from accounts.models import Account, AccountCategory

# from classification_heuristics import classify_transaction
# from transaction_heuristics import extract_client_name, find_loan_payment_match, classify_transaction

# Prefer using the project's collapse_spaced_letters if available; otherwise use the local fallback
try:
    from automations.management.commands.import_legacy_financials import collapse_spaced_letters
except Exception:
    collapse_spaced_letters = None

logger = logging.getLogger(__name__)


def _collapse_spaced_letters_local(text):
    """
    Collapse spaced-letter artifacts:
      "S a v i n g s   P a y m e n t   b y   Y e m i"
    -> "Savings Payment by Yemi"
    """
    if not text:
        return text
    s = str(text)
    s = re.sub(r'\s+', ' ', s).strip()
    tokens = s.split(' ')
    out = []
    i = 0
    while i < len(tokens):
        t = tokens[i]
        # If single alphabetic token, collect the run
        if len(t) == 1 and t.isalpha():
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

# put near the top of bank_payments.py (inside the class or module-level helpers)
import os, csv
from decimal import Decimal

def _normalize_txid_for_compare(x):
    if x is None:
        return None
    s = str(x).strip()
    if s == '':
        return None
    return s

def _same_id(a, b):
    # robust compare for client/legacy ids that may be strings or ints
    if a is None or b is None:
        return False
    try:
        return int(a) == int(b)
    except Exception:
        return str(a).strip() == str(b).strip()


def _find_best_loan_for_bank(self, bank_obj, client_match=None, bank_time_window_secs=86400, amount_tolerance=Decimal('100.00')):
    """
    Robust search for a loan that corresponds to a bank.loan_disbursement row.

    Returns tuple (loan_obj or None, reason_str, optional_meta)
    - tries txid (best)
    - tries client id direct match (best-of-client loans by amount closeness)
    - tries time-window + amount-proximity search across loan models
    """
    bf = bank_obj.get('fields') or {}
    bank_amt = self.ctx.to_dec(bf.get('amount') or 0)
    bank_abs = abs(bank_amt)
    bank_txid = _normalize_txid_for_compare(bf.get('transaction'))
    # prefer searching both 'loan.loan' and 'loan.loandisbursement'
    loan_models = ['loan.loan', 'loan.loandisbursement']

    # 1) TXID match (strict)
    if bank_txid:
        for lm in loan_models:
            for l in (self.ctx.by_model.get(lm) or []):
                lf = l.get('fields') or {}
                ltx = _normalize_txid_for_compare(lf.get('transaction'))
                if ltx and ltx == bank_txid:
                    return l, 'txid_match', {'loan_model': lm, 'loan_txid': ltx}

    # 2) client_match direct: prefer loans where client == client_match[0]
    if client_match:
        candidate_loans = []
        client_id = client_match[0]
        for lm in loan_models:
            for l in (self.ctx.by_model.get(lm) or []):
                lf = l.get('fields') or {}
                if _same_id(lf.get('client'), client_id):
                    candidate_loans.append(l)
        if candidate_loans:
            # choose loan with closest principal or balance to bank_abs
            best = None
            best_score = None
            for l in candidate_loans:
                lf = l.get('fields') or {}
                la = self.ctx.to_dec(lf.get('amount') or 0)
                lb = self.ctx.to_dec(lf.get('balance') or 0)
                # if either matches closely, good
                score = min(abs(bank_abs - abs(la)), abs(bank_abs - abs(lb)))
                if best is None or score < best_score:
                    best = l; best_score = score
            # only accept if within tolerance (avoid false positives)
            if best is not None and best_score <= amount_tolerance:
                return best, 'client_best_amount_match', {'score': str(best_score)}
            # otherwise still return best-but-mark-as-low-confidence if very near
            if best is not None and best_score <= (amount_tolerance * 5):
                return best, 'client_best_amount_low_confidence', {'score': str(best_score)}

    # 3) Time-window + amount proximity search across all loans
    # Use parse_date for bank and loan; require loan to have a datetime or else deprioritize
    _, bank_dt = self.ctx.parse_date(bf, 'payment_date', 'created_at')
    candidates = []
    for lm in loan_models:
        for l in (self.ctx.by_model.get(lm) or []):
            lf = l.get('fields') or {}
            _, l_dt = self.ctx.parse_date(lf, 'payment_date', 'created_at')
            # if no datetime on loan, skip for this pass (too noisy)
            if not l_dt or not bank_dt:
                continue
            sec = None
            try:
                sec = abs((bank_dt - l_dt).total_seconds())
            except Exception:
                continue
            if sec > bank_time_window_secs:
                continue
            la = self.ctx.to_dec(lf.get('amount') or 0)
            lb = self.ctx.to_dec(lf.get('balance') or 0)
            # measure closeness to either principal or balance
            score = min(abs(bank_abs - abs(la)), abs(bank_abs - abs(lb)))
            candidates.append((l, lm, sec, score))
    if candidates:
        # sort by score then time
        candidates.sort(key=lambda x: (x[3], x[2]))
        best, best_lm, best_sec, best_score = candidates[0]
        if best_score <= amount_tolerance:
            return best, 'time_amount_candidate', {'loan_model': best_lm, 'time_secs': best_sec, 'score': str(best_score)}
        # accept lower-confidence if still reasonably close
        if best_score <= (amount_tolerance * 5):
            return best, 'time_amount_low_confidence', {'loan_model': best_lm, 'time_secs': best_sec, 'score': str(best_score)}

    # nothing found
    return None, 'no_candidate_found', {}


def collapse_spaced_letters_safe(text):
    """Use project helper if present, else fallback local impl."""
    if collapse_spaced_letters:
        try:
            return collapse_spaced_letters(text)
        except Exception:
            return _collapse_spaced_letters_local(text)
    return _collapse_spaced_letters_local(text)


class BankPaymentProcessor(BaseTransactionProcessor):
    """Process bank payment transactions with grouping-first logic."""

    def __init__(self, context, account_manager):
        super().__init__(context, account_manager)
        self.ctx = context
        self.account_manager = account_manager

    # -------------------- wrappers --------------------
    
    def _audit_loan_lookup( self, bank_obj, matched_loan, reason, audit_path='loan_disbursement_audit.csv', meta=None):
        """
        Write CSV lines to help debug why a bank.disbursement matched (or didn't).
        """
        try:
            write_header = not os.path.exists(audit_path)
            with open(audit_path, 'a', newline='', encoding='utf-8') as fh:
                w = csv.writer(fh)
                if write_header:
                    w.writerow([
                        'bank_pk','bank_desc','bank_amount','bank_txid',
                        'matched','reason','loan_model','loan_pk','loan_client','loan_amount','loan_balance','time_diff_secs','notes'
                    ])
                bf = bank_obj.get('fields') or {}
                bank_pk = bank_obj.get('pk')
                bank_desc = (bf.get('description') or '').strip()
                bank_amt = str(self.ctx.to_dec(bf.get('amount') or 0))
                bank_txid = _normalize_txid_for_compare(bf.get('transaction'))
                if matched_loan:
                    lf = matched_loan.get('fields') or {}
                    loan_model = matched_loan.get('model')
                    loan_pk = matched_loan.get('pk')
                    loan_client = lf.get('client')
                    loan_amount = str(self.ctx.to_dec(lf.get('amount') or 0))
                    loan_balance = str(self.ctx.to_dec(lf.get('balance') or 0))
                    # compute time delta if possible
                    _, bdt = self.ctx.parse_date(bf, 'payment_date', 'created_at')
                    _, ldt = self.ctx.parse_date(lf, 'payment_date', 'created_at')
                    tdiff = ''
                    try:
                        if bdt and ldt:
                            tdiff = abs((bdt - ldt).total_seconds())
                    except Exception:
                        tdiff = ''
                    w.writerow([bank_pk, bank_desc, bank_amt, bank_txid, 'Y', reason,
                                loan_model, loan_pk, loan_client, loan_amount, loan_balance, tdiff, (meta or '')])
                else:
                    w.writerow([bank_pk, bank_desc, bank_amt, bank_txid, 'N', reason, '', '', '', '', '', '', (meta or '')])
        except Exception:
            logger.exception("Audit CSV write failed for loan lookup")

    def _create_transaction(self, entries, description, workflow_reference=None, date=None, created_dt=None):
        """Prefer ctx.create_transaction then fallback to processor.create_transaction."""
        if hasattr(self.ctx, 'create_transaction') and callable(self.ctx.create_transaction):
            return self.ctx.create_transaction(entries, description, workflow_reference=workflow_reference, date=date)
        if hasattr(self, 'create_transaction') and callable(self.create_transaction):
            return self.create_transaction(entries, description, workflow_reference=workflow_reference, date=date)
        raise RuntimeError("No create_transaction available in context or processor")

    def _register_tx(self, legacy_model, legacy_pk, tx_obj_or_dict):
        """Register mapping using context.register_tx if available; else fallback to processor.register_tx."""
        try:
            if hasattr(self.ctx, 'register_tx') and callable(self.ctx.register_tx):
                return self.ctx.register_tx(legacy_model, legacy_pk, tx_obj_or_dict)
        except Exception:
            pass
        if hasattr(self, 'register_tx') and callable(self.register_tx):
            return self.register_tx(legacy_model, legacy_pk, tx_obj_or_dict)
        return None

    # -------------------- grouping & classification --------------------
    def process_bank_payments(self):
        """
        Group bank.bankpayment by transaction id and handle grouped first.
        Ungrouped entries get robust pairing attempts for transfers.
        """
        key = 'bank.bankpayment'
        objs = self.ctx.by_model.get(key, [])
        if not objs:
            return

        for o in objs:
            o.setdefault('processed', False)
            o.setdefault('matched', False)

        tx_groups = defaultdict(list)
        ungrouped = []
        for obj in objs:
            txid = obj.get('fields', {}).get('transaction')
            if txid:
                tx_groups[txid].append(obj)
            else:
                ungrouped.append(obj)

        logger.info("Bank payments total=%s groups=%s ungrouped=%s", len(objs), len(tx_groups), len(ungrouped))

        # first handle groups with tx id
        for txid, group in tx_groups.items():
            try:
                full_group = self.build_full_group(txid, group)

                # detect interbank transfer first (strong signal)
                if self._detect_interbank_transfer(full_group):
                    try:
                        self.process_transfer_group(full_group, txid)
                        for o in full_group:
                            o['processed'] = True
                        continue
                    except Exception as e:
                        logger.warning("Transfer processing failed for tx %s: %s", txid, e)

                classification = self.classify_group(full_group)

                # treat 'combined_payment' without loan entries as savings group
                if classification == 'combined_payment':
                    loan_present = any('loan' in (o.get('model') or '').lower() for o in full_group)
                    if not loan_present:
                        try:
                            from .savings_payment_processor import SavingsPaymentProcessor
                            sp = SavingsPaymentProcessor(self.ctx, self.account_manager)
                            sp.process_savings_group(full_group, txid)
                            for o in full_group:
                                o['processed'] = True
                            continue
                        except Exception as e:
                            logger.warning("Savings-group delegation failed for tx %s: %s", txid, e)

                # fallback -> per-item processing
                for b in group:
                    if not b.get('processed'):
                        self.process_single_bank_payment(b)

                for o in full_group:
                    o.setdefault('processed', True)

            except Exception:
                logger.exception("Error processing tx group %s — falling back to individual entries", txid)
                for b in group:
                    if not b.get('processed'):
                        try:
                            self.process_single_bank_payment(b)
                        except Exception:
                            logger.exception("Failed to fallback-process bank entry pk=%s", b.get('pk'))

        # attempt to pair ungrouped entries (interbank) BEFORE processing them individually
        if ungrouped:
            # build bank-only list of ungrouped entries for pairing
            bank_only = [o for o in ungrouped if o.get('model') == 'bank.bankpayment' and not o.get('processed')]
            # try pairing heuristics
            for obj in list(bank_only):  # copy - we will remove processed items
                if obj.get('processed'):
                    continue
                counter = self._find_counterparty_for_unmatched_bank(obj, bank_only, max_seconds=3600)
                if counter:
                    try:
                        self._post_pair_transfer(obj, counter)
                        obj['processed'] = True
                        counter['processed'] = True
                    except Exception:
                        logger.exception("Failed to post paired transfer for pks %s and %s", obj.get('pk'), counter.get('pk'))

        # finally process any remaining unprocessed ungrouped entries individually
        for obj in ungrouped:
            if not obj.get('processed'):
                try:
                    self.process_single_bank_payment(obj)
                except Exception:
                    logger.exception("Failed to process ungrouped bank payment pk=%s", obj.get('pk'))

    def build_full_group(self, tx_id, group):
        """Attach related loan/savings/expense/income entries sharing same tx id."""
        full = list(group)
        # Be robust to model name variations by searching any model keys containing 'loan' or 'saving'
        for model_key, items in self.ctx.by_model.items():
            mk = (model_key or '').lower()
            if any(tag in mk for tag in ('loan', 'saving', 'savings', 'expense', 'income')):
                for obj in items:
                    if obj.get('fields', {}).get('transaction') == tx_id:
                        full.append(obj)
        return full

    def classify_group(self, group):
        model_names = { (o.get('model') or '').lower() for o in group }
        if any('loan' in mn for mn in model_names) and any('saving' in mn or 'savings' in mn for mn in model_names):
            return 'combined_payment'
        if any('loan' in mn for mn in model_names):
            return 'loan_payment'
        if any('saving' in mn or 'savings' in mn for mn in model_names):
            return 'savings_payment'
        descs = " ".join([str(o.get('fields', {}).get('description', '') or '').lower() for o in group])
        if 'transfer' in descs or 'cash deposit' in descs:
            return 'transfer'
        fee_k = ['registration fee', 'loan registration', 'risk premium', 'service fee', 'processing fee', 'id fee']
        if any(k in descs for k in fee_k):
            return 'fee_income'
        if 'expense' in descs or 'salary' in descs or 'payroll' in descs:
            return 'expense_payment'
        return 'unknown'

    # -------------------- transfer detection/processing --------------------
    def _detect_interbank_transfer(self, full_group):
        """
        Detect bank pair inside a grouped tx: opposite sign amounts and transfer hints.
        """
        bank_entries = [o for o in full_group if (o.get('model') or '') == 'bank.bankpayment']
        if len(bank_entries) < 2:
            return False
        for i in range(len(bank_entries)):
            ai = self.ctx.to_dec(bank_entries[i]['fields'].get('amount') or 0)
            desc_i = (bank_entries[i]['fields'].get('description') or '').lower()
            for j in range(i + 1, len(bank_entries)):
                aj = self.ctx.to_dec(bank_entries[j]['fields'].get('amount') or 0)
                desc_j = (bank_entries[j]['fields'].get('description') or '').lower()
                if abs(ai + aj) <= Decimal('0.01'):
                    if any(k in desc_i for k in ('transfer', 'cash deposit')) or any(k in desc_j for k in ('transfer', 'cash deposit')):
                        return True
        return False

    def process_transfer_group(self, full_group, tx_id):
        """
        Create DR receiver_bank, CR sender_bank, register tx for full_group.
        """
        bank_entries = [o for o in full_group if (o.get('model') or '') == 'bank.bankpayment']
        pair = None
        for i in range(len(bank_entries)):
            ai = self.ctx.to_dec(bank_entries[i]['fields'].get('amount') or 0)
            for j in range(i + 1, len(bank_entries)):
                aj = self.ctx.to_dec(bank_entries[j]['fields'].get('amount') or 0)
                if abs(ai + aj) <= Decimal('0.01'):
                    pair = (bank_entries[i], bank_entries[j])
                    break
            if pair:
                break
        if not pair:
            raise ValueError("No matching bank pair for transfer group %s" % tx_id)

        leg_a, leg_b = pair
        amt_a = self.ctx.to_dec(leg_a['fields'].get('amount') or 0)
        amt_b = self.ctx.to_dec(leg_b['fields'].get('amount') or 0)

        if amt_a >= 0 and amt_b <= 0:
            receiver = leg_a
            sender = leg_b
            amount = abs(amt_a)
        elif amt_b >= 0 and amt_a <= 0:
            receiver = leg_b
            sender = leg_a
            amount = abs(amt_b)
        else:
            amount = max(abs(amt_a), abs(amt_b))
            receiver, sender = (leg_a, leg_b) if abs(amt_a) >= abs(amt_b) else (leg_b, leg_a)

        bank_id_from = sender['fields'].get('bank')
        bank_id_to = receiver['fields'].get('bank')
        bank_name_from = self.ctx.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id_from, {}).get('fields', {}).get('name')
        bank_name_to = self.ctx.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id_to, {}).get('fields', {}).get('name')

        acct_from = self.account_manager.get_or_create_bank_account(bank_id_from, bank_name_from)
        acct_to = self.account_manager.get_or_create_bank_account(bank_id_to, bank_name_to)

        entries = [
            {'account': acct_to, 'side': getattr(TransactionEntry, 'DEBIT', 'D'), 'amount': amount},
            {'account': acct_from, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': amount},
        ]

        rep = receiver or sender
        raw_desc = rep.get('fields', {}).get('description') or f"Transfer {tx_id}"
        desc = self.ctx.norm_str(collapse_spaced_letters_safe(raw_desc))
        date, _ = self.ctx.parse_date(rep.get('fields', {}), 'payment_date', 'created_at')

        txobj = self._create_transaction(entries, desc, workflow_reference=f"legacy:bank.transfer:{tx_id}", date=date)
        for o in full_group:
            try:
                self._register_tx(o.get('model'), o.get('pk'), txobj)
            except Exception:
                pass
            o['processed'] = True
        return txobj

    # -------------------- ungrouped pairing helpers --------------------
    def _extract_numeric_refs(self, text):
        """Return list of digit sequences of length >=4 from text (cash deposit refs)."""
        if not text:
            return []
        return re.findall(r'\d{4,}', text)

    def _find_counterparty_for_unmatched_bank(self, obj, candidates, tolerance=Decimal('0.01'), max_seconds=3600):
        """
        Try to find a counterparty bank entry among candidates (ungrouped bank entries).
        Heuristics:
          - amounts opposite (sum ~ 0) within tolerance
          - share numeric reference (e.g. cash deposit id) OR both have transfer/cash-deposit hints
          - timestamp within max_seconds (if timestamps parseable)
        """
        if not obj or not candidates:
            return None
        f = obj.get('fields', {}) or {}
        amt = self.ctx.to_dec(f.get('amount') or 0)
        desc = (f.get('description') or '').lower()
        refs = self._extract_numeric_refs(desc)
        dt_obj = self.ctx.parse_date(f, 'payment_date', 'created_at')[1]  # prefer datetime

        for cand in candidates:
            if cand is obj:
                continue
            if cand.get('processed'):
                continue
            cf = cand.get('fields', {}) or {}
            c_amt = self.ctx.to_dec(cf.get('amount') or 0)
            # check opposite sign / amount pairing
            if abs(amt + c_amt) > tolerance:
                continue
            # check numeric reference match
            cdesc = (cf.get('description') or '').lower()
            crefs = self._extract_numeric_refs(cdesc)
            shared_ref = bool(set(refs).intersection(set(crefs))) if refs and crefs else False

            # check strong keyword match: both mention 'cash deposit' or 'transfer' or 'cash in hand'
            both_hint = any(k in desc for k in ('transfer', 'cash deposit')) and any(k in cdesc for k in ('transfer', 'cash deposit'))
            complementary = ('cash in hand' in desc and 'moniepoint' in cdesc) or ('cash in hand' in cdesc and 'moniepoint' in desc)

            # If neither shared_ref nor both_hint nor complementary then skip
            if not (shared_ref or both_hint or complementary):
                continue

            # check timestamp proximity if possible
            c_dt = self.ctx.parse_date(cf, 'payment_date', 'created_at')[1]
            if dt_obj and c_dt:
                try:
                    sec = abs((dt_obj - c_dt).total_seconds())
                    if sec > max_seconds:
                        continue
                except Exception:
                    pass

            # Good candidate
            return cand

        return None

    def _post_pair_transfer(self, a, b):
        """
        Create a transfer transaction for matched ungrouped pair (a,b).
        """
        fa = a.get('fields', {}) or {}
        fb = b.get('fields', {}) or {}
        amta = self.ctx.to_dec(fa.get('amount') or 0)
        amtb = self.ctx.to_dec(fb.get('amount') or 0)

        # decide direction
        if amta >= 0 and amtb <= 0:
            receiver, sender, amount = a, b, abs(amta)
        elif amtb >= 0 and amta <= 0:
            receiver, sender, amount = b, a, abs(amtb)
        else:
            if abs(amta) >= abs(amtb):
                receiver, sender, amount = a, b, abs(amta)
            else:
                receiver, sender, amount = b, a, abs(amtb)

        bank_id_from = sender['fields'].get('bank')
        bank_id_to = receiver['fields'].get('bank')
        bank_name_from = self.ctx.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id_from, {}).get('fields', {}).get('name')
        bank_name_to = self.ctx.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id_to, {}).get('fields', {}).get('name')

        acct_from = self.account_manager.get_or_create_bank_account(bank_id_from, bank_name_from)
        acct_to = self.account_manager.get_or_create_bank_account(bank_id_to, bank_name_to)

        entries = [
            {'account': acct_to, 'side': getattr(TransactionEntry, 'DEBIT', 'D'), 'amount': amount},
            {'account': acct_from, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': amount},
        ]

        rep = receiver
        raw_desc = rep.get('fields', {}).get('description') or f"Transfer"
        desc = self.ctx.norm_str(collapse_spaced_letters_safe(raw_desc))
        date = self.ctx.parse_date(rep.get('fields', {}), 'payment_date', 'created_at')[0]

        txobj = self._create_transaction(entries, desc, workflow_reference=f"legacy:bank.paired_transfer:{rep.get('fields', {}).get('transaction') or rep.get('pk')}", date=date)

        try:
            self._register_tx('bank.bankpayment', a.get('pk'), txobj)
        except Exception:
            pass
        try:
            self._register_tx('bank.bankpayment', b.get('pk'), txobj)
        except Exception:
            pass

        a['matched'] = True
        b['matched'] = True
        a['processed'] = True
        b['processed'] = True

        return txobj

    # -------------------- savings helpers --------------------
    def _is_savings_like(self, desc_lower: str) -> bool:
        if not desc_lower:
            return False
        tokens = [
            'savings payment', 'savings for', 'daily contribution',
            'savings contribution', 'monthly savings', 'dc', 'daily contribution for'
        ]
        return any(t in desc_lower for t in tokens)

    def _extract_client_from_savings_desc(self, desc: str) -> str | None:
        if not desc:
            return None
        d = desc.strip()
        patterns = [
            r'savings\s+payment\s+by\s+(?P<name>[A-Za-z][A-Za-z\s\.\-]+)$',
            r'savings\s+for\s+(?P<name>[A-Za-z][A-Za-z\s\.\-]+)$',
            r'savings\s+contribution\s+by\s+(?P<name>[A-Za-z][A-Za-z\s\.\-]+)$',
            r'monthly\s+savings\s+for\s+(?P<name>[A-Za-z][A-Za-z\s\.\-]+)$',
            r'daily\s+contribution.*?,\s*(?P<name>[A-Za-z][A-Za-z\s\.\-]+)$',
            r'(?:^|\s)by\s+(?P<name>[A-Za-z][A-Za-z\s\.\-]+)$',
            r'(?:^|\s)for\s+(?P<name>[A-Za-z][A-Za-z\s\.\-]+)$',
        ]
        for pat in patterns:
            m = re.search(pat, d, flags=re.IGNORECASE)
            if m:
                name = m.group('name').strip()
                name = re.sub(r'^[\'"\s,]+|[\'"\s,]+$', '', name)
                if len(name.split()) >= 2:
                    return name
        if ',' in d:
            tail = d.split(',')[-1].strip()
            tail = re.sub(r'^[\'"\s,]+|[\'"\s,]+$', '', tail)
            if len(tail.split()) >= 2 and re.search(r'[A-Za-z]', tail):
                return tail
        return None

    def _resolve_client_by_name(self, raw_name: str):
        if not raw_name:
            return None
        target = self.ctx.norm_str(raw_name)
        clients = self.ctx.fixtures_by_app_model_pk.get('client.client', {}) or {}

        for c_pk, c_obj in clients.items():
            cn = self.ctx.norm_str((c_obj.get('fields') or {}).get('name') or '')
            if cn and cn == target:
                return (c_pk, (c_obj.get('fields') or {}).get('name'))

        name_list, name_map = [], {}
        for c_pk, c_obj in clients.items():
            cn = self.ctx.norm_str((c_obj.get('fields') or {}).get('name') or '')
            if cn:
                name_list.append(cn)
                name_map[cn] = (c_pk, (c_obj.get('fields') or {}).get('name'))

        rf_process = getattr(self.ctx, 'rf_process', None)
        rf_fuzz = getattr(self.ctx, 'rf_fuzz', None)
        if rf_process and rf_fuzz and name_list:
            try:
                best, score, _ = rf_process.extractOne(target, name_list, scorer=rf_fuzz.ratio)
                if best and score is not None and score >= 86:
                    return name_map.get(best)
            except Exception:
                pass

        try:
            from automations.management.commands.classification_heuristics import names_match
            for nm in name_list:
                if names_match(target, nm, threshold=0.85):
                    return name_map.get(nm)
        except Exception:
            for nm in name_list:
                if target in nm or nm in target:
                    return name_map.get(nm)

        return None

    # -------------------- combined-group (existing logic adapted) --------------------
    # at top of file ensure these imports are available


    # Replace process_combined_group with the following:
    def process_combined_group(self, full_group, tx_id):
        """
        Conservative combined handling:
        - Build a single bank leg using the signed sum of included bank entries.
        - Create opposing legs for explicit matched components (loans, savings, income).
        - Only attempt small deterministic heuristics if they produce a balanced result.
        - If unbalanced beyond tolerance: audit + append reconciliation and skip creating a tx.
        """
        key = 'bank.bankpayment'
        bank_objs = [o for o in full_group if (o.get('model') or '') == 'bank.bankpayment']
        if not bank_objs:
            raise ValueError("No bank entries in combined group")

        # explicit matched models (do not attempt to interpret loan.master here)
        loan_pay_entries = [o for o in full_group if (o.get('model') or '') == 'loan.loanpayment']
        loan_disb_entries = [o for o in full_group if (o.get('model') or '') == 'loan.loandisbursement']
        savings_entries = [o for o in full_group if (o.get('model') or '') == 'savings.savingspayment']
        income_entries = [o for o in full_group if (o.get('model') or '') == 'income.incomepayment']
        expense_entries = [o for o in full_group if (o.get('model') or '') == 'expenses.expensepayment']

        # helper normaliser for description tests if needed later
        def _norm(s):
            if not s:
                return ''
            try:
                return self.ctx.norm_str(s).strip().lower()
            except Exception:
                return str(s).strip().lower()

        def _is_expense_like(desc):
            d = _norm(desc)
            for k in ('salary', 'payroll', 'nepa', 'electricity', 'bank charge', 'weekly expenses', 'cleaner', 'contractor', 'software', 'expenses'):
                if k in d:
                    return True
            return False

        # exclude obvious expense-like bank rows from combined handling (let ExpenseProcessor handle them)
        included_bank_objs = [b for b in bank_objs if not _is_expense_like((b.get('fields') or {}).get('description') or '')]
        bank_sum_list = included_bank_objs if included_bank_objs else bank_objs

        # compute signed bank_total using legacy amounts as-is (positive means inflow to bank)
        bank_total = sum([self.ctx.to_dec((b.get('fields') or {}).get('amount') or 0) for b in bank_sum_list])
        bank_total = _quant(bank_total)

        # prepare entries list; each entry = {'account': AccountObj, 'side': 'DR'/'CR', 'amount': Decimal}
        entries = []
        rep_fields = (bank_sum_list[0].get('fields') if bank_sum_list else bank_objs[0].get('fields')) or {}
        bank_id = rep_fields.get('bank')
        bank_name = self.ctx.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name')
        bank_acct = self.account_manager.get_or_create_bank_account(bank_id, bank_name) if bank_id else (getattr(self.ctx, 'cash_acc', None) or self.ctx.suspense_acc)

        # Determine bank leg side from sign:
        # - positive bank_total => money in => DEBIT bank
        # - negative bank_total => money out => CREDIT bank
        if bank_total >= Decimal('0.00'):
            bank_side = TransactionEntry.DEBIT
        else:
            bank_side = TransactionEntry.CREDIT

        entries.append({'account': bank_acct, 'side': bank_side, 'amount': _quant(abs(bank_total))})
        bank_leg_account = bank_acct

        # Helper to add opposing legs for matched components. We use abs(amount) and side opposite to bank side.
        def add_component_leg(component_obj, amount, note_reason=None):
            amt = _quant(amount or Decimal('0.00'))
            if amt == Decimal('0.00'):
                return
            # side opposite to bank side
            opp_side = TransactionEntry.CREDIT if bank_side == TransactionEntry.DEBIT else TransactionEntry.DEBIT
            # map component to an account (clients/income/savings)
            model = component_obj.get('model')
            fields = component_obj.get('fields') or {}
            if model and model.startswith('loan'):
                client_id = fields.get('client')
                client_name = None
                if client_id:
                    client_name = self.ctx.fixtures_by_app_model_pk.get('client.client', {}).get(client_id, {}).get('fields', {}).get('name')
                acct = self.account_manager.get_or_create_client_account(client_id, client_name or f"client_{client_id}") if client_id else getattr(self.ctx, 'suspense_acc', None)
                if not client_id:
                    self.ctx.reconciliation.append({'legacy_model': model, 'legacy_pk': component_obj.get('pk'), 'reason': 'loan_component_unmapped_in_combined', 'desc': fields.get('description'), 'amount': str(amount)})
            elif model and model.startswith('savings'):
                client_id = fields.get('client')
                client_name = None
                if client_id:
                    client_name = self.ctx.fixtures_by_app_model_pk.get('client.client', {}).get(client_id, {}).get('fields', {}).get('name')
                acct = self.account_manager.get_or_create_client_account(client_id, client_name or f"client_{client_id}") if client_id else getattr(self.ctx, 'suspense_acc', None)
                if not client_id:
                    self.ctx.reconciliation.append({'legacy_model': model, 'legacy_pk': component_obj.get('pk'), 'reason': 'savings_component_unmapped_in_combined', 'desc': fields.get('description'), 'amount': str(amount)})
            elif model and model.startswith('income'):
                # try to map to income GL via helper; if fails, use suspense
                try:
                    acct = self._income_gl(fields.get('income'))
                except Exception:
                    acct = getattr(self.ctx, 'suspense_acc', None)
            else:
                acct = getattr(self.ctx, 'suspense_acc', None)

            entries.append({'account': acct, 'side': opp_side, 'amount': amt})

        # Add explicit loan payments and disbursements (these are the canonical change sources)
        for l in loan_pay_entries + loan_disb_entries:
            f = l.get('fields') or {}
            amt = self.ctx.to_dec(f.get('amount') or 0)
            add_component_leg(l, amt)

        # Add explicit savings component legs
        for s in savings_entries:
            f = s.get('fields') or {}
            amt = self.ctx.to_dec(f.get('amount') or 0)
            add_component_leg(s, amt)

        # Add explicit income fixtures (they should be credits for bank inflow)
        for inc in income_entries:
            f = inc.get('fields') or {}
            amt = self.ctx.to_dec(f.get('amount') or 0)
            add_component_leg(inc, amt)

        # Quantize all and compute totals
        for e in entries:
            e['amount'] = _quant(e.get('amount', 0))
        total_debits = sum(e['amount'] for e in entries if e['side'] == TransactionEntry.DEBIT)
        total_credits = sum(e['amount'] for e in entries if e['side'] == TransactionEntry.CREDIT)
        diff = (total_debits - total_credits).quantize(Decimal('0.01'))

        # Audit
        _entries_repr = ';'.join([f"{getattr(e['account'],'code',str(e['account']))}|{e['side']}|{e['amount']}" for e in entries])
        _audit_tx_group({'bank_pk': ','.join(str(b.get('pk')) for b in bank_sum_list), 'entries_repr': _entries_repr, 'debits': str(total_debits), 'credits': str(total_credits), 'diff': str(diff), 'note': ''})

        # If balanced already, create tx
        if abs(diff) <= Decimal('0.01'):
            try:
                desc_raw = (rep_fields.get('description') or f"Combined payment tx {tx_id}")
                try:
                    desc = self.ctx.norm_str(desc_raw)
                except Exception:
                    desc = desc_raw
                txobj = self._create_transaction(entries, desc, workflow_reference=f"legacy:bank.group:{tx_id}", date=self.ctx.parse_date(rep_fields, 'payment_date', 'created_at')[0])
                self.ctx.reconciliation.append({
                    'legacy_model': 'bank.group',
                    'legacy_pk': f"group:{tx_id}",
                    'reason': 'combined_balanced',
                    'desc': rep_fields.get('description'),
                    'amount': str(bank_total),
                    'new_tx_id': getattr(txobj, 'pk', getattr(txobj, 'id', None)),
                    'entries_repr': _entries_repr if ' _entries_repr' in locals() else None,
                })
            except TypeError:
                txobj = self._create_transaction(entries, desc, workflow_reference=f"legacy:bank.group:{tx_id}")
                self.ctx.reconciliation.append({
                    'legacy_model': 'bank.group',
                    'legacy_pk': f"group:{tx_id}",
                    'reason': 'combined_balanced',
                    'desc': rep_fields.get('description'),
                    'amount': str(bank_total),
                    'new_tx_id': getattr(txobj, 'pk', getattr(txobj, 'id', None)),
                    'entries_repr': _entries_repr if ' _entries_repr' in locals() else None,
                })
            except Exception as e:
                logger.exception("Failed to create transaction for combined group %s: %s", tx_id, e)
                return None

            # Register mapping & mark processed (only for payment-like models)
            allowed = {'bank.bankpayment', 'loan.loandisbursement', 'loan.loanpayment', 'savings.savingspayment', 'income.incomepayment', 'expenses.expensepayment'}
            for o in full_group:
                if o.get('model') in allowed:
                    try:
                        self._register_tx(o.get('model'), o.get('pk'), txobj)
                    except Exception:
                        logger.exception("Failed to register mapping for combined group item %s:%s", o.get('model'), o.get('pk'))
                        continue
                    o['processed'] = True
            return txobj

        # Not balanced yet — attempt minimal, deterministic heuristics:
        # 1) If there is exactly one bank leg in entries, see if flipping the bank leg side balances exactly
        tolerance = Decimal('0.01')
        bank_indices = [i for i,e in enumerate(entries) if getattr(e['account'], 'pk', None) == getattr(bank_leg_account, 'pk', None) or e['account'] is bank_leg_account]
        if len(bank_indices) == 1:
            i = bank_indices[0]
            bank_leg = entries[i]
            amt = bank_leg['amount']
            # flipping bank leg effects:
            if bank_leg['side'] == TransactionEntry.DEBIT:
                new_debits = total_debits - amt
                new_credits = total_credits + amt
            else:
                new_debits = total_debits + amt
                new_credits = total_credits - amt
            new_diff = (new_debits - new_credits).quantize(Decimal('0.01'))
            if abs(new_diff) <= tolerance:
                # perform flip and accept
                bank_leg['side'] = TransactionEntry.CREDIT if bank_leg['side'] == TransactionEntry.DEBIT else TransactionEntry.DEBIT
                total_debits, total_credits, diff = new_debits, new_credits, new_diff

                # create tx now
                try:
                    desc_raw = (rep_fields.get('description') or f"Combined payment tx {tx_id}")
                    try:
                        desc = self.ctx.norm_str(desc_raw)
                    except Exception:
                        desc = desc_raw
                    txobj = self._create_transaction(entries, desc, workflow_reference=f"legacy:bank.group:{tx_id}", date=self.ctx.parse_date(rep_fields, 'payment_date', 'created_at')[0])
                    self.ctx.reconciliation.append({
                    'legacy_model': 'bank.group',
                    'legacy_pk': f"group:{tx_id}",
                    'reason': 'combined_balanced',
                    'desc': rep_fields.get('description'),
                    'amount': str(bank_total),
                    'new_tx_id': getattr(txobj, 'pk', getattr(txobj, 'id', None)),
                    'entries_repr': _entries_repr if ' _entries_repr' in locals() else None,
                })
                except TypeError:
                    txobj = self._create_transaction(entries, desc, workflow_reference=f"legacy:bank.group:{tx_id}")
                    self.ctx.reconciliation.append({
                    'legacy_model': 'bank.group',
                    'legacy_pk': f"group:{tx_id}",
                    'reason': 'combined_balanced',
                    'desc': rep_fields.get('description'),
                    'amount': str(bank_total),
                    'new_tx_id': getattr(txobj, 'pk', getattr(txobj, 'id', None)),
                    'entries_repr': _entries_repr if ' _entries_repr' in locals() else None,
                })
                except Exception as e:
                    logger.exception("Failed to create transaction for combined group %s: %s", tx_id, e)
                    return None

                allowed = {'bank.bankpayment', 'loan.loandisbursement', 'loan.loanpayment', 'savings.savingspayment', 'income.incomepayment', 'expenses.expensepayment'}
                for o in full_group:
                    if o.get('model') in allowed:
                        try:
                            self._register_tx(o.get('model'), o.get('pk'), txobj)
                        except Exception:
                            logger.exception("Failed to register mapping for combined group item %s:%s", o.get('model'), o.get('pk'))
                            continue
                        o['processed'] = True
                return txobj

        # 2) Try mapping absolute diff to income (only if helper returns balanced diff)
        rep_desc = rep_fields.get('description') or ""
        new_diff = self._abs_diff_to_income_if_likely(diff, rep_desc, entries)
        if abs(new_diff) <= Decimal('0.01'):
            # create tx now
            try:
                desc_raw = (rep_fields.get('description') or f"Combined payment tx {tx_id}")
                try:
                    desc = self.ctx.norm_str(desc_raw)
                except Exception:
                    desc = desc_raw
                txobj = self._create_transaction(entries, desc, workflow_reference=f"legacy:bank.group:{tx_id}", date=self.ctx.parse_date(rep_fields, 'payment_date', 'created_at')[0])
                # inside process_combined_group, after txobj created and _register_tx calls succeeded:
                self.ctx.reconciliation.append({
                    'legacy_model': 'bank.group',
                    'legacy_pk': f"group:{tx_id}",
                    'reason': 'combined_balanced',
                    'desc': rep_fields.get('description'),
                    'amount': str(bank_total),
                    'new_tx_id': getattr(txobj, 'pk', getattr(txobj, 'id', None)),
                    'entries_repr': _entries_repr if ' _entries_repr' in locals() else None,
                })

            except TypeError:
                txobj = self._create_transaction(entries, desc, workflow_reference=f"legacy:bank.group:{tx_id}")
                self.ctx.reconciliation.append({
                    'legacy_model': 'bank.group',
                    'legacy_pk': f"group:{tx_id}",
                    'reason': 'combined_balanced',
                    'desc': rep_fields.get('description'),
                    'amount': str(bank_total),
                    'new_tx_id': getattr(txobj, 'pk', getattr(txobj, 'id', None)),
                    'entries_repr': _entries_repr if ' _entries_repr' in locals() else None,
                })
            except Exception as e:
                logger.exception("Failed to create transaction for combined group %s: %s", tx_id, e)
                return None

            allowed = {'bank.bankpayment', 'loan.loandisbursement', 'loan.loanpayment', 'savings.savingspayment', 'income.incomepayment', 'expenses.expensepayment'}
            for o in full_group:
                if o.get('model') in allowed:
                    try:
                        self._register_tx(o.get('model'), o.get('pk'), txobj)
                    except Exception:
                        logger.exception("Failed to register mapping for combined group item %s:%s", o.get('model'), o.get('pk'))
                        continue
                    o['processed'] = True
            return txobj

        # 3) If diff is small within fallback tolerance, attach to suspense sign-aware
        fallback_tolerance = Decimal('5.00')
        if abs(diff) <= fallback_tolerance:
            if diff > 0:
                entries.append({'account': self.ctx.suspense_acc, 'side': TransactionEntry.CREDIT, 'amount': _quant(abs(diff))})
            else:
                entries.append({'account': self.ctx.suspense_acc, 'side': TransactionEntry.DEBIT, 'amount': _quant(abs(diff))})
            # recompute totals and create tx
            total_debits = sum(e['amount'] for e in entries if e['side'] == TransactionEntry.DEBIT)
            total_credits = sum(e['amount'] for e in entries if e['side'] == TransactionEntry.CREDIT)
            diff = (total_debits - total_credits).quantize(Decimal('0.01'))
            if abs(diff) <= Decimal('0.01'):
                try:
                    desc_raw = (rep_fields.get('description') or f"Combined payment tx {tx_id}")
                    try:
                        desc = self.ctx.norm_str(desc_raw)
                    except Exception:
                        desc = desc_raw
                    txobj = self._create_transaction(entries, desc, workflow_reference=f"legacy:bank.group:{tx_id}", date=self.ctx.parse_date(rep_fields, 'payment_date', 'created_at')[0])
                    self.ctx.reconciliation.append({
                    'legacy_model': 'bank.group',
                    'legacy_pk': f"group:{tx_id}",
                    'reason': 'combined_balanced',
                    'desc': rep_fields.get('description'),
                    'amount': str(bank_total),
                    'new_tx_id': getattr(txobj, 'pk', getattr(txobj, 'id', None)),
                    'entries_repr': _entries_repr if ' _entries_repr' in locals() else None,
                })
                except TypeError:
                    txobj = self._create_transaction(entries, desc, workflow_reference=f"legacy:bank.group:{tx_id}")
                    self.ctx.reconciliation.append({
                    'legacy_model': 'bank.group',
                    'legacy_pk': f"group:{tx_id}",
                    'reason': 'combined_balanced',
                    'desc': rep_fields.get('description'),
                    'amount': str(bank_total),
                    'new_tx_id': getattr(txobj, 'pk', getattr(txobj, 'id', None)),
                    'entries_repr': _entries_repr if ' _entries_repr' in locals() else None,
                })
                except Exception as e:
                    logger.exception("Failed to create transaction for combined group %s: %s", tx_id, e)
                    return None

                allowed = {'bank.bankpayment', 'loan.loandisbursement', 'loan.loanpayment', 'savings.savingspayment', 'income.incomepayment', 'expenses.expensepayment'}
                for o in full_group:
                    if o.get('model') in allowed:
                        try:
                            self._register_tx(o.get('model'), o.get('pk'), txobj)
                        except Exception:
                            logger.exception("Failed to register mapping for combined group item %s:%s", o.get('model'), o.get('pk'))
                            continue
                        o['processed'] = True
                return txobj

        # If we get here: unable to balance deterministically -> audit & record reconciliation, do NOT create tx
        self.ctx.reconciliation.append({
            'legacy_model': key,
            'legacy_pk': f"group:{tx_id}",
            'reason': 'combined_mismatch_diff',
            'desc': rep_fields.get('description'),
            'amount': str(diff),
            'entries': _entries_repr,
            'debits': str(total_debits),
            'credits': str(total_credits),
        })
        logger.debug("Combined group %s unbalanced (diff=%s) — audited and skipped", tx_id, diff)
        return None


    # -------------------- per-entry fallback --------------------
    def process_single_bank_payment(self, obj):
        """
        Fallback single bank payment processing.
        Heuristics: loan-payment exact matching, savings rescue (name extraction),
        transfer pairing, fee/expense handling, else suspense.
        """
        if not obj:
            return
        key = 'bank.bankpayment'
        pk = obj.get('pk')
        f = obj.get('fields', {}) or {}
        amount = self.ctx.to_dec(f.get('amount'))
        bank_id = f.get('bank')
        bank_name = self.ctx.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name')
        bank_acct = self.account_manager.get_or_create_bank_account(bank_id, bank_name) if bank_id else (getattr(self.ctx, 'cash_acc', None) or self.ctx.suspense_acc)

        raw_desc = f.get('description') or ''
        desc = self.ctx.norm_str(collapse_spaced_letters_safe(raw_desc))
        desc_lower = desc.lower()

        # explicit "loan payment" case
        if 'loan payment' in desc_lower or desc_lower.strip() == 'loan payment':
            lp = None
            txid = f.get('transaction')
            if txid and hasattr(self.ctx, 'match_loan_payment_by_txid'):
                lp = self.ctx.match_loan_payment_by_txid(txid)
            if not lp and hasattr(self.ctx, 'find_loan_payment_by_time_amount'):
                lp = self.ctx.find_loan_payment_by_time_amount(amount, f.get('created_at') or f.get('payment_date'), self.ctx.by_model.get('loan.loanpayment', []), tolerance=Decimal('5.00'), seconds=3)
            if lp:
                client_id = lp.get('fields', {}).get('client')
                client_name = ''
                if client_id:
                    client_name = self.ctx.fixtures_by_app_model_pk.get('client.client', {}).get(client_id, {}).get('fields', {}).get('name', '')
                cr_acc = self.account_manager.get_or_create_client_account(client_id or f"legacy_{pk}", client_name or f"legacy_client_{client_id or pk}")
                amt_abs = abs(amount)
                if amount >= 0:
                    entries = [
                        {'account': bank_acct, 'side': getattr(TransactionEntry, 'DEBIT', 'D'), 'amount': amt_abs},
                        {'account': cr_acc,     'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': amt_abs},
                    ]
                else:
                    entries = [
                        {'account': cr_acc,     'side': getattr(TransactionEntry, 'DEBIT', 'D'), 'amount': amt_abs},
                        {'account': bank_acct,  'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': amt_abs},
                    ]
                date = self.ctx.parse_date(f, 'payment_date', 'created_at')[0]
                txobj = self._create_transaction(entries, desc or f"Bank payment #{pk}", workflow_reference=f"legacy:{key}:{pk}", date=date)
                self._register_tx(key, pk, txobj)
                obj['processed'] = True
                return

        # EARLY SAVINGS RESCUE
        if self._is_savings_like(desc_lower):
            cand_name = self._extract_client_from_savings_desc(desc)
            client_match = self._resolve_client_by_name(cand_name) if cand_name else None
            if client_match:
                client_id, client_name = client_match
                cr_acc = self.account_manager.get_or_create_client_account(client_id, client_name)
                amt_abs = abs(amount)
                entries = [
                    {'account': bank_acct, 'side': getattr(TransactionEntry, 'DEBIT', 'D'), 'amount': amt_abs},
                    {'account': cr_acc,     'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': amt_abs},
                ]
                date = self.ctx.parse_date(f, 'payment_date', 'created_at')[0]
                txobj = self._create_transaction(entries, desc or f"Savings payment #{pk}", workflow_reference=f"legacy:{key}:{pk}", date=date)
                self._register_tx(key, pk, txobj)
                obj['processed'] = True
                return

        # Attempt to find a transfer counterpart among all bank entries
        partner = None
        try:
            all_bank_entries = [o for o in self.ctx.by_model.get('bank.bankpayment', []) if o is not obj and not o.get('processed')]
            partner = self._find_counterparty_for_unmatched_bank(obj, all_bank_entries, tolerance=Decimal('0.01'), max_seconds=3600)
        except Exception:
            partner = None

        if partner:
            try:
                txobj = self._post_pair_transfer(obj, partner)
                return txobj
            except Exception:
                logger.exception("Failed to post transfer pair for pks %s and %s", pk, partner.get('pk'))

        # fallback to other heuristics (fees, expense, union, etc.)
        client_match = None
        try:
            from automations.management.commands.classification_heuristics import extract_client_name
            client_name_from_desc = extract_client_name(desc)
        except Exception:
            client_name_from_desc = None

        if client_name_from_desc:
            norm_name = self.ctx.norm_str(client_name_from_desc)
            for c_pk, c_obj in self.ctx.fixtures_by_app_model_pk.get('client.client', {}).items():
                cname = self.ctx.norm_str(c_obj.get('fields', {}).get('name') or '')
                if cname and (cname == norm_name or norm_name in cname or cname in norm_name):
                    client_match = (c_pk, c_obj.get('fields').get('name'))
                    break
            if not client_match and getattr(self.ctx, 'rf_process', None) and getattr(self.ctx, 'rf_fuzz', None):
                try:
                    best, score, _ = self.ctx.rf_process.extractOne(norm_name, [self.ctx.norm_str(c.get('fields').get('name') or '') for c in self.ctx.fixtures_by_app_model_pk.get('client.client', {}).values()], scorer=self.ctx.rf_fuzz.ratio)
                    if score and score >= 70:
                        for c_pk, c_obj in self.ctx.fixtures_by_app_model_pk.get('client.client', {}).items():
                            if self.ctx.norm_str(c_obj.get('fields').get('name') or '') == best:
                                client_match = (c_pk, c_obj.get('fields').get('name'))
                                break
                except Exception:
                    client_match = None

# inside process_single_bank_payment (or top of function), replace your classify_fn lookup with:

        classify_fn = None
        try:
            # preferred local relative import
            from automations.management.commands.transaction_heuristics import classify_transaction
            classify_fn = classify_transaction
        except Exception as e:
            # try absolute fallback import path (if code is executed from a different sys.path)
            try:
                from automations.management.commands.classification_heuristics import classify_transaction
                classify_fn = classify_transaction
            except Exception as e2:
                # keep it quiet in normal runs but print/log so you can diagnose
                logger.debug("classification_heuristics import failed (tried local and absolute): %s ; %s", e, e2)
                classify_fn = None

        tx_type = 'unclassified_transaction'
        if callable(classify_fn):
            try:
                tx_type = classify_fn(desc, amount, client_name_from_desc)
            except Exception as e:
                logger.debug("classify_transaction call failed: %s", e)
                tx_type = 'unclassified_transaction'
        else:
            tx_type = 'unclassified_transaction'
        cr_acc = None
        is_reconciliation = False
        reconciliation_reason = 'unclassified_transaction'

        # prioritized handlers
        if tx_type == 'savings_payment':
            if client_match:
                cr_acc = self.account_manager.get_or_create_client_account(client_match[0], client_match[1])
            else:
                txid = f.get('transaction')
                if txid:
                    s_match = next((s for s in self.ctx.by_model.get('savings.savingspayment', []) if s.get('fields', {}).get('transaction') == txid), None)
                    if s_match and s_match.get('fields', {}).get('client'):
                        cid = s_match['fields'].get('client')
                        cname = self.ctx.fixtures_by_app_model_pk.get('client.client', {}).get(cid, {}).get('fields', {}).get('name', '')
                        cr_acc = self.account_manager.get_or_create_client_account(cid, cname)
                    else:
                        is_reconciliation = True
                        reconciliation_reason = 'savings_without_client'
                else:
                    is_reconciliation = True
                    reconciliation_reason = 'savings_without_client'

        elif tx_type == 'loan_payment':
            if client_match:
                cr_acc = self.account_manager.get_or_create_client_account(client_match[0], client_match[1])
            else:
                fn = globals().get('find_loan_payment_match')
                loan_match = None
                if callable(fn):
                    try:
                        loan_match = fn(amount, self.ctx.parse_date(f, 'payment_date', 'created_at')[0], self.ctx.by_model.get('loan.loanpayment', []))
                    except Exception:
                        loan_match = None
                if loan_match and loan_match.get('fields', {}).get('client'):
                    cid = loan_match['fields'].get('client')
                    cname = self.ctx.fixtures_by_app_model_pk.get('client.client', {}).get(cid, {}).get('fields', {}).get('name', '')
                    cr_acc = self.account_manager.get_or_create_client_account(cid, cname)
                else:
                    is_reconciliation = True
                    reconciliation_reason = 'loan_payment_without_client'

        elif tx_type in ('fee_income', 'risk_premium'):
            income_cat, _ = self._branch_category(4, "Income")
            code = 'F01' if tx_type == 'fee_income' else 'F02'
            name = 'Fee Income' if tx_type == 'fee_income' else 'Risk Premium'
            fee_acc, _ = Account.objects.get_or_create(branch=self.ctx.branch, code=code, defaults={'category': income_cat, 'name': name, 'owner': self.ctx.owner, 'created_by': self.ctx.owner, 'classification': self.ctx.classification})
            cr_acc = fee_acc

        elif tx_type == 'expense_payment':
            expense_cat, _ = self._branch_category(5, "Expenses")
            expense_code = 'E99'; expense_name = 'Miscellaneous Expenses'
            if 'payroll' in desc_lower:
                expense_code = 'E01'; expense_name = 'Payroll Expenses'
            elif 'transport' in desc_lower:
                expense_code = 'E02'; expense_name = 'Transport Expenses'
            expense_acc, _ = Account.objects.get_or_create(branch=self.ctx.branch, code=expense_code, defaults={'category': expense_cat, 'name': expense_name, 'owner': self.ctx.owner, 'created_by': self.ctx.owner, 'classification': self.ctx.classification})
            cr_acc = expense_acc

        elif tx_type in ('matched_transfer', 'cash_transfer', 'internal_transfer', 'bank_transfer'):
            # look for counterpart and create proper transfer if present
            fm = globals().get('find_matching_transfer', None)
            found = None
            try:
                if callable(fm):
                    found = fm(amount, self.ctx.parse_date(f, 'payment_date', 'created_at')[0], desc, self.ctx.by_model.get('bank.bankpayment', []))
            except Exception:
                found = None
            if found and not found.get('processed'):
                try:
                    self._post_pair_transfer(obj, found)
                    return
                except Exception:
                    logger.exception("Failed to post matched transfer pair; will fallback to suspense")
                    found = None
            # fallback: keep in suspense for manual recon
            if tx_type == 'cash_transfer':
                asset_cat, _ = self._branch_category(1, "Assets")
                cash_acc, _ = Account.objects.get_or_create(branch=self.ctx.branch, code='B01', defaults={'category': asset_cat, 'name': 'Cash in Hand', 'owner': self.ctx.owner, 'created_by': self.ctx.owner, 'classification': self.ctx.classification})
                cr_acc = cash_acc
            else:
                is_reconciliation = True
                reconciliation_reason = 'unmatched_transfer'

        # inside process_single_bank_payment, in the 'loan_disbursement' branch# --- paste/replace this block in process_single_bank_payment where you handle loan_disbursement ---
        elif tx_type == 'loan_disbursement':
            # Debug instrumentation
            # client name is last words after to
            #  e.g. "Loan disbursement to John Doe" -> "John Doe"
            cand_name = None
            m = re.search(r'to\s+([A-Za-z][A-Za-z\s\.\-]+)$', desc, flags=re.IGNORECASE)
            if m:
                cand_name = m.group(1).strip()
            client_match = self._resolve_client_by_name(cand_name) if cand_name else None

            loan_pk_found = None
            loan_obj = None
            loan_fields = None
            txid = f.get('transaction')

            loan_obj = None
            loan_found_reason = None
            loan_meta = None

            try:
                loan_obj, loan_found_reason, loan_meta = _find_best_loan_for_bank(self, obj, client_match=client_match,
                                                                                bank_time_window_secs=286400,
                                                                                amount_tolerance=Decimal('100.00'))
            except Exception:
                logger.exception("Error while trying to find loan candidate for bank pk=%s", pk)
                loan_obj, loan_found_reason, loan_meta = None, 'finder_error', {}

            self._audit_loan_lookup(obj, loan_obj, loan_found_reason, audit_path='loan_disbursement_audit.csv', meta=loan_meta)


            # 1) Try direct txid match (best)
            try:
                if txid:
                    loan_obj = next(
                        (l for l in (self.ctx.by_model.get('loan.loan') or []) if (l.get('fields') or {}).get('transaction') == txid),
                        None
                    )
            except Exception:
                logger.exception("loan_disbursement: txid lookup failed")

            # 2) Try client_match if no txid-match
            if not loan_obj and client_match:
                try:
                    client_id = client_match[0]
                    loans_for_client = [l for l in (self.ctx.by_model.get('loan.loan') or []) if (l.get('fields') or {}).get('client') == client_id]
                    if loans_for_client:
                        bank_abs = abs(amount)
                        best = None
                        best_score = None
                        for l in loans_for_client:
                            lf = l.get('fields') or {}
                            la = self.ctx.to_dec(lf.get('amount') or 0)
                            lb = self.ctx.to_dec(lf.get('balance') or 0)
                            # compute closeness to bank amount (small = better)
                            try:
                                score = min(abs(bank_abs - abs(la)), abs(bank_abs - abs(lb)))
                            except Exception:
                                score = Decimal('9999999')
                            if best is None or score < best_score:
                                best = l
                                best_score = score
                        loan_obj = best
                except Exception:
                    logger.exception("loan_disbursement: client_match lookup failed")
                    loan_obj = None

            # 3) Conservative time-window + amount proximity search across loan records
            if not loan_obj:
                try:
                    bank_dt_raw, bank_dt = self.ctx.parse_date(f, 'payment_date', 'created_at')
                    bank_abs = abs(amount)
                    candidates = []
                    if bank_dt:
                        for l in (self.ctx.by_model.get('loan.loan') or []):
                            lf = l.get('fields') or {}
                            # try a couple of date fields on loan record in descending preference
                            _, cand_dt = self.ctx.parse_date(lf, 'created_at', 'created_at')
                            # also try 'disbursed_date' / 'created_at' etc if available (guarded)
                            if not cand_dt:
                                cand_dt = self._as_datetime(lf.get('created_at')) if hasattr(self, '_as_datetime') else None
                            if not cand_dt:
                                continue
                            try:
                                secs = abs((bank_dt - cand_dt).total_seconds())
                            except Exception:
                                continue
                            # conservative window: 1 day (adjustable)
                            if secs <= 86400:
                                la = self.ctx.to_dec(lf.get('amount') or 0)
                                lb = self.ctx.to_dec(lf.get('balance') or 0)
                                if abs(abs(la) - bank_abs) <= Decimal('100.00') or abs(abs(lb) - bank_abs) <= Decimal('100.00'):
                                    candidates.append((l, secs, la, lb))
                        if candidates:
                            # sort by time distance (closest first)
                            candidates.sort(key=lambda x: x[1])
                            # log top candidates
                            loan_obj = candidates[0][0]
                except Exception:
                    logger.exception("loan_disbursement: time-proximity lookup failed")
                    loan_obj = None

            # If we found a loan record, attempt synthesis and log every step
            if loan_obj:
                loan_pk_found = loan_obj.get('pk')
                loan_fields = loan_obj.get('fields') or {}
                try:
                    principal = self.ctx.to_dec(loan_fields.get('amount') or 0)
                except Exception:
                    principal = Decimal('0.00')
                interest = Decimal('0.00')
                # try percent interest first
                try:
                    ip = loan_fields.get('interest')
                    if ip not in (None, ''):
                        interest_pct = Decimal(str(ip))
                        interest = (principal * interest_pct / Decimal('100.00')).quantize(Decimal('0.01'))
                except Exception:
                    logger.exception("loan_disbursement: interest percent parse failed")

                # fallback to balance difference
                try:
                    bal = self.ctx.to_dec(loan_fields.get('balance') or 0)
                    if bal and principal and bal > principal and interest == Decimal('0.00'):
                        interest = (bal - principal)
                except Exception:
                    pass

                bank_abs = abs(amount)
                if principal == Decimal('0.00'):
                    principal = bank_abs
                    interest = Decimal('0.00')

                # Build entries conservatively and create TX
                try:
                    loans_receivable = getattr(self.ctx, 'loans_receivable_acc', None) or getattr(self.ctx, 'suspense_acc', None)
                    # Resolve an interest income account (best-effort)
                    interest_income_acc = getattr(self.ctx, 'suspense_acc', None)
                    try:
                        for i_pk, i_obj in (self.ctx.fixtures_by_app_model_pk.get('income.income') or {}).items():
                            iname = (i_obj.get('fields') or {}).get('name') or ''
                            if 'interest' in iname.lower():
                                try:
                                    interest_income_acc = self._income_gl(i_pk)
                                    break
                                except Exception:
                                    interest_income_acc = interest_income_acc
                        # final fallback: helper with None
                        if interest_income_acc is None and hasattr(self, '_income_gl'):
                            try:
                                interest_income_acc = self._income_gl(None)
                            except Exception:
                                interest_income_acc = interest_income_acc
                    except Exception:
                        pass

                    principal = principal.copy_abs()
                    interest = interest.copy_abs()
                    total_dr = (principal + interest).quantize(Decimal('0.01'))

                    entries = []
                    entries.append({'account': loans_receivable, 'side': getattr(TransactionEntry, 'DEBIT', 'D'), 'amount': total_dr})
                    entries.append({'account': bank_acct, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': principal})
                    if interest > Decimal('0.00'):
                        entries.append({'account': interest_income_acc, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': interest})

                    lname = None
                    try:
                        lname = (self.ctx.fixtures_by_app_model_pk.get('client.client', {}).get(loan_fields.get('client'), {}).get('fields', {}).get('name'))
                    except Exception:
                        pass
                    desc_tx = f"Synthetic loan disbursement/interest capitalisation for loan:{loan_pk_found}"
                    if lname:
                        desc_tx = f"{desc_tx} client:{lname}"

                    date, _ = self.ctx.parse_date(f, 'payment_date', 'created_at')
                    try:
                        txobj = self._create_transaction(entries, desc_tx, workflow_reference=f"legacy:synthetic:loan_disbursement:{pk}", date=date)
                    except TypeError:
                        txobj = self._create_transaction(entries, desc_tx, workflow_reference=f"legacy:synthetic:loan_disbursement:{pk}")


                    # register mappings and mark processed — log failures
                    try:
                        self._register_tx('bank.bankpayment', pk, txobj)
                    except Exception:
                        logger.exception("Failed register_tx for bank synthetic loan disbursement %s", pk)

                    try:
                        if loan_pk_found:
                            self._register_tx('loan.loan', loan_pk_found, txobj)
                    except Exception:
                        logger.exception("Failed register_tx for loan synthetic loan disbursement %s", loan_pk_found)

                    obj['processed'] = True
                    if loan_obj:
                        loan_obj['processed'] = True

                    # also append a tiny CSV audit row (best-effort) so you get a file to scan later
                    try:
                        import csv, os
                        path = 'loan_synthesis_audit.csv'
                        write_header = not os.path.exists(path)
                        with open(path, 'a', newline='', encoding='utf-8') as fh:
                            w = csv.writer(fh)
                            if write_header:
                                w.writerow(['bank_pk','bank_desc','bank_amount','loan_pk','loan_amount','loan_balance','interest','applied_txid'])
                            w.writerow([pk, raw_desc, str(amount), loan_pk_found, str(principal), str(loan_fields.get('balance') or ''), str(interest), getattr(txobj,'id',txobj)])
                    except Exception:
                        logger.exception("Failed to write loan_synthesis_audit.csv")

                    return txobj

                except Exception:
                    logger.exception("Failed to synthesize loan disbursement + interest for bank %s", pk)
                    is_reconciliation = True
                    reconciliation_reason = 'loan_disbursement_synthesis_failed'
            else:
                is_reconciliation = True
                reconciliation_reason = 'loan_disbursement_without_client_or_loan'

        # try liability-like descriptions as a fallback (conservative)
        if not cr_acc and not is_reconciliation:
            desc_lower = desc.lower()
            # conservative keywords to classify as *incoming* liability (loan received / loan / capital)
            liability_indicators = (
                'loan received', 'loan received to', 'loan received from',
                'loan disbursement received', 'loan ', 'loan,', 'loan:',
                'loan received', 'loan received', 'loan received',  # repeats harmless — keep phrase variety
                'loan received', 'capital to', 'capital contribution', 'capital',
                'loan received', 'Union Contribution', 'cash transfered', 'cash transferred', 'loan'  # 'cash transfered' added recently
                    # keep 'loan' last because it's broad
            )
            if any(k in desc_lower for k in liability_indicators):
                try:
                    from .liability_payments import LiabilityPaymentProcessor
                except Exception:
                    LiabilityPaymentProcessor = None

                if LiabilityPaymentProcessor:
                    try:
                        lp = LiabilityPaymentProcessor(self.ctx, self.account_manager)
                        txobj = lp.process_bank_liability(obj)
                        if txobj:
                            logger.info("Bank pk %s classified as liability -> tx %s", pk, getattr(txobj, 'id', txobj))
                            # we handled it; return the created tx
                            return txobj
                    except Exception:
                        logger.exception("Liability auto-classification failed for bank pk %s", pk)
                        # fall through to previous fallback behaviour (suspense/reconciliation)

        elif tx_type == 'control account':
            # try to find a control account by name (existing logic)
            control_acc = None
            try:
                control_acc = Account.objects.filter(branch=self.ctx.branch, name__icontains='Control Account').first()
            except Exception:
                control_acc = None

            # if none found, create/get a stable "control bank" GL using helper
            if not control_acc:
                try:
                    control_acc = self._get_control_bank_account()
                except Exception:
                    control_acc = None

            if control_acc:
                # Here we decide how to use the control account.
                # For a bank line that is a small adjustment, the natural posting is:
                #   DR Bank (if it is an inflow) = CR Control Account
                # or
                #   DR Control Account = CR Bank (if bank is outflow)
                # We'll implement sign-aware posting consistent with existing code.
                cr_acc = control_acc
            else:
                is_reconciliation = True
                reconciliation_reason = 'control_account_not_found'
                
        # fallback: use client_match if available
        if not cr_acc and not is_reconciliation and client_match:
            cr_acc = self.account_manager.get_or_create_client_account(client_match[0], client_match[1])

        if not cr_acc:
            cr_acc = getattr(self.ctx, 'suspense_acc', None)
            if not is_reconciliation:
                is_reconciliation = True
                reconciliation_reason = 'unclassified_transaction'

        amt_abs = abs(amount)
        if amount >= 0:
            entries = [
                {'account': bank_acct, 'side': getattr(TransactionEntry, 'DEBIT', 'D'), 'amount': amt_abs},
                {'account': cr_acc, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': amt_abs},
            ]
        else:
            entries = [
                {'account': cr_acc, 'side': getattr(TransactionEntry, 'DEBIT', 'D'), 'amount': amt_abs},
                {'account': bank_acct, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': amt_abs},
            ]

        date, _ = self.ctx.parse_date(f, 'payment_date', 'created_at')
        txobj = self._create_transaction(entries, desc or f"Bank payment #{pk}", workflow_reference=f"legacy:{key}:{pk}", date=date)
        try:
            self._register_tx(key, pk, txobj)
        except Exception:
            pass

        if is_reconciliation:
            self.ctx.reconciliation.append({
                'legacy_model': key,
                'legacy_pk': pk,
                'reason': reconciliation_reason,
                'desc': desc,
                'amount': str(amount)
            })

        obj['processed'] = True
        return txobj
    
    def _get_control_bank_account(self):
        """
        Return (create if necessary) a dedicated 'Control Account - Legacy (Bank)'
        under the Assets / Bank code space. Used to post tiny legacy adjustments.
        """
        try:
            # Use your branch category helper; branch category for Assets usually id 1
            asset_cat, _ = self._branch_category(1, "Assets")
        except Exception:
            # fallback: try to query a reasonable category or None
            try:
                asset_cat = AccountCategory.objects.filter(name__icontains='Assets').first()
            except Exception:
                asset_cat = None

        # Code choice: reserve a stable code for control bank. B99 is example — change if you prefer.
        control_code = 'B99'
        control_name = 'Control Account - Legacy (Bank)'

        control_acc, created = Account.objects.get_or_create(
            branch=self.context.branch,
            code=control_code,
            defaults={
                'category': asset_cat,
                'name': control_name,
                'owner': self.context.owner,
                'created_by': self.context.owner,
                'classification': self.context.classification
            }
        )
        if created:
            # optionally log creation
            logger.info("Created control bank account: %s (%s)", control_acc, control_code)
        return control_acc

# --- then update your tx_type handling in process_single_bank_payment ---
        
