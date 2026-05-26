# automations/management/commands/transaction_processors/transaction_grouper.py
import datetime as dt
from decimal import Decimal
import difflib
import logging
from collections import defaultdict
import re

logger = logging.getLogger(__name__)

# Import processors we know about

import itertools
from decimal import Decimal
from transactions.models import TransactionEntry

# optionally import income/expense processors to reuse helper GL resolution where available
try:
    from .income_payments import IncomePaymentProcessor
except Exception:
    IncomePaymentProcessor = None

try:
    from .expense_payments import ExpensePaymentProcessor
except Exception:
    ExpensePaymentProcessor = None
try:
    from .bank_payments import BankPaymentProcessor
except Exception:
    BankPaymentProcessor = None

try:
    from .savings_payment_processor import SavingsPaymentProcessor
except Exception:
    SavingsPaymentProcessor = None

# Optionally import loan processor if you have one
try:
    from .loan_payments import LoanPaymentProcessor
except Exception:
    LoanPaymentProcessor = None


class TransactionGrouper:
    """
    Group legacy records by transaction ID and delegate to the appropriate processor
    to create a canonical transaction. This reduces ordering-dependence between processors.
    """

    def __init__(self, context, account_manager):
        """
        context: the management command instance (self)
        account_manager: wrapper exposing get_or_create_bank_account/get_or_create_client_account
        """
        self.ctx = context
        self.am = account_manager

    def _collect_groups(self, model_keys):
        tx_groups = defaultdict(list)
        ungrouped = []
        for mk in model_keys:
            for obj in self.ctx.by_model.get(mk, []):
                txid = (obj.get('fields', {}) or {}).get('transaction')
                if txid:
                    tx_groups[txid].append(obj)
                else:
                    ungrouped.append(obj)
        return tx_groups, ungrouped

    def build_full_group(self, txid, initial_group=None):
        """
        Build a full group of objects that share transaction id txid across the main models.
        """
        full = list(initial_group or [])
        # common models that participate in money movement
        models = [
            'bank.bankpayment', 'loan.loanpayment', 'savings.savingspayment',
            'expenses.expensepayment', 'income.incomepayment', 'asset.assetrecord',
            'liability.liabilitypayment'
        ]
        for mk in models:
            for obj in self.ctx.by_model.get(mk, []):
                if (obj.get('fields', {}) or {}).get('transaction') == txid and obj not in full:
                    full.append(obj)
        return full

    def process_tx_groups(self):
        """
        Main entrypoint: process all groups with a transaction id first.
        """
        model_keys = [
            'bank.bankpayment', 'loan.loanpayment', 'savings.savingspayment',
            'expenses.expensepayment', 'income.incomepayment', 'asset.assetrecord',
            'liability.liabilitypayment'
        ]

        tx_groups, ungrouped = self._collect_groups(model_keys)
        logger.info(f"TransactionGrouper: found {len(tx_groups)} groups keyed by transaction id; {len(ungrouped)} ungrouped")

        # Prepare processor instances
        bank_proc = BankPaymentProcessor(self.ctx, self.am) if BankPaymentProcessor else None
        savings_proc = SavingsPaymentProcessor(self.ctx, self.am) if SavingsPaymentProcessor else None
        loan_proc = LoanPaymentProcessor(self.ctx, self.am) if LoanPaymentProcessor else None

        for txid, group in tx_groups.items():
            # Skip groups already processed by earlier code (flagged 'processed')
            if all(o.get('processed') for o in group):
                continue

            # Build the full cross-model group
            full_group = self.build_full_group(txid, group)

            try:
                # Prefer bank-based processing if bank entries present
                if any(o.get('model') == 'bank.bankpayment' for o in full_group) and bank_proc:
                    # bank processor will register tx and mark objects
                    bank_proc.process_combined_group(full_group, txid)
                elif any(o.get('model') in ('savings.savingspayment', 'savings.savings') for o in full_group) and savings_proc:
                    savings_proc.process_savings_group(full_group, txid)
                elif any(o.get('model') == 'loan.loanpayment' for o in full_group) and loan_proc:
                    # if you have a loan group processor, delegate to it
                    try:
                        loan_proc.process_loan_payment_group(full_group, txid)
                    except Exception:
                        # fallback to simple marking so other processors can try
                        logger.exception(f"Loan processor failed for tx {txid}")
                        for o in full_group:
                            o['processed'] = False
                else:
                    # no specialized processors available — leave them to the per-model processors
                    logger.debug(f"No specialized processor for tx group {txid}; leaving for per-model processors")
                    # do not mark processed so per-model processors will attempt
                    continue

            except Exception as e:
                logger.exception(f"TransactionGrouper: error processing group {txid}: {e}")
                # leave to per-model processors as fallback
                continue

        try:
            # recommended defaults: 2 seconds window, 0.01 amount tolerance, max 3-piece combos
            # audit only by default (auto_apply=False) — set auto_apply=True if you are confident after reviewing audit CSV
            self._run_time_based_matching(seconds_window=2, amount_tolerance=Decimal('0.01'), max_combo=3, auto_apply=False, audit_path='time_matches_audit.csv')
        except Exception:
            logger.exception("Time-based grouping pass failed (continuing).")
        # we do not create transactions for ungrouped entries here; those are handled by processors
        logger.info("TransactionGrouper processing complete.")

    # Replace your _as_datetime implementation with this:
    def _as_datetime(self, d):
        """
        Normalize parse_date output (date or datetime or string or timestamp) into a datetime
        for seconds math. Returns a `datetime.datetime` or None if it can't coerce.

        Notes:
        - If you need timezone-aware comparisons, convert/normalize with django.utils.timezone separately.
        - This function intentionally avoids raising; it returns None on unknown inputs.
        """
        if d is None:
            return None

        # already a datetime
        if isinstance(d, dt.datetime):
            return d

        # a date -> convert to datetime at midnight
        if isinstance(d, dt.date):
            return dt.datetime.combine(d, dt.time.min)

        # numeric timestamp (seconds since epoch)
        if isinstance(d, (int, float)):
            try:
                return dt.datetime.fromtimestamp(d)
            except Exception:
                return None

        # string: try ISO first, then some common formats
        if isinstance(d, str):
            # try Python's fromisoformat (supports many ISO variants)
            try:
                return dt.datetime.fromisoformat(d)
            except Exception:
                pass
            # try a few common fallbacks
            fallbacks = ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d")
            for fmt in fallbacks:
                try:
                    return dt.datetime.strptime(d, fmt)
                except Exception:
                    continue

        # not coercible: log and return None
        logger.debug("_as_datetime: could not coerce %r to datetime", d)
        return None


    def _find_time_based_matches(self, bank_obj, candidate_models, seconds_window=2, amount_tolerance=Decimal('0.01'), max_combo=3):
        """
        For a single bank_obj (unprocessed, unmapped) find candidate objects in candidate_models
        posted within +/- seconds_window seconds whose amounts sum to the opposite of bank amount.

        Return:
          - None if no unambiguous match found
          - a list of matched objects (one or several) if unique unambiguous match is found
        """
        bank_fields = bank_obj.get('fields') or {}
        bank_amt = self.ctx.to_dec(bank_fields.get('amount') or 0)
        if bank_amt == 0:
            return None

        bank_dt_raw, _ = self.ctx.parse_date(bank_fields, 'payment_date', 'created_at')
        bank_dt = self._as_datetime(bank_dt_raw)
        if bank_dt is None:
            # can't do time-based match without a datetime
            return None

        target_abs = abs(bank_amt)

        # collect candidate objects (unprocessed, unmapped) within time window
        candidates = []
        import_map_keys = set((self.ctx.import_map.get('legacy_to_new') or {}).keys())

        for model in candidate_models:
            for c in self.ctx.by_model.get(model, []) or []:
                if c.get('processed'):
                    continue
                if f"{model}:{c.get('pk')}" in import_map_keys:
                    continue
                c_fields = c.get('fields') or {}
                c_dt_raw, _ = self.ctx.parse_date(c_fields, 'payment_date', 'created_at')
                c_dt = self._as_datetime(c_dt_raw)
                if c_dt is None:
                    continue
                # check time window
                if abs((bank_dt - c_dt).total_seconds()) > seconds_window:
                    continue
                c_amt = self.ctx.to_dec(c_fields.get('amount') or 0)
                # If signs are opposite and magnitudes equal-ish this is a strong candidate
                candidates.append({
                    'obj': c,
                    'model': model,
                    'amt': c_amt,
                    'abs_amt': abs(c_amt),
                    'dt': c_dt
                })

        if not candidates:
            return None

        # 1) Try single-candidate exact/opposite match (preferred)
        single_matches = [cand for cand in candidates if (cand['abs_amt'] - target_abs).copy_abs() <= amount_tolerance and ((bank_amt + cand['amt']) == 0 or (bank_amt.copy_abs() == cand['abs_amt']))]
        if len(single_matches) == 1:
            return [single_matches[0]['obj']]

        # 2) Try to find unique small combination (subset-sum) whose absolute sum equals target_abs
        # Limit complexity: up to max_combo items
        # Build list of (index, abs_amt) sorted descending to aid search
        cand_list = sorted([(i, c['abs_amt']) for i, c in enumerate(candidates)], key=lambda x: x[1], reverse=True)
        amounts = [candidates[i]['abs_amt'] for i, _ in cand_list]
        idx_map = [i for i, _ in cand_list]

        # backtracking subset-sum with cutoff by max_combo and tolerance
        target = target_abs

        def backtrack(start, chosen_indices, curr_sum):
            # success
            if abs(curr_sum - target) <= amount_tolerance:
                return list(chosen_indices)
            if len(chosen_indices) >= max_combo:
                return None
            for j in range(start, len(amounts)):
                nxt_sum = curr_sum + amounts[j]
                # prune if too big (we allow some tolerance)
                if nxt_sum - target > amount_tolerance:
                    continue
                res = backtrack(j + 1, chosen_indices + [j], nxt_sum)
                if res:
                    return res
            return None

        combo_indices = backtrack(0, [], Decimal('0.00'))
        if combo_indices:
            # map back to objects
            matched_objs = [candidates[idx_map[i]]['obj'] for i in combo_indices]
            return matched_objs

        # ambiguous: multiple single candidates or no exact combo -> don't auto-match
        return None

    def _run_time_based_matching(self, seconds_window=2, amount_tolerance=Decimal('0.01'), max_combo=3, candidate_models=None, auto_apply=False, audit_path='time_matches_audit.csv'):
        """
        Scan unprocessed bank.bankpayment rows, attempt to pair each with candidate rows
        by tight time + amount matching. When a unique match (single/canonical combo) is found,
        create a transaction and register mappings for involved rows.

        By default this writes an audit CSV (audit_path) with proposed matches. To auto-apply the
        proposed matches set auto_apply=True (use with caution after reviewing the audit CSV).
        """
        import csv
        candidate_models = candidate_models or [
            'loan.loanpayment', 'savings.savingspayment', 'income.incomepayment', 'expenses.expensepayment'
        ]

        bank_key = 'bank.bankpayment'
        bank_items = [b for b in (self.ctx.by_model.get(bank_key) or []) if not b.get('processed') and not f"{bank_key}:{b.get('pk')}" in (self.ctx.import_map.get('legacy_to_new') or {})]

        if not bank_items:
            logger.debug("Time-based matcher: no unprocessed/unmapped bank items to check.")
            return

        # prepare processors for GL resolution if available (best-effort)
        income_proc = IncomePaymentProcessor(self.ctx, self.am) if IncomePaymentProcessor else None
        expense_proc = ExpensePaymentProcessor(self.ctx, self.am) if ExpensePaymentProcessor else None

        # open audit writer
        try:
            audit_fh = open(audit_path, 'w', newline='', encoding='utf-8')
            writer = csv.writer(audit_fh)
            writer.writerow(['bank_model','bank_pk','bank_desc','bank_amt','candidate_model','candidate_pk','candidate_desc','candidate_amt','match_type','reasons','time_delta_secs','auto_applied','tx_ref'])
        except Exception as e:
            logger.exception("Failed to open audit CSV %s: %s", audit_path, e)
            writer = None
            audit_fh = None

        for bank_obj in bank_items:
            try:
                # First try subset-sum matching among candidate_models (existing implementation)
                matches = self._find_time_based_matches(bank_obj, candidate_models, seconds_window, amount_tolerance, max_combo)

                # If that returns None, try cross-model single matching (more flexible)
                match_type = None
                match_meta = None
                if not matches:
                    cand, meta = self._find_time_based_match_across_models(bank_obj, candidate_models, seconds_window=seconds_window, amount_tolerance=amount_tolerance)
                    if cand:
                        # the across-model returns (candidate_obj, meta)
                        matches = [cand]
                        match_type = 'across_models'
                        match_meta = meta.get('match_meta') if meta else None
                else:
                    match_type = 'subset_sum'

                if not matches:
                    # write audit row with empty candidate if writer available
                    if writer:
                        bf = bank_obj.get('fields') or {}
                        writer.writerow(['bank.bankpayment', bank_obj.get('pk'), (bf.get('description') or '').strip(), str(self.ctx.to_dec(bf.get('amount') or 0)), '', '', '', '', 'no_match', '', '', 'N', ''])
                    continue  # nothing unambiguous

                # Build transaction entries: sign-aware bank side
                bank_fields = bank_obj.get('fields') or {}
                bank_amt = self.ctx.to_dec(bank_fields.get('amount') or 0)
                if bank_amt == 0:
                    # skip zero-value
                    continue

                # choose bank acct via bank id in bank_obj
                bank_id = bank_fields.get('bank')
                bank_name = self.ctx.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name')
                bank_acct = self.am.get_or_create_bank_account(bank_id, bank_name) if bank_id else getattr(self.ctx, 'cash_acc', None) or self.ctx.suspense_acc

                entries = []
                bank_side = getattr(TransactionEntry, 'DEBIT', 'D') if bank_amt >= 0 else getattr(TransactionEntry, 'CREDIT', 'C')
                entries.append({'account': bank_acct, 'side': bank_side, 'amount': abs(bank_amt)})

                mapped_total = Decimal('0.00')

                ambiguous_flag = False
                candidate_rows_for_audit = []
                for m in matches:
                    model = m.get('model')
                    f = m.get('fields') or {}
                    amt = self.ctx.to_dec(f.get('amount') or 0)
                    mapped_total += amt

                    candidate_rows_for_audit.append((model, m.get('pk'), (f.get('description') or '').strip(), str(amt)))

                    # income -> credit income GL
                    if (model or '').lower().startswith('income'):
                        inc_acc = None
                        if income_proc and hasattr(income_proc, '_income_gl'):
                            try:
                                inc_acc = income_proc._income_gl(f.get('income'))
                            except Exception:
                                inc_acc = None
                        if not inc_acc:
                            inc_acc = getattr(self.ctx, 'suspense_acc', None)
                        entries.append({'account': inc_acc, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': abs(amt)})

                    # expense -> debit expense GL
                    elif (model or '').lower().startswith('expenses'):
                        exp_acc = None
                        if expense_proc and hasattr(expense_proc, '_expense_gl'):
                            try:
                                exp_acc = expense_proc._expense_gl(f.get('expense'))
                            except Exception:
                                exp_acc = None
                        if not exp_acc:
                            exp_acc = getattr(self.ctx, 'suspense_acc', None)
                        entries.append({'account': exp_acc, 'side': getattr(TransactionEntry, 'DEBIT', 'D'), 'amount': abs(amt)})

                    # loan or savings -> credit client account
                    elif 'loan' in (model or '').lower() or 'saving' in (model or '').lower():
                        client_id = f.get('client')
                        client_name = None
                        if client_id:
                            client_name = self.ctx.fixtures_by_app_model_pk.get('client.client', {}).get(client_id, {}).get('fields', {}).get('name')
                        if client_id:
                            cr_acc = self.am.get_or_create_client_account(client_id, client_name or f"client_{client_id}")
                        else:
                            cr_acc = getattr(self.ctx, 'suspense_acc', None)
                            # record reconciliation for unmapped client in this small pairing
                            self.ctx.reconciliation.append({
                                'legacy_model': model,
                                'legacy_pk': m.get('pk'),
                                'reason': 'time_based_matched_unmapped_client',
                                'desc': (f.get('description') or f"legacy:{model}:{m.get('pk')}"),
                                'amount': str(amt)
                            })
                        entries.append({'account': cr_acc, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': abs(amt)})
                    else:
                        ambiguous_flag = True
                        break

                if ambiguous_flag:
                    # skip auto-matching to avoid false positives; write audit and continue
                    if writer:
                        bf = bank_obj.get('fields') or {}
                        writer.writerow(['bank.bankpayment', bank_obj.get('pk'), (bf.get('description') or '').strip(), str(self.ctx.to_dec(bf.get('amount') or 0)), ','.join([r[0] for r in candidate_rows_for_audit]), ','.join([str(r[1]) for r in candidate_rows_for_audit]), ','.join([r[2] for r in candidate_rows_for_audit]), ','.join([r[3] for r in candidate_rows_for_audit]), match_type or 'ambiguous', (match_meta.get('reasons') if match_meta else ''), (match_meta.get('time_delta_secs') if match_meta else ''), 'N', ''])
                    continue

                # ensure balanced within tolerance
                total_debits = sum(self.ctx.to_dec(e['amount']) for e in entries if e['side'] in (getattr(TransactionEntry, 'DEBIT', 'D'), 'D'))
                total_credits = sum(self.ctx.to_dec(e['amount']) for e in entries if e['side'] in (getattr(TransactionEntry, 'CREDIT', 'C'), 'C'))
                if abs(total_debits - total_credits) > amount_tolerance:
                    # unbalanced; audit and skip
                    if writer:
                        bf = bank_obj.get('fields') or {}
                        writer.writerow(['bank.bankpayment', bank_obj.get('pk'), (bf.get('description') or '').strip(), str(self.ctx.to_dec(bf.get('amount') or 0)), ','.join([r[0] for r in candidate_rows_for_audit]), ','.join([str(r[1]) for r in candidate_rows_for_audit]), ','.join([r[2] for r in candidate_rows_for_audit]), ','.join([r[3] for r in candidate_rows_for_audit]), match_type or 'unbalanced', (match_meta.get('reasons') if match_meta else ''), (match_meta.get('time_delta_secs') if match_meta else ''), 'N', ''])
                    continue

                tx_ref = ''
                auto_applied_flag = 'N'
                # Auto-apply if requested (conservative)
                if auto_apply:
                    desc = (bank_fields.get('description') or '') or "Time-based matched transaction"
                    try:
                        bank_dt = bank_fields.get('payment_date') or bank_fields.get('created_at')
                        txobj = self.ctx.create_transaction(entries, desc, workflow_reference=f"legacy:time_match:{bank_obj.get('pk')}", date=self._as_datetime(bank_dt))
                    except TypeError:
                        txobj = self.ctx.create_transaction(entries, desc, workflow_reference=f"legacy:time_match:{bank_obj.get('pk')}")
                    # Register mapping for bank + matched objects (idempotent)
                    all_objects = [bank_obj] + matches
                    reg_failed = False
                    for o in all_objects:
                        try:
                            self.ctx.register_tx(o.get('model'), o.get('pk'), txobj)
                        except Exception:
                            logger.exception("Time-based matcher: failed to register mapping for %s:%s", o.get('model'), o.get('pk'))
                            reg_failed = True
                            break
                    if not reg_failed:
                        for o in all_objects:
                            o['processed'] = True
                        tx_ref = getattr(txobj, 'id', '')
                        auto_applied_flag = 'Y'
                        logger.info("Time-based matched bank %s -> objects %s; tx=%s", bank_obj.get('pk'), [m.get('pk') for m in matches], tx_ref)

                # always audit the proposed match
                if writer:
                    bf = bank_obj.get('fields') or {}
                    if matches:
                        # if multiple matches, collapse rows into comma-separated strings
                        cand_models = ','.join([m.get('model') for m in matches])
                        cand_pks = ','.join([str(m.get('pk')) for m in matches])
                        cand_descs = ','.join([((m.get('fields') or {}).get('description') or '').strip() for m in matches])
                        cand_amts = ','.join([str((m.get('fields') or {}).get('amount') or '') for m in matches])
                    else:
                        cand_models = cand_pks = cand_descs = cand_amts = ''
                    reasons = (match_meta.get('reasons') if match_meta else '')
                    tdelta = (match_meta.get('time_delta_secs') if match_meta else '')
                    writer.writerow(['bank.bankpayment', bank_obj.get('pk'), (bf.get('description') or '').strip(), str(self.ctx.to_dec(bf.get('amount') or 0)), cand_models, cand_pks, cand_descs, cand_amts, match_type or 'subset', reasons, tdelta, auto_applied_flag, tx_ref])

            except Exception as e:
                logger.exception("Time-based matcher error for bank item %s: %s", bank_obj.get('pk'), e)
                # continue to next bank item

        if audit_fh:
            try:
                audit_fh.close()
            except Exception:
                pass

    # place inside TransactionGrouper class (or import into it)
    def _extract_numeric_refs(self,s):
        return re.findall(r'\d{3,}', (s or ''))

    def _find_time_based_match_across_models(self,
                                            bank_obj,
                                            candidate_models=None,
                                            seconds_window: int = 1,
                                            amount_tolerance: Decimal = Decimal('0.01'),
                                            required_secondary_match: bool = True,
                                            allow_either_sign: bool = False):
        """
        Try to find a single best counterparty object for a *bank_obj* by scanning
        candidate models for objects whose datetime is within +/- seconds_window
        and whose amount magnitude matches within amount_tolerance.

        Returns:
        (candidate_obj, reason_dict) on unique confident match, otherwise (None, None).

        Parameters:
        - bank_obj: legacy fixture dict (a bank.bankpayment object)
        - candidate_models: list of model strings to search e.g.
            ['income.incomepayment','expenses.expensepayment','savings.savingspayment',
            'loan.loanpayment','loan.loandisbursement']
            default: the above common set.
        - seconds_window: integer seconds window (default 3)
        - amount_tolerance: Decimal, allowed absolute diff between |bank_amt| and |cand_amt|
        - required_secondary_match: if True require a secondary check (shared numeric ref OR keyword/desc match)
        - allow_either_sign: if True, ignore sign relationship (less strict) — default False (prefer explicit sign rules)

        Notes:
        - This function does not mark objects processed or register transactions.
        - It returns None for ambiguous cases.
        """
        if candidate_models is None:
            candidate_models = [
                'income.incomepayment',
                'expenses.expensepayment',
                'savings.savingspayment',
                'loan.loanpayment',
                'loan.loandisbursement'
            ]

        # Quick sanity
        if not bank_obj or bank_obj.get('processed'):
            return None, None

        # Extract bank info
        bf = bank_obj.get('fields') or {}
        try:
            bank_amt = Decimal(self.ctx.to_dec(bf.get('amount') or 0))
        except Exception:
            bank_amt = Decimal('0.00')
        # parse_date expected to return (date_or_dt, datetime_or_none). Prefer the datetime component.
        _, bank_dt = self.ctx.parse_date(bf, 'payment_date', 'created_at')
        # normalized desc and numeric refs helper
        bank_desc = (bf.get('description') or '') or ''
        bank_desc_norm = (self.ctx.norm_str(bank_desc) if hasattr(self.ctx, 'norm_str') else bank_desc).lower()
        bank_refs = set(self._extract_numeric_refs(bank_desc_norm))

        # sign semantics per model relative to the bank entry.
        # 'same' -> we expect candidate amount has same sign as bank (both positive inflows),
        # 'opposite' -> we expect candidate amount is opposite sign (bank outflow vs payment credit).
        expected_relation = {
            'income.incomepayment': 'same',
            'expenses.expensepayment': 'opposite',
            'savings.savingspayment': 'opposite',
            'loan.loanpayment': 'opposite',
            'loan.loandisbursement': 'opposite',
        }

        # helper: compute if amounts match within tolerance (absolute)
        def _amounts_match(a, b):
            try:
                return abs(Decimal(a) - Decimal(b)) <= Decimal(amount_tolerance)
            except Exception:
                return False

        # helper: numeric refs extractor provided by your class (you referenced _extract_numeric_refs above)
        # if not present, fallback to simple regex

        # Build candidate list by time window first for performance
        # Convert seconds to timedeltas
        td = dt.timedelta(seconds=seconds_window)

        matches = []  # collect potential matches with reasons

        for model in candidate_models:
            objs = self.ctx.by_model.get(model, []) or []
            # iterate candidates
            for cand in objs:
                if cand is bank_obj:
                    continue
                if cand.get('processed'):
                    continue
                cf = cand.get('fields') or {}
                # parse candidate datetime
                _, cand_dt = self.ctx.parse_date(cf, 'payment_date', 'created_at')
                # if either datetime missing, still allow but deprioritize; but we will prefer ones that have dt
                if bank_dt and cand_dt:
                    try:
                        secs = abs((bank_dt - cand_dt).total_seconds())
                    except Exception:
                        # if delta cannot be computed, skip
                        continue
                    if secs > seconds_window:
                        continue
                else:
                    # If both dt not present, we can still consider but only if required_secondary_match False,
                    # otherwise skip because time is a primary signal.
                    if bank_dt and not cand_dt:
                        # if bank has dt but candidate doesn't, skip
                        continue
                    if not bank_dt and not cand_dt:
                        # allow through, but these are low-confidence candidates
                        pass

                # amount check: compare magnitudes
                try:
                    cand_amt = Decimal(self.ctx.to_dec(cf.get('amount') or 0))
                except Exception:
                    continue

                # sign matching logic
                relation = expected_relation.get(model, None)
                sign_ok = True
                if not allow_either_sign and relation:
                    if relation == 'same' and (cand_amt * bank_amt) < 0:
                        sign_ok = False
                    if relation == 'opposite' and (cand_amt * bank_amt) > 0:
                        sign_ok = False
                # if sign_ok false skip
                if not sign_ok:
                    continue

                # absolute-amount match
                if not _amounts_match(abs(bank_amt), abs(cand_amt)):
                    continue

                # secondary checks (one or more must be true if required_secondary_match True)
                reasons = []
                # numeric refs
                cand_desc = (cf.get('description') or '') or ''
                cand_desc_norm = (self.ctx.norm_str(cand_desc) if hasattr(self.ctx, 'norm_str') else cand_desc).lower()
                cand_refs = set(self._extract_numeric_refs(cand_desc_norm))
                if bank_refs and cand_refs and bank_refs.intersection(cand_refs):
                    reasons.append('shared_numeric_ref')
                # direct substring hint: 'transfer' 'cash deposit' 'disburse' etc.
                hint_pairs = [('transfer', 'transfer'), ('cash deposit', 'cash deposit'),
                            ('disburse', 'disburse'), ('registration fee', 'registration fee'),
                            ('salary', 'salary')]
                for a, b in hint_pairs:
                    if a in bank_desc_norm and b in cand_desc_norm:
                        reasons.append(f'hint:{a}')
                        break
                # fuzzy description similarity
                if bank_desc_norm and cand_desc_norm:
                    score = difflib.SequenceMatcher(None, bank_desc_norm, cand_desc_norm).ratio()
                    if score > 0.8:
                        reasons.append('desc_high_similarity')
                    elif score > 0.6:
                        reasons.append('desc_med_similarity')
                # timestamp proximity reason
                if bank_dt and cand_dt:
                    try:
                        secs = abs((bank_dt - cand_dt).total_seconds())
                        if secs <= seconds_window:
                            reasons.append('time_close')
                    except Exception:
                        pass

                # enforce secondary match if requested
                if required_secondary_match and not reasons:
                    continue

                # Compose match candidate with metadata: model, pk, reasons, sec distance, scores
                match_meta = {
                    'candidate': cand,
                    'model': model,
                    'pk': cand.get('pk'),
                    'amount': str(cand_amt),
                    'reasons': reasons,
                    'time_delta_secs': None
                }
                if bank_dt and cand_dt:
                    try:
                        match_meta['time_delta_secs'] = abs((bank_dt - cand_dt).total_seconds())
                    except Exception:
                        pass

                matches.append(match_meta)

        # Post-process matches:
        # - If no matches, return None
        # - If exactly one match, return it
        # - If multiple, try to pick best by
        #     1) highest number of reasons (stronger evidence)
        #     2) smallest time_delta_secs
        #     3) highest description similarity (desc_high_similarity first)
        if not matches:
            return None, None

        # score each match conservatively
        def _score(m):
            score = 0
            # reward more reasons
            score += len(m['reasons']) * 10
            # reward time closeness
            td = m.get('time_delta_secs')
            if td is None:
                score -= 5  # penalize missing time
            else:
                score += max(0, int((seconds_window - td) * 5))  # closer time -> higher
            # reward strong desc similarity reason
            if 'desc_high_similarity' in m['reasons']:
                score += 20
            if 'shared_numeric_ref' in m['reasons']:
                score += 30
            return score

        matches_sorted = sorted(matches, key=lambda mm: (_score(mm), - (mm.get('time_delta_secs') or 0)), reverse=True)

        # If the top candidate is strictly better than second by margin, accept. Otherwise ambiguous -> None.
        if len(matches_sorted) == 1:
            return matches_sorted[0]['candidate'], {'match_meta': matches_sorted[0]}
        else:
            top = matches_sorted[0]
            second = matches_sorted[1]
            if _score(top) >= (_score(second) + 15):  # require a meaningful lead
                return top['candidate'], {'match_meta': top}
            else:
                # ambiguous: no confident unique match
                return None, None
