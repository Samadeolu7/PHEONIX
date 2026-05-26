"""
Direct test of AccountCategoryViewSet to debug 405 error
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
django.setup()

from rest_framework.test import APIRequestFactory, force_authenticate
from django.contrib.auth import get_user_model
from branches.models import Branch
from accounts.views import AccountCategoryViewSet

User = get_user_model()

# Create test data
from datetime import datetime
timestamp = datetime.now().strftime('%Y%m%d%H%M%S%f')

branch = Branch.objects.create(name=f'Test Branch {timestamp}', code=f'TB{timestamp[:8]}')
user = User.objects.create_user(username=f'testuser_{timestamp}', password='test123', email=f'test{timestamp}@test.com')
user.branch = branch
user.save()

# Create request using APIRequestFactory
factory = APIRequestFactory()
request = factory.post('/api/accounts/account-classifications/', {'section': 1, 'name': 'Test Category'}, format='json')
force_authenticate(request, user=user)

# Instantiate viewset and call create action
viewset = AccountCategoryViewSet.as_view({'post': 'create'})
response = viewset(request)

print(f"\n=== Direct ViewSet Test ===")
print(f"Status Code: {response.status_code}")
print(f"Response Data: {response.data}")
print(f"Response: {response}")

# Check allowed methods
print(f"\n=== ViewSet Info ===")
print(f"ViewSet class: {AccountCategoryViewSet}")
print(f"Base classes: {AccountCategoryViewSet.__bases__}")
print(f"Has 'create' action: {hasattr(AccountCategoryViewSet, 'create')}")
print(f"Has 'list' action: {hasattr(AccountCategoryViewSet, 'list')}")

# Cleanup
user.delete()
branch.delete()
