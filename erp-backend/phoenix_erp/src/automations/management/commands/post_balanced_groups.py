import csv
import json
import logging
from decimal import Decimal
from datetime import datetime
import os
import glob
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from django.db import transaction as db_transaction

from accounts.models import Account
from transactions.models import Transaction, TransactionEntry, TransactionSeries
from django.contrib.auth import get_user_model
# Try to reuse the project's grouper to expand tx-id-based groups
try:
    from automations.management.commands.transaction_processors.transaction_grouper import TransactionGrouper
except Exception:
    TransactionGrouper = None

logger = logging.getLogger(__name__)
User = get_user_model()

# Tolerance used by your heuristics
AMOUNT_TOLERANCE = Decimal('5.00')


def dec(v):
    try:
        return Decimal(str(v))
    except Exception:
        return Decimal('0')


class Command(BaseCommand):
    help = "Post balanced transaction groups from tx_group_audit CSV. Dry-run by default."

    def add_arguments(self, parser):
        parser.add_argument('--audit', required=True, help='Path to tx_group_audit CSV produced by previous import run')
        parser.add_argument('--mapping', required=False, help='Path to import_map JSON (optional, used to map legacy accounts)')
        parser.add_argument('--series', default='IM', help='TransactionSeries code to use/create for posted transactions')
        parser.add_argument('--owner-id', type=int, required=True, help='Owner user id for created transactions')
        parser.add_argument('--commit', action='store_true', help='If passed, actually create transactions in DB; otherwise dry-run CSV is produced')
        parser.add_argument('--out', default='to_post_transactions.csv', help='Output CSV for dry-run/posting results')
        parser.add_argument('--data-json', required=False, help='Path to legacy fixtures JSON (group by "transaction" field) to include more groups')
        parser.add_argument('--include-fixtures', action='store_true', help='Auto-include all data*.json fixtures in the project src folder')

    def handle(self, *args, **options):
        audit_file = options['audit']
        mapping_file = options.get('mapping')
        owner = User.objects.filter(pk=options['owner_id']).first()
        if not owner:
            raise CommandError('Owner user not found')

        # load mapping if provided
        mapping = {}
        if mapping_file:
            try:
                with open(mapping_file, 'r', encoding='utf-8') as fh:
                    mapping = json.load(fh)
                logger.info('Loaded mapping file')
            except Exception as e:
                raise CommandError(f'Error loading mapping file: {e}')

        # normalize mapping sections we expect
        # mapping may contain:
        # - banks: { legacy_bank_id: account_pk }
        # - categories: { loan: account_pk, savings: account_pk, liability: account_pk, expense: account_pk, income: account_pk, asset: account_pk, suspense: account_pk }
        # - legacy_category_map: { 'LEGACY_CODE_OR_KEYWORD': 'loan' }
        banks_map = mapping.get('banks') or mapping.get('bank_accounts') or {}
        categories_map = mapping.get('categories') or {}
        legacy_category_map = mapping.get('legacy_category_map') or {}

        # series
        series, _ = TransactionSeries.objects.get_or_create(code=options['series'], defaults={'description': 'Posted from balanced groups'})

        data_json_file = options.get('data_json')

        # read audit CSV
        try:
            with open(audit_file, newline='', encoding='utf-8') as fh:
                reader = csv.DictReader(fh)
                rows = [r for r in reader]
        except Exception as e:
            raise CommandError(f'Error reading audit CSV: {e}')

        # If provided, read the data JSON and build additional groups keyed by transaction id
        json_groups = {}
        if data_json_file:
            try:
                with open(data_json_file, 'r', encoding='utf-8') as fj:
                    fixtures = json.load(fj)
                # fixtures likely a list of objects with 'fields' and maybe 'pk'
                for obj in fixtures:
                    fields = obj.get('fields') if isinstance(obj, dict) else {}
                    txid = (fields or {}).get('transaction')
                    if not txid:
                        continue
                    # compute debit/credit per object (best-effort using amount and model semantics)
                    amt = dec((fields or {}).get('amount') or 0)
                    # heuristic: positive amounts are credits for bank rows; we'll store signed amt and model placeholder
                    entry = {'obj': obj, 'amt': amt}
                    json_groups.setdefault(str(txid), []).append(entry)
            except Exception as e:
                raise CommandError(f'Error reading data JSON: {e}')

        # If requested, auto-include data*.json fixtures in the same folder as the audit file
        if options.get('include_fixtures'):
            try:
                audit_dir = os.path.dirname(audit_file) or '.'
                pattern = os.path.join(audit_dir, 'data*.json')
                for path in glob.glob(pattern):
                    try:
                        with open(path, 'r', encoding='utf-8') as fj:
                            fixtures = json.load(fj)
                    except Exception:
                        continue
                    for obj in fixtures:
                        fields = obj.get('fields') if isinstance(obj, dict) else {}
                        txid = (fields or {}).get('transaction')
                        if not txid:
                            continue
                        amt = dec((fields or {}).get('amount') or 0)
                        entry = {'obj': obj, 'amt': amt}
                        json_groups.setdefault(str(txid), []).append(entry)
            except Exception as e:
                logger.exception('include-fixtures scan failed: %s', e)

        # prepare groups map (merge audit CSV and any JSON-derived groups into a single map)
        groups = {}

        # merge data-json groups into groups (use txid strings to avoid collision with bank_pk keys)
        if json_groups:
            # If TransactionGrouper is available, build a by_model map and expand each txid into a full group
            if TransactionGrouper:
                # Build by_model mapping from all fixtures we loaded (data-json + included fixtures)
                by_model = {}
                for txid, entries in json_groups.items():
                    for e in entries:
                        obj = e.get('obj')
                        if not isinstance(obj, dict):
                            continue
                        model = obj.get('model') or obj.get('model_label') or ''
                        by_model.setdefault(model, []).append(obj)

                # minimal context for the grouper
                class _Ctx:
                    def __init__(self, by_model):
                        self.by_model = by_model
                        self.import_map = {'legacy_to_new': {}}
                    def to_dec(self, v):
                        return dec(v)
                    def parse_date(self, fields, *keys):
                        # naive parse: try keys in fields
                        for k in keys:
                            if fields.get(k):
                                try:
                                    dt = datetime.fromisoformat(fields.get(k))
                                    return (dt, dt)
                                except Exception:
                                    try:
                                        d = datetime.strptime(fields.get(k).split('.')[0], '%Y-%m-%d %H:%M:%S')
                                        return (d, d)
                                    except Exception:
                                        continue
                        return (None, None)

                ctx = _Ctx(by_model)
                grouper = TransactionGrouper(ctx, None)
                for txid in list(json_groups.keys()):
                    full = grouper.build_full_group(txid, initial_group=[e['obj'] for e in json_groups[txid]])
                    # compute debits/credits from full group
                    debits = Decimal('0')
                    credits = Decimal('0')
                    for o in full:
                        f = (o.get('fields') or {}) if isinstance(o, dict) else {}
                        a = dec(f.get('amount') or 0)
                        if a >= 0:
                            debits += a
                        else:
                            credits += (-a)
                    diff = (debits - credits).quantize(Decimal('0.01'))
                    sample = {'bank_pk': f'tx:{txid}', 'date': '', 'note': f'Fixtures group {txid}', 'debits': str(debits), 'credits': str(credits)}
                    groups.setdefault(f'tx:{txid}', []).append((sample, diff))
            else:
                for txid, entries in json_groups.items():
                    amounts = [e['amt'] for e in entries]
                    debits = sum(a for a in amounts if a > 0)
                    credits = sum((-a) for a in amounts if a < 0)
                    diff = (Decimal(str(debits)) - Decimal(str(credits))).quantize(Decimal('0.01'))
                    sample = {'bank_pk': f'tx:{txid}', 'date': '', 'note': f'Fixtures group {txid}', 'debits': str(debits), 'credits': str(credits)}
                    groups.setdefault(f'tx:{txid}', []).append((sample, diff))

        # merge audit CSV rows into groups
        for r in rows:
            # the audit CSV uses `bank_pk` as the group identifier in this export
            grp = r.get('bank_pk') or r.get('bank_id') or r.get('group')
            if not grp:
                continue
            try:
                diff = dec(r.get('diff') or r.get('Diff') or '0')
            except Exception:
                diff = Decimal('0')
            groups.setdefault(grp, []).append((r, diff))

        balanced_groups = []
        for g, items in groups.items():
            # sum diffs (most audits have single row per group but be safe)
            total_diff = sum(d for (_, d) in items)
            if abs(total_diff) <= AMOUNT_TOLERANCE:
                balanced_groups.append((g, items))

        if not balanced_groups:
            self.stdout.write(self.style.NOTICE('No balanced groups found in audit CSV'))
            return

        self.stdout.write(self.style.SUCCESS(f'Found {len(balanced_groups)} balanced groups'))

        # Build dry-run rows for posting
        out_rows = []
        for g, items in balanced_groups:
            sample = items[0][0]
            # prefer any available date column
            date_str = sample.get('date') or sample.get('Date') or sample.get('created_at') or ''
            desc = sample.get('note') or sample.get('note') or sample.get('description') or f'Group {g}'
            try:
                when = datetime.strptime(date_str.split('.')[0], '%Y-%m-%d %H:%M:%S')
                when = timezone.make_aware(when)
            except Exception:
                when = timezone.now()

            # The audit provides aggregated debit/credit totals per group
            debit = dec(sample.get('debits') or sample.get('Debits') or sample.get('debits_total') or '0')
            credit = dec(sample.get('credits') or sample.get('Credits') or sample.get('credits_total') or '0')

            # Choose an amount to post for bank leg. If both positive and equal, we'll post the debit as bank movement and offset to Suspense.
            amt = debit if debit > 0 else credit

            # Map bank_pk to Account if mapping provided; try several key formats
            bank_pk = sample.get('bank_pk') or sample.get('bank_id')
            bank_acc = None
            if banks_map and bank_pk is not None:
                mapped = banks_map.get(str(bank_pk)) or banks_map.get(f'bank_{bank_pk}')
                # int keys sometimes used
                if not mapped:
                    try:
                        mapped = banks_map.get(int(bank_pk))
                    except Exception:
                        mapped = None
                if mapped:
                    try:
                        bank_acc = Account.objects.filter(pk=mapped).first()
                    except Exception:
                        bank_acc = None

            # fallback bank account selection
            if not bank_acc:
                bank_acc = Account.objects.filter(code__in=['CSH','101','B01']).first()

            # Determine a counterparty category/account. Use mapping categories if provided and heuristics based on sample text.
            # 1) If mapping provides a direct category for this bank id, prefer that (e.g., mapping.get('bank_category'))
            counter_acc = None
            # try direct category mapping keyed by bank id
            bank_cat_map = mapping.get('bank_category') or mapping.get('bank_categories') or {}
            category_key = None
            if bank_cat_map and bank_pk is not None:
                category_key = bank_cat_map.get(str(bank_pk)) or bank_cat_map.get(f'bank_{bank_pk}')

            # 2) If no direct bank->category mapping, attempt to infer from sample text using legacy_category_map
            if not category_key and legacy_category_map:
                text = (sample.get('note') or sample.get('description') or sample.get('recon_reasons') or '').lower()
                for legacy_key, cat in legacy_category_map.items():
                    try:
                        if legacy_key.lower() in text:
                            category_key = cat
                            break
                    except Exception:
                        continue

            # 3) final fallback category is 'suspense'
            if not category_key:
                category_key = 'suspense'

            # Resolve category to Account object
            if categories_map and category_key:
                mapped_cat = categories_map.get(category_key)
                if mapped_cat:
                    try:
                        counter_acc = Account.objects.filter(pk=mapped_cat).first()
                    except Exception:
                        counter_acc = None

            # default suspense/fallback
            if not counter_acc:
                counter_acc = Account.objects.filter(code__in=['SUS','999']).first()
            if not counter_acc:
                counter_acc = Account.objects.first()

            # Build legs: determine which side bank should be on based on debit vs credit totals
            legs = []
            if amt > 0:
                # if total debit >= total credit -> bank is debit side, counterparty is credit, else reversed
                if debit >= credit:
                    bank_side = 'D'
                    counter_side = 'C'
                else:
                    bank_side = 'C'
                    counter_side = 'D'

                legs = [
                    {'account': getattr(bank_acc, 'pk', None), 'amount': str(amt), 'side': bank_side},
                    {'account': getattr(counter_acc, 'pk', None), 'amount': str(amt), 'side': counter_side},
                ]

            out_rows.append({
                'group': g,
                'bank_pk': bank_pk,
                'description': desc,
                'when': when.isoformat(),
                'debit': str(debit),
                'credit': str(credit),
                'legs': json.dumps(legs),
            })

        # write dry-run CSV
        out_file = options.get('out') or 'to_post_transactions.csv'
        keys = ['group', 'bank_pk', 'description', 'when', 'debit', 'credit', 'legs']
        try:
            with open(out_file, 'w', newline='', encoding='utf-8') as fh:
                writer = csv.DictWriter(fh, fieldnames=keys)
                writer.writeheader()
                for r in out_rows:
                    writer.writerow(r)
        except Exception as e:
            raise CommandError(f'Error writing output CSV: {e}')

        self.stdout.write(self.style.SUCCESS(f'Wrote {len(out_rows)} groups to {out_file}'))

        # If commit: post transactions (each group -> one transaction with bank<->suspense)
        if options.get('commit'):
            posted = 0
            for r in out_rows:
                legs = json.loads(r['legs']) if r.get('legs') else []
                if not legs:
                    continue
                when = datetime.fromisoformat(r['when'])
                # build TX entries with real Account objects
                tx_entries = []
                for l in legs:
                    acc_pk = l.get('account')
                    try:
                        acc_obj = Account.objects.filter(pk=acc_pk).first() if acc_pk else None
                    except Exception:
                        acc_obj = None
                    if not acc_obj:
                        # skip groups that can't be mapped to accounts
                        tx_entries = []
                        break
                    tx_entries.append({'account': acc_obj, 'side': l.get('side'), 'amount': dec(l.get('amount'))})

                if not tx_entries:
                    continue

                # create transaction
                try:
                    with db_transaction.atomic():
                        tx = Transaction.objects.create(series=series, date=when.date(), description=r['description'][:255], owner=owner, created_by=owner)
                        for e in tx_entries:
                            TransactionEntry.objects.create(transaction=tx, account=e['account'], side=e['side'], amount=e['amount'])
                    posted += 1
                except Exception as e:
                    logger.exception(f'Error posting transaction for group {r.get("group")}: {e}')

            self.stdout.write(self.style.SUCCESS(f'Posted {posted} transactions'))

        # done
