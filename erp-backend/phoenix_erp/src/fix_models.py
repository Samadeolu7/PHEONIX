import os

def fix_models():
    model_files = [
        'hr/models.py',
        'savings/models.py',
        'tickets/models.py',
        'procurement/models.py',
        'loans/models.py',
        'products/models.py',
        'inventory/models.py'
    ]
    
    replacement = '    objects = OwnerBranchManager()\n    all_objects = OwnerBranchManager(include_deleted=True)'
    
    for model_file in model_files:
        with open(model_file, 'r') as f:
            content = f.read()
        
        # Replace all variations of the manager assignment
        content = content.replace(
            '    objects      = OwnerBranchManager()\n    all_objects  = OwnerBranchManager(include_deleted=True)',
            replacement
        )
        content = content.replace(
            '    objects = OwnerBranchManager()\n    all_objects = OwnerBranchManager(include_deleted=True)',
            replacement
        )
        content = content.replace(
            '    objects   = OwnerBranchManager()\n    all_objects   = OwnerBranchManager(include_deleted=True)',
            replacement
        )
        
        with open(model_file, 'w') as f:
            f.write(content)

if __name__ == '__main__':
    fix_models()
