"""
Check for transactions posted directly to parent accounts (which is wrong)
"""
from django.core.management.base import BaseCommand
from accounts.models import Account
from transactions.models import TransactionEntry
from django.db.models import Sum, Count


class Command(BaseCommand):
    help = 'Find transactions posted directly to parent accounts'
    
    def handle(self, *args, **options):
        # Find all parent accounts
        parent_accounts = Account.objects.filter(
            account_level='PARENT'
        )
        
        self.stdout.write(f"\nChecking {parent_accounts.count()} parent accounts...\n")
        
        problematic_accounts = []
        
        for account in parent_accounts:
            # Check if this parent has any transaction entries
            entry_count = TransactionEntry.objects.filter(
                account=account
            ).count()
            
            if entry_count > 0:
                # Calculate balance
                debits = TransactionEntry.objects.filter(
                    account=account,
                    side='DR'
                ).aggregate(total=Sum('amount'))['total'] or 0
                
                credits = TransactionEntry.objects.filter(
                    account=account,
                    side='CR'
                ).aggregate(total=Sum('amount'))['total'] or 0
                
                balance = debits - credits if account.account_type in ['ASSET', 'EXPENSE'] else credits - debits
                
                problematic_accounts.append({
                    'account': account,
                    'entry_count': entry_count,
                    'balance': balance,
                    'debits': debits,
                    'credits': credits
                })
                
                self.stdout.write(
                    self.style.ERROR(
                        f"❌ PARENT ACCOUNT WITH TRANSACTIONS: {account.code} - {account.name}"
                    )
                )
                self.stdout.write(f"   Type: {account.account_type}")
                self.stdout.write(f"   Entry count: {entry_count}")
                self.stdout.write(f"   Debits: {debits:,.2f}")
                self.stdout.write(f"   Credits: {credits:,.2f}")
                self.stdout.write(f"   Balance: {balance:,.2f}\n")
                
                # Show sample transactions
                entries = TransactionEntry.objects.filter(
                    account=account
                ).select_related('transaction')[:5]
                
                self.stdout.write("   Recent entries:")
                for entry in entries:
                    self.stdout.write(
                        f"     - {entry.transaction.date} | {entry.side} {entry.amount:,.2f} | "
                        f"{entry.transaction.description}"
                    )
                self.stdout.write("")
        
        if problematic_accounts:
            self.stdout.write(
                self.style.WARNING(
                    f"\n⚠️  Found {len(problematic_accounts)} parent accounts with direct postings!"
                )
            )
            self.stdout.write("\nThese transactions should be moved to child accounts.")
            self.stdout.write("Parent accounts are for grouping only - they should NEVER have transactions.\n")
        else:
            self.stdout.write(
                self.style.SUCCESS('\n✓ No parent accounts have direct transactions - all good!')
            )
