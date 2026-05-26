from decimal import Decimal
from accounts.models import  Account, AccountCategory, AccountClassification
from incomes.models import FeeConfiguration, IncomeCategory

def setup_income_types(commit, owner, branch):
    """Setup default income types"""
    types = {
        'registration': {
            'code': 'REG',
            'description': 'Registration fees'
        },
        'processing': {
            'code': 'PROC',
            'description': 'Processing fees'
        },
        'service': {
            'code': 'SERV',
            'description': 'Service fees'
        },
        'penalty': {
            'code': 'PEN',
            'description': 'Penalty fees'
        },
        'commission': {
            'code': 'COMM',
            'description': 'Commission income'
        }
    }
    
    income_type_map = {}
    
    if commit:
        # Create income account category if not exists
        income_cat = AccountCategory.objects.get_or_create(
            section=4,
            defaults={'name': 'Income'}
        )[0]
        
        # Get or create income classification
        classification = AccountClassification.objects.get_or_create(
            name='Fees'
        )[0]
        
        for name, details in types.items():
            # Create GL account for this income type
            account = Account.objects.get_or_create(
                branch=branch,
                code=f"4{details['code']}",
                defaults={
                    'name': name.replace('_', ' ').title(),
                    'category': income_cat,
                    'classification': classification,
                    'owner': owner,
                    'created_by': owner
                }
            )[0]
            
            # Create income type
            rev_type, created = IncomeCategory.objects.get_or_create(
                code=details['code'],
                branch=branch,
                defaults={
                    'name': name.replace('_', ' ').title(),
                    'description': details['description'],
                    'gl_account': account,
                    'owner': owner,
                    'created_by': owner
                }
            )
            income_type_map[name] = rev_type
            
    return income_type_map

def register_fee_config(obj, commit, owner, branch, income_type_map):
    """Register a fee configuration from legacy data"""
    if not commit:
        return f"DRY_FEE_{obj['model']}_{obj['pk']}"
        
    fields = obj['fields']
    model_name = obj['model'].split('.')[-1].lower()
    
    # Map legacy fee types to income types
    type_mapping = {
        'registrationfee': 'registration',
        'idfee': 'processing',
        'loanregistrationfee': 'registration',
        'loanservicefee': 'service',
        'riskpremium': 'service',
        'unioncontribution': 'commission'
    }
    
    income_type = income_type_map.get(type_mapping.get(model_name, 'commission'))
    if not income_type:
        return None
        
    # Create fee configuration
    fee = FeeConfiguration.objects.create(
        name=fields.get('name', '').title() or model_name.replace('_', ' ').title(),
        code=f"{income_type.code}{obj['pk']}",
        description=fields.get('description', '') or f"Legacy {model_name}",
        income_category=income_type,
        amount=Decimal(str(fields.get('amount', '0'))),
        rate=Decimal(str(fields.get('rate', '0'))),
        is_percentage=bool(fields.get('rate')),
        owner=owner,
        created_by=owner,
        branch=branch
    )
    
    return fee.pk
