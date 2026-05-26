"""
Fix IncomeCategory records that are pointing to parent accounts
Creates proper child accounts and updates the categories
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from incomes.models import IncomeCategory
from accounts.models import Account
from accounts.utils.account_creation import get_or_create_child_account


class Command(BaseCommand):
    help = 'Fix IncomeCategory records pointing to parent accounts'
    
    def handle(self, *args, **options):
        # Find all income categories pointing to parent accounts
        problematic_categories = IncomeCategory.objects.filter(
            income_account__account_level='PARENT'
        ).select_related('income_account', 'tenant')
        
        fixed_count = 0
        
        for category in problematic_categories:
            parent_account = category.income_account
            self.stdout.write(
                f"\nFixing {category.name} (code: {category.code})"
            )
            self.stdout.write(
                f"  Currently points to PARENT: {parent_account.code} - {parent_account.name}"
            )
            
            # Determine child account code based on category
            child_suffix_map = {
                'TUITION': '001',
                'BOOKS': '002',
                'TRANSPORT': '003',
                'UNIFORM': '004',
                'EXAM': '005',
            }
            
            child_suffix = child_suffix_map.get(category.code, '001')
            
            # Get owner from category
            owner = category.owner
            branch = category.branch
            
            # Create or get child account
            child_account = get_or_create_child_account(
                parent_code=parent_account.code,
                child_suffix=child_suffix,
                name=f"{category.name} Revenue",
                account_type='INCOME',
                owner=owner,
                branch=branch,
                parent_name=parent_account.name
            )
            
            self.stdout.write(
                f"  Created/found CHILD: {child_account.code} - {child_account.name}"
            )
            
            # Update category to use child account
            category.income_account = child_account
            category.save()
            
            self.stdout.write(
                self.style.SUCCESS(f"  ✓ Fixed {category.name}")
            )
            
            fixed_count += 1
        
        if fixed_count == 0:
            self.stdout.write(
                self.style.SUCCESS('\n✓ No problematic categories found - all good!')
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(f'\n✓ Fixed {fixed_count} income categories')
            )
