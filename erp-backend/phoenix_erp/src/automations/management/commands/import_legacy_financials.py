# automations/management/commands/import_legacy_financials.py
from collections import defaultdict
import json
import os
import csv
import logging
from decimal import Decimal
from datetime import datetime, timedelta
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.contrib.auth import get_user_model
from decimal import Decimal
from fuzzywuzzy import process, fuzz

from accounts.models import Account, AccountCategory, AccountClassification
from expenses.models import Expense, ExpenseCategory
from .fee_import_helpers_new import register_fee_config, setup_income_types
from .expense_import_helpers_new import setup_expense_categories
from transactions.models import Transaction, TransactionEntry, TransactionSeries
from branches.models import Branch
from clients.models import Client as NewClient
from django.utils import timezone
from .transaction_heuristics import (
    classify_transaction_group,
    find_matching_transfer,
    find_loan_payment_match,
    extract_client_name,
    classify_transaction,
    names_match
)

logger = logging.getLogger(__name__)
User = get_user_model()

# Configure logging if not already configured
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


import re

def collapse_spaced_letters(text: str) -> str:
    """
    Fix 'stretched' text like 'S a v i n g s   P a y m e n t   b y   Y e m i  A k i n s a n y a'
    -> 'Savings Payment by Yemi Akinsanya'. Only touches A–Z letters; numbers/punct. are left alone.
    """
    if not text:
        return ""
    s = str(text)

    # Replace every run of 'A z a z ...' (single letters separated by single spaces) with the joined word.
    # Example match: 'S a v i n g s' or 'b y' or 'O l a j u m o k e'
    pattern = re.compile(r'\b(?:[A-Za-z]\s)+(?:[A-Za-z])\b')

    while True:
        new_s = pattern.sub(lambda m: m.group(0).replace(' ', ''), s)
        if new_s == s:
            break
        s = new_s

    # Normalize whitespace
    s = re.sub(r'\s{2,}', ' ', s).strip()
    return s



