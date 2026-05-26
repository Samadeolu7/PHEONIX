from decimal import Decimal
from django.utils import timezone
from accounts.models import Account, AccountCategory, AccountClassification
from expenses.models import ExpenseCategory, ExpenseClaim
from django.contrib.auth import get_user_model

User = get_user_model()

def setup_expense_categories(commit, owner, branch):
    """Setup default expense categories"""
    if not commit:
        return {}
    categories = {
        'salaries': {
            'code': 'SAL',
            'description': 'Staff salaries and wages'
        },
        'rent': {
            'code': 'RENT', 
            'description': 'Office rent and property costs'
        },
        'utilities': {
            'code': 'UTIL',
            'description': 'Electricity, water and other utilities'
        },
        'office_supplies': {
            'code': 'OFF',
            'description': 'Office supplies and stationery'
        },
        'travel': {
            'code': 'TRAV',
            'description': 'Travel and transportation'
        },
        'maintenance': {
            'code': 'MAINT',
            'description': 'Equipment and building maintenance'
        },
        'miscellaneous': {
            'code': 'MISC',
            'description': 'Other expenses'
        }
    }
    
    category_map = {}
    
    if commit:
        # Create expense account category if not exists
        expense_cat = AccountCategory.objects.get_or_create(
            section=5,
            defaults={
                'name': 'Expenses',
                'code_prefix': 'EXP',
                'owner': owner,
                'created_by': owner,
                'branch': branch
            }
        )[0]
        
        # Get or create expense classification
        classification = AccountClassification.objects.get_or_create(
            name='Expenses'
        )[0]
        
        for name, details in categories.items():
            # Create GL account for this expense type
            account = Account.objects.get_or_create(
                branch=branch,
                code=f"5{details['code']}",
                defaults={
                    'name': name.replace('_', ' ').title(),
                    'category': expense_cat,
                    'classification': classification,
                    'owner': owner,
                    'created_by': owner
                }
            )[0]
            
            # Create expense category
            cat, created = ExpenseCategory.objects.get_or_create(
                code=details['code'],
                branch=branch,
                defaults={
                    'name': name.replace('_', ' ').title(),
                    'description': details['description'],
                    'expense_account': account,
                    'owner': owner,
                    'created_by': owner
                }
            )
            category_map[name] = cat
            
    return category_map

def import_expense(obj, commit, owner, branch, category_map):
    """Import a single expense record"""
    if not commit:
        return f"DRY_EXPENSE_{obj['pk']}"
        
    fields = obj['fields']
    name = fields.get('name', '').lower()
    
    # Try to match category
    category = None
    for cat_name, cat_obj in category_map.items():
        if cat_name in name or name in cat_name:
            category = cat_obj
            break
            
    if not category:
        # Default to miscellaneous
        category = category_map.get('miscellaneous')
        
    if not category:
        return None
        
    # Create expense claim
    claim = ExpenseClaim.objects.create(
        staff=owner.staff if hasattr(owner, 'staff') else None,  # Fallback to owner
        category=category,
        amount=Decimal(str(fields.get('amount', '0'))),
        description=fields.get('description', '') or name,
        status='paid' if fields.get('paid', False) else 'submitted',
        payment_reference=fields.get('reference', ''),
        paid_date=fields.get('paid_date') or timezone.now().date() if fields.get('paid', False) else None,
        owner=owner,
        created_by=owner,
        branch=branch
    )
    
    return claim.pk
