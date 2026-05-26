# automations/management/commands/transaction_processors/base_processor.py
from decimal import Decimal
from django.db import transaction
from transactions.models import Transaction, TransactionEntry
from accounts.models import Account, AccountCategory, AccountClassification

import re
import difflib
from decimal import Decimal

class BaseTransactionProcessor:
    """Base class for all transaction processors"""
    
    def __init__(self, context, account_manager):
        self.context = context
        self.account_manager = account_manager
        
    def create_transaction(self, entries, description, workflow_reference=None, meta=None, date=None):
        """
        Create a transaction with the given entries
        """
        tx_date = date or self.context.timezone.localdate()

        if not self.context.commit:
            ref = f"DRY-{len(self.context.import_map['transactions'])+1}"
            return {'dry_reference': ref, 'entries': entries, 'tx_obj': None, 'date': tx_date, 'meta': meta or {}}

        with transaction.atomic():
            tx = Transaction(
                series=self.context.series,
                date=tx_date,
                description=description[:255] if description else '',
                owner=self.context.owner,
                created_by=self.context.owner,
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
            
    def _income_gl(self, legacy_income_id):
        """Create/find a GL income account per legacy income name."""
        income = self.context.fixtures_by_app_model_pk.get('income.income', {}).get(legacy_income_id)
        name = self.context.norm_str(income['fields'].get('name')) if income else f"Income_{legacy_income_id}"
        income_cat, _ = self._branch_category(4, "Income")
        
        # Use modulo to ensure code fits in 3 chars: I01-I99
        code = f"I{int(legacy_income_id) % 100:02d}" if str(legacy_income_id).isdigit() else "I99"
        
        # Get classification from context or create a default one
        classification = getattr(self.context, 'classification', None)
        if not classification:
            classification, _ = AccountClassification.objects.get_or_create(
                name="Imported",
                branch=self.context.branch,
                defaults={'owner': self.context.owner, 'created_by': self.context.owner}
            )
            
        acc, _ = Account.objects.get_or_create(
            branch=self.context.branch, code=code,
            defaults={
                'category': income_cat, 'name': f"{name} (Legacy)",
                'owner': self.context.owner, 'created_by': self.context.owner,
                'classification': classification,
            }
        )
        return acc
        
    def _expense_gl(self, legacy_expense_id, fallback_name="Expense"):
        expense = self.context.fixtures_by_app_model_pk.get('expenses.expense', {}).get(legacy_expense_id)
        name = self.context.norm_str(expense['fields'].get('name')) if expense else f"{fallback_name}_{legacy_expense_id}"
        expense_cat, _ = self._branch_category(5, "Expenses")
        
        # Use modulo to ensure code fits in 3 chars: E01-E99
        code = f"E{int(legacy_expense_id) % 100:02d}" if str(legacy_expense_id).isdigit() else "E99"
        
        # Get classification from context or create a default one
        classification = getattr(self.context, 'classification', None)
        if not classification:
            classification, _ = AccountClassification.objects.get_or_create(
                name="Imported",
                branch=self.context.branch,
                defaults={'owner': self.context.owner, 'created_by': self.context.owner}
            )
            
        acc, _ = Account.objects.get_or_create(
            branch=self.context.branch, code=code,
            defaults={
                'category': expense_cat, 'name': f"{name} (Legacy)",
                'owner': self.context.owner, 'created_by': self.context.owner,
                'classification': classification,
            }
        )
        return acc
        
    def _branch_category(self, section, name, code_prefix=None):
        """
        Branch-scoped category getter/creator.
        """
        obj = AccountCategory.objects.filter(section=section, branch=self.context.branch).first()
        if obj:
            return obj, False
        return AccountCategory.objects.get_or_create(
            section=section,
            branch=self.context.branch,
            defaults={
                'name': name,
                'code_prefix': code_prefix or name.upper()[:10],
                'owner': self.context.owner,
                'created_by': self.context.owner
            }
        )
    # --- helpers to paste into your processor class (e.g., BaseTransactionProcessor subclass) ---

    def _norm(self, s):
        if not s:
            return ''
        try:
            s = self.ctx.norm_str(s)
        except Exception:
            s = str(s).strip()
        # collapse punctuation/spacing; lowercase
        s = re.sub(r'[^\w\s]', ' ', s)
        s = re.sub(r'\s+', ' ', s).strip().lower()
        return s

    def _is_income_like(self, desc_norm: str) -> bool:
        # broad but safe: catches “income”, “fee”, “interest”, “premium”, “registration”, “sms”
        kw = ["income", "fee", "interest", "premium", "registration", "admin", "administrative", "sms"]
        return any(k in desc_norm for k in kw)

    def _find_income_fixture_pk(self, desc_norm: str):
        """
        Try to map description text to an income fixture PK by keyword/fuzzy name match.
        Looks under fixtures_by_app_model_pk['income.income'].
        Returns PK or None.
        """
        incomes = (self.ctx.fixtures_by_app_model_pk or {}).get('income.income', {}) or {}
        if not incomes:
            return None

        # keyword -> preferred target phrases (expand as needed)
        targets = [
            ("administrative fee", ["admin fee", "administrative fee"]),
            ("loan registration fee", ["registration fee", "loan registration"]),
            ("risk premium", ["risk premium"]),
            ("sms fee", ["sms fee", "sms charge"]),
            ("interest income", ["interest", "loan interest"]),
            ("daily contribution income", ["dc income", "daily contribution income"]),
        ]

        # Build normalized names for fixtures
        cand = []
        for pk, obj in incomes.items():
            name = self._norm(((obj.get('fields') or {}).get('name')) or "")
            if name:
                cand.append((pk, name))

        # 1) keyword inclusion pass (fast)
        for label, synonyms in targets:
            if any(self._norm(syn) in desc_norm for syn in synonyms):
                # choose the fixture whose name best matches the label
                best = max(cand, key=lambda x: difflib.SequenceMatcher(None, x[1], self._norm(label)).ratio(), default=None)
                if best and difflib.SequenceMatcher(None, best[1], self._norm(label)).ratio() >= 0.55:
                    return best[0]

        # 2) generic “income-like” fuzzy match against all income names
        best = max(cand, key=lambda x: difflib.SequenceMatcher(None, x[1], desc_norm).ratio(), default=None)
        if best and difflib.SequenceMatcher(None, best[1], desc_norm).ratio() >= 0.65:
            return best[0]
        return None

    def _income_account_from_entry_or_desc(self, fields: dict, fallback_desc: str):
        """
        Resolve an income GL account either from the entry’s `income` field
        or by mapping description text to an income fixture PK.
        """
        income_id = (fields or {}).get('income')
        if income_id:
            try:
                return self._income_gl(income_id)
            except Exception:
                pass

        pk = self._find_income_fixture_pk(self._norm(fallback_desc or ""))
        if pk:
            try:
                return self._income_gl(pk)
            except Exception:
                pass
        # last resort: a generic "Other Income" GL if you expose one
        try:
            return self.account_manager.get_or_create_misc_income_account("other_income")
        except Exception:
            return None  # caller will fall back to suspense if still None

    def _include_income_components(self, full_group, entries, mapped_total: Decimal):
        """
        Scan a grouped set for explicit income entries and add CREDIT lines for them.
        Returns new_mapped_total and count_added.
        """
        count = 0
        for o in list(full_group):
            model = (o.get('model') or '').lower()
            if 'income' not in model:
                continue
            if o.get('processed'):
                continue
            f = o.get('fields') or {}
            amt = self.ctx.to_dec(f.get('amount') or 0)
            if amt == 0:
                continue
            desc = f.get('description') or ""
            inc_acc = self._income_account_from_entry_or_desc(f, desc)
            if inc_acc is None:
                # fall back to suspense but still count towards mapped_total so diff shrinks
                inc_acc = getattr(self.ctx, 'suspense_acc', None)

            entries.append({'account': inc_acc, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': abs(amt)})
            mapped_total += amt
            count += 1
            # mark processed & (optionally) leave mapping for reconcile clarity
            o['processed'] = True
        return mapped_total, count

    def _abs_diff_to_income_if_likely(self, diff: Decimal, rep_desc: str, entries):
        """
        If a leftover diff looks like income from the bank description, convert it into an
        income CREDIT instead of suspense. Returns remaining diff after conversion.
        """
        desc_norm = self._norm(rep_desc or "")
        if not self._is_income_like(desc_norm):
            return diff

        inc_acc = self._income_account_from_entry_or_desc({}, rep_desc)
        if inc_acc is None:
            return diff

        if diff == 0:
            return diff

        # sign-aware: CREDIT income for the absolute value, matching sign effect of diff
        if diff > 0:
            # bank_total > mapped_total -> we still need a CREDIT to balance
            entries.append({'account': inc_acc, 'side': getattr(TransactionEntry, 'CREDIT', 'C'), 'amount': abs(diff)})
            return Decimal('0.00')
        else:
            # mapped_total > bank_total -> we need a DEBIT to income (rare but handle)
            entries.append({'account': inc_acc, 'side': getattr(TransactionEntry, 'DEBIT', 'D'), 'amount': abs(diff)})
            return Decimal('0.00')
