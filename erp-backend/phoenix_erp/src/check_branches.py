from branches.models import Branch

branches = Branch.objects.all()
if branches.exists():
    print(f'Found {branches.count()} branches:')
    for b in branches[:5]:
        print(f'  ID: {b.id}, Name: {b.name}')
else:
    print('No branches found in database')
    print('Creating a default branch...')
    
    from django.contrib.auth import get_user_model
    User = get_user_model()
    admin = User.objects.first()
    
    if admin:
        branch = Branch.objects.create(
            name='Main Branch',
            code='MAIN',
            owner=admin,
            is_active=True
        )
        print(f'Created branch ID: {branch.id}, Name: {branch.name}')
    else:
        print('ERROR: No users found to create branch')