class Command(BaseCommand):
    help = "Import legacy JSON fixture into new schema. Dry-run by default."

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.import_map = {}
        self.reconciliation = []
        self.owner = None
        self.branch = None
        self.series = None
        self.commit = False
        self.suspense_acc = None
        self.classification = None
        self.per_client = False
        self.mapping_out = None
        self.recon_out = None
        self.by_model = {}
        self.fixtures_by_app_model_pk = {}
        self.suspense_name = None

    def to_dec(self, v):
        """Convert string amounts to Decimal"""
        if v is None or v == '':
            return Decimal('0.00')
        return Decimal(str(v))

    def _norm_str(self, v):
        if v is None:
            return ''
        s = str(v).strip()
        return '' if s.lower() in {'nan', 'none', 'null'} else s

    def _parse_date(self, f, *keys):
        """
        Return (date, dt) tuple:
        - date: date part for Transaction.date
        - dt: datetime with micro-latency for created_at style stamp (if you use one)
        """
        # prefer payment_date, else created_at, else today
        raw = None
        for k in keys:
            if f.get(k):
                raw = f[k]
                break
        if not raw:
            d = timezone.localdate()
            dt = timezone.now()
            return d, dt
        try:
            if 'T' in raw:
                # ISO datetime
                dt = datetime.fromisoformat(raw.replace('Z','+00:00')).astimezone(timezone.get_current_timezone())
                return dt.date(), dt
            else:
                # date only
                d = datetime.fromisoformat(raw).date()
                dt = datetime.combine(d, datetime.min.time(), tzinfo=timezone.get_current_timezone())
                return d, dt
        except Exception:
            d = timezone.localdate()
            dt = timezone.now()
            return d, dt

    def _with_latency(self, base_dt, offset_seconds):
        return base_dt + timedelta(seconds=offset_seconds)

    def _abs_dec(self, val):
        d = self.to_dec(val)
        return abs(d), (d >= 0)

    def _branch_category(self, section, name, code_prefix=None):
        """
        Branch-scoped category getter/creator.
        """
        obj = AccountCategory.objects.filter(section=section, branch=self.branch).first()
        if obj:
            return obj, False
        return AccountCategory.objects.get_or_create(
            section=section,
            branch=self.branch,
            defaults={
                'name': name,
                'code_prefix': code_prefix or name.upper()[:10],
                'owner': self.owner,
                'created_by': self.owner
            }
        )
    
    from decimal import Decimal

    def _match_loan_payment_by_txid(self, tx_id):
        """Return the loan.loanpayment fixture with the same transaction id, if any."""
        if not tx_id:
            return None
        for lp in self.by_model.get('loan.loanpayment', []):
            if lp.get('fields', {}).get('transaction') == tx_id:
                return lp
        return None

    def _find_loan_payment_by_time_amount(self, amount, bank_dt, loan_payments, tolerance=Decimal('5.00'), seconds=3):
        """
        Find a loan payment whose amount is within ±tolerance and whose timestamp
        is within ±seconds of the bank entry. Name is NOT required.
        """
        if not loan_payments or bank_dt is None:
            return None

        amt = abs(self.to_dec(amount))
        for lp in loan_payments:
            f = lp.get('fields', {}) or {}
            p_amt = abs(self.to_dec(f.get('amount')))
            if abs(amt - p_amt) <= tolerance:
                _, p_dt = self._parse_date(f, 'payment_date', 'created_at')
                if p_dt and abs((bank_dt - p_dt).total_seconds()) <= seconds:
                    return lp
        return None


    def get_or_create_category(self, section=2, name="Liabilities", code=None):
        """Get or create an AccountCategory with section and name"""
        # First try to get an existing category with this section
        existing_cat = AccountCategory.objects.filter(section=section).first()
        if existing_cat:
            return existing_cat, False
            
        # If no existing category, create a new one
        return AccountCategory.objects.get_or_create(
            section=section, 
            defaults={
                'name': name,
                'code_prefix': code or name.upper()[:10],
                'branch': self.branch,
                'owner': self.owner,
                'created_by': self.owner
            }
        )

    def get_default_product(self, product_type, amount=None):
        """Get appropriate default product based on type and amount"""
        from products.models import Product
        
        if product_type == 'LOAN':
            # Choose product based on amount
            if amount and amount >= Decimal('200000.00'):
                return Product.objects.filter(
                    product_type='LOAN',
                    code='BUS-LOAN'
                ).first()
            return Product.objects.filter(
                product_type='LOAN',
                code='PERS-LOAN'
            ).first()
        elif product_type == 'SAVINGS':
            # Choose savings product - default to regular savings
            if amount and amount >= Decimal('100000.00'):
                return Product.objects.filter(
                    product_type='SAVINGS',
                    code='FIX-DEP'
                ).first()
            return Product.objects.filter(
                product_type='SAVINGS',
                code='REG-SAV'
            ).first()
        return None

    def create_transaction(self, entries, description, workflow_reference=None, meta=None, date=None):
        """
        entries: [{'account': Account, 'side': TransactionEntry.DEBIT|CREDIT, 'amount': Decimal}, ...]
        date: date for the transaction (falls back to today)
        created_dt: datetime for an internal timestamp if your Transaction model tracks created_at automatically
        """
        tx_date = date or timezone.localdate()

        if not self.commit:
            ref = f"DRY-{len(self.import_map['transactions'])+1}"
            return {'dry_reference': ref, 'entries': entries, 'tx_obj': None, 'date': tx_date, 'meta': meta or {}}

        with transaction.atomic():
            tx = Transaction(
                series=self.series,
                date=tx_date,
                description=description[:255] if description else '',
                owner=self.owner,
                created_by=self.owner,
                workflow_reference=str(workflow_reference) if workflow_reference else None,
            )
            tx.save()
            for e in entries:
                TransactionEntry.objects.create(
                    transaction=tx,
                    account=e['account'],
                    side=e['side'],
                    amount=e['amount']
                )
            return tx

    def register_tx(self, legacy_model, legacy_pk, tx_obj_or_dict):
        """Record transaction mapping"""
        key = f"{legacy_model}:{legacy_pk}"
        if self.commit:
            self.import_map['legacy_to_new'][key] = tx_obj_or_dict.pk
            self.import_map['transactions'][key] = tx_obj_or_dict.pk
        else:
            self.import_map['legacy_to_new'][key] = tx_obj_or_dict.get('dry_reference')
            self.import_map['transactions'][key] = tx_obj_or_dict.get('dry_reference')

    def get_or_create_bank_account(self, legacy_bank_id, bank_name):
        """Get or create a bank GL account with deterministic code."""
        key = f"bank_{legacy_bank_id}"
        if key in self.import_map['banks']:
            return Account.objects.get(pk=self.import_map['banks'][key])

        asset_cat, _ = self._branch_category(section=1, name="Assets")
        # Use modulo to ensure code fits in 3 chars: B01-B99
        code = f"B{int(legacy_bank_id) % 100:02d}" if str(legacy_bank_id).isdigit() else "B99"
        acct, _ = Account.objects.get_or_create(
            branch=self.branch,
            code=code,
            defaults={
                'category': asset_cat,
                'name': f"Bank - {self._norm_str(bank_name) or legacy_bank_id}",
                'classification': self.classification,
                'owner': self.owner,
                'created_by': self.owner
            }
        )
        self.import_map['banks'][key] = acct.pk
        return acct

    def _income_gl(self, legacy_income_id):
        """Create/find a GL income account per legacy income name."""
        income = self.fixtures_by_app_model_pk.get('income.income', {}).get(legacy_income_id)
        name = self._norm_str(income['fields'].get('name')) if income else f"Income_{legacy_income_id}"
        income_cat, _ = self._branch_category(4, "Income")
        # Use modulo to ensure code fits in 3 chars: I01-I99
        code = f"I{int(legacy_income_id) % 100:02d}" if str(legacy_income_id).isdigit() else "I99"
        acc, _ = Account.objects.get_or_create(
            branch=self.branch, code=code,
            defaults={
                'category': income_cat, 'name': f"{name} (Legacy)",
                'owner': self.owner, 'created_by': self.owner,
                'classification': self.classification,
            }
        )
        return acc

    def process_savings_payments(self):
        """savings.savingspayment → DR Bank/Cash, CR Client Savings."""
        key = 'savings.savingspayment'
        objs = self.by_model.get(key, [])
        offset = 0
        for obj in objs:
            pk = obj['pk']
            f = obj['fields']
            amount = self.to_dec(f.get('amount'))
            client_legacy_id = f.get('client')

            # GL accounts
            bank_id = f.get('bank')
            if bank_id:
                bank_acct = self.get_or_create_bank_account(bank_id,
                    self.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name'))
            else:
                bank_acct = self.cash_acc  # assume cash if bank missing

            client_name = self.fixtures_by_app_model_pk.get('client.client', {}).get(client_legacy_id, {}).get('fields', {}).get('name')
            client_acct = self.get_or_create_client_account(client_legacy_id, client_name)

            # Dates with latency
            date, base_dt = self._parse_date(f, 'payment_date', 'created_at', 'updated_at')

            entries = [
                {'account': bank_acct, 'side': TransactionEntry.DEBIT,  'amount': amount},
                {'account': client_acct, 'side': TransactionEntry.CREDIT, 'amount': amount},
            ]
            desc = self._norm_str(collapse_spaced_letters(f.get('description')))
            desc_lower = desc.lower()
            txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:{key}:{pk}", date=date)
            self.register_tx(key, pk, txobj)

    def _find_matching_transfer(self, amount, date, desc, all_payments):
        """Find matching bank transfer entry within a reasonable time window."""
        amount_abs = abs(amount)
        for p in all_payments:
            if p.get('matched'):  # Skip already matched entries
                continue
            p_amount = self.to_dec(p['fields'].get('amount'))
            if abs(p_amount + amount) < Decimal('0.01'):  # Opposite amounts
                p_date, _ = self._parse_date(p['fields'], 'payment_date', 'created_at')
                if abs((date - p_date).days) <= 3:  # Within 3 days
                    return p
        return None

    def _classify_transaction(self, desc, amount, date, all_payments):
         # NEW: fix stretched text first and normalize
        original_desc = desc or ""
        desc = collapse_spaced_letters(original_desc).lower().strip()
        amount = self.to_dec(amount)
        desc_lower = desc

        if not desc:
            return 'unknown'

        # Combined Savings and Loan Payment
        if desc.startswith('combined savings and loan payment by'):
            client_name = extract_client_name(desc)  # already cleaned & lowercased inside
            if client_name:
                savings_match, loan_match = split_combined_payment(amount, client_name, all_payments)
                if savings_match and loan_match:
                    savings_match['matched'] = True
                    loan_match['matched'] = True
                    return 'combined_payment'
        loan_payments = self.by_model.get('loan.loanpayment', [])
        
        # Try the new external heuristics first
        from .transaction_heuristics import classify_transaction as new_classify
        result = new_classify(desc, amount, date, all_payments, loan_payments)
        if result != 'unknown':
            return result
            
        # New patterns based on your reconciliation items
        if 'administrative fee for' in desc_lower or 'risk premium for' in desc_lower or 'loan registration fee for' in desc_lower:
            return 'fee_income'
        
        if 'expense for' in desc_lower:
            return 'expense_payment'
            
        if 'combined payment from' in desc_lower:
            return 'combined_payment'
            
        if 'withdrawal by' in desc_lower:
            return 'savings_withdrawal'
            
        if 'dc income for' in desc_lower:
            return 'fee_income'
        
        # Existing classification logic continues...
        # Income payments (fees) - checking first as they're most common
        fee_patterns = [
            'registration fee', 'id fee', 'sms fee', 'loan registration fee',
            'service fee', 'processing fee', 'card fee', 'risk premium',
            'loan service fee', 'loan registration'
        ]
        # ... rest of your existing classification logic
            
        # Income payments (fees) - checking first as they're most common
        fee_patterns = [
            'registration fee', 'id fee', 'sms fee', 'loan registration fee',
            'service fee', 'processing fee', 'card fee', 'risk premium',
            'loan service fee', 'loan registration'
        ]
        if any(pattern in desc_lower for pattern in fee_patterns):
            if 'risk premium' in desc_lower:
                return 'risk_premium'
            return 'fee_income'
            
        # Check for combined savings and loan payment first
        if desc_lower.startswith('combined savings and loan payment by'):
            client_name = extract_client_name(desc)
            if client_name:
                from .transaction_heuristics import split_combined_payment
                savings_match, loan_match = split_combined_payment(amount, client_name, all_payments)
                if savings_match and loan_match:
                    savings_match['matched'] = True
                    loan_match['matched'] = True
                    return 'combined_payment'
                    
        # Savings transactions - check before loan payments
        savings_patterns = [
            'savings for ', 'savings payment by ', 'savings payment for ',
            'savings contribution', 'daily contribution', 'monthly savings',
            'savings payment'
        ]
        if any(pattern in desc_lower for pattern in savings_patterns):
            return 'savings_payment'
            
        # Loan-related transactions
        if 'loan disbursement to ' in desc_lower and amount < 0:
            return 'loan_disbursement'
            
        if 'loan payment' in desc_lower or 'loan repayment' in desc_lower:
            client_name = extract_client_name(desc)
            matching_loan = find_loan_payment_match(amount, date, loan_payments, client_name)
            if matching_loan:
                return 'loan_payment'
                
        # Union contributions - should be liability
        if ('union contribution' in desc_lower or 
            (desc_lower.startswith('union ') and amount == Decimal('1000.00'))):
            return 'union_contribution'
            
        # Inter-bank transfers
        if desc_lower.startswith('transfer from ') or desc_lower.startswith('transfer to '):
            # Try the new matching algorithm first
            matching_transfer = find_matching_transfer(amount, date, desc, all_payments)
            if matching_transfer:
                matching_transfer['matched'] = True
                return 'matched_transfer'
                
            # If no match but looks like a transfer
            if 'cash in hand' in desc_lower:
                return 'cash_transfer'
            if 'union pulse' in desc_lower:
                return 'internal_transfer'
            # If amount is round number, likely a transfer
            if amount % 100 == 0 and abs(amount) >= Decimal('10000.00'):
                return 'bank_transfer'
            
        # Expense transactions
        if desc_lower.startswith('expense for '):
            # Check for nearby expense record with matching amount
            for expense in self.by_model.get('expenses.expense', []):
                e_amount = self.to_dec(expense['fields'].get('amount'))
                if abs(amount - e_amount) < Decimal('0.01'):
                    e_date, _ = self._parse_date(expense['fields'], 'date', 'created_at')
                    if abs((date - e_date).days) <= 5:
                        return 'expense_payment'
            
        # Capital transactions
        if 'capital to business' in desc_lower:
            return 'capital'
            
        # Try client name matching as fallback
        client_name = extract_client_name(desc)
        if client_name:
            # If large negative amount, likely loan disbursement
            if amount < 0 and abs(amount) >= Decimal('50000.00'):
                return 'loan_disbursement'
            # If medium positive amount, check for loan payment match
            if amount > 0:
                matching_loan = find_loan_payment_match(amount, date, loan_payments, client_name)
                if matching_loan:
                    return 'loan_payment'
                elif amount <= Decimal('10000.00'):
                    return 'savings_payment'
                    
        return 'unknown'
        
    def _find_loan_payment_match(self, amount, date, loan_payments):
        """Find matching loan payment within a reasonable time window."""
        if not amount or not date or not loan_payments:
            return None
            
        amount = abs(self.to_dec(amount))
        for payment in loan_payments:
            if payment.get('matched'):
                continue
                
            p_amount = abs(self.to_dec(payment['fields'].get('amount')))
            if abs(amount - p_amount) < Decimal('0.01'):  # Matching amounts
                p_date, _ = self._parse_date(payment['fields'], 'payment_date', 'created_at')
                if abs((date - p_date).days) <= 3:  # Within 3 days
                    payment['matched'] = True
                    return payment
            if payment.get('matched'):
                continue
            p_amount = self.to_dec(payment['fields'].get('amount'))
            if abs(p_amount - amount) < Decimal('0.01'):
                p_date, _ = self._parse_date(payment['fields'], 'payment_date', 'created_at')
                if abs((date - p_date).days) <= 3:  # Within 3 days
                    return payment
        return None

        # In your Command class, enhance the process_bank_payments method
    # In your Command class, complete the process_bank_payments method



    # Insert/replace the following methods in your Command class

    # optional fuzzy imports (rapidfuzz preferred). If not present we degrade gracefully.
    try:
        from rapidfuzz import process as _rf_process, fuzz as _rf_fuzz  # type: ignore
    except Exception:
        try:
            from fuzzywuzzy import process as _rf_process, fuzz as _rf_fuzz  # type: ignore
        except Exception:
            _rf_process = None
            _rf_fuzz = None

    from collections import defaultdict

    def _parse_date(self, fields, *keys):
        """Return (date, datetime) parsed from preferred keys; robust to several formats."""
        raw = None
        for k in keys:
            v = fields.get(k)
            if v:
                raw = v
                break
        # fallback: today
        now = timezone.now()
        if not raw:
            return now.date(), now

        # try multiple formats
        candidates = [
            "%Y-%m-%dT%H:%M:%S.%fZ",
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d"
        ]
        s = str(raw)
        for fmt in candidates:
            try:
                dt = datetime.strptime(s.split('+')[0].split('Z')[0], fmt)
                # assume naive -> localize to timezone
                return dt.date(), timezone.make_aware(dt) if timezone.is_naive(dt) else dt
            except Exception:
                continue
        # last resort: try fromisoformat
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            return dt.date(), timezone.make_aware(dt) if timezone.is_naive(dt) else dt
        except Exception:
            return now.date(), now

    def _norm_str(self, s):
        if not s:
            return ""
        return " ".join(str(s).strip())

    def _with_latency(self, base_dt, offset_seconds=0):
        """Return a datetime spaced by offset_seconds from base_dt. If base_dt is a date, use now()."""
        now = timezone.now()
        if base_dt is None:
            base_dt = now
        # if a date (not datetime) convert to midnight
        if isinstance(base_dt, type(now.date())) and not isinstance(base_dt, datetime):
            base_dt = datetime.combine(base_dt, datetime.min.time())
            base_dt = timezone.make_aware(base_dt) if timezone.is_naive(base_dt) else base_dt
        try:
            return base_dt + timedelta(seconds=int(offset_seconds))
        except Exception:
            return base_dt


    def _classify_group(self, group):
        """Simple group classifier: prefer explicit models in group, then describe by keywords."""
        # prioritize explicit model presence
        model_names = {obj.get('model') for obj in group}
        if 'loan.loanpayment' in model_names and 'savings.savingspayment' in model_names:
            return 'combined_payment'
        if 'loan.loanpayment' in model_names:
            return 'loan_payment'
        if 'savings.savingspayment' in model_names:
            return 'savings_payment'
        # look for obvious transfer keywords across group descriptions
        descs = " ".join([str(obj.get('fields', {}).get('description', '')).lower() for obj in group])
        if 'transfer' in descs or 'cash deposit' in descs:
            return 'transfer'
        fee_keywords = ['registration fee', 'loan registration', 'risk premium', 'service fee', 'processing fee', 'id fee']
        if any(k in descs for k in fee_keywords):
            return 'fee_income'
        # expense / income hints
        if 'expense' in descs or 'salary' in descs or 'payroll' in descs:
            return 'expense_payment'
        return 'unknown'

    def _find_matching_transfer(self, amount, date, desc, bank_obj):
        """Wrapper that attempts to find a matching bank.bankpayment representing the other side of a transfer."""
        # Use the global helper if available (the more advanced matching you added earlier)
        fn = globals().get('find_matching_transfer')
        if callable(fn):
            try:
                return fn(amount, date, desc, self.by_model.get('bank.bankpayment', []))
            except Exception:
                pass

        # fallback: naive opposite-amount + +/- 3 day search
        candidates = self.by_model.get('bank.bankpayment', [])
        for p in candidates:
            if p is bank_obj:
                continue
            if p.get('matched'):
                continue
            pfields = p.get('fields', {})
            p_amount = self.to_dec(pfields.get('amount'))
            if abs((amount + p_amount)) <= Decimal('0.01'):
                p_date, _ = self._parse_date(pfields, 'payment_date', 'created_at')
                try:
                    if abs((date - p_date).days) <= 3:
                        return p
                except Exception:
                    return p
        return None

    def _process_combined_group(self, full_group, tx_id):
        """
        Build one transaction for combined payment groups: bank DR = sum loan + savings credits (if we can identify them).
        Falls back to posting to suspense and adding reconciliation rows for unmapped parts.
        """
        key = 'bank.bankpayment'
        # bank entries in the group
        bank_entries = [o for o in full_group if o.get('model') == 'bank.bankpayment']
        if not bank_entries:
            raise ValueError("No bank entries to create combined transaction.")

        # choose representative description & date from first bank entry
        bank_fields = bank_entries[0]['fields']
        date, base_dt = self._parse_date(bank_fields, 'payment_date', 'created_at')
        created_dt = self._with_latency(base_dt, 0)

        # compute total bank amount (sum bank entries amounts)
        bank_total = sum([self.to_dec(b['fields'].get('amount') or 0) for b in bank_entries])

        # collect savings and loan entries that are in the grouped set
        loan_entries = [o for o in full_group if o.get('model') == 'loan.loanpayment']
        savings_entries = [o for o in full_group if o.get('model') in ('savings.savingspayment', 'savings.savingspayment')]
        # if no explicit loan/savings entries, try to locate from other models by transaction id (already done) — fine

        entries = []
        # debit the bank(s) - if multiple bank entries, create one aggregate debit against first bank account
        # fetch bank account for the first bank entry
        bank_id = bank_entries[0]['fields'].get('bank')
        bank_acct = self.get_or_create_bank_account(bank_id,
            self.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name'))
        entries.append({'account': bank_acct, 'side': getattr(TransactionEntry, 'DEBIT', 'D'), 'amount': bank_total})

        # try mapping credits to clients for loan and savings components
        mapped_total = Decimal('0.00')
        for l in loan_entries:
            amt = self.to_dec(l['fields'].get('amount'))
            mapped_total += amt
            client_id = l['fields'].get('client')
            client_name = None
            if client_id:
                client_obj = self.fixtures_by_app_model_pk.get('client.client', {}).get(client_id, {})
                client_name = client_obj.get('fields', {}).get('name') if client_obj else None
            if client_id:
                cr_acc = self.get_or_create_client_account(client_id, client_name or f"client_{client_id}")
                entries.append({'account': cr_acc, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': amt})
            else:
                # credit suspense for unmapped loan portion
                entries.append({'account': self.suspense_acc, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': amt})
                self.reconciliation.append({
                    'legacy_model': l.get('model'),
                    'legacy_pk': l.get('pk'),
                    'reason': 'loan_component_unmapped_in_combined',
                    'desc': l.get('fields', {}).get('description'),
                    'amount': str(amt)
                })

        for s in savings_entries:
            amt = self.to_dec(s['fields'].get('amount'))
            mapped_total += amt
            client_id = s['fields'].get('client')
            client_name = None
            if client_id:
                client_obj = self.fixtures_by_app_model_pk.get('client.client', {}).get(client_id, {})
                client_name = client_obj.get('fields', {}).get('name') if client_obj else None
            if client_id:
                cr_acc = self.get_or_create_client_account(client_id, client_name or f"client_{client_id}")
                entries.append({'account': cr_acc, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': amt})
            else:
                entries.append({'account': self.suspense_acc, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': amt})
                self.reconciliation.append({
                    'legacy_model': s.get('model'),
                    'legacy_pk': s.get('pk'),
                    'reason': 'savings_component_unmapped_in_combined',
                    'desc': s.get('fields', {}).get('description'),
                    'amount': str(amt)
                })

        diff = bank_total - mapped_total
        # allow a small rounding/fee tolerance (<= 5 units)
        if abs(diff) > Decimal('5.00'):
            # create a suspense posting for difference and record reconciliation
            entries.append({'account': self.suspense_acc, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': diff})
            self.reconciliation.append({
                'legacy_model': key,
                'legacy_pk': f"group:{tx_id}",
                'reason': 'combined_mismatch_diff',
                'desc': bank_entries[0]['fields'].get('description'),
                'amount': str(diff)
            })

        # Create transaction (try with date/created_dt signature; fallback if not supported)
        desc = bank_entries[0]['fields'].get('description') or f"Combined payment tx {tx_id}"
        try:
            txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:bank.group:{tx_id}", date=date, created_dt=created_dt)
        except TypeError:
            txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:bank.group:{tx_id}")

        # register tx for all legacy objects in the full_group
        for o in full_group:
            try:
                self.register_tx(o.get('model'), o.get('pk'), txobj)
                o['processed'] = True
            except Exception:
                pass

        return txobj

    def process_bank_payments(self):
        """
        Main bank payments processor:
         - group by transaction id first
         - attempt to process combined groups (bank + loan + savings)
         - fallback to per-bank-entry processing for unrecognized cases
        """
        key = 'bank.bankpayment'
        objs = self.by_model.get(key, [])
        if not objs:
            return

        # ensure flags exist
        for o in objs:
            o.setdefault('matched', False)
            o.setdefault('processed', False)

        # group by legacy transaction id
        tx_groups = defaultdict(list)
        ungrouped = []
        for obj in objs:
            tx_id = obj.get('fields', {}).get('transaction')
            if tx_id:
                tx_groups[tx_id].append(obj)
            else:
                ungrouped.append(obj)

        logger.info(f"Bank payments: {len(objs)} entries; {len(tx_groups)} grouped by transaction id; {len(ungrouped)} ungrouped")

        # Process grouped transaction ids
        for tx_id, group in tx_groups.items():
            try:
                # build full group: bank entries + related loan/savings/expense/income entries that share tx_id
                full_group = []
                full_group.extend(group)
                for model_key in ['loan.loanpayment', 'savings.savingspayment', 'expenses.expensepayment', 'income.incomepayment']:
                    for obj in self.by_model.get(model_key, []):
                        if obj.get('fields', {}).get('transaction') == tx_id:
                            full_group.append(obj)

                classification = self._classify_group(full_group)
                # Try combined processing first
                if classification == 'combined_payment':
                    try:
                        self._process_combined_group(full_group, tx_id)
                    except Exception as e:
                        logger.warning(f"Combined group processing failed for tx {tx_id}: {e}; falling back to single entries")
                        for b in group:
                            if not b.get('processed'):
                                self.process_single_bank_payment(b)
                else:
                    # For anything else we currently fallback to single-entry processing for the bank entries
                    for b in group:
                        if not b.get('processed'):
                            self.process_single_bank_payment(b)

                # mark group processed
                for o in full_group:
                    o['processed'] = True

            except Exception as e:
                logger.error(f"Error processing tx group {tx_id}: {e}")
                for b in group:
                    if not b.get('processed'):
                        try:
                            self.process_single_bank_payment(b)
                        except Exception:
                            logger.exception("Failed to process single entry fallback")

        # Process ungroupped entries individually
        for obj in ungrouped:
            if not obj.get('processed'):
                try:
                    self.process_single_bank_payment(obj)
                except Exception:
                    logger.exception("Failed to process ungrouped bank payment")

    def process_single_bank_payment(self, obj):
        """
        Process a single bank.bankpayment entry (fallback or standalone).
        Includes heuristics to map to client accounts, fees, expenses, transfers, or suspense.
        """
        if not obj:
            return
        key = 'bank.bankpayment'
        pk = obj.get('pk')
        f = obj.get('fields', {})
        amount = self.to_dec(f.get('amount'))
        bank_id = f.get('bank')
        date, base_dt = self._parse_date(f, 'payment_date', 'created_at')
        bank_acct = self.get_or_create_bank_account(bank_id,
            self.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name'))
        desc = self._norm_str(collapse_spaced_letters(f.get('description')))
        desc_lower = desc.lower()

        tx_id = f.get('transaction')
        loan_payments = self.by_model.get('loan.loanpayment', [])

        if 'loan payment' in desc_lower or desc_lower.strip() == 'loan payment':
            # 1) Prefer exact transaction-id match
            lp = self._match_loan_payment_by_txid(tx_id)

            # 2) Fall back to tight time+amount (±5.00 within 3 seconds)
            if not lp:
                lp = self._find_loan_payment_by_time_amount(amount, base_dt, loan_payments,
                                                            tolerance=Decimal('5.00'), seconds=3)

            if lp:
                # Resolve client from loan payment
                client_id = lp.get('fields', {}).get('client')
                client_name = ''
                if client_id:
                    c_obj = self.fixtures_by_app_model_pk.get('client.client', {}).get(client_id, {})
                    client_name = (c_obj.get('fields', {}) or {}).get('name', '')

                # Post DR Bank / CR Client (no suspense, no reconciliation)
                cr_acct = self.get_or_create_client_account(client_id or f"legacy_{pk}", client_name or f"legacy_client_{client_id or pk}")
                entries = [
                    {'account': bank_acct, 'side': TransactionEntry.DEBIT,  'amount': abs(amount)},
                    {'account': cr_acct,  'side': TransactionEntry.CREDIT, 'amount': abs(amount)},
                ]
                txobj = self.create_transaction(entries, desc or f"Bank payment #{pk}",
                                                workflow_reference=f"legacy:{key}:{pk}", date=date)
                self.register_tx(key, pk, txobj)
                obj['processed'] = True
                return

        # attempt to extract client name from description and fuzzy match to known clients
        client_match = None
        client_name_from_desc = None
        client_name_from_desc = globals().get('extract_client_name', lambda d: None)(desc)
        if client_name_from_desc:
            norm_desc_name = self._norm_str(client_name_from_desc)
            # try direct name matching
            for c_pk, c_obj in self.fixtures_by_app_model_pk.get('client.client', {}).items():
                cname = self._norm_str(c_obj['fields'].get('name'))
                if cname:
                    # if rapidfuzz available use that, else fallback to names_match
                    if self._rf_process and self._rf_fuzz:
                        try:
                            score = self._rf_fuzz.ratio(norm_desc_name, cname)
                            if score >= 0.85:
                                client_match = (c_pk, cname)
                                break
                        except Exception:
                            pass
                    else:
                        if globals().get('names_match'):
                            try:
                                if names_match(norm_desc_name, cname, threshold=0.85):
                                    client_match = (c_pk, cname)
                                    break
                            except Exception:
                                # fallback substring
                                if norm_desc_name in cname or cname in norm_desc_name:
                                    client_match = (c_pk, cname)
                                    break
        # classify this entry (use global classify_transaction if available)
        loan_payments = self.by_model.get('loan.loanpayment', [])
        classify_fn = globals().get('classify_transaction', None)
        try:
            if callable(classify_fn):
                tx_type = classify_fn(desc, amount, date, self.by_model.get('bank.bankpayment', []), loan_payments)
            else:
                tx_type = self._classify_group([obj])  # simple fallback
        except Exception:
            tx_type = self._classify_group([obj])

        cr_acct = None
        is_reconciliation = False
        reconciliation_reason = 'unclassified_transaction'

        # PRIORITISED HANDLERS
        if tx_type == 'savings_payment':
            if client_match:
                cr_acct = self.get_or_create_client_account(client_match[0], client_match[1])
            else:
                is_reconciliation = True
                reconciliation_reason = 'savings_without_client'

        elif tx_type == 'loan_payment':
            if client_match:
                cr_acct = self.get_or_create_client_account(client_match[0], client_match[1])
            else:
                # try to find loan payment in legacy loan.loanpayment entries by time+amount (global helper)
                fn = globals().get('find_loan_payment_match')
                loan_match = None
                if callable(fn):
                    try:
                        loan_match = fn(amount, date, self.by_model.get('loan.loanpayment', []))
                    except Exception:
                        loan_match = None
                if loan_match and loan_match.get('fields', {}).get('client'):
                    client_id = loan_match['fields'].get('client')
                    client_obj = self.fixtures_by_app_model_pk.get('client.client', {}).get(client_id, {})
                    client_name = client_obj.get('fields', {}).get('name', '') if client_obj else ''
                    cr_acct = self.get_or_create_client_account(client_id, client_name)
                else:
                    is_reconciliation = True
                    reconciliation_reason = 'loan_payment_without_client'

        elif tx_type in ('fee_income', 'risk_premium'):
            income_cat, _ = self._branch_category(4, "Income")
            code = 'F01' if tx_type == 'fee_income' else 'F02'
            name = 'Fee Income' if tx_type == 'fee_income' else 'Risk Premium'
            fee_acc, _ = Account.objects.get_or_create(
                branch=self.branch,
                code=code,
                defaults={
                    'category': income_cat,
                    'name': name,
                    'owner': self.owner,
                    'created_by': self.owner,
                    'classification': self.classification
                }
            )
            cr_acct = fee_acc

        elif tx_type == 'expense_payment':
            expense_cat, _ = self._branch_category(5, "Expenses")
            expense_code = 'E99'
            expense_name = 'Miscellaneous Expenses'
            if 'payroll' in desc_lower:
                expense_code = 'E01'
                expense_name = 'Payroll Expenses'
            elif 'transport' in desc_lower or 'transportation' in desc_lower:
                expense_code = 'E02'
                expense_name = 'Transport Expenses'
            expense_acc, _ = Account.objects.get_or_create(
                branch=self.branch,
                code=expense_code,
                defaults={
                    'category': expense_cat,
                    'name': expense_name,
                    'owner': self.owner,
                    'created_by': self.owner,
                    'classification': self.classification
                }
            )
            cr_acct = expense_acc

        elif tx_type == 'loan_disbursement':
            # Usually a negative bank amount indicates disbursement out; attach to client loan if possible
            if client_match and amount < 0:
                cr_acct = self.get_or_create_client_account(client_match[0], client_match[1])
            else:
                is_reconciliation = True
                reconciliation_reason = 'loan_disbursement_without_client'

        elif tx_type in ('matched_transfer', 'cash_transfer', 'internal_transfer', 'bank_transfer'):
            # try to find the other side of transfer
            match = None
            try:
                match = globals().get('find_matching_transfer', lambda a, d, de, allp: None)(amount, date, desc, self.by_model.get('bank.bankpayment', []))
            except Exception:
                match = self._find_matching_transfer(amount, date, desc, obj)
            if match:
                match['matched'] = True
                obj['matched'] = True
                # If we matched, we will treat as transfer and post to counterparty (handled by the matched entry)
                # We'll create a simple two-leg transaction here (bank debit, suspense credit) so we can reconcile later
                # but prefer marking for reconciliation so operator inspects matched pair.
                cr_acct = self.suspense_acc
                reconciliation_reason = 'matched_transfer_needs_recon'
                is_reconciliation = True

            elif tx_type == 'withdrawal':
                # Expect amount < 0 (money out of bank). Use client from description if possible.
                client_match = client_match or (
                    (lambda nm: (next(((c_pk, self._norm_str(c_obj['fields'].get('name')))
                                    for c_pk, c_obj in self.fixtures_by_app_model_pk.get('client.client', {}).items()
                                    if self._norm_str(c_obj['fields'].get('name')) == nm), None))
                    (self._norm_str(extract_client_name(desc))) if extract_client_name(desc) else None)
                )

                if client_match:
                    cr_acct = bank_acct  # credit bank (money out)
                    dr_acct = self.get_or_create_client_account(client_match[0], client_match[1])

                    # Build entries with reversed sides for withdrawal
                    date, base_dt = self._parse_date(f, 'payment_date', 'created_at')
                    entries = [
                        {'account': dr_acct, 'side': TransactionEntry.DEBIT,  'amount': abs(amount)},
                        {'account': cr_acct, 'side': TransactionEntry.CREDIT, 'amount': abs(amount)},
                    ]
                    txobj = self.create_transaction(entries, desc or f"Withdrawal #{pk}",
                                                    workflow_reference=f"legacy:bank.bankpayment:{pk}", date=date)
                    self.register_tx('bank.bankpayment', pk, txobj)
                    obj['processed'] = True
                    return
                else:
                    is_reconciliation = True
                    reconciliation_reason = 'withdrawal_without_client'

            else:
                # unmatched transfer -> create cash or internal transfer account
                if tx_type == 'cash_transfer':
                    asset_cat, _ = self._branch_category(1, "Assets")
                    cash_acc, _ = Account.objects.get_or_create(
                        branch=self.branch,
                        code='B01',
                        defaults={
                            'category': asset_cat,
                            'name': 'Cash in Hand',
                            'owner': self.owner,
                            'created_by': self.owner,
                            'classification': self.classification
                        }
                    )
                    cr_acct = cash_acc
                else:
                    is_reconciliation = True
                    reconciliation_reason = 'unmatched_transfer'

        elif tx_type == 'union_contribution':
            if amount == Decimal('1000.00'):
                liability_cat, _ = self._branch_category(2, "Liabilities")
                union_acc, _ = Account.objects.get_or_create(
                    branch=self.branch,
                    code='U01',
                    defaults={
                        'category': liability_cat,
                        'name': 'Union Contributions',
                        'owner': self.owner,
                        'created_by': self.owner,
                        'classification': self.classification
                    }
                )
                cr_acct = union_acc
            else:
                is_reconciliation = True
                reconciliation_reason = 'invalid_union_amount'

        # fallback: try to leverage a client mention if no classification matched
        if not cr_acct and not is_reconciliation and client_match:
            cr_acct = self.get_or_create_client_account(client_match[0], client_match[1])

        if not cr_acct:
            # Unknown → Suspense
            cr_acct = self.suspense_acc
            if not is_reconciliation:
                reconciliation_reason = 'unclassified_transaction'
                is_reconciliation = True

        # Build transaction entries
        debit_side = getattr(TransactionEntry, 'DEBIT', 'D')
        credit_side = getattr(TransactionEntry, 'CREDIT', 'C')

        entries = [
            {'account': bank_acct, 'side': debit_side, 'amount': amount},
            {'account': cr_acct, 'side': credit_side, 'amount': amount},
        ]

        # create transaction (try to pass date/created_dt; fallback if create_transaction doesn't accept them)
        try:
            created_dt = self._with_latency(base_dt, 0)
            txobj = self.create_transaction(entries, desc or f"Bank payment #{pk}", workflow_reference=f"legacy:{key}:{pk}", date=date, created_dt=created_dt)
        except TypeError:
            txobj = self.create_transaction(entries, desc or f"Bank payment #{pk}", workflow_reference=f"legacy:{key}:{pk}")

        # register mapping
        try:
            self.register_tx(key, pk, txobj)
        except Exception:
            pass

        # record reconciliation row if needed
        if is_reconciliation:
            self.reconciliation.append({
                'legacy_model': key,
                'legacy_pk': pk,
                'reason': reconciliation_reason,
                'desc': desc,
                'amount': str(amount)
            })

        # mark as processed
        obj['processed'] = True

    def process_income_payments(self):
        """income.incomepayment → DR Bank/Cash, CR Income GL."""
        key = 'income.incomepayment'
        objs = self.by_model.get(key, [])
        offset = 0
        for obj in objs:
            pk = obj['pk']
            f = obj['fields']
            amount = self.to_dec(f.get('amount'))
            bank_id = f.get('bank')
            bank_acct = self.get_or_create_bank_account(bank_id,
                self.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name')) if bank_id else self.cash_acc

            income_acc = self._income_gl(f.get('income'))

            date, base_dt = self._parse_date(f, 'payment_date', 'created_at')

            entries = [
                {'account': bank_acct,  'side': TransactionEntry.DEBIT,  'amount': amount},
                {'account': income_acc, 'side': TransactionEntry.CREDIT, 'amount': amount},
            ]
            desc = self._norm_str(collapse_spaced_letters(f.get('description')))
            desc_lower = desc.lower()

            txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:{key}:{pk}", date=date)
            self.register_tx(key, pk, txobj)

    def _expense_gl(self, legacy_expense_id, fallback_name="Expense"):
        expense = self.fixtures_by_app_model_pk.get('expenses.expense', {}).get(legacy_expense_id)
        name = self._norm_str(expense['fields'].get('name')) if expense else f"{fallback_name}_{legacy_expense_id}"
        expense_cat, _ = self._branch_category(5, "Expenses")
        # Use modulo to ensure code fits in 3 chars: E01-E99
        code = f"E{int(legacy_expense_id) % 100:02d}" if str(legacy_expense_id).isdigit() else "E99"
        acc, _ = Account.objects.get_or_create(
            branch=self.branch, code=code,
            defaults={
                'category': expense_cat, 'name': f"{name} (Legacy)",
                'owner': self.owner, 'created_by': self.owner,
                'classification': self.classification,
            }
        )
        return acc
    
    def process_transfer_group(self, group, tx_id):
        """Process a transfer transaction group between bank accounts."""
        if len(group) < 2:
            logger.warning(f"Transfer group {tx_id} has less than 2 entries")
            return
            
        # Find bank accounts involved in the transfer
        bank_entries = [obj for obj in group if obj['model'] == 'bank.bankpayment']
        
        if len(bank_entries) != 2:
            logger.warning(f"Transfer group {tx_id} doesn't have exactly 2 bank entries")
            return
            
        # Get bank accounts
        bank_id1 = bank_entries[0]['fields'].get('bank')
        bank_id2 = bank_entries[1]['fields'].get('bank')
        
        bank_acct1 = self.get_or_create_bank_account(bank_id1,
            self.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id1, {}).get('fields', {}).get('name'))
        
        bank_acct2 = self.get_or_create_bank_account(bank_id2,
            self.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id2, {}).get('fields', {}).get('name'))
        
        # Get amounts
        amount1 = self.to_dec(bank_entries[0]['fields'].get('amount'))
        amount2 = self.to_dec(bank_entries[1]['fields'].get('amount'))
        
        # Use the date from the first entry
        date, base_dt = self._parse_date(bank_entries[0]['fields'], 'payment_date', 'created_at')
        
        # Create transaction entries
        entries = [
            {'account': bank_acct1, 'side': TransactionEntry.DEBIT if amount1 > 0 else TransactionEntry.CREDIT, 'amount': abs(amount1)},
            {'account': bank_acct2, 'side': TransactionEntry.CREDIT if amount1 > 0 else TransactionEntry.DEBIT, 'amount': abs(amount1)},
        ]
        
        desc = f"Transfer between banks (Legacy TX: {tx_id})"
        txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:transfer:{tx_id}", date=date)
        
        # Register all entries in the group
        for obj in group:
            self.register_tx(obj['model'], obj['pk'], txobj)

    def process_loan_payment_group(self, group, tx_id):
        """Process a loan payment transaction group."""
        # Find the bank entry and loan entry
        bank_entry = next((obj for obj in group if obj['model'] == 'bank.bankpayment'), None)
        loan_entry = next((obj for obj in group if obj['model'] == 'loan.loanpayment'), None)
        
        if not bank_entry or not loan_entry:
            logger.warning(f"Loan payment group {tx_id} missing bank or loan entry")
            return
        
        bank_amount = self.to_dec(bank_entry['fields'].get('amount'))
        loan_amount = self.to_dec(loan_entry['fields'].get('amount'))
        
        # Get accounts
        bank_id = bank_entry['fields'].get('bank')
        bank_acct = self.get_or_create_bank_account(bank_id,
            self.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name'))
        
        # Use the loan's client to find the client account
        client_id = loan_entry['fields'].get('client')
        client_obj = self.fixtures_by_app_model_pk.get('client.client', {}).get(client_id, {})
        client_name = client_obj.get('fields', {}).get('name', '')
        client_acct = self.get_or_create_client_account(client_id, client_name)
        
        # Use the date from the bank entry
        date, base_dt = self._parse_date(bank_entry['fields'], 'payment_date', 'created_at')
        
        # Create transaction entries
        entries = [
            {'account': bank_acct, 'side': TransactionEntry.DEBIT, 'amount': abs(bank_amount)},
            {'account': client_acct, 'side': TransactionEntry.CREDIT, 'amount': abs(bank_amount)},
        ]
        
        desc = f"Loan payment (Legacy TX: {tx_id})"
        txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:loan_payment:{tx_id}", date=date)
        
        # Register all entries in the group
        for obj in group:
            self.register_tx(obj['model'], obj['pk'], txobj)

    def process_savings_payment_group(self, group, tx_id):
        """Process a savings payment transaction group."""
        # Find the bank entry and savings entry
        bank_entry = next((obj for obj in group if obj['model'] == 'bank.bankpayment'), None)
        savings_entry = next((obj for obj in group if obj['model'] == 'savings.savingspayment'), None)
        
        if not bank_entry or not savings_entry:
            logger.warning(f"Savings payment group {tx_id} missing bank or savings entry")
            return
        
        bank_amount = self.to_dec(bank_entry['fields'].get('amount'))
        savings_amount = self.to_dec(savings_entry['fields'].get('amount'))
        
        # Get accounts
        bank_id = bank_entry['fields'].get('bank')
        bank_acct = self.get_or_create_bank_account(bank_id,
            self.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name'))
        
        # Use the savings entry's client to find the client account
        client_id = savings_entry['fields'].get('client')
        client_obj = self.fixtures_by_app_model_pk.get('client.client', {}).get(client_id, {})
        client_name = client_obj.get('fields', {}).get('name', '')
        client_acct = self.get_or_create_client_account(client_id, client_name)
        
        # Use the date from the bank entry
        date, base_dt = self._parse_date(bank_entry['fields'], 'payment_date', 'created_at')
        
        # Create transaction entries
        entries = [
            {'account': bank_acct, 'side': TransactionEntry.DEBIT, 'amount': abs(bank_amount)},
            {'account': client_acct, 'side': TransactionEntry.CREDIT, 'amount': abs(bank_amount)},
        ]
        
        desc = f"Savings payment (Legacy TX: {tx_id})"
        txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:savings_payment:{tx_id}", date=date)
        
        # Register all entries in the group
        for obj in group:
            self.register_tx(obj['model'], obj['pk'], txobj)

    def process_combined_payment_group(self, group, tx_id):
        """Process a combined savings and loan payment group."""
        # Find all relevant entries
        bank_entry = next((obj for obj in group if obj['model'] == 'bank.bankpayment'), None)
        loan_entry = next((obj for obj in group if obj['model'] == 'loan.loanpayment'), None)
        savings_entry = next((obj for obj in group if obj['model'] == 'savings.savingspayment'), None)
        
        if not bank_entry or (not loan_entry and not savings_entry):
            logger.warning(f"Combined payment group {tx_id} missing required entries")
            return
        
        bank_amount = self.to_dec(bank_entry['fields'].get('amount'))
        loan_amount = self.to_dec(loan_entry['fields'].get('amount')) if loan_entry else Decimal('0')
        savings_amount = self.to_dec(savings_entry['fields'].get('amount')) if savings_entry else Decimal('0')
        
        # Get accounts
        bank_id = bank_entry['fields'].get('bank')
        bank_acct = self.get_or_create_bank_account(bank_id,
            self.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name'))
        
        # Use the client from either loan or savings entry
        client_id = None
        if loan_entry:
            client_id = loan_entry['fields'].get('client')
        elif savings_entry:
            client_id = savings_entry['fields'].get('client')
        
        if not client_id:
            logger.warning(f"Combined payment group {tx_id} missing client reference")
            return
        
        client_obj = self.fixtures_by_app_model_pk.get('client.client', {}).get(client_id, {})
        client_name = client_obj.get('fields', {}).get('name', '')
        client_acct = self.get_or_create_client_account(client_id, client_name)
        
        # Use the date from the bank entry
        date, base_dt = self._parse_date(bank_entry['fields'], 'payment_date', 'created_at')
        
        # Create transaction entries
        entries = [
            {'account': bank_acct, 'side': TransactionEntry.DEBIT, 'amount': abs(bank_amount)},
            {'account': client_acct, 'side': TransactionEntry.CREDIT, 'amount': abs(bank_amount)},
        ]
        
        desc = f"Combined payment (Legacy TX: {tx_id})"
        txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:combined_payment:{tx_id}", date=date)
        
        # Register all entries in the group
        for obj in group:
            self.register_tx(obj['model'], obj['pk'], txobj)

    def process_fee_payment_group(self, group, tx_id):
        """Process a fee payment transaction group."""
        bank_entry = next((obj for obj in group if obj['model'] == 'bank.bankpayment'), None)
        income_entry = next((obj for obj in group if obj['model'] == 'income.incomepayment'), None)
        
        if not bank_entry or not income_entry:
            logger.warning(f"Fee payment group {tx_id} missing bank or income entry")
            return
        
        bank_amount = self.to_dec(bank_entry['fields'].get('amount'))
        income_amount = self.to_dec(income_entry['fields'].get('amount'))
        
        # Get accounts
        bank_id = bank_entry['fields'].get('bank')
        bank_acct = self.get_or_create_bank_account(bank_id,
            self.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name'))
        
        income_acc = self._income_gl(income_entry['fields'].get('income'))
        
        # Use the date from the bank entry
        date, base_dt = self._parse_date(bank_entry['fields'], 'payment_date', 'created_at')
        
        # Create transaction entries
        entries = [
            {'account': bank_acct, 'side': TransactionEntry.DEBIT, 'amount': abs(bank_amount)},
            {'account': income_acc, 'side': TransactionEntry.CREDIT, 'amount': abs(bank_amount)},
        ]
        
        desc = f"Fee payment (Legacy TX: {tx_id})"
        txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:fee_payment:{tx_id}", date=date)
        
        # Register all entries in the group
        for obj in group:
            self.register_tx(obj['model'], obj['pk'], txobj)

    def process_expense_payments(self):
        """expenses.expensepayment → DR Expense, CR Bank/Cash."""
        key = 'expenses.expensepayment'
        objs = self.by_model.get(key, [])
        offset = 0
        for obj in objs:
            pk = obj['pk']
            f = obj['fields']
            amount = self.to_dec(f.get('amount'))

            exp_acc = self._expense_gl(f.get('expense'))
            bank_id = f.get('bank')
            bank_acct = self.get_or_create_bank_account(bank_id,
                self.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name')) if bank_id else self.cash_acc

            date, base_dt = self._parse_date(f, 'payment_date', 'created_at')

            entries = [
                {'account': exp_acc,  'side': TransactionEntry.DEBIT,  'amount': amount},
                {'account': bank_acct, 'side': TransactionEntry.CREDIT, 'amount': amount},
            ]
            desc = self._norm_str(collapse_spaced_letters(f.get('description')))
            desc_lower = desc.lower()

            txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:{key}:{pk}", date=date)
            self.register_tx(key, pk, txobj)

    def process_loan_payments(self):
        """loan.loanpayment → DR Bank/Cash, CR Loans Receivable (principal-only by default)."""
        key = 'loan.loanpayment'
        objs = self.by_model.get(key, [])
        offset = 0
        for obj in objs:
            pk = obj['pk']
            f = obj['fields']
            amount = self.to_dec(f.get('amount'))
            bank_id = f.get('bank')
            dr_acct = self.get_or_create_bank_account(bank_id,
                self.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name')) if bank_id else self.cash_acc

            date, base_dt = self._parse_date(f, 'payment_date', 'created_at')

            entries = [
                {'account': dr_acct,                 'side': TransactionEntry.DEBIT,  'amount': amount},
                {'account': self.loans_receivable_acc, 'side': TransactionEntry.CREDIT, 'amount': amount},
            ]
            desc = self._norm_str(collapse_spaced_letters(f.get('description')))
            desc_lower = desc.lower()
            txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:{key}:{pk}", date=date)
            self.register_tx(key, pk, txobj)

    def process_liability_payments(self):
        """liability.liabilitypayment → sign-aware postings.

        amount > 0: likely paying down liability → DR Liability, CR Bank/Cash
        amount < 0: capital injected/increase liability → DR Bank/Cash, CR Liability
        """
        key = 'liability.liabilitypayment'
        objs = self.by_model.get(key, [])
        offset = 0
        liability_cat, _ = self._branch_category(2, "Liabilities")

        for obj in objs:
            pk = obj['pk']
            f = obj['fields']
            amt_raw = f.get('amount')
            amount_abs, is_positive = self._abs_dec(amt_raw)
            liab_id = f.get('liability')
            # One GL per legacy liability header:
            # Use modulo to ensure code fits in 3 chars: L01-L99
            code = f"L{int(liab_id) % 100:02d}" if str(liab_id).isdigit() else "L99"
            liab_acc, _ = Account.objects.get_or_create(
                branch=self.branch, code=code,
                defaults={
                    'category': liability_cat,
                    'name': self._norm_str(self.fixtures_by_app_model_pk.get('liability.liability', {}).get(liab_id, {}).get('fields', {}).get('name')) or f"Liability {liab_id}",
                    'owner': self.owner, 'created_by': self.owner,
                    'classification': self.classification
                }
            )

            bank_id = f.get('bank')
            bank_acct = self.get_or_create_bank_account(bank_id,
                self.fixtures_by_app_model_pk.get('bank.bank', {}).get(bank_id, {}).get('fields', {}).get('name')) if bank_id else self.cash_acc

            date, base_dt = self._parse_date(f, 'payment_date', 'created_at')

            if is_positive:
                # paying down liability
                entries = [
                    {'account': liab_acc, 'side': TransactionEntry.DEBIT,  'amount': amount_abs},
                    {'account': bank_acct, 'side': TransactionEntry.CREDIT, 'amount': amount_abs},
                ]
            else:
                # increasing liability (capital in)
                entries = [
                    {'account': bank_acct, 'side': TransactionEntry.DEBIT,  'amount': amount_abs},
                    {'account': liab_acc, 'side': TransactionEntry.CREDIT, 'amount': amount_abs},
                ]

            desc = self._norm_str(collapse_spaced_letters(f.get('description')))
            desc_lower = desc.lower()
            txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:{key}:{pk}", date=date)
            self.register_tx(key, pk, txobj)

    def process_asset_records(self):
        """asset.assetrecord → debit fixed asset or inventory, credit Suspense/supplier/bank."""
        key = 'asset.assetrecord'
        objs = self.by_model.get(key, [])
        offset = 0
        for obj in objs:
            pk = obj['pk']
            f = obj['fields']
            qty = int(f.get('quantity') or 1)
            price = self.to_dec(f.get('price'))
            amount = price * qty

            date, base_dt = self._parse_date(f, 'payment_date', 'created_at')

            if f.get('fixed_asset'):
                dr = self.fixed_asset_acc
            elif f.get('inventory'):
                dr = self.inventory_acc
            else:
                dr = self.suspense_acc
                self.reconciliation.append({
                    'legacy_model': key, 'legacy_pk': pk,
                    'reason': 'unknown_asset_or_inventory', 'amount': str(amount)
                })

            entries = [
                {'account': dr,                  'side': TransactionEntry.DEBIT,  'amount': amount},
                {'account': self.suspense_acc,   'side': TransactionEntry.CREDIT, 'amount': amount},
            ]
            desc = self._norm_str(collapse_spaced_letters(f.get('description')))
            desc_lower = desc.lower()
            txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:{key}:{pk}", date=date)
            self.register_tx(key, pk, txobj)

    class DummyAccount:
        """Dummy account class for dry runs"""
        def __init__(self, pk):
            self.pk = pk
            
    def get_or_create_client_account(self, legacy_client_id, client_name):
        """Get or create a client savings GL account, parented to the savings pool."""
        key = f"client_{legacy_client_id}"
        
        # For dry runs, return a dummy account object
        if not self.commit:
            if key in self.import_map['accounts']:
                return self.DummyAccount(self.import_map['accounts'][key])
                
            self.import_map['accounts'][key] = f"DRY_ACC_CLIENT_{legacy_client_id}"
            return self.DummyAccount(self.import_map['accounts'][key])

        # Normal commit mode processing
        if key in self.import_map['accounts']:
            return Account.objects.get(pk=self.import_map['accounts'][key])

        liability_cat, _ = self._branch_category(section=2, name="Liabilities")
        # Use modulo to ensure code fits in 3 chars: S01-S99
        code = f"S{int(legacy_client_id) % 100:02d}" if str(legacy_client_id).isdigit() else "S99"

        defaults = {
            'category': liability_cat,
            'name': f"Savings - {self._norm_str(client_name) or legacy_client_id}",
            'owner': self.owner,
            'created_by': self.owner,
            'classification': self.classification,
            'parent': self.savings_pool_acc  # Link to pool account
        }
        acct, _ = Account.objects.get_or_create(
            branch=self.branch,
            code=code,
            defaults=defaults
        )

        # Ensure parent is set even if account existed
        if not acct.parent_id:
            acct.parent = self.savings_pool_acc
            acct.save(update_fields=['parent'])

        self.import_map['accounts'][key] = acct.pk
        return acct

    def add_arguments(self, parser):
        parser.add_argument('file', help='Path to legacy data.json (fixture-style list of objects).')
        parser.add_argument('--owner-id', type=int, required=True, help='User id to set as owner/created_by for created records.')
        parser.add_argument('--branch-id', type=int, required=True, help='Branch id to set on created records.')
        parser.add_argument('--commit', action='store_true', help='If passed, persist changes. Otherwise dry-run.')
        parser.add_argument('--per-client', action='store_true', help='Create per-client savings GL accounts (recommended).')
        parser.add_argument('--series', default='IM', help='TransactionSeries code to use/create for imported transactions.')
        parser.add_argument('--mapping-out', default=None, help='Output path for import_map JSON (defaults to import_map_<ts>.json)')
        parser.add_argument('--reconciliation-out', default=None, help='Output CSV path for reconciliation items.')
        parser.add_argument('--suspense-account-name', default='Suspense - Import', help='Name of the suspense account used for ambiguous postings.')

    def setup_import(self, options):
        """Initialize import settings and core objects"""
        self.commit = options['commit']
        self.owner = User.objects.filter(pk=options['owner_id']).first()
        if not self.owner:
            raise CommandError("Owner user not found.")

        self.branch = Branch.objects.filter(pk=options['branch_id']).first()
        if not self.branch:
            raise CommandError("Branch not found.")

        # Set up import tracking
        self.import_map = {
            'accounts': {}, 
            'transactions': {}, 
            'banks': {}, 
            'clients': {}, 
            'legacy_to_new': {},
            'income_types': {},
            'fees': {},
            'expenses': {},
            'expense_payments': {},
            'expense_batches': {},
            'expense_categories': {},
            'savings_accounts': {},
            'loans': {}
        }

        # Store suspense account name
        self.suspense_name = options['suspense_account_name']
        
        # Create core accounts
        self.setup_core_accounts(self.suspense_name)

        # Set up transaction series
        self.series, _ = TransactionSeries.objects.get_or_create(
            code=options['series'],
            defaults={'description': 'Import series'}
        )

    def setup_core_accounts(self, suspense_name):
        """Set up core accounts needed for import (branch-scoped)."""
        # Categories
        asset_cat, _ = self._branch_category(section=1, name="Assets")
        liability_cat, _ = self._branch_category(section=2, name="Liabilities")
        income_cat, _ = self._branch_category(section=4, name="Income")
        expense_cat, _ = self._branch_category(section=5, name="Expenses")

        # Classification
        self.classification, _ = AccountClassification.objects.get_or_create(
            name="Imported",
            branch=self.branch,
            defaults={'owner': self.owner, 'created_by': self.owner}
        )

        # Suspense (liability by default)
        self.suspense_acc, _ = Account.objects.get_or_create(
            branch=self.branch,
            code='290',
            defaults={
                'category': liability_cat,
                'name': suspense_name,
                'owner': self.owner,
                'created_by': self.owner,
                'classification': self.classification,
            }
        )

        # Cash in Hand (asset)
        self.cash_acc, _ = Account.objects.get_or_create(
            branch=self.branch,
            code='101',
            defaults={
                'category': asset_cat,
                'name': 'Cash in Hand',
                'owner': self.owner,
                'created_by': self.owner,
                'classification': self.classification,
            }
        )

        # Savings Pool (liability)
        self.savings_pool_acc, _ = Account.objects.get_or_create(
            branch=self.branch,
            code='201',
            defaults={
                'category': liability_cat,
                'name': 'Client Savings (Pool)',
                'owner': self.owner,
                'created_by': self.owner,
                'classification': self.classification,
            }
        )

        # Canonical GLs you'll likely need later
        self.loans_receivable_acc, _ = Account.objects.get_or_create(
            branch=self.branch, code='102',
            defaults={
                'category': asset_cat, 'name': 'Loans Receivable',
                'owner': self.owner, 'created_by': self.owner,
                'classification': self.classification,
            }
        )
        self.interest_income_acc, _ = Account.objects.get_or_create(
            branch=self.branch, code='401',
            defaults={
                'category': income_cat, 'name': 'Interest Income',
                'owner': self.owner, 'created_by': self.owner,
                'classification': self.classification,
            }
        )
        self.inventory_acc, _ = Account.objects.get_or_create(
            branch=self.branch, code='103',
            defaults={
                'category': asset_cat, 'name': 'Inventory',
                'owner': self.owner, 'created_by': self.owner,
                'classification': self.classification,
            }
        )
        self.fixed_asset_acc, _ = Account.objects.get_or_create(
            branch=self.branch, code='104',
            defaults={
                'category': asset_cat, 'name': 'Fixed Assets',
                'owner': self.owner, 'created_by': self.owner,
                'classification': self.classification,
            }
        )

    def process_clients(self):
        """Process client records"""
        for obj in self.by_model.get('client.client', []):
            pk = obj['pk']
            fields = obj['fields']
            name = fields.get('name', '').strip() or f"legacy_client_{pk}"
            
            # Split name into parts - assume last word is last name
            name_parts = name.split()
            if len(name_parts) > 1:
                first_name = ' '.join(name_parts[:-1])
                last_name = name_parts[-1]
            else:
                first_name = name
                last_name = f"Unknown_{pk}"
            
            # Create new Client record if commit
            if self.commit:
                new_client = NewClient.objects.create(
                    client_id=fields.get('client_id') or f"legacy_{pk}",
                    first_name=first_name,
                    last_name=last_name,
                    email=fields.get('email') or '',
                    phone_primary=fields.get('phone') or '',
                    address_street=fields.get('address') or '',
                    marital_status=fields.get('marital_status', 'unknown'),
                    next_of_kin_name=fields.get('next_of_kin') or '',
                    next_of_kin_phone=fields.get('next_of_kin_phone') or '',
                    next_of_kin_relationship=fields.get('next_of_kin_relationship') or '',
                    date_of_birth=fields.get('date_of_birth'),
                    bank_name=fields.get('bank_name') or '',
                    bank_account_number=fields.get('account_number') or '',
                    owner=self.owner,
                    created_by=self.owner,
                    branch=self.branch,
                    
                    # Set reasonable defaults for required fields
                    gender='other',  # We'll need to update this manually
                    status='active',
                    kyc_status='pending'
                )
                self.import_map['clients'][pk] = new_client.pk
                self.import_map['legacy_to_new'][f"client.client:{pk}"] = new_client.pk
                
                # Add note about legacy import
                from clients.models import ClientNote
                ClientNote.objects.create(
                    client=new_client,
                    note_type='general',
                    title='Legacy Data Import',
                    content=f'Client data imported from legacy system. Original ID: {pk}',
                    owner=self.owner,
                    created_by=self.owner,
                    branch=self.branch
                )
            else:
                # dry-run stub
                self.import_map['clients'][pk] = f"DRY_CLIENT_{pk}"
                self.import_map['legacy_to_new'][f"client.client:{pk}"] = f"DRY_CLIENT_{pk}"

    def process_banks(self):
        """Process bank records"""
        for obj in self.by_model.get('bank.bank', []):
            pk = obj['pk']
            fields = obj['fields']
            bank_name = fields.get('name') or f"bank_{pk}"
            if self.commit:
                acct = self.get_or_create_bank_account(pk, bank_name)
                self.import_map['banks'][pk] = acct.pk
            else:
                self.import_map['banks'][pk] = f"DRY_BANK_{pk}"

    def process_savings_accounts(self):
        """Process savings account records"""
        for obj in self.by_model.get('savings.savings', []):
            pk = obj['pk']
            fields = obj['fields']
            client_legacy_id = fields.get('client')
            client_name = None
            
            if client_legacy_id:
                client_obj = self.fixtures_by_app_model_pk.get('client.client', {}).get(client_legacy_id, {})
                if client_obj:
                    client_name = client_obj['fields'].get('name')
            
            if self.commit:
                from savings.models import SavingsAccount
                from clients.models import Client
                
                client = None
                if client_legacy_id:
                    client = Client.objects.filter(pk=self.import_map['clients'].get(client_legacy_id)).first()
                
                if client:
                    # Create the GL account first
                    gl_account = self.get_or_create_client_account(client_legacy_id, client_name or f"client_{client_legacy_id}")
                    self.import_map['accounts'][f"client_{client_legacy_id}"] = gl_account.pk
                    
                    # Determine appropriate savings product
                    amount = fields.get('balance') or 0
                    product = self.get_default_product('SAVINGS', self.to_dec(amount))
                    
                    if product:
                        # Create savings account
                        savings = SavingsAccount.objects.create(
                            client=client,
                            account=gl_account,
                            product=product,
                            account_number=fields.get('account_number') or f"SAV{pk:06d}",
                            opened_on=fields.get('opened_on') or timezone.now().date(),
                            interest_rate=fields.get('interest_rate') or product.interest_rate,
                            current_balance=self.to_dec(amount),
                            available_balance=self.to_dec(amount),
                            interest_calculation_method='daily',
                            owner=self.owner,
                            created_by=self.owner,
                            branch=self.branch
                        )
                        self.import_map['savings_accounts'][pk] = savings.pk
            else:
                # dry-run mapping
                if client_legacy_id:
                    self.import_map['accounts'][f"client_{client_legacy_id}"] = f"DRY_ACC_CLIENT_{client_legacy_id}"
                self.import_map['savings_accounts'][pk] = f"DRY_SAVINGS_{pk}"

    def handle(self, *args, **options):
        self.setup_import(options)
        
        filepath = options['file']
        if not os.path.exists(filepath):
            raise CommandError(f"File not found: {filepath}")

        self.per_client = options['per_client']
        self.mapping_out = options['mapping_out']
        self.recon_out = options['reconciliation_out']

        # Create import status tracking
        import_status = {
            'started_at': timezone.now(),
            'completed_at': None,
            'total_records': 0,
            'processed_records': 0,
            'success_count': 0,
            'error_count': 0,
            'warnings': [],
            'errors': [],
            'model_stats': {}
        }

        # Load fixture JSON
        encodings = ['utf-8', 'utf-16', 'latin1', 'cp1252']
        raw = None
        
        for encoding in encodings:
            try:
                with open(filepath, 'r', encoding=encoding) as fh:
                    raw = json.load(fh)
                    logger.info(f"Successfully loaded JSON file with {encoding} encoding")
                    break
            except UnicodeDecodeError:
                continue
            except json.JSONDecodeError as e:
                logger.warning(f"JSON decode error with {encoding} encoding: {e}")
                continue
                
        if raw is None:
            raise CommandError(f"Could not read JSON file with any of the attempted encodings: {', '.join(encodings)}")

        # Reformat into model -> list dict for convenience
        for obj in raw:
            model = obj.get('model')  # e.g. 'loan.loan'
            self.by_model.setdefault(model, []).append(obj)

        # Build quick lookup maps from loaded objects for convenience
        # legacy id -> fixture object
        for obj in raw:
            self.fixtures_by_app_model_pk.setdefault(obj['model'], {})[obj['pk']] = obj

        # Process clients
        self.process_clients()

        # Process banks
        self.process_banks()

        # Process savings accounts
        self.process_savings_accounts()

        # Set up income types and process fees
        income_type_map = setup_income_types(self.commit, self.owner, self.branch)
        self.import_map['income_types'] = income_type_map

        # Process registration fees and other fee configurations
        fee_models = [
            'income.registrationfee',
            'income.idfee',
            'income.loanregistrationfee',
            'income.riskpremium',
            'income.unioncontribution',
            'income.loanservicefee'
        ]
        
        for model in fee_models:
            for obj in self.by_model.get(model, []):
                fee_id = register_fee_config(obj, self.commit, self.owner, self.branch, income_type_map)
                self.import_map['fees'][f"{model}:{obj['pk']}"] = fee_id
                
        # Set up expense categories and import expenses
        expense_category_map = setup_expense_categories(self.commit, self.owner, self.branch)
        self.import_map['expense_categories'] = expense_category_map
        
        # Process expenses and their types
        expense_types = {}
        for obj in self.by_model.get('expenses.expensetype', []):
            code = obj['fields'].get('name', '').upper().replace(' ', '_')[:10]
            if code:
                expense_types[obj['pk']] = code

        # Set up expense categories if not already done
        expense_categories = setup_expense_categories(self.commit, self.owner, self.branch)
        
        # Process expenses
        for obj in self.by_model.get('expenses.expense', []):
            expense_type_id = obj['fields'].get('expense_type')
            category_code = expense_types.get(expense_type_id, 'MISC')
            
            # Map to new category
            category = expense_categories.get(category_code)
            if self.commit and category:
                # You'll need to implement import_expense method
                expense_id = f"EXPENSE_{obj['pk']}"  # Placeholder
                self.import_map['expenses'][obj['pk']] = expense_id
            else:
                self.import_map['expenses'][obj['pk']] = f"DRY_EXP_{obj['pk']}"

        # === TRANSACTIONAL IMPORTS (order chosen to minimize Suspense noise) ===
        logger.info("Processing transaction groups...")
        self.process_bank_payments()  # This now uses the grouping approach
        
        logger.info("Processing income payments...")
        self.process_income_payments()
        
        logger.info("Processing expense payments...")
        self.process_expense_payments()
        
        logger.info("Processing loan payments...")
        self.process_loan_payments()
        
        logger.info("Processing liability payments...")
        self.process_liability_payments()
        
        logger.info("Processing asset records...")
        self.process_asset_records()

        # Done. Write mapping and reconciliation outputs
        # ... [rest of your handle method]

        # Done. Write mapping and reconciliation outputs
        ts = datetime.utcnow().strftime('%Y%m%d%H%M%S')
        if not self.mapping_out:
            self.mapping_out = f"import_map_{ts}.json"
        if not self.recon_out:
            self.recon_out = f"reconciliation_{ts}.csv"

        with open(self.mapping_out, 'w', encoding='utf-8') as mfile:
            json.dump(self.import_map, mfile, indent=2, default=str)

        if self.reconciliation:
            keys = list(self.reconciliation[0].keys())
            with open(self.recon_out, 'w', newline='', encoding='utf-8') as rfile:
                writer = csv.DictWriter(rfile, fieldnames=keys)
                writer.writeheader()
                for row in self.reconciliation:
                    writer.writerow(row)

        self.stdout.write(self.style.SUCCESS("Import run complete."))
        self.stdout.write(self.style.WARNING(f"Mapping file: {self.mapping_out}"))
        if self.reconciliation:
            self.stdout.write(self.style.WARNING(f"Reconciliation CSV: {self.recon_out}"))

        # Generate detailed import report
        import_status['completed_at'] = timezone.now()
        duration = import_status['completed_at'] - import_status['started_at']
        
        # Count total records
        import_status['total_records'] = len(raw)
        import_status['processed_records'] = len(raw)  # Simplified for now
        
        posted_tx_count = len(self.import_map['transactions'])
        suspense_total = Decimal('0.00')
        # Optional: compute suspense total only in commit mode by re-querying entries
        if self.commit:
            try:
                from transactions.models import TransactionEntry
                from django.db.models import Sum, Q
                suspense_entries = TransactionEntry.objects.filter(account=self.suspense_acc).aggregate(
                    cr=Sum('amount', filter=Q(side=TransactionEntry.CREDIT)),
                    dr=Sum('amount', filter=Q(side=TransactionEntry.DEBIT)),
                )
                suspense_total = (suspense_entries.get('cr') or 0) - (suspense_entries.get('dr') or 0)
            except Exception as e:
                logger.warning(f"Could not compute suspense total: {e}")

        report = [
            "\nIMPORT SUMMARY",
            "=" * 50,
            f"Duration: {duration}",
            f"Total Records in file: {import_status['total_records']}",
            f"Processed (scanned): {import_status['processed_records']}",
            f"Posted Transactions: {posted_tx_count}",
            f"Reconciliation items: {len(self.reconciliation)}",
            f"Suspense total (approx.): {suspense_total}",
            "\nPROCESSED BY MODEL",
            "=" * 50
        ]

        # Add model-specific stats in sorted order
        for model, objects in sorted(self.by_model.items(), key=lambda kv: kv[0]):
            report.append(f"{model}: {len(objects)}")

        # Pool vs per-client check
        try:
            if self.commit:
                children = Account.objects.filter(parent=self.savings_pool_acc).values_list('id', flat=True)
                if children:
                    from transactions.models import TransactionEntry
                    from django.db.models import Sum, Q
                    # Liability balance convention varies; treat credits as positive here
                    child_bal = TransactionEntry.objects.filter(account_id__in=children).aggregate(
                        cr=Sum('amount', filter=Q(side=TransactionEntry.CREDIT)),
                        dr=Sum('amount', filter=Q(side=TransactionEntry.DEBIT)),
                    )
                    pool_bal = TransactionEntry.objects.filter(account=self.savings_pool_acc).aggregate(
                        cr=Sum('amount', filter=Q(side=TransactionEntry.CREDIT)),
                        dr=Sum('amount', filter=Q(side=TransactionEntry.DEBIT)),
                    )
                    def net(a): 
                        return (a.get('cr') or 0) - (a.get('dr') or 0)
                    delta = net(pool_bal) - net(child_bal)
                    report.append("\nSAVINGS POOL RECONCILIATION")
                    report.append("=" * 50)
                    report.append(f"Pool net: {net(pool_bal)}  Children net: {net(child_bal)}  Delta: {delta}")
        except Exception as e:
            report.append(f"\n[WARN] Pool reconciliation skipped: {e}")
        
        # Balance verification section
        report.append("\nBALANCE VERIFICATION")
        report.append("=" * 50)

        # Verify client savings balances
        legacy_savings = self.by_model.get('savings.savings', [])
        for savings in legacy_savings:
            client_id = savings['fields'].get('client')
            legacy_balance = self.to_dec(savings['fields'].get('balance', 0))
            
            if self.commit:
                # Get new balance from transactions
                key = f"client_{client_id}"
                if key in self.import_map['accounts']:
                    account_id = self.import_map['accounts'][key]
                    try:
                        from transactions.models import TransactionEntry
                        from django.db.models import Sum, Q
                        entries = TransactionEntry.objects.filter(account_id=account_id).aggregate(
                            cr=Sum('amount', filter=Q(side=TransactionEntry.CREDIT)),
                            dr=Sum('amount', filter=Q(side=TransactionEntry.DEBIT)),
                        )
                        new_balance = (entries.get('cr') or 0) - (entries.get('dr') or 0)
                        if abs(new_balance - legacy_balance) > Decimal('0.01'):
                            report.append(f"Balance mismatch for client {client_id}:")
                            report.append(f"  Legacy balance: {legacy_balance}")
                            report.append(f"  New balance: {new_balance}")
                            report.append(f"  Difference: {new_balance - legacy_balance}")
                    except Exception as e:
                        report.append(f"Error checking balance for client {client_id}: {str(e)}")

        # Verify loan balances
        legacy_loans = self.by_model.get('loan.loan', [])
        for loan in legacy_loans:
            loan_id = loan['pk']
            legacy_balance = self.to_dec(loan['fields'].get('balance', 0))
            
            if self.commit:
                # Get new balance from transactions
                if loan_id in self.import_map.get('loans', {}):
                    loan_account_id = self.import_map['loans'][loan_id]
                    try:
                        entries = TransactionEntry.objects.filter(account_id=loan_account_id).aggregate(
                            cr=Sum('amount', filter=Q(side=TransactionEntry.CREDIT)),
                            dr=Sum('amount', filter=Q(side=TransactionEntry.DEBIT)),
                        )
                        new_balance = (entries.get('dr') or 0) - (entries.get('cr') or 0)  # DR - CR for asset accounts
                        if abs(new_balance - legacy_balance) > Decimal('0.01'):
                            report.append(f"Balance mismatch for loan {loan_id}:")
                            report.append(f"  Legacy balance: {legacy_balance}")
                            report.append(f"  New balance: {new_balance}")
                            report.append(f"  Difference: {new_balance - legacy_balance}")
                    except Exception as e:
                        report.append(f"Error checking balance for loan {loan_id}: {str(e)}")
                            
        # Write detailed report
        report_file = f"import_report_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.txt"
        with open(report_file, 'w', encoding='utf-8') as rf:
            rf.write('\n'.join(report))
        
        self.stdout.write(self.style.WARNING(f"Detailed report: {report_file}"))

        if not self.commit:
            self.stdout.write(self.style.NOTICE("Dry-run complete — no DB changes were committed. Run with --commit to persist."))