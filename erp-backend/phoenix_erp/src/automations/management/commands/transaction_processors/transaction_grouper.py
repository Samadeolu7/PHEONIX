import datetime as dt
from decimal import Decimal, ROUND_HALF_UP
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)

# Import processors we know about
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

try:
    from .loan_payments import LoanPaymentProcessor
except Exception:
    LoanPaymentProcessor = None

# near top of file (helpers)
import csv, os, time

def _quant(v):
    """Normalize numeric/Decimal to 2dp Decimal"""
    if v is None:
        return Decimal('0.00')
    if not isinstance(v, Decimal):
        v = Decimal(str(v))
    return v.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

def _audit_tx_group(rows, path='tx_group_audit.csv'):
    try:
        write_header = not os.path.exists(path)
        with open(path, 'a', newline='', encoding='utf-8') as fh:
            w = csv.writer(fh)
            if write_header:
                w.writerow(['ts','context','bank_pk','entries','debits','credits','diff','note'])
            w.writerow([time.time(), rows.get('context',''), rows.get('bank_pk'), rows.get('entries_repr'), rows.get('debits'), rows.get('credits'), rows.get('diff'), rows.get('note')])
    except Exception:
        logger.exception("Failed to write tx group audit")


class TransactionGrouper:
    """
    Group legacy records by transaction ID and delegate to the appropriate processor.
    """

    def __init__(self, context, account_manager):
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
        Build full group across common money-moving models.
        """
        full = list(initial_group or [])
        models = [
            'bank.bankpayment',
            'loan.loan',
            'loan.loandisbursement',
            'loan.loanpayment',
            'savings.savingspayment',
            'expenses.expensepayment',
            'income.incomepayment',
            'asset.assetrecord',
            'liability.liabilitypayment',
        ]
        for mk in models:
            for obj in self.ctx.by_model.get(mk, []):
                if (obj.get('fields', {}) or {}).get('transaction') == txid and obj not in full:
                    full.append(obj)
        return full

    def process_tx_groups(self):
        model_keys = [
            'bank.bankpayment',
            'loan.loan',
            'loan.loandisbursement',
            'loan.loanpayment',
            'savings.savingspayment',
            'expenses.expensepayment',
            'income.incomepayment',
            'asset.assetrecord',
            'liability.liabilitypayment'
        ]
        tx_groups, ungrouped = self._collect_groups(model_keys)
        logger.info(f"TransactionGrouper: found {len(tx_groups)} groups keyed by transaction id; {len(ungrouped)} ungrouped")

        bank_proc = BankPaymentProcessor(self.ctx, self.am) if BankPaymentProcessor else None
        savings_proc = SavingsPaymentProcessor(self.ctx, self.am) if SavingsPaymentProcessor else None
        loan_proc = LoanPaymentProcessor(self.ctx, self.am) if LoanPaymentProcessor else None

        for txid, group in tx_groups.items():
            # skip if all flagged processed
            if all(o.get('processed') for o in group):
                continue

            full_group = self.build_full_group(txid, group)

            try:
                # prefer bank-based processing
                if any(o.get('model') == 'bank.bankpayment' for o in full_group) and bank_proc:
                    bank_proc.process_combined_group(full_group, txid)
                elif any(o.get('model') in ('savings.savingspayment', 'savings.savings') for o in full_group) and savings_proc:
                    try:
                        savings_proc.process_savings_group(full_group, txid)
                        for o in full_group:
                            o['processed'] = True
                    except Exception:
                        logger.exception("Delegation to savings processor failed for tx %s", txid)
                        for o in full_group:
                            o['processed'] = False
                elif any(o.get('model') == 'loan.loanpayment' for o in full_group) and loan_proc:
                    try:
                        loan_proc.process_loan_payment_group(full_group, txid)
                    except Exception:
                        logger.exception("Loan processor failed for tx %s", txid)
                        for o in full_group:
                            o['processed'] = False
                else:
                    logger.debug(f"No specialized processor for tx group {txid}; leaving for per-model processors")
                    continue

            except Exception as e:
                logger.exception(f"TransactionGrouper: error processing group {txid}: {e}")
                continue

        try:
            self._run_time_based_matching(seconds_window=2, amount_tolerance=Decimal('0.01'), max_combo=3)
        except Exception:
            logger.exception("Time-based grouping pass failed (continuing).")

        logger.info("TransactionGrouper processing complete.")

    # ----- Helpers for time-based matching (updated, sign-aware) -----

    def _as_datetime(self, d):
        if d is None:
            return None
        if isinstance(d, dt.datetime):
            return d
        if isinstance(d, dt.date):
            return dt.datetime.combine(d, dt.time.min)
        if isinstance(d, (int, float)):
            try:
                return dt.datetime.fromtimestamp(d)
            except Exception:
                return None
        if isinstance(d, str):
            try:
                return dt.datetime.fromisoformat(d)
            except Exception:
                pass
            fallbacks = ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d")
            for fmt in fallbacks:
                try:
                    return dt.datetime.strptime(d, fmt)
                except Exception:
                    continue
        logger.debug("_as_datetime: could not coerce %r to datetime", d)
        return None

    def _find_time_based_matches(self, bank_obj, candidate_models, seconds_window=2, amount_tolerance=Decimal('0.01'), max_combo=3):
        bank_fields = bank_obj.get('fields') or {}
        bank_amt = self.ctx.to_dec(bank_fields.get('amount') or 0)
        if bank_amt == 0:
            return None
        bank_dt_raw, _ = self.ctx.parse_date(bank_fields, 'payment_date', 'created_at')
        bank_dt = self._as_datetime(bank_dt_raw)
        if bank_dt is None:
            return None
        target_abs = abs(bank_amt)

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
                if abs((bank_dt - c_dt).total_seconds()) > seconds_window:
                    continue
                c_amt = self.ctx.to_dec(c_fields.get('amount') or 0)
                candidates.append({
                    'obj': c,
                    'model': model,
                    'amt': c_amt,
                    'abs_amt': abs(c_amt),
                    'dt': c_dt
                })

        if not candidates:
            return None

        # single-candidate exact/opposite
        single_matches = [cand for cand in candidates if (cand['abs_amt'] - target_abs).copy_abs() <= amount_tolerance and ((bank_amt + cand['amt']) == 0 or (bank_amt.copy_abs() == cand['abs_amt']))]
        if len(single_matches) == 1:
            return [single_matches[0]['obj']]

        # subset-sum small combos
        cand_list = sorted([(i, c['abs_amt']) for i, c in enumerate(candidates)], key=lambda x: x[1], reverse=True)
        amounts = [candidates[i]['abs_amt'] for i, _ in cand_list]
        idx_map = [i for i, _ in cand_list]
        target = target_abs

        def backtrack(start, chosen_indices, curr_sum):
            if abs(curr_sum - target) <= amount_tolerance:
                return list(chosen_indices)
            if len(chosen_indices) >= max_combo:
                return None
            for j in range(start, len(amounts)):
                nxt_sum = curr_sum + amounts[j]
                if nxt_sum - target > amount_tolerance:
                    continue
                res = backtrack(j + 1, chosen_indices + [j], nxt_sum)
                if res:
                    return res
            return None

        combo_indices = backtrack(0, [], Decimal('0.00'))
        if combo_indices:
            matched_objs = [candidates[idx_map[i]]['obj'] for i in combo_indices]
            return matched_objs

        return None

    def _run_time_based_matching(self, seconds_window=2, amount_tolerance=Decimal('0.01'), max_combo=3, candidate_models=None):
        candidate_models = candidate_models or [
            'loan.loan',
            'loan.loandisbursement',
            'loan.loanpayment',
            'savings.savingspayment',
            'income.incomepayment',
            'expenses.expensepayment'
        ]

        bank_key = 'bank.bankpayment'
        bank_items = [b for b in (self.ctx.by_model.get(bank_key) or []) if not b.get('processed') and not f"{bank_key}:{b.get('pk')}" in (self.ctx.import_map.get('legacy_to_new') or {})]

        if not bank_items:
            logger.debug("Time-based matcher: no unprocessed/unmapped bank items to check.")
            return

        income_proc = IncomePaymentProcessor(self.ctx, self.am) if IncomePaymentProcessor else None
        expense_proc = ExpensePaymentProcessor(self.ctx, self.am) if ExpensePaymentProcessor else None

        for bank_obj in bank_items:
            try:
                matches = self._find_time_based_matches(bank_obj, candidate_models, seconds_window, amount_tolerance, max_combo)
                if not matches:
                    continue

                bank_fields = bank_obj.get('fields') or {}
                bank_amt = self.ctx.to_dec(bank_fields.get('amount') or 0)
                if bank_amt == 0:
                    continue

                bank_id = bank_fields.get('bank')
                bank_name = self.ctx.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name')
                bank_acct = self.am.get_or_create_bank_account(bank_id, bank_name) if bank_id else getattr(self.ctx, 'cash_acc', None) or self.ctx.suspense_acc

                entries = []
                # bank side: use bank row sign
                bank_side = getattr(TransactionEntry, 'DEBIT', 'D') if bank_amt >= 0 else getattr(TransactionEntry, 'CREDIT', 'C')
                entries.append({'account': bank_acct, 'side': bank_side, 'amount': _quant(abs(bank_amt))})

                mapped_total = Decimal('0.00')
                ambiguous_flag = False

                for m in matches:
                    model = m.get('model')
                    f = m.get('fields') or {}
                    amt = self.ctx.to_dec(f.get('amount') or 0)
                    mapped_total += amt

                    # income -> credit if positive, debit if negative (sign aware)
                    if (model or '').lower().startswith('income'):
                        inc_acc = None
                        if income_proc and hasattr(income_proc, '_income_gl'):
                            try:
                                inc_acc = income_proc._income_gl(f.get('income'))
                            except Exception:
                                inc_acc = None
                        if not inc_acc:
                            inc_acc = getattr(self.ctx, 'suspense_acc', None)
                        side = getattr(TransactionEntry, 'CREDIT', 'C') if amt >= 0 else getattr(TransactionEntry, 'DEBIT', 'D')
                        entries.append({'account': inc_acc, 'side': side, 'amount': _quant(abs(amt))})

                    elif (model or '').lower().startswith('expenses'):
                        exp_acc = None
                        if expense_proc and hasattr(expense_proc, '_expense_gl'):
                            try:
                                exp_acc = expense_proc._expense_gl(f.get('expense'))
                            except Exception:
                                exp_acc = None
                        if not exp_acc:
                            exp_acc = getattr(self.ctx, 'suspense_acc', None)
                        side = getattr(TransactionEntry, 'DEBIT', 'D') if amt >= 0 else getattr(TransactionEntry, 'CREDIT', 'C')
                        entries.append({'account': exp_acc, 'side': side, 'amount': _quant(abs(amt))})

                    elif 'loan' in (model or '').lower() or 'saving' in (model or '').lower():
                        client_id = f.get('client')
                        client_name = None
                        if client_id:
                            client_name = self.ctx.fixtures_by_app_model_pk.get('client.client', {}).get(client_id, {}).get('fields', {}).get('name')
                        if client_id:
                            cr_acc = self.am.get_or_create_client_account(client_id, client_name or f"client_{client_id}")
                        else:
                            cr_acc = getattr(self.ctx, 'suspense_acc', None)
                            self.ctx.reconciliation.append({
                                'legacy_model': model,
                                'legacy_pk': m.get('pk'),
                                'reason': 'time_based_matched_unmapped_client',
                                'desc': (f.get('description') or f"legacy:{model}:{m.get('pk')}"),
                                'amount': str(amt)
                            })
                        side = getattr(TransactionEntry, 'CREDIT', 'C') if amt >= 0 else getattr(TransactionEntry, 'DEBIT', 'D')
                        entries.append({'account': cr_acc, 'side': side, 'amount': _quant(abs(amt))})

                    else:
                        ambiguous_flag = True
                        break

                if ambiguous_flag:
                    continue

                # compute totals
                total_debits = sum(e['amount'] for e in entries if e['side'] in (getattr(TransactionEntry, 'DEBIT', 'D'), 'D'))
                total_credits = sum(e['amount'] for e in entries if e['side'] in (getattr(TransactionEntry, 'CREDIT', 'C'), 'C'))
                diff = (total_debits - total_credits).quantize(Decimal('0.01'))

                _entries_repr = ';'.join([f"{getattr(e['account'],'code',str(e['account']))}|{e['side']}|{e['amount']}" for e in entries])
                _audit = {'context': 'time_match', 'bank_pk': bank_obj.get('pk'), 'entries_repr': _entries_repr, 'debits': str(total_debits), 'credits': str(total_credits), 'diff': str(diff), 'note': ''}
                _audit_tx_group(_audit)

                if abs(diff) > amount_tolerance:
                    # If there's exactly one bank leg in this logical transaction and flipping its side balances it, allow that (safe heuristic).
                    if len([e for e in entries if getattr(e['account'], 'pk', None) == bank_acct.pk]) == 1:
                        # test flip
                        flipped_total_debits = total_debits
                        flipped_total_credits = total_credits
                        # flipping bank side moves amount from debit->credit or vice versa
                        if bank_side in (getattr(TransactionEntry, 'DEBIT', 'D'), 'D'):
                            flipped_total_debits = total_debits - _quant(abs(bank_amt))
                            flipped_total_credits = total_credits + _quant(abs(bank_amt))
                        else:
                            flipped_total_debits = total_debits + _quant(abs(bank_amt))
                            flipped_total_credits = total_credits - _quant(abs(bank_amt))
                        if abs(flipped_total_debits - flipped_total_credits) <= amount_tolerance:
                            # flip the bank side
                            for e in entries:
                                if getattr(e['account'], 'pk', None) == bank_acct.pk:
                                    e['side'] = getattr(TransactionEntry, 'CREDIT', 'C') if bank_side in (getattr(TransactionEntry, 'DEBIT', 'D'), 'D') else getattr(TransactionEntry, 'DEBIT', 'D')
                            total_debits, total_credits = flipped_total_debits, flipped_total_credits
                            diff = (total_debits - total_credits).quantize(Decimal('0.01'))
                        else:
                            # skip and audit
                            self.ctx.reconciliation.append({
                                'legacy_model': bank_obj.get('model'),
                                'legacy_pk': bank_obj.get('pk'),
                                'reason': 'time_based_unbalanced',
                                'desc': (bank_fields.get('description') or '')[:200],
                                'amount': str(bank_amt)
                            })
                            continue
                    else:
                        # multiple bank legs; do not attempt to auto-balance
                        self.ctx.reconciliation.append({
                            'legacy_model': bank_obj.get('model'),
                            'legacy_pk': bank_obj.get('pk'),
                            'reason': 'time_based_unbalanced_multi_bank',
                            'desc': (bank_fields.get('description') or '')[:200],
                            'amount': str(bank_amt)
                        })
                        continue

                # Create tx
                desc = (bank_fields.get('description') or '') or "Time-based matched transaction"
                try:
                    bank_dt = bank_fields.get('payment_date') or bank_fields.get('created_at')
                    txobj = self.ctx.create_transaction(entries, desc, workflow_reference=f"legacy:time_match:{bank_obj.get('pk')}", date=self._as_datetime(bank_dt))
                except TypeError:
                    txobj = self.ctx.create_transaction(entries, desc, workflow_reference=f"legacy:time_match:{bank_obj.get('pk')}")
                # Register mappings
                all_objects = [bank_obj] + matches
                ok = True
                for o in all_objects:
                    try:
                        self.ctx.register_tx(o.get('model'), o.get('pk'), txobj)
                    except Exception:
                        logger.exception("Time-based matcher: failed to register mapping for %s:%s", o.get('model'), o.get('pk'))
                        ok = False
                        break
                if not ok:
                    continue
                for o in all_objects:
                    o['processed'] = True
                logger.info("Time-based matched bank %s -> objects %s; tx=%s", bank_obj.get('pk'), [m.get('pk') for m in matches], getattr(txobj, 'id', txobj))

            except Exception as e:
                logger.exception("Time-based matcher error for bank item %s: %s", bank_obj.get('pk'), e)
                continue
