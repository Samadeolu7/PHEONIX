# automations/management/commands/transaction_processors/asset_records.py
from decimal import Decimal
from transactions.models import TransactionEntry

from .base_processor import BaseTransactionProcessor

class AssetRecordProcessor(BaseTransactionProcessor):
    """Process asset record transactions"""
    
    def __init__(self, context, account_manager):
        super().__init__(context, account_manager)
        
    def process_asset_records(self):
        """asset.assetrecord → debit fixed asset or inventory, credit Suspense/supplier/bank."""
        key = 'asset.assetrecord'
        objs = self.context.by_model.get(key, [])
        
        for obj in objs:
            pk = obj['pk']
            f = obj['fields']
            qty = int(f.get('quantity') or 1)
            price = self.context.to_dec(f.get('price'))
            amount = price * qty

            # Parse date
            date, base_dt = self.context.parse_date(f, 'payment_date', 'created_at')

            # Determine debit account
            if f.get('fixed_asset'):
                dr = self.context.fixed_asset_acc
            elif f.get('inventory'):
                dr = self.context.inventory_acc
            else:
                dr = self.context.suspense_acc
                print(f"[WARN] Asset record #{pk} has no fixed asset or inventory linked; using suspense account.")
                self.context.reconciliation.append({
                    'legacy_model': key, 'legacy_pk': pk,
                    'reason': 'unknown_asset_or_inventory', 'amount': str(amount)
                })

            # Create transaction entries
            entries = [
                {'account': dr,                  'side': TransactionEntry.DEBIT,  'amount': amount},
                {'account': self.context.suspense_acc,   'side': TransactionEntry.CREDIT, 'amount': amount},
            ]
            
            desc = self.context.norm_str(f.get('description')) or f"Asset record #{pk}"
            txobj = self.create_transaction(entries, desc, workflow_reference=f"legacy:{key}:{pk}", date=date)
            self.context.register_tx(key, pk, txobj)