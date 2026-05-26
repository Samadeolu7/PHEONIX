from django.contrib.auth import get_user_model
from branches.models import Branch

User = get_user_model()
user = User.objects.first()
branch = Branch.objects.first()

if user:
    print(f'Owner ID: {user.id}')
    print(f'Owner username: {user.username}')
else:
    print('No users found in database')

if branch:
    print(f'Branch ID: {branch.id}')
    print(f'Branch name: {branch.name}')
else:
    print('No branches found in database')
