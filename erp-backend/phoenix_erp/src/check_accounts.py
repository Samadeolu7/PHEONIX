#!/usr/bin/env python
import django
import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
django.setup()

from transactions.models import Transaction, TransactionEntry
from accounts.models import Account
from incomes.models import Invoice

print("=" * 60)
print("CHECKING RECENT INVOICES AND JOURNALS")
print("=" * 60)

try:
    # Check recent invoices
    invoices = Invoice.objects.order_by('-updated_at')[:5]
    print(f"\nRecent Invoices:")
    for inv in invoices:
        print(f"  Invoice: {inv.invoice_number} (ID: {inv.id})")
        print(f"    Amount: {inv.amount}, Paid: {inv.amount_paid}, Status: {inv.status}")
        print(f"    Updated: {inv.updated_at}")
        print()
    
    # Check recent transactions
    transactions = Transaction.objects.order_by('-created_at')[:5]
    print(f"\nRecent Transactions:")
    for tx in transactions:
        print(f"  Journal ID: {tx.id}, Ref: {tx.workflow_reference}")
        print(f"    Approved: {tx.approved}, Date: {tx.date}")
        print(f"    Entries:")
        for e in tx.entries.all():
            print(f"      - {e.account.code} ({e.account.name}): {e.side} {e.amount}, Posted: {e.posted}")
        print()
    
    print("\n" + "=" * 60)
    print("CHECKING ACCOUNTS WITH NON-ZERO BALANCES")
    print("=" * 60)
    
    accounts = Account.objects.all_tenants().exclude(balance=0).order_by('code')
    if accounts.count() == 0:
        print("❌ NO ACCOUNTS HAVE NON-ZERO BALANCES!")
    else:
        for acc in accounts[:20]:  # Show first 20
            print(f"{acc.code} - {acc.name}: {acc.balance} ({acc.account_type})")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
