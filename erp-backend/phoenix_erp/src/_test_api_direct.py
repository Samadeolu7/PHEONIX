#!/usr/bin/env python
"""Test API URL directly"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
django.setup()

from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from branches.models import Branch
from accounts.models import AccountCategory

User = get_user_model()

# Get or create test user
user, _ = User.objects.get_or_create(
    username='testuser',
    defaults={
        'email': 'test@test.com',
        'is_staff': True,
        'is_superuser': True
    }
)
user.set_password('testpass123')
user.save()

# Get or create test branch
branch, _ = Branch.objects.get_or_create(
    code='TEST',
    defaults={'name': 'Test Branch'}
)

# Get or create category
category, _ = AccountCategory.objects.get_or_create(
    section=1,
    defaults={'name': 'Assets'}
)

# Test API
client = APIClient()
client.force_authenticate(user=user)

print("\n=== Testing Account Creation API ===\n")

data = {
    'code': '101',
    'name': 'Test Cash Account',
    'account_level': 'parent',
    'account_type': 'asset',
    'branch': branch.id,
    'category': category.id
}

url = '/api/accounts/accounts/'
print(f"POST URL: {url}")
print(f"Data: {data}\n")

response = client.post(url, data, format='json')

print(f"Status Code: {response.status_code}")
if response.status_code == 301:
    print(f"REDIRECT TO: {response['Location']}")
elif response.status_code >= 400:
    print(f"Error: {response.data}")
else:
    print(f"Success: {response.data}")
