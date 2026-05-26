import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
sys.path.insert(0, 'd:/Users/User/Desktop/PHEONIX-ERP/erp-backend/phoenix_erp/src')
django.setup()

from django.test import Client
from django.urls import reverse
from rest_framework.test import APIClient
from accounts.models import Account, AccountCategory
from users.models import User, Tenant
from branches.models import Branch

# Create test data
tenant = Tenant.objects.create(name="Debug Tenant")
branch = Branch.objects.create(name="Debug Branch", code="DB01")
user = User.objects.create_user(
    username="debuguser",
    password="debug123",
    tenant=tenant,
    branch=branch,
    is_staff=True
)
classification = AccountCategory.objects.create(
    name="Debug Classification",
    section=999,
    owner=user,
    created_by=user,
    branch=branch
)

# Test API call
client = APIClient()
client.force_authenticate(user=user)

url = reverse('accounts:account-list')
print(f"URL: {url}")

data = {
    'name': 'Debug Account',
    'code': 'DBG001',
    'account_type': 'ASSET',
    'account_level': 'PARENT',
    'category': classification.id
}

response = client.post(url, data, format='json')
print(f"Status: {response.status_code}")
print(f"Headers: {dict(response.items())}")
if hasattr(response, 'data'):
    print(f"Data: {response.data}")
if response.status_code == 301:
    print(f"Redirect to: {response.get('Location', 'No location header')}")

# Cleanup
Account.objects.filter(code='DBG001').delete()
classification.delete()
user.delete()
branch.delete()
tenant.delete()
