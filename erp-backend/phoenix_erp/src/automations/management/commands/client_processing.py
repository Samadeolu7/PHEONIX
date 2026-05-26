# automations/management/commands/client_processing.py
from django.utils import timezone
from clients.models import Client as NewClient
from clients.models import ClientNote

class ClientProcessor:
    """Process client-related data"""
    
    def __init__(self, context, account_manager):
        self.context = context
        self.account_manager = account_manager
        
    def process_clients(self):
        """Process client records"""
        for obj in self.context.by_model.get('client.client', []):
            pk = obj['pk']
            fields = obj['fields']
            name = fields.get('name', '').strip() or f"legacy_client_{pk}"
            
            # Split name into parts
            name_parts = name.split()
            if len(name_parts) > 1:
                first_name = ' '.join(name_parts[:-1])
                last_name = name_parts[-1]
            else:
                first_name = name
                last_name = f"Unknown_{pk}"
            
            # Create new Client record if commit
            if self.context.commit:
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
                    owner=self.context.owner,
                    created_by=self.context.owner,
                    branch=self.context.branch,
                    gender='other',
                    status='active',
                    kyc_status='pending'
                )
                self.context.import_map['clients'][pk] = new_client.pk
                self.context.import_map['legacy_to_new'][f"client.client:{pk}"] = new_client.pk
                
                # Add note about legacy import
                ClientNote.objects.create(
                    client=new_client,
                    note_type='general',
                    title='Legacy Data Import',
                    content=f'Client data imported from legacy system. Original ID: {pk}',
                    owner=self.context.owner,
                    created_by=self.context.owner,
                    branch=self.context.branch
                )
            else:
                # dry-run stub
                self.context.import_map['clients'][pk] = f"DRY_CLIENT_{pk}"
                self.context.import_map['legacy_to_new'][f"client.client:{pk}"] = f"DRY_CLIENT_{pk}"
                
    def process_banks(self):
        """Process bank records"""
        for obj in self.context.by_model.get('bank.bank', []):
            pk = obj['pk']
            fields = obj['fields']
            bank_name = fields.get('name') or f"bank_{pk}"
            if self.context.commit:
                acct = self.account_manager.get_or_create_bank_account(pk, bank_name)
                self.context.import_map['banks'][pk] = acct.pk
            else:
                self.context.import_map['banks'][pk] = f"DRY_BANK_{pk}"
                
    def process_savings_accounts(self):
        """Process savings account records"""
        for obj in self.context.by_model.get('savings.savings', []):
            pk = obj['pk']
            fields = obj['fields']
            client_legacy_id = fields.get('client')
            client_name = None

            if client_legacy_id:
                client_obj = self.context.fixtures_by_app_model_pk.get('client.client', {}).get(client_legacy_id, {})
                if client_obj:
                    client_name = client_obj['fields'].get('name')

            if self.context.commit:
                from savings.models import SavingsAccount
                from clients.models import Client
                import logging
                logger = logging.getLogger(__name__)

                client = None
                if client_legacy_id:
                    client = Client.objects.filter(pk=self.context.import_map['clients'].get(client_legacy_id)).first()

                if client:
                    # Create the GL account first (idempotent)
                    gl_account = self.account_manager.get_or_create_client_account(client_legacy_id, client_name or f"client_{client_legacy_id}")
                    self.context.import_map['accounts'][f"client_{client_legacy_id}"] = gl_account.pk

                    # Determine appropriate savings product (account_manager should provide fallback)
                    amount = fields.get('balance') or 0
                    product = None
                    try:
                        # if account_manager has get_default_product, use it; else fallback to None
                        if hasattr(self.account_manager, 'get_default_product'):
                            product = self.account_manager.get_default_product('SAVINGS', self.context.to_dec(amount))
                    except Exception:
                        logger.exception("get_default_product failed; will try to use fallback product")
                        product = None

                    if not product:
                        # attempt to find or create a fallback product (idempotent)
                        from products.models import Product
                        product, _ = Product.objects.get_or_create(
                            branch=self.context.branch,
                            code='IMPORTED_DEFAULT_SAV',
                            defaults={
                                'name': 'Imported Default Savings Product',
                                'product_class': 'FINANCIAL',
                                'product_type': getattr(Product, 'SAVINGS', 'SAVINGS') if hasattr(Product, 'SAVINGS') else 'SAVINGS',
                                'interest_rate': 0,
                                'minimum_amount': 0,
                            }
                        )

                    # parse opened_on safely (use context.parse_date if available)
                    opened_on = None
                    try:
                        if hasattr(self.context, 'parse_date'):
                            opened_on_parsed, opened_on_dt = self.context.parse_date(fields, 'opened_on', 'created_at')
                            opened_on = opened_on_parsed or None
                        else:
                            opened_on = fields.get('opened_on')
                    except Exception:
                        opened_on = None

                    if not opened_on:
                        opened_on = timezone.now().date()

                    # Check if SavingsAccount for this GL account already exists (one-to-one)
                    existing = SavingsAccount.objects.filter(account=gl_account).first()
                    if existing:
                        # Update balances/fields if you want, and map it
                        try:
                            desired = self.context.to_dec(fields.get('balance') or existing.current_balance)
                            current = existing.current_balance or Decimal('0.00')
                            delta = desired - current

                            # When committing, record an opening/adjustment transaction instead
                            # of directly mutating balances. This keeps a proper audit trail.
                            if self.commit and delta != 0:
                                from django.db import transaction as db_transaction
                                from django.utils import timezone
                                from transactions.models import Transaction, TransactionEntry, TransactionSeries
                                from django.conf import settings

                                try:
                                    series_code = getattr(settings, 'DEFAULT_TRANSACTION_SERIES', None)
                                    series = TransactionSeries.objects.get(code=series_code) if series_code else TransactionSeries.objects.first()
                                except Exception:
                                    series = TransactionSeries.objects.first()

                                try:
                                    with db_transaction.atomic():
                                        tx = Transaction.objects.create(
                                            series=series,
                                            date=timezone.localdate(),
                                            workflow_reference=None,
                                            description=f"IMPORT OPENING BALANCE: client {client.pk}",
                                            owner=self.context.owner,
                                            branch=self.context.branch,
                                            created_by=self.context.owner,
                                        )

                                        account = gl_account
                                        pool = getattr(self, 'savings_pool_acc', None)
                                        if pool is None:
                                            raise RuntimeError("Savings pool account not configured for import; cannot post opening balance")

                                        # Determine which side will produce a positive change for the account
                                        is_debit_normal = account.account_type in [account.ASSET, account.EXPENSE]
                                        if delta > 0:
                                            primary_side = TransactionEntry.DEBIT if is_debit_normal else TransactionEntry.CREDIT
                                        else:
                                            primary_side = TransactionEntry.CREDIT if is_debit_normal else TransactionEntry.DEBIT

                                        amt = abs(delta)
                                        primary_entry = TransactionEntry.objects.create(
                                            transaction=tx,
                                            account=account,
                                            side=primary_side,
                                            amount=amt,
                                        )

                                        counter_side = TransactionEntry.CREDIT if primary_side == TransactionEntry.DEBIT else TransactionEntry.DEBIT
                                        counter_entry = TransactionEntry.objects.create(
                                            transaction=tx,
                                            account=pool,
                                            side=counter_side,
                                            amount=amt,
                                        )

                                        tx.full_clean()

                                        # Lock and post
                                        from accounts.models import Account as _Account
                                        _Account.objects.select_for_update().filter(pk__in=[account.pk, pool.pk])
                                        primary_entry.post()
                                        counter_entry.post()
                                except Exception:
                                    logger.exception("Failed to post import opening balance transaction for account %s", gl_account.pk)
                            else:
                                # dry-run or no delta: update local fields (no ledger entry)
                                existing.current_balance = desired
                                existing.available_balance = desired
                                # do not blindly overwrite opened_on/product if already set; update where missing
                                if not existing.opened_on:
                                    existing.opened_on = opened_on
                                if not existing.product:
                                    existing.product = product
                                existing.save(update_fields=['current_balance', 'available_balance', 'opened_on', 'product'])
                        except Exception:
                            logger.exception("Failed to update existing SavingsAccount for account %s", gl_account.pk)
                        self.context.import_map['savings_accounts'][pk] = existing.pk
                    else:
                        # create new savings account (safe creation)
                        try:
                            savings = SavingsAccount.objects.create(
                                client=client,
                                account=gl_account,
                                product=product,
                                account_number=fields.get('account_number') or f"SAV{pk:06d}",
                                opened_on=opened_on,
                                interest_rate=fields.get('interest_rate') or getattr(product, 'interest_rate', 0),
                                current_balance=self.context.to_dec(amount),
                                available_balance=self.context.to_dec(amount),
                                interest_calculation_method='daily',
                                owner=self.context.owner,
                                created_by=self.context.owner,
                                branch=self.context.branch
                            )
                            self.context.import_map['savings_accounts'][pk] = savings.pk
                        except Exception:
                            logger.exception("Failed to create SavingsAccount for legacy pk %s (account=%s)", pk, gl_account.pk)
            else:
                # dry-run mapping
                if client_legacy_id:
                    self.context.import_map['accounts'][f"client_{client_legacy_id}"] = f"DRY_ACC_CLIENT_{client_legacy_id}"
                self.context.import_map['savings_accounts'][pk] = f"DRY_SAVINGS_{pk}"
