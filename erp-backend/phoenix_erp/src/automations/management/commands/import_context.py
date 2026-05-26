# automations/management/commands/import_context.py
from datetime import datetime, timedelta
from django.utils import timezone
from django.contrib.auth import get_user_model
from decimal import Decimal
from collections import defaultdict
from django.core.management.base import CommandError
from django.db import transaction as db_transaction

from accounts.models import Account
from transactions.models import TransactionEntry, TransactionSeries, Transaction
from transactions.utils import create_transaction

User = get_user_model()


# automations/management/commands/import_context.py
from django.utils import timezone
from datetime import datetime
import time

# import at top of import_context.py (if not already present)
from datetime import datetime, date
import logging
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------
def _ensure_datetime(obj):
    """
    Convert obj (which may be datetime, date, or several string formats)
    into a naive datetime (UTC-ish). Returns None if cannot parse.
    Accepts:
      - datetime -> returned as-is
      - date -> combined with midnight
      - ISO strings like "2024-09-23T21:56:33.927Z" or "2024-09-23T21:56:33.927+00:00"
      - "YYYY-MM-DD HH:MM:SS(.ffffff)"
      - "YYYY-MM-DD"
    """
    if obj is None:
        return None
    if isinstance(obj, datetime):
        return obj
    if isinstance(obj, date):
        # convert date -> datetime at midnight
        return datetime.combine(obj, datetime.min.time())

    if isinstance(obj, str):
        s = obj.strip()
        if not s:
            return None

        # try common ISO with trailing Z
        try:
            if s.endswith('Z'):
                # remove trailing Z and parse microsecs or seconds
                s2 = s[:-1]
                try:
                    return datetime.strptime(s2, '%Y-%m-%dT%H:%M:%S.%f')
                except ValueError:
                    try:
                        return datetime.strptime(s2, '%Y-%m-%dT%H:%M:%S')
                    except ValueError:
                        pass

            # try ISO with offset like +00:00 by replacing offset to be parseable by fromisoformat
            try:
                return datetime.fromisoformat(s)
            except Exception:
                pass

            # common fallback formats
            for fmt in ('%Y-%m-%d %H:%M:%S.%f', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d'):
                try:
                    return datetime.strptime(s, fmt)
                except ValueError:
                    continue

        except Exception as e:
            logger.debug("Unexpected parse error in _ensure_datetime for %r: %s", obj, e)
            return None

    # unknown type
    return None



class LegacyImportContext:
    """Shared context for the legacy import process"""
    
    def __init__(self, options, style):
        self.options = options
        self.style = style
        self.commit = options['commit']
        self.started_at = timezone.now()
        self.start_time = time.time()  # For precise timing
        
        # Initialize data structures
        self.by_model = defaultdict(list)
        self.fixtures_by_app_model_pk = {}
        self.reconciliation = []
        
        # Initialize import mapping
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
        
        
        # Load required objects
        self.owner = User.objects.filter(pk=options['owner_id']).first()
        if not self.owner:
            raise CommandError("Owner user not found.")

        from branches.models import Branch
        self.branch = Branch.objects.filter(pk=options['branch_id']).first()
        if not self.branch:
            raise CommandError("Branch not found.")
            
        # Set up transaction series
        from transactions.models import TransactionSeries
        self.series, _ = TransactionSeries.objects.get_or_create(
            code=options['series'],
            defaults={'description': 'Import series'}
        )
        
        # Store suspense account name
        self.suspense_name = options['suspense_account_name']
        self.per_client = options['per_client']
        
    def to_dec(self, v):
        """Convert string amounts to Decimal"""
        if v is None or v == '':
            return Decimal('0.00')
        return Decimal(str(v))

    def norm_str(self, v):
        """Normalize string values"""
        if v is None:
            return ''
        s = str(v).strip()
        return '' if s.lower() in {'nan', 'none', 'null'} else s

    def parse_date(self, f, *keys):
        """
        Return (date, dt) tuple from various date fields
        """
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
                dt = datetime.fromisoformat(raw.replace('Z','+00:00')).astimezone(timezone.get_current_timezone())
                return dt.date(), dt
            else:
                d = datetime.fromisoformat(raw).date()
                dt = datetime.combine(d, datetime.min.time(), tzinfo=timezone.get_current_timezone())
                return d, dt
        except Exception:
            d = timezone.localdate()
            dt = timezone.now()
            return d, dt

    def with_latency(self, base_dt, offset_seconds):
        """Add time latency to a datetime"""
        return base_dt + timedelta(seconds=offset_seconds)

    def abs_dec(self, val):
        """Get absolute value and sign of a Decimal"""
        d = self.to_dec(val)
        return abs(d), (d >= 0)
        
    def register_tx(self, legacy_model, legacy_pk, tx_obj_or_dict):
        """Record transaction mapping"""
        key = f"{legacy_model}:{legacy_pk}"
        if self.commit:
            self.import_map['legacy_to_new'][key] = tx_obj_or_dict.pk
            self.import_map['transactions'][key] = tx_obj_or_dict.pk
        else:
            self.import_map['legacy_to_new'][key] = tx_obj_or_dict.get('dry_reference')
            self.import_map['transactions'][key] = tx_obj_or_dict.get('dry_reference')
            
    def create_transaction(self,
                        entries,
                        description,
                        workflow_reference=None,
                        metadata=None,
                        date=None,
                        created_dt=None):
        """
        Create a Transaction and TransactionEntry rows.

        - entries: list of dicts {'account': Account instance, 'side': TransactionEntry.DEBIT|CREDIT or 'D'/'C', 'amount': Decimal}
        - in dry-run (self.commit == False) returns {'dry_reference': ..., 'entries': entries, 'tx_obj': None}
        - auto-balances any small difference (<= 5.00) by posting the difference to self.suspense_acc and records a reconciliation row.
        """
        if date is None:
            date = timezone.localdate()

        # ensure a series exists on the context
        if not getattr(self, 'series', None):
            self.series, _ = TransactionSeries.objects.get_or_create(
                code='IM',
                defaults={'description': 'Import series'}
            )

        # Dry-run mode -> return a structured dry result without writing
        if not getattr(self, 'commit', False):
            curr_count = len(self.import_map.get('transactions', {}) if isinstance(self.import_map, dict) else [])
            dry_ref = f"DRY-{curr_count + 1}"
            return {'dry_reference': dry_ref, 'entries': entries, 'tx_obj': None}

        # Real DB write
        with db_transaction.atomic():
            # Create Transaction record (we manage entry creation and auto-balancing here
            # so delegate to the local Transaction model rather than the helper in
            # transactions.utils which would create entries again).
            # Truncate workflow_reference to the DB field limit (30) to avoid DataError.
            wf = (workflow_reference or None)
            metadata = metadata or {}
            if wf:
                try:
                    if len(wf) > 30:
                        # preserve full original in metadata for debugging
                        metadata = dict(metadata or {})
                        metadata['legacy_workflow_reference'] = wf
                        wf = wf[:30]
                except Exception:
                    wf = wf[:30]

            tx = Transaction(
                series=self.series,
                date=(date or None),
                description=(description or '')[:255],
                workflow_reference=wf,
                metadata=metadata,
                created_by=getattr(self, 'owner', None),
            )
            if getattr(self, 'owner', None) is not None:
                tx.owner = getattr(self, 'owner', None)
            if getattr(self, 'branch', None) is not None:
                tx.branch = getattr(self, 'branch', None)

            # persist tx now to obtain PK for entry rows
            try:
                tx.save()
            except Exception as e:
                # Surface DB errors (e.g., value too long) with more context
                logger.exception("Failed to save Transaction (wf=%r, desc=%r): %s", workflow_reference, description, e)
                raise
            

            # if caller wants created_dt reflected, try to update after save
            if created_dt:
                try:
                    Transaction.objects.filter(pk=tx.pk).update(created_at=created_dt)
                except Exception:
                    # ignore if model uses auto_now_add and DB disallows update; best-effort
                    pass

            # Create entries and calculate totals
            total_dr = Decimal('0.00')
            total_cr = Decimal('0.00')

            created_entries = []
            for e in entries:
                acct = e.get('account')
                amt = e.get('amount') or 0
                try:
                    amt = Decimal(str(amt))
                except Exception:
                    amt = Decimal('0.00')

                side = e.get('side')
                # Accept either the TransactionEntry constants or 'D'/'C' strings
                if side in (getattr(TransactionEntry, 'DEBIT', 'D'), 'D'):
                    total_dr += amt
                else:
                    total_cr += amt

                te = TransactionEntry.objects.create(
                    transaction=tx,
                    account=acct,
                    side=side,
                    amount=amt
                )
                created_entries.append(te)

            # Balance check: if not exactly balanced, auto-balance to suspense within tolerance
            diff = (total_dr - total_cr)
            if diff != Decimal('0.00'):
                tolerance = Decimal('5.00')  # configurable tolerance
                suspense = getattr(self, 'suspense_acc', None)
                if suspense:
                    if abs(diff) > Decimal('0.00'):
                        if abs(diff) > tolerance:
                            # Post the difference to suspense (credit if diff > 0 else debit)
                            if diff > 0:
                                TransactionEntry.objects.create(
                                    transaction=tx,
                                    account=suspense,
                                    side=getattr(TransactionEntry, 'CREDIT', 'C'),
                                    amount=abs(diff)
                                )
                            else:
                                TransactionEntry.objects.create(
                                    transaction=tx,
                                    account=suspense,
                                    side=getattr(TransactionEntry, 'DEBIT', 'D'),
                                    amount=abs(diff)
                                )

                            # add reconciliation row to highlight large imbalance
                            print(f"Auto-balancing transaction {tx.pk} with large diff {diff} to suspense account {suspense}, description: {description}")
                            self.reconciliation.append({
                                'legacy_model': 'transaction_auto_balance',
                                'legacy_pk': tx.pk,
                                'reason': 'auto_balanced_diff_large',
                                'desc': str(description)[:255],
                                'amount': str(diff)
                            })
                        else:
                            # small tolerance diff -> still auto-balance but mark as small difference
                            if diff > 0:
                                TransactionEntry.objects.create(
                                    transaction=tx,
                                    account=suspense,
                                    side=getattr(TransactionEntry, 'CREDIT', 'C'),
                                    amount=abs(diff)
                                )
                            else:
                                TransactionEntry.objects.create(
                                    transaction=tx,
                                    account=suspense,
                                    side=getattr(TransactionEntry, 'DEBIT', 'D'),
                                    amount=abs(diff)
                                )
                            print(f"Auto-balancing transaction {tx.pk} with small diff {diff} to suspense account {suspense}, description: {description}")
                            self.reconciliation.append({
                                'legacy_model': 'transaction_auto_balance',
                                'legacy_pk': tx.pk,
                                'reason': 'auto_balanced_diff_small',
                                'desc': str(description)[:255],
                                'amount': str(diff)
                            })
                else:
                    # No suspense account available -> still record reconciliation so operator inspects
                    print(f"[WARN] Transaction {tx.pk} is unbalanced by {diff} but no suspense account configured. Description: {description}")
                    self.reconciliation.append({
                        'legacy_model': 'transaction_unbalanced_no_suspense',
                        'legacy_pk': tx.pk,
                        'reason': 'unbalanced_no_suspense',
                        'desc': str(description)[:255],
                        'amount': str(diff)
                    })

            # Post entries (update account balances)
            for te in created_entries:
                te.post()

            return tx

        # automations/management/commands/import_context.py (add this method to the class)
    def generate_detailed_report(self):
        """Generate a detailed import report"""
        duration_seconds = self.get_duration()
        duration = timedelta(seconds=duration_seconds)
        
        posted_tx_count = len(self.import_map['transactions'])
        
        # Calculate suspense total
        suspense_total = Decimal('0.00')
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
                self.stdout.write(self.style.WARNING(f"Could not compute suspense total: {e}"))

        report = [
            "\nIMPORT SUMMARY",
            "=" * 50,
            f"Duration: {duration}",
            f"Total Records in file: {sum(len(objs) for objs in self.by_model.values())}",
            f"Processed (scanned): {sum(len(objs) for objs in self.by_model.values())}",
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
                from accounts.models import Account
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
        
        return report_file
    
    def get_duration(self):
        """Calculate the duration of the import process"""
        if hasattr(self, 'start_time'):
            end_time = time.time()
            return end_time - self.start_time
        return 0
    
    def classify_group(self, group):
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
    
    def match_loan_payment_by_txid(self, tx_id):
        """Return the loan.loanpayment fixture with the same transaction id, if any."""
        if not tx_id:
            return None
        for lp in self.by_model.get('loan.loanpayment', []):
            if lp.get('fields', {}).get('transaction') == tx_id:
                return lp
        return None
    
    
    def find_loan_payment_by_time_amount(self, amount, bank_dt, loan_payments, tolerance=Decimal('5.00'), seconds=3):
        """
        Find a loan payment whose amount is within ±tolerance and whose timestamp
        is within ±seconds of the bank entry. Name is NOT required.

        Robust to bank_dt being a datetime, date, or string. Robust to loan payment
        timestamps being strings or datetimes. Returns the loan payment fixture object
        (the dict) or None.
        """
        if not loan_payments:
            return None

        # normalize amounts
        try:
            amt = abs(self.to_dec(amount))
        except Exception:
            amt = abs(Decimal(str(amount))) if amount is not None else Decimal('0')

        # normalize bank datetime (bank_dt may be string or date)
        bank_dt_norm = _ensure_datetime(bank_dt)
        if bank_dt_norm is None:
            # try to parse if bank_dt is nested fields dict (rare)
            try:
                # If caller accidentally passed fields dict, try parse_date helper
                if isinstance(bank_dt, dict) and hasattr(self, 'parse_date'):
                    _, bank_dt_norm_candidate = self.parse_date(bank_dt, 'payment_date', 'created_at')
                    bank_dt_norm = bank_dt_norm_candidate
            except Exception:
                bank_dt_norm = None

        # If still None: we can't reliably match by close timestamp -> fall back to amount-only match (but prefer time)
        # However to keep behavior predictable, if we can't parse bank time return None
        if bank_dt_norm is None:
            logger.debug("find_loan_payment_by_time_amount: bank_dt could not be normalized (%r)", bank_dt)
            return None

        for lp in loan_payments:
            f = lp.get('fields', {}) or {}
            try:
                p_amt = abs(self.to_dec(f.get('amount')))
            except Exception:
                p_amt = abs(Decimal(str(f.get('amount') or 0)))

            if abs(amt - p_amt) <= tolerance:
                # normalize loan payment datetime
                # prefer created_at then payment_date
                p_raw = f.get('created_at') or f.get('payment_date') or f.get('date')
                p_dt = _ensure_datetime(p_raw)

                # If still None, try the parse_date helper (if available)
                if p_dt is None and hasattr(self, 'parse_date'):
                    try:
                        _, p_dt_candidate = self.parse_date(f, 'payment_date', 'created_at')
                        p_dt = p_dt_candidate
                    except Exception:
                        p_dt = None

                if p_dt is None:
                    # cannot parse loan payment timestamp; skip this candidate
                    logger.debug("find_loan_payment_by_time_amount: could not parse loan payment timestamp for lp pk=%s raw=%r", lp.get('pk'), p_raw)
                    continue

                # compare time delta
                try:
                    delta_seconds = abs((bank_dt_norm - p_dt).total_seconds())
                    if delta_seconds <= float(seconds):
                        return lp
                except Exception as e:
                    logger.debug("find_loan_payment_by_time_amount: time compare failed for lp pk=%s: %s", lp.get('pk'), e)
                    continue

        return None
    # ---------------------------------------------------------------------

