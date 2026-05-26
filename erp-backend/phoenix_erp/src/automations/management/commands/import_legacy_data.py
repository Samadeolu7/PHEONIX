# automations/management/commands/import_legacy_data.py
from decimal import Decimal, InvalidOperation
import json
import os
import csv
import logging
from datetime import datetime
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from django.db import transaction

logger = logging.getLogger(__name__)

# Local imports for the import scaffolding/context
from .import_context import LegacyImportContext
from .client_processing import ClientProcessor

# AccountManager (the real manager implemented in transaction_processors)
from .transaction_processors.account_management import AccountManager

# Note: processors are imported lazily inside handle() to keep startup light and to allow
# safe fallback if a processor file is temporarily missing.

class Command(BaseCommand):
    help = "Import legacy JSON fixture into new schema. Dry-run by default."

    def add_arguments(self, parser):
        parser.add_argument('file', help='Path to legacy data.json (fixture-style list of objects).')
        parser.add_argument('--owner-id', type=int, required=True, help='User id to set as owner/created_by for created records.')
        parser.add_argument('--branch-id', type=int, required=True, help='Branch id to set on created records.')
        parser.add_argument('--commit', action='store_true', help='If passed, persist changes. Otherwise dry-run.')
        parser.add_argument('--per-client', action='store_true', help='Create per-client savings GL accounts (recommended).')
        parser.add_argument('--series', default='IM', help='TransactionSeries code to use/create for imported transactions.')
        parser.add_argument('--mapping-out', default=None, help='Output path for import_map JSON (defaults to import_map_<ts>.json)')
        parser.add_argument('--reconciliation-out', default=None, help='Output CSV path for reconciliation items.')
        parser.add_argument('--accounts-out', default=None, help='Output CSV path for proposed accounts mapping.')
        parser.add_argument('--flush-db', action='store_true', help='If passed with --commit, flush previously imported transactions/accounts for this import series before importing.')
        parser.add_argument('--suspense-account-name', default='Suspense - Import', help='Name of the suspense account used for ambiguous postings.')
        parser.add_argument('--opening-out', default=None, help='Output CSV path for proposed opening transactions (dry-run).')

    def handle(self, *args, **options):
        # Create import context (holds by_model, fixtures_by_app_model_pk, import_map, reconciliation, helpers)
        context = LegacyImportContext(options, self.style)
        # instrumentation (add to top of handle, after context created)
        ctx = context
        ctx.stats = getattr(ctx, 'stats', {})
        ctx.stats.setdefault('create_transaction_calls', 0)
        ctx.stats.setdefault('register_tx_calls', 0)
        ctx.stats.setdefault('register_tx_success', 0)

        # wrap create_transaction if available
        _orig_create_tx = getattr(ctx, 'create_transaction', None)
        def _tracking_create_tx(*a, **kw):
            ctx.stats['create_transaction_calls'] += 1
            return _orig_create_tx(*a, **kw) if _orig_create_tx else None
        if _orig_create_tx:
            ctx.create_transaction = _tracking_create_tx

        # wrap register_tx (best-effort: signature may vary)
        _orig_register = getattr(ctx, 'register_tx', None)
        def _tracking_register(model, pk, txobj, *args, **kw):
            ctx.stats['register_tx_calls'] += 1
            res = None
            try:
                res = _orig_register(model, pk, txobj, *args, **kw)
                ctx.stats['register_tx_success'] = ctx.stats.get('register_tx_success', 0) + 1
            except Exception:
                import logging
                logging.exception("register_tx wrapper: register failed for %s:%s", model, pk)
                raise
            return res
        if _orig_register:
            ctx.register_tx = _tracking_register


        # Load fixture JSON to context.by_model and context.fixtures_by_app_model_pk
        filepath = options['file']
        self.stdout.write(f"Loading fixture: {filepath}")
        if not self.load_fixture_data(context, filepath):
            raise CommandError("Failed to load fixture data")

        # Instantiate account manager (real one from transaction_processors.account_management)
        try:
            account_manager = AccountManager(context)
        except Exception as e:
            raise CommandError(f"Failed to initialize AccountManager: {e}")

        # If this is a dry-run, run the setup/create/post steps and exit early so the
        # user can inspect proposed mappings without any DB side-effects.
        if not options.get('commit'):
            try:
                account_manager.setup_core_accounts()
                # Prepare proposed accounts CSV path for dry-run
                context.accounts_proposed_out = options.get('accounts_out')
                if options.get('flush_db'):
                    # refuse to flush during dry-run
                    self.stdout.write(self.style.WARNING("--flush-db requested but --commit not supplied: skipping flush to avoid accidental data loss."))
                # Create per-legacy-entity accounts (dry-run will only record mapping strings)
                try:
                    account_manager.create_accounts_for_legacy()
                    self.stdout.write(self.style.SUCCESS('Proposed legacy accounts mapping generated.'))
                except Exception:
                    logger.exception('Failed to create proposed legacy accounts mapping')

                # Prepare opening transactions CSV path for dry-run
                context.opening_tx_proposed_out = options.get('opening_out')
                # Post or prepare opening balances (dry-run writes CSV, commit posts transactions)
                try:
                    account_manager.post_opening_balances()
                    self.stdout.write(self.style.SUCCESS('Opening balances processed (proposed CSV or posted).'))
                except Exception:
                    logger.exception('Failed to process opening balances')

                # write reports and exit successfully for dry-run
                try:
                    self.generate_reports(context, options)
                except Exception:
                    logger.exception('Failed to generate dry-run reports')
                self.stdout.write(self.style.NOTICE("Dry-run complete — no DB changes were committed. Run with --commit to persist."))
                return
            except Exception as e:
                logger.exception("Dry-run setup failed: %s", e)

        # COMMIT path: perform the entire import inside a single atomic block so it's
        # all-or-nothing. This groups core account creation, optional flush, legacy
        # account mapping and posting of opening balances as one transaction.
        try:
            with transaction.atomic():
                # Set up core accounts (suspense/cash etc.). This should create required GLs.
                account_manager.setup_core_accounts()
                # Prepare proposed accounts CSV path
                context.accounts_proposed_out = options.get('accounts_out')

                # If user requested a flush and wants to commit, perform a precautionary flush
                # of previously imported items for this import series before importing.
                if options.get('flush_db'):
                    try:
                        account_manager.flush_previous_import()
                        self.stdout.write(self.style.WARNING("Performed flush of previous import artifacts for this series."))
                    except Exception:
                        logger.exception('Failed to flush previous import data')

                # Create per-legacy-entity accounts (in commit mode these should map to
                # pooled accounts where applicable to avoid exhausting code ranges)
                try:
                    account_manager.create_accounts_for_legacy()
                    self.stdout.write(self.style.SUCCESS('Proposed legacy accounts mapping generated.'))
                except Exception:
                    logger.exception('Failed to create proposed legacy accounts mapping')

                # Prepare opening transactions CSV path for commit-run
                context.opening_tx_proposed_out = options.get('opening_out')
                try:
                    account_manager.post_opening_balances()
                    self.stdout.write(self.style.SUCCESS('Opening balances processed (proposed CSV or posted).'))
                except Exception:
                    logger.exception('Failed to process opening balances')

                # Attach account_manager to context for processors and helpers to use
                context.account_manager = account_manager
                # mark commit intent on context so helpers operate in commit mode
                context.commit = True
                # now continue into processors below (the with-block continues)
                # make context reflect user's choice for processors/helpers
                context.commit = bool(options.get('commit'))

                # --- Phase 1: Create tenants/clients/banks/savings GLs that grouping needs ---
                client_processor = ClientProcessor(context, account_manager)

                self.stdout.write("Processing clients (creating new clients in new schema / dry-run mapping)...")
                client_processor.process_clients()

                self.stdout.write("Processing banks (creating bank GL accounts)...")
                client_processor.process_banks()

                self.stdout.write("Processing savings accounts (creating per-client GLs if requested)...")
                client_processor.process_savings_accounts()

                # --- DB write region: guarded by a transaction.atomic() so --commit is all-or-nothing ---
                # We'll still generate reports afterwards (so you can inspect mapping/reconciliation even on rollback).
                had_exception = False
                exc_info = None

                # --- Phase 2: Transaction grouping (by legacy transaction id) ---
                try:
                    from automations.management.commands.transaction_processors.transaction_grouper import TransactionGrouper
                    grouper = TransactionGrouper(context, account_manager)
                    self.stdout.write("Running TransactionGrouper (grouped-by-transaction-id processing)...")
                    grouper.process_tx_groups()
                except Exception as e:
                    logger.warning("TransactionGrouper unavailable or failed: %s. Falling back to per-model processing.", e)
                    self.stdout.write(self.style.WARNING("TransactionGrouper missing/failed — continuing with per-model processors."))

                # --- Phase 3: Per-model processors for any records not handled by grouping ---
                def _try_run_processor(module_path, class_name, run_method):
                    try:
                        mod = __import__(module_path, fromlist=[class_name])
                        ProcClass = getattr(mod, class_name)
                        proc = ProcClass(context, account_manager)
                        getattr(proc, run_method)()
                    except ModuleNotFoundError:
                        logger.warning(" %s", module_path)
                        self.stdout.write(self.style.WARNING(f"Processor module not found: {module_path}"))
                    except Exception as e:
                        logger.exception("Processor %s.%s failed: %s", module_path, class_name, e)
                        self.stdout.write(self.style.WARNING(f"Processor {class_name} failed during run — continuing."))

                # Run processors (order chosen to minimize reconciliation / dependent posting issues)
                self.stdout.write("Processing income payments...")
                _try_run_processor('automations.management.commands.transaction_processors.income_payments', 'IncomePaymentProcessor', 'process_income_payments')

                self.stdout.write("Processing expense payments...")
                _try_run_processor('automations.management.commands.transaction_processors.expense_payments', 'ExpensePaymentProcessor', 'process_expense_payments')

                self.stdout.write("Processing loan payments...")
                _try_run_processor('automations.management.commands.transaction_processors.loan_payments', 'LoanPaymentProcessor', 'process_loan_payments')

                self.stdout.write("Processing asset records...")
                _try_run_processor('automations.management.commands.transaction_processors.asset_records', 'AssetRecordProcessor', 'process_asset_records')

                self.stdout.write("Processing bank payments...")
                _try_run_processor('automations.management.commands.transaction_processors.bank_payments', 'BankPaymentProcessor', 'process_bank_payments')

                self.stdout.write("Processing liability payments...")
                _try_run_processor('automations.management.commands.transaction_processors.liability_payments', 'LiabilityPaymentProcessor', 'process_liability_payments')

                # Finally process savings entries that were not consumed by grouping or bank processor
                self.stdout.write("Processing savings payments (fallback)...")
                _try_run_processor('automations.management.commands.transaction_processors.savings_payment_processor', 'SavingsPaymentProcessor', 'process_savings_payments')

                # If this is a dry-run, mark the transaction for rollback to ensure no DB changes persist.
                if not context.commit:
                    # ensure rollback at the end of the with-block:
                    transaction.set_rollback(True)
                    self.stdout.write(self.style.NOTICE("Dry-run mode: all DB changes in this transaction will be rolled back."))
                raise ValueError("Intentional rollback for dry-run")  # force rollback for dry-run

        except Exception as e:
            # Any exception here means the DB transaction is rolled back automatically.
            had_exception = True
            exc_info = e
            logger.exception("Import run failed; all DB changes rolled back: %s", e)
            # we do NOT re-raise yet — we want to still write mapping/reconciliation reports for debugging below.

        # --- Final: reconciliation symmetry pass; generate reports & print stats ---
        try:
            self._ensure_reconciliation_symmetry(context)
        except Exception:
            logger.exception("Reconciliation symmetry pass failed.")

        # Always generate the mapping & reconciliation reports so you can inspect output even if we rolled back.
        self.generate_reports(context, options)

        # print instrumentation stats
        print("create_transaction calls:", ctx.stats.get('create_transaction_calls'))
        print("register_tx calls:", ctx.stats.get('register_tx_calls'))
        print("register_tx success:", ctx.stats.get('register_tx_success'))

        # If an exception occurred inside the DB block, raise a CommandError now to return non-zero exit.
        if had_exception:
            raise CommandError(f"Import failed; transaction rolled back. See logs above for details: {exc_info}")

        # If commit was False, let the user know we rolled back intentionally.
        if not context.commit:
            self.stdout.write(self.style.NOTICE("Dry-run complete — no DB changes were committed. Run with --commit to persist."))
        else:
            self.stdout.write(self.style.SUCCESS("Commit complete — all changes persisted atomically."))

        # --- Final: reports & outputs ---
        try:
            self._ensure_reconciliation_symmetry(context)
        except Exception:
            logger.exception("Reconciliation symmetry pass failed.")

        self.generate_reports(context, options)
        # Inspect import_map produced by your run (works after the import run)
        # ctx = context  # just alias for brevity
        # im = getattr(ctx, 'import_map', {}) or {}
        # legacy_to_new = im.get('legacy_to_new', {}) if isinstance(im, dict) else {}

        # print("Mapped legacy items:", len(legacy_to_new))

        # # Count unique mapping targets (stringified to be safe)
        # unique_targets = set(str(v) for v in legacy_to_new.values())
        # print("Unique mapping targets (distinct tx ids/objects):", len(unique_targets))

        # # show sample mappings (first 20)
        # for i, (k,v) in enumerate(legacy_to_new.items()):
        #     if i >= 20:
        #         break
        #     print(k, "->", v)
        
        # processed_but_unmapped = []
        # for model_key, objs in (ctx.by_model or {}).items():
        #     for o in objs:
        #         if o.get('processed'):
        #             key = f"{o.get('model')}:{o.get('pk')}"
        #             if key not in legacy_to_new:
        #                 processed_but_unmapped.append((key, (o.get('fields') or {}).get('description')))

        # print("processed but unmapped count:", len(processed_but_unmapped))
        # for rec in processed_but_unmapped[:100]:
        #     print(rec)

        # import csv
        # old_recon_path = 'reconciliation_20250828144025.csv'  # change to path you saved previously
        # old_rows = []
        # with open(old_recon_path, newline='', encoding='utf-8') as fh:
        #     r = csv.DictReader(fh)
        #     for row in r:
        #         old_rows.append(row)

        # missing_now_mapped = []
        # for r in old_rows:
        #     key_model = r.get('legacy_model')
        #     key_pk = r.get('legacy_pk')
        #     if not key_model or not key_pk:
        #         continue
        #     key = f"{key_model}:{key_pk}"
        #     if key in legacy_to_new:
        #         missing_now_mapped.append((key, legacy_to_new[key]))

        # print("Old reconciliations now mapped:", len(missing_now_mapped))
        # for x in missing_now_mapped[:50]:
        #     print(x)
        
        print("create_transaction calls:", ctx.stats.get('create_transaction_calls'))
        print("register_tx calls:", ctx.stats.get('register_tx_calls'))
        print("register_tx success:", ctx.stats.get('register_tx_success'))





    # -------------------------
    # Helpers (file-level)
    # -------------------------

    # import at top of file if not already: from collections import defaultdict

    def _ensure_reconciliation_symmetry(self,ctx):
        """
        For every reconciliation entry already recorded, try to find related legacy objects
        (other fixtures sharing the same transaction id or group) and ensure they are also
        present in ctx.reconciliation. This prevents only one side (bank) showing up.
        """
        if not getattr(ctx, 'reconciliation', None):
            return

        # build a quick lookup of existing reconciliation keys to avoid duplicates
        existing_keys = set()
        for r in ctx.reconciliation:
            lm = r.get('legacy_model')
            lpk = r.get('legacy_pk')
            if lm and lpk:
                existing_keys.add(f"{lm}:{lpk}")

        # copy the list to iterate over original items only (we will append new ones)
        original = list(ctx.reconciliation)

        # helpers: find all fixtures that share a transaction id
        def objs_with_txid(txid):
            found = []
            if not txid:
                return found
            for model, objs in (ctx.by_model or {}).items():
                for o in objs:
                    if (o.get('fields') or {}).get('transaction') == txid:
                        found.append((model, o))
            return found

        for r in original:
            lm = r.get('legacy_model')
            lpk = r.get('legacy_pk')
            if not lm or not lpk:
                continue

            # support group: keys of form 'group:123' or direct pk numeric strings
            if str(lpk).startswith('group:'):
                txid = str(lpk).split(':', 1)[1]
                related = objs_with_txid(txid)
            else:
                # try to extract txid from this specific object if we can find the fixture
                try:
                    model_dict = ctx.fixtures_by_app_model_pk.get(lm, {})
                    # lpk may be like '123' or 'bank.bankpayment:123' we expect two parts, but handle single pk too
                    pk_only = str(lpk).split(':')[-1] if isinstance(lpk, str) and ':' in str(lpk) else lpk
                    o = model_dict.get(int(pk_only)) if isinstance(pk_only, (int, str)) and str(pk_only).isdigit() else model_dict.get(pk_only)
                    txid = (o.get('fields') or {}).get('transaction') if o else None
                    related = objs_with_txid(txid) if txid else []
                except Exception:
                    related = []

            # add entries for related objects if not already present
            for model, o in related:
                key = f"{model}:{o.get('pk')}"
                if key in existing_keys:
                    continue
                # create reconciliation row mirroring the original reason / desc
                try:
                    ctx.reconciliation.append({
                        'legacy_model': model,
                        'legacy_pk': o.get('pk'),
                        'reason': f"paired_with_{lm.replace('.', '_')}",
                        'desc': (o.get('fields') or {}).get('description'),
                        'amount': str((o.get('fields') or {}).get('amount') or '')
                    })
                    existing_keys.add(key)
                except Exception:
                    logger.exception("Failed to append paired reconciliation for %s", key)

    # ... in handle() after processors ran, before self.generate_reports(...)
    # call:

    def load_fixture_data(self, context, filepath):
        """Load and parse the fixture JSON file into context.by_model and fixtures_by_app_model_pk"""
        if not os.path.exists(filepath):
            raise CommandError(f"File not found: {filepath}")

        encodings = ['utf-8', 'utf-16', 'latin1', 'cp1252']
        raw = None
        for encoding in encodings:
            try:
                with open(filepath, 'r', encoding=encoding) as fh:
                    raw = json.load(fh)
                    logger.info("Successfully loaded JSON file with encoding %s", encoding)
                    break
            except (UnicodeDecodeError, json.JSONDecodeError) as e:
                logger.warning("Error reading JSON with %s encoding: %s", encoding, e)
                continue

        if raw is None:
            return False

        # Reformat into model -> list dict and fixtures_by_app_model_pk
        for obj in raw:
            #make sure pending cash transfers are excluded
            if obj.get('model') == 'bank.pendingcashtransfer':
                continue
            model = obj.get('model')
            context.by_model.setdefault(model, []).append(obj)
            context.fixtures_by_app_model_pk.setdefault(model, {})[obj['pk']] = obj

        return True



    def generate_reports(self, context, options):
        """Generate mapping & reconciliation files and a human readable report file (robust)."""
        ts = datetime.utcnow().strftime('%Y%m%d%H%M%S')
        mapping_out = options.get('mapping_out') or f"import_map_{ts}.json"
        recon_out = options.get('reconciliation_out') or f"reconciliation_{ts}.csv"

        # --- Write mapping file ---
        try:
            with open(mapping_out, 'w', encoding='utf-8') as mfile:
                json.dump(context.import_map, mfile, indent=2, default=str)
        except Exception as e:
            logger.exception("Failed to write mapping file: %s", e)
            self.stdout.write(self.style.WARNING(f"Failed to write mapping file: {e}"))

        # --- Write reconciliation CSV (normalize keys across rows) ---
        try:
            recon_rows = context.reconciliation or []
            if recon_rows:
                # union of keys
                all_keys = set()
                for r in recon_rows:
                    if isinstance(r, dict):
                        all_keys.update(r.keys())
                keys = sorted(all_keys)
                with open(recon_out, 'w', newline='', encoding='utf-8') as rfile:
                    writer = csv.DictWriter(rfile, fieldnames=keys)
                    writer.writeheader()
                    for row in recon_rows:
                        out = {k: (row.get(k, '') if isinstance(row, dict) else '') for k in keys}
                        writer.writerow(out)
        except Exception as e:
            logger.exception("Failed to write reconciliation CSV: %s", e)
            self.stdout.write(self.style.WARNING(f"Failed to write reconciliation CSV: {e}"))

        # --- Read tx_group_audit (if any) ---
        audit_filename_candidates = [
            options.get('tx_group_audit') or 'tx_group_audit.csv',
            'tx_group_audit.csv',
        ]
        audit_rows = []
        audit_path_used = None
        for fn in audit_filename_candidates:
            try:
                if fn and os.path.exists(fn):
                    with open(fn, newline='', encoding='utf-8') as fh:
                        reader = csv.DictReader(fh)
                        for r in reader:
                            audit_rows.append(dict(r))
                    audit_path_used = fn
                    break
            except Exception:
                logger.exception("Failed to parse tx_group_audit file: %s", fn)

        # --- Build reconciliation index mapping by normalized legacy_pk string ---
        recon_by_pk = {}
        for r in (context.reconciliation or []):
            if not isinstance(r, dict):
                continue
            pk_raw = r.get('legacy_pk') or r.get('legacy_id') or r.get('legacy_model') or ''
            pk = str(pk_raw) if pk_raw is not None else ''
            if not pk:
                # create a fallback synthetic key
                pk = f"rowidx:{len(recon_by_pk)}"
            recon_by_pk.setdefault(pk, []).append(r)

        # --- If no audit rows, synthesize from reconciliation entries that contain group: keys ---
        if not audit_rows:
            for pk, rlist in recon_by_pk.items():
                # include only group: entries or reason indicates combined
                if pk.startswith('group:') or any(('group:' in str(x.get('legacy_pk','')) or x.get('reason','').startswith('combined')) for x in rlist):
                    for r in rlist:
                        audit_rows.append({
                            'ts': '',
                            'bank_pk': pk,
                            'entries_repr': r.get('entries') or r.get('entries_repr') or '',
                            'debits': r.get('debits', ''),
                            'credits': r.get('credits', ''),
                            'diff': r.get('amount', '') or r.get('diff',''),
                            'note': r.get('reason',''),
                        })
            # If still empty, leave audit_rows empty (no data)

        # --- Merge audits with reconciliation info into merged_rows ---
        merged_rows = []
        for ar in audit_rows:
            bank_pk = ar.get('bank_pk') or ar.get('group_key') or ''
            bank_pk_s = str(bank_pk) if bank_pk is not None else ''
            entries_repr = ar.get('entries_repr') or ''
            debits = ar.get('debits') or ar.get('debit') or ''
            credits = ar.get('credits') or ar.get('credit') or ''
            diff_raw = ar.get('diff') or ar.get('difference') or ''
            note = ar.get('note') or ''

            # try to parse diff to Decimal safely
            try:
                diff_val = Decimal(str(diff_raw)) if diff_raw != '' else Decimal('0.00')
            except (InvalidOperation, TypeError):
                diff_val = None

            # Try to find matching recon entries using normalized pk string
            matched_recon = recon_by_pk.get(bank_pk_s, [])

            merged = {
                'bank_pk': bank_pk_s,
                'entries_repr': entries_repr,
                'debits': debits,
                'credits': credits,
                'diff': str(diff_val) if diff_val is not None else str(diff_raw),
                'note': note,
                'recon_count': len(matched_recon),
                'recon_reasons': ';'.join(sorted({str(r.get('reason','')) for r in matched_recon})),
                'recon_details': json.dumps(matched_recon, default=str),
            }
            merged_rows.append(merged)

        # Include reconciliation-only groups not in audit_rows (synthesized)
        seen_group_keys = {r.get('bank_pk') for r in merged_rows if r.get('bank_pk')}
        for pk, rl in recon_by_pk.items():
            if pk.startswith('group:') and pk not in seen_group_keys:
                example = rl[0]
                merged_rows.append({
                    'bank_pk': pk,
                    'entries_repr': example.get('entries') or example.get('entries_repr',''),
                    'debits': example.get('debits',''),
                    'credits': example.get('credits',''),
                    'diff': example.get('amount',''),
                    'note': ';'.join(sorted({str(d.get('reason','')) for d in rl})),
                    'recon_count': len(rl),
                    'recon_reasons': ';'.join(sorted({str(d.get('reason','')) for d in rl})),
                    'recon_details': json.dumps(rl, default=str)
                })

        merged_audit_csv = f"tx_group_audit_{ts}.csv"
        try:
            if merged_rows:
                keys = ['bank_pk','entries_repr','debits','credits','diff','note','recon_count','recon_reasons','recon_details']
                with open(merged_audit_csv, 'w', newline='', encoding='utf-8') as mf:
                    w = csv.DictWriter(mf, fieldnames=keys)
                    w.writeheader()
                    for r in merged_rows:
                        w.writerow({k: r.get(k, '') for k in keys})
                self.stdout.write(self.style.WARNING(f"Transaction group audit CSV: {merged_audit_csv}"))
        except Exception:
            logger.exception("Failed to write merged tx group audit CSV")

        # --- Human readable detailed report ---
        detailed_txt = f"import_report_{ts}.txt"
        try:
            summary_lines = []
            total_groups = len(merged_rows)
            # consider balanced if diff is 0 or within 0.01
            balanced = []
            unbalanced = []
            for r in merged_rows:
                diff_s = r.get('diff','')
                try:
                    d = Decimal(str(diff_s))
                    if abs(d) <= Decimal('0.01'):
                        balanced.append(r)
                    else:
                        unbalanced.append(r)
                except Exception:
                    # treat invalid parse as unbalanced (so you can inspect)
                    unbalanced.append(r)

            summary_lines.append(f"Import run report: {ts}")
            summary_lines.append(f"Mapping file: {mapping_out}")
            summary_lines.append(f"Reconciliation CSV: {recon_out if recon_rows else '(none)'}")
            summary_lines.append(f"Transaction group audit CSV: {merged_audit_csv if merged_rows else '(none)'}")
            summary_lines.append("")
            summary_lines.append(f"Total audited groups: {total_groups}")
            summary_lines.append(f"Balanced groups: {len(balanced)}")
            summary_lines.append(f"Unbalanced groups: {len(unbalanced)}")
            summary_lines.append("")

            summary_lines.append("Balanced groups (sample):")
            for r in balanced[:50]:
                # try to extract new_tx_id if present in reconciliations
                new_tx = ''
                try:
                    recon_details = json.loads(r.get('recon_details') or '[]')
                    for d in recon_details:
                        if d.get('reason') == 'combined_balanced' and d.get('new_tx_id'):
                            new_tx = d.get('new_tx_id')
                            break
                except Exception:
                    new_tx = ''
                summary_lines.append(f" * group={r.get('bank_pk')} diff={r.get('diff')} new_tx={new_tx} entries={r.get('entries_repr')[:200]}")
            summary_lines.append("")

            summary_lines.append("Unbalanced groups (detailed):")
            for r in unbalanced:
                summary_lines.append("-" * 80)
                summary_lines.append(f"Group: {r.get('bank_pk')}")
                summary_lines.append(f"Diff: {r.get('diff')}")
                summary_lines.append(f"Entries repr: {r.get('entries_repr')}")
                summary_lines.append(f"Debits: {r.get('debits')}, Credits: {r.get('credits')}")
                summary_lines.append(f"Note: {r.get('note')}")
                try:
                    recon_details = json.loads(r.get('recon_details') or '[]')
                except Exception:
                    recon_details = []
                if recon_details:
                    summary_lines.append("Reconciliation items:")
                    for d in recon_details:
                        summary_lines.append(f"  - legacy_model={d.get('legacy_model')} legacy_pk={d.get('legacy_pk')} reason={d.get('reason')} amount={d.get('amount')} desc={d.get('desc')}")
                summary_lines.append("")

            with open(detailed_txt, 'w', encoding='utf-8') as df:
                df.write('\n'.join(summary_lines))

            self.stdout.write(self.style.WARNING(f"Detailed report: {detailed_txt}"))
        except Exception:
            logger.exception("Failed to generate detailed report")
            self.stdout.write(self.style.WARNING("Detailed report generation failed."))

        if not context.commit:
            self.stdout.write(self.style.NOTICE("Dry-run complete — no DB changes were committed. Run with --commit to persist."))

