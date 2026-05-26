import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
django.setup()

from django.test import Client
from django.contrib.auth import get_user_model

User = get_user_model()
user = User.objects.first()

client = Client()
client.force_login(user)

print("\n=== Testing Accounts API URL ===")
response = client.post('/api/accounts/accounts/', {
    'code': '101',
    'name': 'Test Account',
    'account_type': 'asset',
    'branch': 1
}, content_type='application/json')

print(f"Status Code: {response.status_code}")
if response.status_code == 301:
    print(f"Redirect Location: {response['Location']}")
print(f"Response content: {response.content[:200] if response.content else 'No content'}")
