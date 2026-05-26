"""
Debug script to understand why we get 405 errors in tests
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
django.setup()

from django.test import override_settings
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from branches.models import Branch

User = get_user_model()

# Create test data (or get existing)
from datetime import datetime
timestamp = datetime.now().strftime('%Y%m%d%H%M%S')

branch = Branch.objects.create(name=f'Test Branch {timestamp}', code=f'TB{timestamp[:8]}')
user = User.objects.create_user(username=f'testuser_{timestamp}', password='test123', email=f'test{timestamp}@test.com')
user.branch = branch
user.save()

# Test with client
client = APIClient()
client.force_authenticate(user=user)

print("\n=== Testing AccountCategory POST ===")
response = client.post('/api/accounts/account-classifications/', {'section': 1, 'name': 'Test'}, format='json')
print(f"Status: {response.status_code}")
print(f"Data: {response.data if hasattr(response, 'data') else 'No data'}")
print(f"Response: {response}")

print("\n=== Testing Period POST ===")
response2 = client.post('/api/accounts/periods/', {
    'period_type': 'M',
    'year': 2024,
    'month': 12,
    'branch': branch.id
}, format='json')
print(f"Status: {response2.status_code}")
print(f"Data: {response2.data if hasattr(response2, 'data') else 'No data'}")

print("\n=== Testing Account POST (should work) ===")
response3 = client.post('/api/accounts/', {
    'code': '101',
    'name': 'Test Account',
    'account_level': 'PARENT',
    'account_type': 'ASSET',
    'branch': branch.id
}, format='json')
print(f"Status: {response3.status_code}")
print(f"Data: {response3.data if hasattr(response3, 'data') else 'No data'}")

# Cleanup
user.delete()
branch.delete()
